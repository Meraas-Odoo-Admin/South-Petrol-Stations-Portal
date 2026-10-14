import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { tripoliDay } from '../src/common/utils/grace-stage';
import { createMunicipality, deleteMunicipalities } from './support/municipality-fixtures';

// Phase 6: exception types with daily limits per station (no approval step),
// the strict switch, the unreasonable-station flag, and the «بدون بطاقة» pump
// fallback (search a registered vehicle, a reason, recorded and counted).
describe('Phase 6 exceptions and the no-card fallback (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const runId = Date.now().toString(36);
  const password = 'BoundaryTest123!';
  const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  const cardNumber = () => `TST-${Array.from({ length: 8 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('')}`;

  type UserKey = 'employee' | 'supervisor' | 'otherSupervisor' | 'manager' | 'admin';
  const users = {} as Record<UserKey, { id: string; username: string }>;
  const roleIds: string[] = [];
  const vehicles: Array<{ id: string; plate: string; cardNumber: string }> = [];

  let company: { id: string };
  let municipalityId: string;
  let otherMunicipalityId: string;
  let stationA: { id: string };
  let stationB: { id: string }; // same municipality, a second station
  let stationOther: { id: string }; // another municipality
  let registrationStationId: string;
  let deskId: string;
  let registrarId: string;
  let limitedTypeId: string; // daily limit 2
  let gapOnlyTypeId: string; // only VEHICLE_GAP_TOO_SHORT may be overridden
  let ownerId: string;

  async function setSetting(key: string, value: string) {
    await prisma.systemSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = moduleRef.get(PrismaService);

    for (const [key, value] of [
      ['fillup.max_per_week', '3'],
      ['fillup.min_gap_days', '2'],
      ['fillup.max_per_week_per_owner', '100'],
      ['fillup.min_gap_days_per_owner', '0'],
      ['fillup.max_liters_per_week_per_owner', '100000'],
      ['fillup.week_window_mode', 'rolling'],
      ['fillup.week_start_day', '6'],
      ['exceptions.strict_limit', 'false'],
      ['exceptions.station_daily_threshold', '100'],
    ] as const) {
      await setSetting(key, value);
    }
    // Owner-level rules off, so only the vehicle gap rule blocks in these tests.
    for (const key of ['fillup.rule.owner_gap.enabled', 'fillup.rule.owner_weekly.enabled', 'fillup.rule.owner_liters.enabled']) {
      await setSetting(key, 'false');
    }
    await setSetting('fillup.rule.vehicle_gap.enabled', 'true');
    await setSetting('fillup.rule.vehicle_weekly.enabled', 'true');

    ownerId = (
      await prisma.vehicleOwner.create({
        data: { identityType: 'NATIONAL_ID', identityNumber: `E2EP6${runId}`, fullName: `E2E P6 Owner ${runId}` },
      })
    ).id;
    company = await prisma.company.create({ data: { name: `E2E P6 Company ${runId}` } });
    municipalityId = (await createMunicipality(prisma, `E2E P6 Municipality ${runId}`)).id;
    otherMunicipalityId = (await createMunicipality(prisma, `E2E P6 Other ${runId}`)).id;
    stationA = await prisma.station.create({
      data: { internalCode: `E2E-P6-A-${runId}`, stationNumber: '1', name: 'E2E P6 A', companyId: company.id, municipalityId },
    });
    stationB = await prisma.station.create({
      data: { internalCode: `E2E-P6-B-${runId}`, stationNumber: '2', name: 'E2E P6 B', companyId: company.id, municipalityId },
    });
    stationOther = await prisma.station.create({
      data: { internalCode: `E2E-P6-O-${runId}`, stationNumber: '3', name: 'E2E P6 O', companyId: company.id, municipalityId: otherMunicipalityId },
    });
    registrationStationId = (
      await prisma.registrationStation.create({
        data: { internalCode: `E2E-P6-R-${runId}`, name: `مكتب ${runId}`, municipalityId, address: 'x' },
      })
    ).id;
    deskId = (await prisma.registrationDesk.create({ data: { registrationStationId, name: 'desk' } })).id;

    const grant = async (roleId: string, keys: string[]) => {
      for (const key of keys) {
        const permission = await prisma.permission.upsert({ where: { key }, create: { key }, update: {} });
        await prisma.rolePermission.create({ data: { roleId, permissionId: permission.id } });
      }
    };
    const mkRole = async (name: string, perms: string[], extra: Record<string, unknown> = {}) => {
      const role = await prisma.role.create({ data: { name: `${name}_${runId}`, ...extra } });
      roleIds.push(role.id);
      await grant(role.id, perms);
      return role.id;
    };
    const mkUser = async (key: UserKey, roleId: string) => {
      const user = await prisma.user.create({
        data: { username: `e2e_p6_${key}_${runId}`, passwordHash: await argon2.hash(password), fullName: `E2E P6 ${key}` },
      });
      users[key] = { id: user.id, username: user.username };
      await prisma.userRole.create({ data: { userId: user.id, roleId } });
      return user;
    };

    const employee = await mkUser('employee', await mkRole('p6_emp', ['fillups:create', 'fillups:record_exception', 'vehicles:read', 'reports:own_shift']));
    await prisma.userStationScope.create({ data: { userId: employee.id, stationId: stationA.id } });
    const supervisor = await mkUser(
      'supervisor',
      await mkRole('p6_sup', ['fillups:create', 'fillups:record_exception', 'vehicles:read', 'reports:view', 'notifications:read', 'notifications:station_events']),
    );
    await prisma.userStationScope.create({ data: { userId: supervisor.id, stationId: stationA.id } });
    const otherSupervisor = await mkUser(
      'otherSupervisor',
      await mkRole('p6_sup2', ['fillups:create', 'reports:view', 'notifications:read', 'notifications:station_events']),
    );
    await prisma.userStationScope.create({ data: { userId: otherSupervisor.id, stationId: stationOther.id } });
    const manager = await mkUser(
      'manager',
      await mkRole(
        'p6_mgr',
        ['reports:view', 'reports:municipality', 'notifications:read', 'notifications:municipality_events', 'exception_types:manage', 'exception_settings:manage', 'municipalities:read'],
        { municipalityScoped: true },
      ),
    );
    await prisma.userMunicipalityScope.create({ data: { userId: manager.id, municipalityId } });
    await mkUser(
      'admin',
      await mkRole('p6_admin', ['settings:manage', 'exception_settings:manage', 'exception_types:manage', 'reports:view', 'reports:municipality'], {
        unrestrictedStationAccess: true,
      }),
    );

    registrarId = (await prisma.user.create({ data: { username: `e2e_p6_reg_${runId}`, passwordHash: 'x', fullName: 'reg' } })).id;

    // Six vehicles, each with an active card, one owner.
    for (let n = 1; n <= 8; n++) {
      const plate = `9-${String(Date.now()).slice(-5)}${n}`;
      const vehicle = await prisma.vehicle.create({
        data: { internalCode: `E2E-P6-V${n}-${runId}`, currentPlate: plate, normalizedPlate: plate, ownerId },
      });
      const number = cardNumber();
      await prisma.vehicleCard.create({
        data: {
          cardNumber: number,
          vehicleId: vehicle.id,
          registrationStationId,
          deskId,
          issuedById: registrarId,
          reason: 'FIRST_ISSUE',
          activeForVehicleId: vehicle.id,
          printedPlate: plate,
          printedVehicleLine: 'x',
          printedOfficeName: 'x',
          printedIssueDate: '2026-01-01',
          printedStationCode: 'x',
        },
      });
      vehicles.push({ id: vehicle.id, plate, cardNumber: number });
    }

    limitedTypeId = (
      await prisma.exceptionType.create({
        data: { key: `e2e_p6_limited_${runId}`, name: `استثناء محدود ${runId}`, requiresProof: false, dailyLimitPerStation: 2 },
      })
    ).id;
    gapOnlyTypeId = (
      await prisma.exceptionType.create({
        data: {
          key: `e2e_p6_gaponly_${runId}`,
          name: `فاصل فقط ${runId}`,
          requiresProof: false,
          overridableRules: ['VEHICLE_GAP_TOO_SHORT'],
        },
      })
    ).id;
  });

  afterAll(async () => {
    const userIds = [...Object.values(users).map((u) => u.id), registrarId];
    const vIds = vehicles.map((v) => v.id);
    const stationIds = [stationA.id, stationB.id, stationOther.id];
    const fills = await prisma.fillUpTransaction.findMany({ where: { stationId: { in: stationIds } }, select: { id: true } });
    await prisma.exception.deleteMany({ where: { fillUpTransactionId: { in: fills.map((f) => f.id) } } });
    await prisma.fillUpTransaction.deleteMany({ where: { id: { in: fills.map((f) => f.id) } } });
    await prisma.exceptionFlag.deleteMany({ where: { stationId: { in: stationIds } } });
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.municipalitySetting.deleteMany({ where: { municipalityId: { in: [municipalityId, otherMunicipalityId] } } });
    await prisma.exceptionType.deleteMany({ where: { id: { in: [limitedTypeId, gapOnlyTypeId] } } });
    await prisma.vehicleCard.deleteMany({ where: { vehicleId: { in: vIds } } });
    await prisma.vehiclePlateHistory.deleteMany({ where: { vehicleId: { in: vIds } } });
    await prisma.vehicle.deleteMany({ where: { id: { in: vIds } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userStationScope.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userMunicipalityScope.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await prisma.registrationDesk.deleteMany({ where: { registrationStationId } });
    await prisma.registrationStation.deleteMany({ where: { id: registrationStationId } });
    await prisma.station.deleteMany({ where: { id: { in: stationIds } } });
    await prisma.company.delete({ where: { id: company.id } });
    await prisma.vehicleOwner.deleteMany({ where: { id: ownerId } });
    await deleteMunicipalities(prisma, [municipalityId, otherMunicipalityId]);
    await app.close();
  });

  const tokens = new Map<string, string>();
  beforeAll(async () => {
    for (const key of Object.keys(users) as UserKey[]) {
      const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ username: users[key].username, password }).expect(200);
      tokens.set(key, res.body.accessToken);
    }
  });
  const as = async (key: UserKey): Promise<string> => tokens.get(key)!;
  let keyCounter = 0;
  async function fill(who: UserKey, body: Record<string, unknown>, stationId = stationA.id) {
    keyCounter += 1;
    return request(app.getHttpServer())
      .post('/api/v1/fillups')
      .set('Authorization', `Bearer ${await as(who)}`)
      .set('Idempotency-Key', `e2e-p6-${runId}-${keyCounter}`)
      .send({ stationId, fuelType: 'PETROL_95', quantityLiters: 20, ...body });
  }
  const get = (who: UserKey, path: string) =>
    request(app.getHttpServer()).get(`/api/v1/${path}`).set('Authorization', `Bearer ${tokens.get(who)!}`);
  const patch = (who: UserKey, path: string, body: object) =>
    request(app.getHttpServer()).patch(`/api/v1/${path}`).set('Authorization', `Bearer ${tokens.get(who)!}`).send(body);
  const unread = async (who: UserKey, kind: string) => {
    const res = await get(who, 'notifications?limit=100').expect(200);
    return (res.body.items as Array<{ kind: string }>).filter((n) => n.kind === kind).length;
  };
  // A vehicle's second fill-up right after its first is blocked by the gap rule.
  async function blockedUse(index: number, extra: Record<string, unknown> = {}, stationId = stationA.id) {
    const v = vehicles[index]!;
    const first = await fill('employee', { cardNumber: v.cardNumber }, stationId);
    expect([200, 201, 422]).toContain(first.status);
    return fill('employee', { cardNumber: v.cardNumber, exceptionTypeId: limitedTypeId, reason: 'اختبار', ...extra }, stationId);
  }

  // ── Exception types with daily limits ────────────────────────────────

  describe('using an exception type', () => {
    it('a use within the limit is recorded at once, with no approval step, and logged', async () => {
      const res = await blockedUse(0);
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ isException: true });
      expect(res.body.exception).toMatchObject({
        exceptionTypeId: limitedTypeId,
        triggerReason: 'VEHICLE_GAP_TOO_SHORT',
        overLimit: false,
        approvedById: users.employee.id,
      });
      const audit = await prisma.auditLog.findFirst({ where: { entityId: res.body.id, action: 'CREATE' } });
      expect(audit?.newValue).toMatchObject({ exceptionTypeId: limitedTypeId, ruleOverridden: 'VEHICLE_GAP_TOO_SHORT' });
    });

    it('the station list for the picker shows today\'s uses, and the approve endpoint is gone', async () => {
      const types = await get('employee', `fillups/exception-types?stationId=${stationA.id}`).expect(200);
      const limited = (types.body as Array<{ id: string; usedToday: number; dailyLimitPerStation: number }>).find((t) => t.id === limitedTypeId);
      expect(limited).toMatchObject({ usedToday: 1, dailyLimitPerStation: 2 });
      await request(app.getHttpServer())
        .post('/api/v1/fillups/some-id/exceptions/approve')
        .set('Authorization', `Bearer ${await as('supervisor')}`)
        .expect(404);
    });

    it('a type that may override only another rule is refused for this one', async () => {
      const v = vehicles[1]!;
      await fill('employee', { cardNumber: v.cardNumber }).then((r) => expect([201, 422]).toContain(r.status));
      // Blocked by the gap rule, which gapOnly covers: allowed.
      const ok = await fill('employee', { cardNumber: v.cardNumber, exceptionTypeId: gapOnlyTypeId, reason: 'فاصل' });
      expect(ok.status).toBe(201);
      // Restrict it to another rule: now refused for the gap rule.
      await prisma.exceptionType.update({ where: { id: gapOnlyTypeId }, data: { overridableRules: ['OWNER_WEEKLY_CAP_REACHED'] } });
      const refused = await fill('employee', { cardNumber: v.cardNumber, exceptionTypeId: gapOnlyTypeId, reason: 'فاصل' });
      expect(refused.status).toBe(409);
      expect(refused.body.message).toBe('EXCEPTION_TYPE_NOT_FOR_RULE');
      await prisma.exceptionType.update({ where: { id: gapOnlyTypeId }, data: { overridableRules: [] } });
    });

    it('past the limit it is still allowed, flagged, and the supervisor and manager are told once for the day', async () => {
      const second = await blockedUse(2); // 2nd use of the type today at this station (1 used + 1)
      expect(second.status).toBe(201);
      expect(second.body.exception.overLimit).toBe(false);
      const third = await blockedUse(3); // past the limit of 2
      expect(third.status).toBe(201);
      expect(third.body.exception.overLimit).toBe(true);
      const fourth = await blockedUse(4);
      expect(fourth.status).toBe(201);
      expect(fourth.body.exception.overLimit).toBe(true);

      expect(await unread('supervisor', 'EXCEPTION_OVER_LIMIT')).toBe(1);
      expect(await unread('manager', 'EXCEPTION_OVER_LIMIT')).toBe(1);
      expect(await unread('otherSupervisor', 'EXCEPTION_OVER_LIMIT')).toBe(0);
    });

    it('the strict switch refuses past the limit; a municipality value wins over the global one', async () => {
      await setSetting('exceptions.strict_limit', 'true');
      const refused = await blockedUse(5);
      expect(refused.status).toBe(409);
      expect(refused.body.message).toBe('EXCEPTION_LIMIT_REACHED');
      expect(await prisma.fillUpTransaction.count({ where: { vehicleId: vehicles[5]!.id, isException: true } })).toBe(0);

      // The manager turns it OFF for their municipality: allowed again.
      await patch('manager', `exceptions/settings/municipality/${municipalityId}`, { strictLimit: false }).then((r) => expect(r.status).toBe(200));
      const allowed = await fill('employee', { cardNumber: vehicles[5]!.cardNumber, exceptionTypeId: limitedTypeId, reason: 'اختبار' });
      expect(allowed.status).toBe(201);
      expect(allowed.body.exception.overLimit).toBe(true);

      // Global off, municipality ON: refused.
      await setSetting('exceptions.strict_limit', 'false');
      await patch('manager', `exceptions/settings/municipality/${municipalityId}`, { strictLimit: true }).expect(200);
      const refusedAgain = await blockedUse(6);
      expect(refusedAgain.status).toBe(409);
      // Clearing the override returns to the global value.
      await patch('manager', `exceptions/settings/municipality/${municipalityId}`, { strictLimit: null }).expect(200);
      expect(
        await prisma.auditLog.count({ where: { action: 'UPDATE_EXCEPTION_SETTINGS', entityId: municipalityId, userId: users.manager.id } }),
      ).toBe(3);
    });

    it('a manager cannot change another municipality, and an employee cannot change settings', async () => {
      expect((await patch('manager', `exceptions/settings/municipality/${otherMunicipalityId}`, { strictLimit: true })).status).toBe(403);
      expect((await patch('employee', `exceptions/settings/municipality/${municipalityId}`, { strictLimit: true })).status).toBe(403);
      expect((await patch('manager', 'exceptions/settings', { strictLimit: true })).status).toBe(403);
      expect((await patch('admin', 'exceptions/settings', { stationDailyThreshold: 100 })).status).toBe(200);
    });

    it('a station past the unreasonable-daily threshold is flagged, with one notification that day', async () => {
      await setSetting('exceptions.station_daily_threshold', '5');
      // Station B has none yet: ten uses of a type with no limit there.
      for (let i = 0; i < 7; i++) {
        const v = vehicles[i % vehicles.length]!;
        await fill('supervisor', { cardNumber: v.cardNumber, exceptionTypeId: gapOnlyTypeId, reason: 'اختبار' }, stationA.id);
      }
      const flags = await prisma.exceptionFlag.findMany({ where: { stationId: stationA.id, kind: 'STATION_THRESHOLD' } });
      expect(flags).toHaveLength(1);
      expect(await unread('manager', 'EXCEPTION_STATION_FLAGGED')).toBe(1);
      expect(await unread('supervisor', 'EXCEPTION_STATION_FLAGGED')).toBe(0); // the one who caused it is excepted
    });
  });

  // ── Views and scope ───────────────────────────────────────────────────

  describe('who sees what', () => {
    it('a supervisor sees their own station only, with filters; flagged rows are marked', async () => {
      const mine = await get('supervisor', `exceptions?stationId=${stationA.id}`).expect(200);
      expect(mine.body.total).toBeGreaterThan(0);
      expect(mine.body.rows.every((r: { stationId: string }) => r.stationId === stationA.id)).toBe(true);
      expect(mine.body.rows.some((r: { overLimit: boolean }) => r.overLimit)).toBe(true);
      expect(mine.body.rows.some((r: { stationFlagged: boolean }) => r.stationFlagged)).toBe(true);

      await get('supervisor', `exceptions?stationId=${stationOther.id}`).then((r) => expect(r.status).toBe(403));
      const byType = await get('supervisor', `exceptions?stationId=${stationA.id}&typeId=${limitedTypeId}&flaggedOnly=true`).expect(200);
      expect(byType.body.rows.every((r: { typeId: string; overLimit: boolean }) => r.typeId === limitedTypeId && r.overLimit)).toBe(true);
      const byEmployee = await get('supervisor', `exceptions?stationId=${stationA.id}&employeeId=${users.employee.id}`).expect(200);
      expect(byEmployee.body.rows.every((r: { employeeId: string }) => r.employeeId === users.employee.id)).toBe(true);
    });

    it('without a stationId a supervisor is limited to their stations', async () => {
      const res = await get('otherSupervisor', 'exceptions').expect(200);
      expect(res.body.rows.every((r: { stationId: string }) => r.stationId === stationOther.id)).toBe(true);
    });

    it('a municipality manager sees stations of their municipality with counts and flags, never another municipality', async () => {
      const res = await get('manager', `exceptions/by-station?municipalityId=${municipalityId}`).expect(200);
      const a = res.body.stations.find((s: { stationId: string }) => s.stationId === stationA.id);
      expect(a.count).toBeGreaterThan(0);
      expect(a.flagged).toBe(true);
      const b = res.body.stations.find((s: { stationId: string }) => s.stationId === stationB.id);
      expect(b.count).toBe(0);
      expect(res.body.stations.find((s: { stationId: string }) => s.stationId === stationOther.id)).toBeUndefined();
      await get('manager', `exceptions/by-station?municipalityId=${otherMunicipalityId}`).then((r) => expect(r.status).toBe(403));
    });

    it('the super admin sees each municipality, then drills into one', async () => {
      const all = await get('admin', 'exceptions/by-station').expect(200);
      const mine = all.body.municipalities.find((m: { municipalityId: string }) => m.municipalityId === municipalityId);
      expect(mine.flaggedStations).toBeGreaterThanOrEqual(1);
      await get('admin', `exceptions/by-station?municipalityId=${municipalityId}`).expect(200);
    });

    it('an employee has no exceptions view', async () => {
      await get('employee', `exceptions?stationId=${stationA.id}`).then((r) => expect(r.status).toBe(403));
    });
  });

  // ── Tripoli day boundaries ────────────────────────────────────────────

  describe('the daily limit follows the Tripoli day', () => {
    it('23:59:59 Tripoli and 00:00:00 the next day count in different days', async () => {
      // A type with a limit of 1, strict on: the second use in one Tripoli day is refused.
      const type = await prisma.exceptionType.create({
        data: { key: `e2e_p6_one_${runId}`, name: `مرة واحدة ${runId}`, requiresProof: false, dailyLimitPerStation: 1 },
      });
      await setSetting('exceptions.strict_limit', 'true');
      const day = '2026-01-10';
      // 2026-01-10 23:59:59 in Tripoli (UTC+2) is 21:59:59Z; 00:00:00 on the 11th is 22:00:00Z.
      const lastSecond = '2026-01-10T21:59:59.000Z';
      const nextDay = '2026-01-10T22:00:00.000Z';
      expect(tripoliDay(new Date(lastSecond))).toBe(day);
      expect(tripoliDay(new Date(nextDay))).toBe('2026-01-11');
      const use = (index: number, at: string) =>
        fill('employee', { cardNumber: vehicles[index]!.cardNumber, exceptionTypeId: type.id, reason: 'يوم', occurredAt: at }, stationA.id);
      expect((await use(0, lastSecond)).status).toBe(201);
      expect((await use(1, lastSecond)).status).toBe(409); // same Tripoli day, over the limit
      expect((await use(2, nextDay)).status).toBe(201); // the next Tripoli day
      await setSetting('exceptions.strict_limit', 'false');
      await prisma.exception.deleteMany({ where: { exceptionTypeId: type.id } });
      await prisma.exceptionType.delete({ where: { id: type.id } });
    });
  });

  // ── Exception types: who manages which ────────────────────────────────

  describe('exception types are managed by municipality', () => {
    it('a manager creates and edits types of their own municipality only; the super admin the global ones', async () => {
      const key = `e2e_p6_m_${runId}`;
      const mine = await request(app.getHttpServer())
        .post('/api/v1/fillups/exception-types')
        .set('Authorization', `Bearer ${await as('manager')}`)
        .send({ key, name: 'نوع البلدية', dailyLimitPerStation: 3 });
      expect(mine.status).toBe(201);
      expect(mine.body.municipalityId).toBe(municipalityId);

      const otherMunicipality = await request(app.getHttpServer())
        .post('/api/v1/fillups/exception-types')
        .set('Authorization', `Bearer ${await as('manager')}`)
        .send({ key: `${key}_x`, name: 'x', municipalityId: otherMunicipalityId });
      expect(otherMunicipality.status).toBe(403);

      // A global type (no municipality) cannot be edited by a manager.
      const edit = await patch('manager', `fillups/exception-types/${limitedTypeId}`, { dailyLimitPerStation: 9 });
      expect(edit.status).toBe(403);
      const editMine = await patch('manager', `fillups/exception-types/${mine.body.id}`, { dailyLimitPerStation: 4 });
      expect(editMine.status).toBe(200);
      expect(editMine.body.dailyLimitPerStation).toBe(4);

      // It is offered at stations of that municipality, and not at another's.
      const here = await get('employee', `fillups/exception-types?stationId=${stationA.id}`).expect(200);
      expect(here.body.map((t: { id: string }) => t.id)).toContain(mine.body.id);

      const admin = await request(app.getHttpServer())
        .post('/api/v1/fillups/exception-types')
        .set('Authorization', `Bearer ${await as('admin')}`)
        .send({ key: `${key}_g`, name: 'نوع عام' });
      expect(admin.status).toBe(201);
      expect(admin.body.municipalityId).toBeNull();

      await prisma.exceptionType.deleteMany({ where: { id: { in: [mine.body.id, admin.body.id] } } });
    });
  });

  // ── The no-card fallback ──────────────────────────────────────────────

  describe('«بدون بطاقة»: a registered vehicle found by search', () => {
    let bare: { id: string; plate: string };

    beforeAll(async () => {
      const plate = `8-${String(Date.now()).slice(-6)}`;
      const vehicle = await prisma.vehicle.create({
        data: { internalCode: `E2E-P6-NC-${runId}`, currentPlate: plate, normalizedPlate: plate, ownerId, registrationBooklet: `E2EBK${runId}` },
      });
      vehicles.push({ id: vehicle.id, plate, cardNumber: '' });
      bare = { id: vehicle.id, plate };
    });

    it('search finds a registered vehicle by plate, owner name and booklet number', async () => {
      for (const search of [bare.plate, `E2E P6 Owner ${runId}`, `E2EBK${runId}`]) {
        const res = await get('employee', `vehicles?search=${encodeURIComponent(search)}`).expect(200);
        expect(JSON.stringify(res.body)).toContain(bare.id);
      }
    });

    it('needs a reason, and never works for an unregistered vehicle', async () => {
      const noReason = await fill('employee', { vehicleId: bare.id });
      expect(noReason.status).toBe(409);
      expect(noReason.body.message).toBe('CARD_REQUIRED');
      const badReason = await fill('employee', { vehicleId: bare.id, noCardReason: 'BECAUSE' });
      expect(badReason.status).toBe(400);
      const unknown = await fill('employee', { vehicleId: 'does-not-exist', noCardReason: 'CARD_DAMAGED' });
      expect(unknown.status).toBe(404);
      expect(unknown.body.message).toBe('VEHICLE_NOT_REGISTERED');
      // A typed plate on its own is never accepted.
      const typed = await fill('employee', { plate: bare.plate, noCardReason: 'CARD_DAMAGED' });
      expect(typed.status).toBe(400);
    });

    it('is not accepted next to a card scan', async () => {
      const res = await fill('employee', { cardNumber: vehicles[7]!.cardNumber, noCardReason: 'CARD_NOT_FOUND' });
      expect(res.status).toBe(409);
      expect(res.body.message).toBe('NO_CARD_NOT_NEEDED');
    });

    it('records as NO_CARD with its reason, audited, the rules still apply, and the preview agrees', async () => {
      const preview = await request(app.getHttpServer())
        .get('/api/v1/fillups/rule-preview')
        .query({ stationId: stationA.id, vehicleId: bare.id, noCardReason: 'CAMERA_NOT_WORKING' })
        .set('Authorization', `Bearer ${await as('employee')}`)
        .expect(200);
      expect(preview.body.identifiedBy).toBe('NO_CARD');

      const res = await fill('employee', { vehicleId: bare.id, noCardReason: 'CAMERA_NOT_WORKING' });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ identifiedBy: 'NO_CARD', noCardReason: 'CAMERA_NOT_WORKING', isException: false });
      const audit = await prisma.auditLog.findFirst({ where: { entityId: res.body.id, action: 'FILLUP_NO_CARD' } });
      expect(audit?.userId).toBe(users.employee.id);
      expect(audit?.newValue).toMatchObject({ noCardReason: 'CAMERA_NOT_WORKING' });

      const again = await fill('employee', { vehicleId: bare.id, noCardReason: 'CAMERA_NOT_WORKING' });
      expect(again.status).toBe(422);
      expect(again.body.reason).toBe('VEHICLE_GAP_TOO_SHORT');
    });

    it('is counted in the daily and station reports, filterable by station and employee', async () => {
      const today = tripoliDay(new Date());
      const daily = await get('supervisor', `reports/daily?stationId=${stationA.id}&date=${new Date().toISOString().slice(0, 10)}`).expect(200);
      expect(daily.body.noCardCount).toBeGreaterThanOrEqual(1);
      const onlyNoCard = await get(
        'supervisor',
        `reports/daily?stationId=${stationA.id}&date=${new Date().toISOString().slice(0, 10)}&noCard=true&employeeId=${users.employee.id}`,
      ).expect(200);
      expect(onlyNoCard.body.totalFillUps).toBe(onlyNoCard.body.noCardCount);
      const station = await get('supervisor', `ops-reports/station?stationId=${stationA.id}&from=${today}&to=${today}`).expect(200);
      const ident = station.body.tables.find((t: { id: string }) => t.id === 'identification');
      expect(JSON.stringify(ident.rows)).toContain('بدون بطاقة');
      const flags = station.body.tables.find((t: { id: string }) => t.id === 'exceptions');
      expect(flags.columns.map((c: { key: string }) => c.key)).toContain('noCard');
    });
  });

  // ── The emergency override is gone ────────────────────────────────────

  it('the emergency override fields are refused as unknown', async () => {
    const res = await fill('supervisor', { vehicleId: vehicles[0]!.id, emergencyOverride: true, overrideReason: 'x y z' });
    expect(res.status).toBe(400);
  });
});
