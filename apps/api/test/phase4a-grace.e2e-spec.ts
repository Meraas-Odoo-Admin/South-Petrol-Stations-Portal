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
import { vehicleBody } from './support/registration-fixtures';

// Registration pivot, phase 4a (launch day for vehicles without a card):
// stages, typed-plate fill-ups, linking at registration, the after-deadline
// refusal, the emergency override, rule-preview parity and the A4 sheet's
// scoping. Rule-engine arithmetic itself is unit-tested (rule-engine/*.spec.ts);
// the stage boundaries are unit-tested in grace-stage.spec.ts — this file is
// the endpoint behavior.
describe('Phase 4a grace period (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const runId = Date.now().toString(36);
  const password = 'BoundaryTest123!';
  // Six digits, never starting with 0 (a leading zero is dropped in the canonical form).
  const seq = `1${String(Date.now()).slice(-5)}`;
  // The same car written three ways — Western digits with a dash, Arabic-Indic
  // digits, and with a space.
  const plateDash = `7-${seq}`;
  const plateArabic = `${[...`7${seq}`].map((d) => String.fromCharCode(0x0660 + Number(d))).join('').replace(/^(.)/, '$1-')}`;
  const plateSpace = `7 ${seq}`;
  const plateZero = `07-${seq}`;
  // The canonical form of all of the above, and a DIFFERENT car (city code 71).
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
  const setDates = (awareness: number | null, deadline: number | null) =>
    prisma.municipality.update({
      where: { id: municipalityId },
      data: {
        awarenessStartDate: awareness === null ? null : calendarDayToDate(day(awareness)),
        cardRequiredFromDate: deadline === null ? null : calendarDayToDate(day(deadline)),
      },
    });

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
      await mkRole('e2e_p4a_supervisor').then(async (id) => (await grant(id, ['fillups:create', 'fillups:emergency_override', 'registration_sheet:print']), id)),
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
        async (id) => (await grant(id, ['municipalities:manage', 'municipalities:read', 'registration_sheet:print']), id),
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
  }, 60_000);

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
  const patchMunicipality = async (body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .patch(`/api/v1/municipalities/${municipalityId}`)
      .set('Authorization', `Bearer ${await as('admin')}`)
      .send(body);

  // ── Municipality stage dates (admin) ─────────────────────────────────

  describe('municipality stage dates', () => {
    it('reports GRACE with no dates, and computes the stage server-side', async () => {
      await setDates(null, null);
      const res = await request(app.getHttpServer())
        .get('/api/v1/municipalities')
        .set('Authorization', `Bearer ${await as('admin')}`)
        .expect(200);
      const row = res.body.find((m: { id: string }) => m.id === municipalityId);
      expect(row).toMatchObject({ stage: 'GRACE', awarenessStartDate: null, cardRequiredFromDate: null });
    });

    it('validates the dates and requires awareness before the deadline', async () => {
      await patchMunicipality({ cardRequiredFromDate: '2026-13-45' }).then((r) => {
        expect(r.status).toBe(400);
        expect(r.body.message).toBe('INVALID_DATE');
      });
      await patchMunicipality({ awarenessStartDate: day(10), cardRequiredFromDate: day(5) }).then((r) => {
        expect(r.status).toBe(400);
        expect(r.body.message).toBe('AWARENESS_NOT_BEFORE_DEADLINE');
      });
    });

    it('audits a date change with old and new values, and moves the stage', async () => {
      const res = await patchMunicipality({ awarenessStartDate: day(1), cardRequiredFromDate: day(9) });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ stage: 'GRACE', awarenessStartDate: day(1), cardRequiredFromDate: day(9) });
      const audit = await prisma.auditLog.findFirst({
        where: { entityType: 'Municipality', entityId: municipalityId, action: 'UPDATE_STAGE_DATES' },
        orderBy: { createdAt: 'desc' },
      });
      expect(audit?.oldValue).toMatchObject({ awarenessStartDate: null, cardRequiredFromDate: null });
      expect(audit?.newValue).toMatchObject({ awarenessStartDate: day(1), cardRequiredFromDate: day(9) });
    });

    it('needs the typed municipality name to move the deadline to today or earlier', async () => {
      await setDates(null, null);
      await patchMunicipality({ cardRequiredFromDate: day(0) }).then((r) => {
        expect(r.status).toBe(400);
        expect(r.body.message).toBe('CONFIRMATION_NAME_MISMATCH');
      });
      await patchMunicipality({ cardRequiredFromDate: day(-1), confirmName: 'wrong' }).then((r) => expect(r.status).toBe(400));
      const name = (await prisma.municipality.findUniqueOrThrow({ where: { id: municipalityId } })).name;
      await patchMunicipality({ awarenessStartDate: null, cardRequiredFromDate: day(0), confirmName: name }).then((r) => {
        expect(r.status).toBe(200);
        expect(r.body.stage).toBe('CARD_REQUIRED');
      });
      await setDates(null, null);
    });

    it('lets an employee-level user nowhere near the endpoint', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/municipalities/${municipalityId}`)
        .set('Authorization', `Bearer ${await as('employee')}`)
        .send({ cardRequiredFromDate: day(30) })
        .expect(403);
    });
  });

  // ── Grace: typed unregistered plates, counted per normalized plate ───

  describe('grace stage: unregistered plates', () => {
    beforeAll(async () => {
      await setDates(null, null);
    });

    it('records an unregistered plate as typed, flagged TYPED_UNREGISTERED, with no vehicle', async () => {
      const res = await postFillUp('employee', { plate: plateDash }).then((r) => {
        expect(r.status).toBe(201);
        return r;
      });
      expect(res.body).toMatchObject({
        vehicleId: null,
        typedPlate: plateDash,
        normalizedPlate: canon7,
        identifiedBy: 'TYPED_UNREGISTERED',
        municipalityId,
        awareness: null,
      });
    });

    it('blocks a too-soon retry typed differently (same car), and preview agrees with submit', async () => {
      for (const typed of [plateArabic, plateSpace, plateZero]) {
        const prev = await preview('employee', { plate: typed });
      expect(prev.status).toBe(200);
        const failed = prev.body.checks.find((c: { passed: boolean }) => !c.passed);
        expect(failed?.reason).toBe('VEHICLE_GAP_TOO_SHORT');
        // Owner-level rules can't apply to a plate, and the result says so.
        expect(prev.body.skippedRules).toEqual(
          expect.arrayContaining(['OWNER_GAP_TOO_SHORT', 'OWNER_WEEKLY_CAP_REACHED', 'LITERS_PER_PERSON_CAP_REACHED']),
        );
        expect(prev.body).toMatchObject({ registered: false, identifiedBy: 'TYPED_UNREGISTERED', stage: 'GRACE' });

        const submit = await postFillUp('employee', { plate: typed });
        expect(submit.status).toBe(422);
        expect(submit.body).toMatchObject({ allowed: false, reason: failed.reason });
      }
    });

    it('treats a different city code as a different car: 7-1… and 71-… never share limits', async () => {
      // plateDash (city 7) is inside its minimum gap; plateOtherCity (city 71) is another car.
      expect(normalizePlate(plateOtherCity)).not.toBe(canon7);
      const prev = await preview('employee', { plate: plateOtherCity });
      expect(prev.status).toBe(200);
      expect(prev.body.checks.every((c: { passed: boolean }) => c.passed)).toBe(true);
      const res = await postFillUp('employee', { plate: plateOtherCity });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ vehicleId: null, normalizedPlate: normalizePlate(plateOtherCity), identifiedBy: 'TYPED_UNREGISTERED' });
    });

    it('counts per municipality: the same plate in another municipality starts its own count', async () => {
      // Still too soon at stationA (same municipality)…
      const prev = await preview('supervisor', { plate: plateDash }, stationA.id);
      expect(prev.status).toBe(200);
      expect(prev.body.checks.some((c: { passed: boolean }) => !c.passed)).toBe(true);
      // …but a station in another municipality counts separately.
      await prisma.userStationScope.create({ data: { userId: users.supervisor.id, stationId: stationOther.id } });
      try {
        const res = await postFillUp('supervisor', { plate: plateDash }, stationOther.id);
        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ municipalityId: otherMunicipalityId, identifiedBy: 'TYPED_UNREGISTERED' });
      } finally {
        await prisma.userStationScope.delete({
          where: { userId_stationId: { userId: users.supervisor.id, stationId: stationOther.id } },
        });
      }
    });

    it('enforces the weekly cap by normalized plate across typings', async () => {
      await setSettings({ gap: '0', cap: '3' });
      try {
        const cap = `5-${seq}`;
        const typings = [`5-${seq}`, `٥-${[...seq].map((d) => String.fromCharCode(0x0660 + Number(d))).join('')}`, `5 ${seq}`];
        for (const typed of typings) {
          expect((await postFillUp('employee', { plate: typed })).status).toBe(201);
        }
        const fourth = await postFillUp('employee', { plate: `5-${seq}` });
        expect(fourth.status).toBe(422);
        expect(fourth.body.reason).toBe('VEHICLE_WEEKLY_CAP_REACHED');
        expect(await prisma.fillUpTransaction.count({ where: { normalizedPlate: cap } })).toBe(3);
      } finally {
        await setSettings({ gap: '2', cap: '3' });
      }
    });
  });

  // ── Registration links earlier unregistered fill-ups ─────────────────

  describe('linking at registration', () => {
    it('refuses to register a plate that already exists when typed differently', async () => {
      // First registration below uses plateDash; a registered 9-… plate typed
      // another way must clash too.
      const res = await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', `Bearer ${await as('registrar')}`)
        .send(vehicleBody({ registrationStationId, ownerId, currentPlate: carded.plate.replace('-', ' ') }));
      expect(res.status).toBe(409);
      expect(res.body.message).toBe('VEHICLE_DUPLICATE');
    });

    it('links earlier fill-ups of that plate in the same transaction, keeping how they were identified', async () => {
      const before = await prisma.fillUpTransaction.findMany({ where: { vehicleId: null, normalizedPlate: canon7 } });
      expect(before.length).toBeGreaterThan(0);

      const res = await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', `Bearer ${await as('registrar')}`)
        .send(vehicleBody({ registrationStationId, ownerId, currentPlate: plateDash }));
      expect(res.status).toBe(201);
      expect(res.body.linkedFillUps).toBe(before.length);
      vehicleIds.push(res.body.id);

      const after = await prisma.fillUpTransaction.findMany({ where: { id: { in: before.map((b) => b.id) } } });
      for (const row of after) {
        expect(row.vehicleId).toBe(res.body.id);
        expect(row.identifiedBy).toBe('TYPED_UNREGISTERED');
        expect(row.typedPlate).toBe(plateDash);
        // The municipality each fill-up was recorded in is never rewritten.
        expect(row.municipalityId).toBe(before.find((b) => b.id === row.id)!.municipalityId);
      }
      expect(new Set(after.map((r) => r.municipalityId))).toEqual(new Set([municipalityId, otherMunicipalityId]));
      // The other city code's fill-up is a different car and stays unlinked.
      expect(
        await prisma.fillUpTransaction.count({ where: { normalizedPlate: normalizePlate(plateOtherCity)!, vehicleId: null } }),
      ).toBe(1);
      const audit = await prisma.auditLog.findFirst({ where: { action: 'LINK_UNREGISTERED_FILLUPS', entityId: res.body.id } });
      expect(audit?.newValue).toMatchObject({ linkedFillUps: before.length });

      // And now the typed plate resolves to the registered vehicle.
      const prev = await preview('employee', { plate: plateSpace });
      expect(prev.status).toBe(200);
      expect(prev.body).toMatchObject({ registered: true, vehicleId: res.body.id, identifiedBy: 'TYPED_REGISTERED' });
    });

    it('a registration with no earlier fill-ups reports zero linked', async () => {
      const plate = `3-${String(Number(seq) + 77).padStart(6, '0')}`;
      const res = await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', `Bearer ${await as('registrar')}`)
        .send(vehicleBody({ registrationStationId, ownerId, currentPlate: plate }))
        .expect(201);
      expect(res.body.linkedFillUps).toBe(0);
      vehicleIds.push(res.body.id);
    });
  });

  // ── After the deadline ────────────────────────────────────────────────

  describe('card required stage', () => {
    beforeAll(async () => {
      await setDates(-10, -1);
    });

    it('refuses an unregistered plate, in preview and submit, naming the active registration stations', async () => {
      const unknown = `4-${String(Number(seq) + 5).padStart(6, '0')}`;
      const prev = await preview('employee', { plate: unknown });
      const submit = await postFillUp('employee', { plate: unknown });
      for (const res of [prev, submit]) {
        expect(res.status).toBe(409);
        expect(res.body.message).toBe('CARD_REQUIRED');
        const stations = res.body.details.registrationStations as Array<{ id: string; name: string; address: string; workingHours: string }>;
        expect(stations.map((s) => s.id)).toContain(registrationStationId);
        expect(stations.map((s) => s.id)).not.toContain(closedRegistrationStationId);
        expect(stations.find((s) => s.id === registrationStationId)).toMatchObject({ address: 'شارع الاختبار', workingHours: '8-14' });
      }
      expect(await prisma.fillUpTransaction.count({ where: { normalizedPlate: normalizePlate(unknown)! } })).toBe(0);
    });

    it('refuses a registered vehicle that has no active card', async () => {
      const bare = await prisma.vehicle.findFirstOrThrow({ where: { normalizedPlate: canon7 } });
      const res = await postFillUp('employee', { vehicleId: bare.id });
      expect(res.status).toBe(409);
      expect(res.body.message).toBe('CARD_REQUIRED');
      expect((await preview('employee', { vehicleId: bare.id })).status).toBe(409);
    });

    it('allows a registered vehicle with an active card, by typed plate', async () => {
      const res = await postFillUp('employee', { plate: carded.plate });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ vehicleId: carded.id, identifiedBy: 'TYPED_REGISTERED', awareness: null });
    });

    it('records a scanned card as CARD_SCAN, whatever the client says about identification', async () => {
      const res = await postFillUp('employee', { vehicleId: scanned.id, cardNumber: scanned.cardNumber });
      expect(res.status).toBe(201);
      expect(res.body.identifiedBy).toBe('CARD_SCAN');
      // Claiming a card that belongs to another vehicle is refused.
      const mismatch = await postFillUp('employee', { vehicleId: carded.id, cardNumber: scanned.cardNumber });
      expect(mismatch.status).toBe(400);
      expect(mismatch.body.message).toBe('CARD_VEHICLE_MISMATCH');
    });

    it('keeps refusing the unknown / cancelled card outcomes of phase 3', async () => {
      const unknown = await postFillUp('employee', { cardNumber: 'ZZZ-22222222' });
      expect(unknown.status).toBe(404);
      expect(unknown.body.message).toBe('CARD_NOT_FOUND');
    });
  });

  // ── Emergency override ────────────────────────────────────────────────

  describe('emergency override', () => {
    const overridePlate = () => `6-${String(Number(seq) + 9).padStart(6, '0')}`;

    beforeAll(async () => {
      await setDates(-10, -1);
    });

    it('is refused for an employee and for a registration role, however it is asked', async () => {
      const body = { plate: overridePlate(), emergencyOverride: true, overrideReason: 'ambulance' };
      expect((await postFillUp('employee', body)).status).toBe(403);
      expect((await postFillUp('registrar', body)).status).toBe(403);
      expect(await prisma.fillUpTransaction.count({ where: { normalizedPlate: normalizePlate(overridePlate())! } })).toBe(0);
    });

    it('needs a written reason', async () => {
      const res = await postFillUp('supervisor', { plate: overridePlate(), emergencyOverride: true });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('OVERRIDE_REASON_REQUIRED');
    });

    it('waives only the card: records an exception, audits who/when/plate/reason', async () => {
      const res = await postFillUp('supervisor', { plate: overridePlate(), emergencyOverride: true, overrideReason: 'ambulance on the way' });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        identifiedBy: 'EMERGENCY_OVERRIDE',
        isException: true,
        overrideReason: 'ambulance on the way',
        recordedById: users.supervisor.id,
      });
      expect(res.body.exception).toBeTruthy();
      const type = await prisma.exceptionType.findUniqueOrThrow({ where: { id: res.body.exception.exceptionTypeId } });
      expect(type.key).toBe('emergency');

      const audit = await prisma.auditLog.findFirst({ where: { action: 'EMERGENCY_OVERRIDE_FILLUP', entityId: res.body.id } });
      expect(audit?.userId).toBe(users.supervisor.id);
      expect(audit?.createdAt).toBeInstanceOf(Date);
      expect(audit?.newValue).toMatchObject({ normalizedPlate: normalizePlate(overridePlate())!, overrideReason: 'ambulance on the way' });

      // The limits still apply: the same plate again right away is too soon.
      const again = await postFillUp('supervisor', { plate: overridePlate(), emergencyOverride: true, overrideReason: 'again' });
      expect(again.status).toBe(422);
      expect(again.body.reason).toBe('VEHICLE_GAP_TOO_SHORT');
    });

    it('is not accepted where no override is needed (stage is not card-required)', async () => {
      await setDates(null, null);
      const res = await postFillUp('supervisor', { plate: `2-${seq}`, emergencyOverride: true, overrideReason: 'x' });
      expect(res.status).toBe(409);
      expect(res.body.message).toBe('OVERRIDE_NOT_NEEDED');
    });
  });

  // ── Awareness stage ───────────────────────────────────────────────────

  describe('awareness stage', () => {
    beforeAll(async () => {
      await setDates(0, 5);
    });

    it('returns the deadline and the live station list after a no-card fill-up', async () => {
      const res = await postFillUp('employee', { plate: `8-${seq}` });
      expect(res.status).toBe(201);
      expect(res.body.awareness.cardRequiredFromDate).toBe(day(5));
      expect(res.body.awareness.registrationStations.map((s: { id: string }) => s.id)).toEqual([registrationStationId]);
    });

    it('does not return the notice after a card scan', async () => {
      const fresh = await prisma.vehicle.create({
        data: { internalCode: `E2E-P4A-V3-${runId}`, currentPlate: `1-${seq}`, normalizedPlate: normalizePlate(`1-${seq}`)! },
      });
      vehicleIds.push(fresh.id);
      const cardNumber = mkCardNumber(3);
      await prisma.vehicleCard.create({
        data: {
          cardNumber,
          vehicleId: fresh.id,
          registrationStationId,
          deskId,
          issuedById: users.registrar.id,
          reason: 'FIRST_ISSUE',
          activeForVehicleId: fresh.id,
          printedPlate: fresh.currentPlate,
          printedVehicleLine: 'x',
          printedOfficeName: 'x',
          printedIssueDate: day(0),
          printedStationCode: 'x',
        },
      });
      const res = await postFillUp('employee', { vehicleId: fresh.id, cardNumber });
      expect(res.status).toBe(201);
      expect(res.body.awareness).toBeNull();
    });
  });

  // ── The A4 sheet ──────────────────────────────────────────────────────

  describe('registration stations sheet', () => {
    const get = async (who: keyof typeof users, query: Record<string, string>) =>
      request(app.getHttpServer())
        .get('/api/v1/registration-sheet')
        .query(query)
        .set('Authorization', `Bearer ${await as(who)}`);

    it('needs registration_sheet:print', async () => {
      expect((await get('employee', { stationId: stationA.id })).status).toBe(403);
      expect((await get('registrar', { stationId: stationA.id })).status).toBe(403);
    });

    it('stays inside the caller’s station scope', async () => {
      expect((await get('supervisor', { stationId: stationOther.id })).status).toBe(403);
      expect((await get('supervisor', { municipalityId })).status).toBe(403);
    });

    it('prints a PDF for an in-scope station and for an admin by municipality', async () => {
      const binary = (res: request.Response, done: (err: Error | null, body: Buffer) => void) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      };
      for (const [who, query] of [
        ['supervisor', { stationId: stationA.id }],
        ['admin', { municipalityId }],
      ] as const) {
        const res = await request(app.getHttpServer())
          .get('/api/v1/registration-sheet')
          .query(query)
          .set('Authorization', `Bearer ${await as(who)}`)
          .buffer(true)
          .parse(binary)
          .expect(200);
        expect(res.headers['content-type']).toBe('application/pdf');
        expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
      }
    });
  });

  // ── A plate with no separator is ambiguous and refused ───────────────

  describe('plate format', () => {
    const noSeparator = `7${seq}`;

    it('refuses a typed plate with no separator, in submit and preview', async () => {
      await setDates(null, null);
      const submit = await postFillUp('employee', { plate: noSeparator });
      expect(submit.status).toBe(400);
      expect(submit.body.message).toBe('PLATE_INVALID');
      const prev = await preview('employee', { plate: noSeparator });
      expect(prev.status).toBe(400);
      expect(prev.body.message).toBe('PLATE_INVALID');
      expect(await prisma.fillUpTransaction.count({ where: { typedPlate: noSeparator } })).toBe(0);
    });

    it('refuses to register a plate it cannot split into a city code and a number', async () => {
      for (const currentPlate of [noSeparator, '٨١٢٣٤٥٦٧', 'ab-12', '8-12-34', '8-']) {
        const res = await request(app.getHttpServer())
          .post('/api/v1/vehicles')
          .set('Authorization', `Bearer ${await as('registrar')}`)
          .send(vehicleBody({ registrationStationId, ownerId, currentPlate }));
        expect({ currentPlate, status: res.status }).toEqual({ currentPlate, status: 400 });
      }
    });

    it('keeps 8-1234567 and 81-234567 as two different registrable plates', async () => {
      // Two different cars: both register (no duplicate between them).
      const a = `8-${seq}7`;
      const b = `81-${seq.slice(0, 5)}7`;
      expect(normalizePlate(a)).not.toBe(normalizePlate(b));
      for (const currentPlate of [a, b]) {
        const res = await request(app.getHttpServer())
          .post('/api/v1/vehicles')
          .set('Authorization', `Bearer ${await as('registrar')}`)
          .send(vehicleBody({ registrationStationId, ownerId, currentPlate }));
        expect({ currentPlate, status: res.status }).toEqual({ currentPlate, status: 201 });
        vehicleIds.push(res.body.id);
      }
    });
  });

  // ── Station scope on the plate path ───────────────────────────────────

  it('applies the station-scope boundary to typed-plate fill-ups and previews', async () => {
    await setDates(null, null);
    expect((await postFillUp('employee', { plate: `1-${seq}9` }, stationOther.id)).status).toBe(403);
    expect((await preview('employee', { plate: `1-${seq}9` }, stationOther.id)).status).toBe(403);
    expect(await prisma.fillUpTransaction.count({ where: { stationId: stationOther.id, recordedById: users.employee.id } })).toBe(0);
  });
});
