import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { normalizePlate } from '@fuel-tracking/shared-types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { calendarDayToDate, tripoliDay } from '../src/common/utils/grace-stage';
import { createMunicipality, deleteMunicipalities } from './support/municipality-fixtures';

// Phase 6 (the 4a grace period is gone): a fill-up is recorded from a CARD
// SCAN. There are no stages, no awareness and no typed-plate paths. The only
// other way in is the supervisor's emergency override, for a REGISTERED
// vehicle, with a written reason. The activation switch gates nothing.
describe('Phase 6 card-only pump flow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const runId = Date.now().toString(36);
  const password = 'BoundaryTest123!';
  // Six digits, never starting with 0 (a leading zero is dropped in the canonical form).
  const seq = `1${String(Date.now()).slice(-5)}`;
  const canon7 = `7-${seq}`;
  const plateOtherCity = `71-${seq.slice(1)}`;

  const users: Record<'employee' | 'supervisor' | 'registrar' | 'admin', { id: string; username: string }> = {
    employee: { id: '', username: `e2e_p4a_employee_${runId}` },
    supervisor: { id: '', username: `e2e_p4a_supervisor_${runId}` },
    registrar: { id: '', username: `e2e_p4a_registrar_${runId}` },
    admin: { id: '', username: `e2e_p4a_admin_${runId}` },
  };
  const roleIds: string[] = [];

  let company: { id: string };
  let municipalityId: string;
  let otherMunicipalityId: string;
  let stationA: { id: string };
  let stationOther: { id: string };
  let registrationStationId: string;
  let closedRegistrationStationId: string;
  let deskId: string;
  const vehicleIds: string[] = [];
  const cardNumbers: string[] = [];
  let carded: { id: string; plate: string; cardNumber: string };
  let scanned: { id: string; plate: string; cardNumber: string };

  // A real-format card number (municipality code + 8 look-alike-free characters).
  const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  const mkCardNumber = (n: number) =>
    `TST-${[...`${runId}${seq}`.toUpperCase()].filter((c) => ALPHABET.includes(c)).join('').slice(0, 7).padEnd(7, 'K')}${ALPHABET[n]}`;
  let ownerId: string;

  const day = (offset: number) => {
    const base = calendarDayToDate(tripoliDay(new Date()));
    base.setUTCDate(base.getUTCDate() + offset);
    return base.toISOString().slice(0, 10);
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = moduleRef.get(PrismaService);

    await setSettings({ gap: '2', cap: '3' });
    ownerId = (
      await prisma.vehicleOwner.create({
        data: { identityType: 'NATIONAL_ID', identityNumber: `E2EP4A${runId}`, fullName: `E2E P4A Owner ${runId}` },
      })
    ).id;

    company = await prisma.company.create({ data: { name: `E2E P4A Company ${runId}` } });
    municipalityId = (await createMunicipality(prisma, `E2E P4A Municipality ${runId}`)).id;
    otherMunicipalityId = (await createMunicipality(prisma, `E2E P4A Other ${runId}`)).id;
    stationA = await prisma.station.create({
      data: { internalCode: `E2E-P4A-A-${runId}`, stationNumber: '1', name: 'E2E P4A A', companyId: company.id, municipalityId },
    });
    stationOther = await prisma.station.create({
      data: { internalCode: `E2E-P4A-O-${runId}`, stationNumber: '2', name: 'E2E P4A O', companyId: company.id, municipalityId: otherMunicipalityId },
    });
    registrationStationId = (
      await prisma.registrationStation.create({
        data: {
          internalCode: `E2E-P4A-R-${runId}`,
          name: `مكتب التسجيل ${runId}`,
          municipalityId,
          address: 'شارع الاختبار',
          workingHours: '8-14',
          contactPhone: '0910000000',
        },
      })
    ).id;
    closedRegistrationStationId = (
      await prisma.registrationStation.create({
        data: { internalCode: `E2E-P4A-RC-${runId}`, name: `مكتب مغلق ${runId}`, municipalityId, address: 'x', status: 'CLOSED' },
      })
    ).id;
    deskId = (await prisma.registrationDesk.create({ data: { registrationStationId, name: 'desk' } })).id;

    const grant = async (roleId: string, keys: string[]) => {
      for (const key of keys) {
        const permission = await prisma.permission.upsert({ where: { key }, create: { key }, update: {} });
        await prisma.rolePermission.create({ data: { roleId, permissionId: permission.id } });
      }
    };
    const mkRole = async (name: string, extra: Record<string, unknown> = {}) => {
      const role = await prisma.role.create({ data: { name: `${name}_${runId}`, ...extra } });
      roleIds.push(role.id);
      return role.id;
    };
    const mkUser = async (key: keyof typeof users, roleId: string) => {
      const user = await prisma.user.create({
        data: { username: users[key].username, passwordHash: await argon2.hash(password), fullName: `E2E P4A ${key}` },
      });
      users[key].id = user.id;
      await prisma.userRole.create({ data: { userId: user.id, roleId } });
      return user;
    };

    // Employee: records fill-ups, no override. Supervisor: also the override
    // and the sheet. Registrar: a registration role — never records fill-ups.
    const employee = await mkUser('employee', await mkRole('e2e_p4a_employee', {}).then(async (id) => (await grant(id, ['fillups:create']), id)));
    await prisma.userStationScope.create({ data: { userId: employee.id, stationId: stationA.id } });
    const supervisor = await mkUser(
      'supervisor',
      await mkRole('e2e_p4a_supervisor').then(async (id) => (await grant(id, ['fillups:create', 'fillups:emergency_override']), id)),
    );
    await prisma.userStationScope.create({ data: { userId: supervisor.id, stationId: stationA.id } });
    const registrar = await mkUser(
      'registrar',
      await mkRole('e2e_p4a_registrar', { kind: 'REGISTRATION' }).then(
        async (id) => (await grant(id, ['vehicles:read', 'vehicles:manage', 'owners:read', 'owners:manage', 'registration_stations:read']), id),
      ),
    );
    await prisma.userRegistrationStationScope.create({ data: { userId: registrar.id, registrationStationId } });
    await mkUser(
      'admin',
      await mkRole('e2e_p4a_admin', { unrestrictedStationAccess: true }).then(
        async (id) => (await grant(id, ['municipalities:manage', 'municipalities:read']), id),
      ),
    );

    // Two registered vehicles that each hold an ACTIVE card.
    const mkCardedVehicle = async (n: number) => {
      const plate = `9-${String(Number(seq) + n).padStart(6, '0')}`;
      const vehicle = await prisma.vehicle.create({
        data: { internalCode: `E2E-P4A-V${n}-${runId}`, currentPlate: plate, normalizedPlate: normalizePlate(plate) },
      });
      vehicleIds.push(vehicle.id);
      const cardNumber = mkCardNumber(n);
      await prisma.vehicleCard.create({
        data: {
          cardNumber,
          vehicleId: vehicle.id,
          registrationStationId,
          deskId,
          issuedById: registrar.id,
          reason: 'FIRST_ISSUE',
          activeForVehicleId: vehicle.id,
          printedPlate: plate,
          printedVehicleLine: 'x',
          printedOfficeName: 'x',
          printedIssueDate: day(0),
          printedStationCode: 'x',
        },
      });
      cardNumbers.push(cardNumber);
      return { id: vehicle.id, plate, cardNumber };
    };
    carded = await mkCardedVehicle(1);
    scanned = await mkCardedVehicle(2);
  });

  afterAll(async () => {
    const userIds = Object.values(users).map((u) => u.id).filter(Boolean);
    const allVehicles = await prisma.vehicle.findMany({
      where: { OR: [{ id: { in: vehicleIds } }, { normalizedPlate: { in: [canon7, normalizePlate(plateOtherCity)!] } }] },
      select: { id: true },
    });
    const vIds = allVehicles.map((v) => v.id);
    const fillUps = await prisma.fillUpTransaction.findMany({
      where: { OR: [{ municipalityId: { in: [municipalityId, otherMunicipalityId] } }, { vehicleId: { in: vIds } }] },
      select: { id: true },
    });
    const fIds = fillUps.map((f) => f.id);
    await prisma.exception.deleteMany({ where: { fillUpTransactionId: { in: fIds } } });
    await prisma.fillUpTransaction.deleteMany({ where: { id: { in: fIds } } });
    await prisma.vehicleCard.deleteMany({ where: { vehicleId: { in: vIds } } });
    await prisma.vehiclePlateHistory.deleteMany({ where: { vehicleId: { in: vIds } } });
    await prisma.vehicle.deleteMany({ where: { id: { in: vIds } } });
    await prisma.duplicateCatch.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userStationScope.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userRegistrationStationScope.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await prisma.registrationDesk.deleteMany({ where: { registrationStationId } });
    await prisma.registrationStation.deleteMany({ where: { id: { in: [registrationStationId, closedRegistrationStationId] } } });
    await prisma.station.deleteMany({ where: { id: { in: [stationA.id, stationOther.id] } } });
    await prisma.company.delete({ where: { id: company.id } });
    await prisma.vehicleOwner.deleteMany({ where: { id: ownerId } });
    await deleteMunicipalities(prisma, [municipalityId, otherMunicipalityId]);
    await app.close();
  });

  async function setSettings({ gap, cap }: { gap: string; cap: string }) {
    const settings: Array<[string, string]> = [
      ['fillup.max_per_week', cap],
      ['fillup.min_gap_days', gap],
      ['fillup.max_per_week_per_owner', '3'],
      ['fillup.min_gap_days_per_owner', '2'],
      ['fillup.max_liters_per_week_per_owner', '100000'],
      ['fillup.week_window_mode', 'rolling'],
      ['fillup.week_start_day', '6'],
    ];
    for (const [key, value] of settings) {
      await prisma.systemSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
    }
  }

  const tokens = new Map<string, string>();
  async function as(key: keyof typeof users): Promise<string> {
    const cached = tokens.get(key);
    if (cached) return cached;
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: users[key].username, password })
      .expect(200);
    tokens.set(key, res.body.accessToken);
    return res.body.accessToken;
  }

  let keyCounter = 0;
  async function postFillUp(who: keyof typeof users, body: Record<string, unknown>, stationId = stationA.id) {
    keyCounter += 1;
    return request(app.getHttpServer())
      .post('/api/v1/fillups')
      .set('Authorization', `Bearer ${await as(who)}`)
      .set('Idempotency-Key', `e2e-p4a-${runId}-${keyCounter}`)
      .send({ stationId, fuelType: 'PETROL_95', quantityLiters: 20, ...body });
  }
  async function preview(who: keyof typeof users, params: Record<string, string>, stationId = stationA.id) {
    return request(app.getHttpServer())
      .get('/api/v1/fillups/rule-preview')
      .query({ stationId, ...params })
      .set('Authorization', `Bearer ${await as(who)}`);
  }

  // ── No card, no fill-up ───────────────────────────────────────────────

  describe('a card scan is required', () => {
    it('refuses a typed plate, in preview and submit: it is not a way to identify a vehicle', async () => {
      const unknown = `4-${String(Number(seq) + 5).padStart(6, '0')}`;
      expect((await preview('employee', { plate: unknown })).status).toBe(400);
      expect((await postFillUp('employee', { plate: unknown })).status).toBe(400);
      expect(await prisma.fillUpTransaction.count({ where: { normalizedPlate: normalizePlate(unknown)! } })).toBe(0);
    });

    it('refuses a registered vehicle named by id when no card is scanned and no reason is given', async () => {
      const res = await postFillUp('employee', { vehicleId: carded.id });
      expect(res.status).toBe(409);
      expect(res.body.message).toBe('CARD_REQUIRED');
      expect((await preview('employee', { vehicleId: carded.id })).status).toBe(409);
    });

    it('records a scanned card as CARD_SCAN, with no awareness notice', async () => {
      const res = await postFillUp('employee', { cardNumber: carded.cardNumber });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ vehicleId: carded.id, identifiedBy: 'CARD_SCAN' });
      expect(res.body.awareness).toBeUndefined();
    });

    it('refuses a card that belongs to another vehicle than the one claimed, and an unknown card', async () => {
      const mismatch = await postFillUp('employee', { vehicleId: carded.id, cardNumber: scanned.cardNumber });
      expect(mismatch.status).toBe(400);
      expect(mismatch.body.message).toBe('CARD_VEHICLE_MISMATCH');
      const unknown = await postFillUp('employee', { cardNumber: 'ZZZ-22222222' });
      expect(unknown.status).toBe(404);
      expect(unknown.body.message).toBe('CARD_NOT_FOUND');
    });

    it('records at a station of a municipality that is not activated: the switch gates nothing', async () => {
      await prisma.municipality.update({ where: { id: municipalityId }, data: { status: 'PREPARING', activatedAt: null } });
      const res = await postFillUp('employee', { cardNumber: scanned.cardNumber });
      expect(res.status).toBe(201);
    });

    it('applies the station-scope boundary to card fill-ups and previews', async () => {
      expect((await postFillUp('employee', { cardNumber: carded.cardNumber }, stationOther.id)).status).toBe(403);
      expect((await preview('employee', { cardNumber: carded.cardNumber }, stationOther.id)).status).toBe(403);
      expect(await prisma.fillUpTransaction.count({ where: { stationId: stationOther.id, recordedById: users.employee.id } })).toBe(0);
    });
  });

  // The emergency override was replaced by the no-card search (see
  // phase6-exceptions.e2e-spec.ts): its fields are no longer accepted.
  it('refuses the old emergency-override fields and a typed plate', async () => {
    for (const body of [
      { plate: carded.plate, emergencyOverride: true, overrideReason: 'ambulance on the way' },
      { vehicleId: carded.id, emergencyOverride: true, overrideReason: 'ambulance on the way' },
      { plate: carded.plate },
    ]) {
      expect((await postFillUp('supervisor', body)).status).toBe(400);
    }
  });
});
