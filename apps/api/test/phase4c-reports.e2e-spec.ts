import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { tripoliDay } from '../src/common/utils/grace-stage';
import { addDays } from '../src/common/utils/tripoli';
import { createMunicipality, deleteMunicipalities } from './support/municipality-fixtures';

// Registration pivot, phase 4c — the monitoring reports, through the real
// endpoints:
//  1. registration-office monitoring (cards, vehicles, people, per employee);
//  2. card-stock reconciliation (insert-only entries, corrections, the arithmetic);
//  3. deadline readiness (cards vs no-card, the estimate with and without a deadline);
// plus scoping (a registration supervisor sees only their own offices, a station
// supervisor only their own stations, registration employees nothing) and the
// Tripoli-midnight day boundary in every daily figure.
//
// Fixtures sit on fixed days in September 2026 so the numbers are exact; the
// readiness headline uses the last few days, so those rows are relative to now.
describe('Phase 4c — monitoring reports (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authService: AuthService;

  const runId = Date.now().toString(36);
  const prefix = `e2e_p4c_${runId}`;
  // Fixture plates are built from this run-specific number so none can clash with a real vehicle.
  const plateBase = String(parseInt(runId, 36)).padStart(8, '1').slice(-6);
  const password = 'BoundaryTest123!';

  type UserKey = 'regSup1' | 'regSup2' | 'regEmp1' | 'regEmp2' | 'admin' | 'stSup' | 'stEmp';
  const roleIds: string[] = [];
  const userIds = {} as Record<UserKey, string>;
  const tokens = {} as Record<UserKey, string>;
  const vehicleIds: string[] = [];
  const fillUpIds: string[] = [];
  let companyId: string;
  let municipalityId: string;
  let s1: string;
  let s2: string;
  let r1: string;
  let r2: string;
  let d1: string;
  let d2: string;

  async function makeRole(key: string, kind: 'PETROL_STATION' | 'REGISTRATION' | null, permissionKeys: string[], unrestricted = false) {
    const role = await prisma.role.create({ data: { name: `${prefix}_${key}`, kind, unrestrictedStationAccess: unrestricted } });
    roleIds.push(role.id);
    for (const permissionKey of permissionKeys) {
      const permission = await prisma.permission.upsert({ where: { key: permissionKey }, create: { key: permissionKey }, update: {} });
      await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    }
    return role.id;
  }

  async function makeUser(
    key: UserKey,
    roleId: string,
    scope: { stations?: string[]; offices?: string[] } = {},
    extra: { isActive?: boolean; lastLoginAt?: Date } = {},
  ) {
    const user = await prisma.user.create({
      data: {
        username: `${prefix}_${key}`,
        passwordHash: await argon2.hash(password),
        fullName: `P4C ${key}`,
        isActive: extra.isActive ?? true,
        lastLoginAt: extra.lastLoginAt ?? null,
      },
    });
    userIds[key] = user.id;
    await prisma.userRole.create({ data: { userId: user.id, roleId } });
    for (const stationId of scope.stations ?? []) await prisma.userStationScope.create({ data: { userId: user.id, stationId } });
    for (const registrationStationId of scope.offices ?? []) {
      await prisma.userRegistrationStationScope.create({ data: { userId: user.id, registrationStationId } });
    }
    tokens[key] = (await authService.issueTokenPair(user.id, user.username)).accessToken;
  }

  let vehicleCounter = 0;
  async function makeVehicle(opts: { office?: string; by?: UserKey; createdAt?: Date; plate?: string }) {
    vehicleCounter += 1;
    const plate = opts.plate ?? `9-${plateBase}${String(vehicleCounter).padStart(2, '0')}`;
    const vehicle = await prisma.vehicle.create({
      data: {
        internalCode: `${prefix}-V${vehicleCounter}`,
        currentPlate: plate,
        normalizedPlate: plate,
        model: 'تويوتا',
        color: 'أبيض',
        registeredAtRegistrationStationId: opts.office ?? null,
        registeredById: opts.by ? userIds[opts.by] : null,
        ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
      },
    });
    vehicleIds.push(vehicle.id);
    return vehicle;
  }

  let cardCounter = 0;
  async function makeCard(opts: {
    vehicleId: string;
    office: string;
    desk: string;
    by: UserKey;
    at: string;
    reason: 'FIRST_ISSUE' | 'LOST' | 'DAMAGED' | 'FAILED_PRINT' | 'DETAILS_CHANGED';
    status?: 'ACTIVE' | 'CANCELLED' | 'REPLACED';
    cancelReason?: string;
    cancelledAt?: string;
  }) {
    cardCounter += 1;
    const status = opts.status ?? 'ACTIVE';
    return prisma.vehicleCard.create({
      data: {
        cardNumber: `P4C-${runId.toUpperCase()}${String(cardCounter).padStart(4, '0')}`,
        vehicleId: opts.vehicleId,
        registrationStationId: opts.office,
        deskId: opts.desk,
        issuedById: userIds[opts.by],
        issuedAt: new Date(opts.at),
        reason: opts.reason,
        status,
        activeForVehicleId: status === 'ACTIVE' ? opts.vehicleId : null,
        cancelledAt: status === 'CANCELLED' ? new Date(opts.cancelledAt ?? opts.at) : null,
        cancelledById: status === 'CANCELLED' ? userIds[opts.by] : null,
        cancelReason: status === 'CANCELLED' ? (opts.cancelReason ?? 'x') : null,
        printedPlate: 'x',
        printedVehicleLine: 'x',
        printedOfficeName: 'x',
        printedIssueDate: opts.at.slice(0, 10),
        printedStationCode: 'x',
      },
    });
  }

  let fillUpCounter = 0;
  async function makeFillUp(opts: {
    station: string;
    at: string;
    identifiedBy: 'CARD_SCAN' | 'TYPED_REGISTERED' | 'TYPED_UNREGISTERED' | 'EMERGENCY_OVERRIDE';
    vehicleId?: string;
    plate?: string;
  }) {
    fillUpCounter += 1;
    const row = await prisma.fillUpTransaction.create({
      data: {
        stationId: opts.station,
        municipalityId,
        fuelType: 'PETROL_95',
        quantityLiters: 10,
        occurredAt: new Date(opts.at),
        recordedById: userIds.stEmp,
        idempotencyKey: `${prefix}-f${fillUpCounter}`,
        identifiedBy: opts.identifiedBy,
        ...(opts.vehicleId ? { vehicleId: opts.vehicleId } : { typedPlate: opts.plate!, normalizedPlate: opts.plate! }),
      },
    });
    fillUpIds.push(row.id);
    return row;
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
    authService = moduleRef.get(AuthService);

    companyId = (await prisma.company.create({ data: { name: `P4C Company ${runId}` } })).id;
    municipalityId = (await createMunicipality(prisma, `P4C Municipality ${runId}`)).id;
    const station = async (key: string, n: string) =>
      (await prisma.station.create({ data: { internalCode: `P4C-${runId}-${key}`, stationNumber: n, name: `P4C station ${key}`, companyId, municipalityId } })).id;
    s1 = await station('S1', '1');
    s2 = await station('S2', '2');
    const office = async (key: string) =>
      (await prisma.registrationStation.create({ data: { internalCode: `P4C-${runId}-${key}`, name: `P4C office ${key}`, municipalityId, address: 'x' } })).id;
    r1 = await office('R1');
    r2 = await office('R2');
    d1 = (await prisma.registrationDesk.create({ data: { registrationStationId: r1, name: 'Desk 1' } })).id;
    d2 = (await prisma.registrationDesk.create({ data: { registrationStationId: r2, name: 'Desk 2' } })).id;

    const regSupervisorRole = await makeRole('regSupervisor', 'REGISTRATION', [
      'registration_reports:view', 'card_stock:read', 'card_stock:record', 'readiness:view', 'cards:issue',
    ]);
    const regEmployeeRole = await makeRole('regEmployee', 'REGISTRATION', ['cards:issue', 'vehicles:read']);
    const adminRole = await makeRole('admin', null, ['registration_reports:view', 'card_stock:read', 'readiness:view'], true);
    const stationSupervisorRole = await makeRole('stSupervisor', 'PETROL_STATION', ['readiness:view', 'stations:read']);
    const stationEmployeeRole = await makeRole('stEmployee', 'PETROL_STATION', ['fillups:create']);

    await makeUser('regSup1', regSupervisorRole, { offices: [r1] }, { lastLoginAt: new Date('2026-10-01T08:00:00Z') });
    await makeUser('regSup2', regSupervisorRole, { offices: [r2] });
    await makeUser('regEmp1', regEmployeeRole, { offices: [r1] }, { lastLoginAt: new Date('2026-10-03T08:00:00Z') });
    await makeUser('regEmp2', regEmployeeRole, { offices: [r1] }, { isActive: false });
    await makeUser('admin', adminRole);
    await makeUser('stSup', stationSupervisorRole, { stations: [s1] });
    await makeUser('stEmp', stationEmployeeRole, { stations: [s1] });

    // ── Office R1: cards, vehicles, duplicates, corrections ───────────────
    const created = new Date('2026-09-12T08:00:00Z');
    const v: Awaited<ReturnType<typeof makeVehicle>>[] = [];
    for (let i = 0; i < 6; i++) v.push(await makeVehicle({ office: r1, by: 'regEmp1', createdAt: created }));
    const v2 = await makeVehicle({ office: r2, by: 'regSup2', createdAt: created });
    const at = (iso: string) => iso;
    await makeCard({ vehicleId: v[0]!.id, office: r1, desk: d1, by: 'regEmp1', at: at('2026-09-12T08:00:00.000Z'), reason: 'FIRST_ISSUE' });
    // Just before and just after Tripoli midnight (22:00 UTC) on 14/15 September.
    await makeCard({ vehicleId: v[1]!.id, office: r1, desk: d1, by: 'regEmp1', at: at('2026-09-14T21:59:59.999Z'), reason: 'FIRST_ISSUE' });
    await makeCard({ vehicleId: v[2]!.id, office: r1, desk: d1, by: 'regEmp1', at: at('2026-09-14T22:00:00.000Z'), reason: 'FIRST_ISSUE' });
    await makeCard({ vehicleId: v[3]!.id, office: r1, desk: d1, by: 'regEmp1', at: at('2026-09-15T09:00:00.000Z'), reason: 'LOST' });
    // A misprint: the first card is cancelled for FAILED_PRINT, its replacement is a FAILED_PRINT issue.
    await makeCard({
      vehicleId: v[4]!.id, office: r1, desk: d1, by: 'regEmp1', at: at('2026-09-16T08:50:00.000Z'), reason: 'FIRST_ISSUE',
      status: 'CANCELLED', cancelReason: 'FAILED_PRINT', cancelledAt: '2026-09-16T08:59:00.000Z',
    });
    const reprintCard = await makeCard({ vehicleId: v[4]!.id, office: r1, desk: d1, by: 'regEmp1', at: at('2026-09-16T09:00:00.000Z'), reason: 'FAILED_PRINT' });
    await makeCard({ vehicleId: v2.id, office: r2, desk: d2, by: 'regSup2', at: at('2026-09-12T08:00:00.000Z'), reason: 'FIRST_ISSUE' });

    await prisma.duplicateCatch.createMany({
      data: [
        { registrationStationId: r1, userId: userIds.regEmp1, fields: ['PLATE'], occurredAt: new Date('2026-09-13T08:00:00Z') },
        { registrationStationId: r1, userId: userIds.regEmp1, fields: ['CHASSIS', 'BOOKLET'], occurredAt: new Date('2026-09-13T09:00:00Z') },
        { registrationStationId: r2, userId: userIds.regSup2, fields: ['PLATE'], occurredAt: new Date('2026-09-13T08:00:00Z') },
      ],
    });
    for (const [status, n] of [['PENDING', 1], ['APPROVED', 2], ['REJECTED', 3]] as const) {
      await prisma.vehicleChangeRequest.create({
        data: {
          vehicleId: v[0]!.id, changeType: 'CHASSIS_CHANGE', currentValue: 'a', requestedValue: `b${n}`, reason: 'typo',
          proofReference: 'p', status, requestedById: userIds.regEmp1, createdAt: new Date('2026-09-13T10:00:00Z'),
        },
      });
    }
    // Prints: a first print and a reprint of one card, and a test card.
    await prisma.cardPrint.createMany({
      data: [
        { registrationStationId: r1, deskId: d1, kind: 'CARD', cardId: reprintCard.id, printedById: userIds.regEmp1, printedAt: new Date('2026-09-16T09:05:00Z') },
        { registrationStationId: r1, deskId: d1, kind: 'CARD', cardId: reprintCard.id, printedById: userIds.regEmp1, printedAt: new Date('2026-09-16T09:10:00Z') },
        { registrationStationId: r1, deskId: d1, kind: 'TEST', cardId: null, printedById: userIds.regEmp1, printedAt: new Date('2026-09-17T09:00:00Z') },
      ],
    });
    // An audit row that carries personal data, to prove the timeline never shows it.
    await prisma.auditLog.create({
      data: {
        userId: userIds.regEmp1, action: 'CREATE', entityType: 'VehicleOwner', entityId: 'x',
        newValue: { identityNumber: '119999999999', phone: '0912345678', cardNumber: 'P4C-SAFE' },
        createdAt: new Date('2026-09-13T11:00:00Z'),
      },
    });

    // ── Fill-ups at station S1 / S2 (municipality M) ──────────────────────
    // Registered before the report range, so they do not count as new vehicles in it.
    const earlier = new Date('2026-09-01T08:00:00Z');
    const carded = await makeVehicle({ office: r1, by: 'regEmp1', createdAt: earlier, plate: `7-${plateBase}1` });
    const uncarded = await makeVehicle({ office: r1, by: 'regEmp1', createdAt: earlier, plate: `7-${plateBase}2` });
    await makeCard({ vehicleId: carded.id, office: r1, desk: d1, by: 'regEmp1', at: '2026-09-01T08:00:00.000Z', reason: 'FIRST_ISSUE' });
    await makeFillUp({ station: s1, at: '2026-09-14T09:00:00Z', identifiedBy: 'CARD_SCAN', vehicleId: carded.id });
    await makeFillUp({ station: s1, at: '2026-09-14T09:10:00Z', identifiedBy: 'CARD_SCAN', vehicleId: carded.id });
    await makeFillUp({ station: s1, at: '2026-09-14T09:20:00Z', identifiedBy: 'TYPED_REGISTERED', vehicleId: uncarded.id });
    await makeFillUp({ station: s1, at: '2026-09-14T09:30:00Z', identifiedBy: 'TYPED_UNREGISTERED', plate: `8-${plateBase}1` });
    await makeFillUp({ station: s1, at: '2026-09-14T09:40:00Z', identifiedBy: 'TYPED_UNREGISTERED', plate: `8-${plateBase}2` });
    await makeFillUp({ station: s1, at: '2026-09-14T09:50:00Z', identifiedBy: 'EMERGENCY_OVERRIDE', plate: `8-${plateBase}3` });
    await makeFillUp({ station: s2, at: '2026-09-14T10:00:00Z', identifiedBy: 'TYPED_UNREGISTERED', plate: `8-${plateBase}4` });
    // Tripoli midnight: 23:59:59.999 is still the 14th, 00:00:00.000 is the 15th.
    await makeFillUp({ station: s1, at: '2026-09-14T21:59:59.999Z', identifiedBy: 'CARD_SCAN', vehicleId: carded.id });
    await makeFillUp({ station: s1, at: '2026-09-14T22:00:00.000Z', identifiedBy: 'CARD_SCAN', vehicleId: carded.id });
  }, 120_000);

  afterAll(async () => {
    const users = await prisma.user.findMany({ where: { username: { startsWith: prefix } }, select: { id: true } });
    const ids = users.map((u) => u.id);
    const stations = [r1, r2];
    // Stock entries are insert-only by design (a database trigger), so the test
    // lifts that guard on its own rows to clean up. A real database never does.
    await prisma.$executeRawUnsafe('ALTER TABLE "StockEntry" DISABLE TRIGGER "stock_entry_no_update_delete"');
    try {
      await prisma.stockEntry.deleteMany({ where: { registrationStationId: { in: stations }, correctsEntryId: { not: null } } });
      await prisma.stockEntry.deleteMany({ where: { registrationStationId: { in: stations } } });
    } finally {
      await prisma.$executeRawUnsafe('ALTER TABLE "StockEntry" ENABLE TRIGGER "stock_entry_no_update_delete"');
    }
    await prisma.fillUpTransaction.deleteMany({ where: { id: { in: fillUpIds } } });
    await prisma.cardPrint.deleteMany({ where: { registrationStationId: { in: stations } } });
    await prisma.vehicleChangeRequest.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.vehicleCard.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.vehicle.deleteMany({ where: { id: { in: vehicleIds } } });
    await prisma.duplicateCatch.deleteMany({ where: { registrationStationId: { in: stations } } });
    await prisma.auditLog.deleteMany({ where: { OR: [{ userId: { in: ids } }, { entityId: { in: ids } }] } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.userStationScope.deleteMany({ where: { userId: { in: ids } } });
    await prisma.userRegistrationStationScope.deleteMany({ where: { userId: { in: ids } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await prisma.registrationDesk.deleteMany({ where: { registrationStationId: { in: stations } } });
    await prisma.registrationStation.deleteMany({ where: { id: { in: stations } } });
    await prisma.station.deleteMany({ where: { id: { in: [s1, s2] } } });
    await prisma.company.delete({ where: { id: companyId } });
    await deleteMunicipalities(prisma, [municipalityId]);
    await app.close();
  });

  const api = () => request(app.getHttpServer());
  const get = (as: UserKey, path: string) => api().get(`/api/v1${path}`).set('Authorization', `Bearer ${tokens[as]}`);
  const post = (as: UserKey, path: string, body: object = {}) => api().post(`/api/v1${path}`).set('Authorization', `Bearer ${tokens[as]}`).send(body);
  const RANGE = 'from=2026-09-10&to=2026-09-20';

  // ── scoping ─────────────────────────────────────────────────────────

  describe('who sees what', () => {
    it('a registration employee reaches none of it', async () => {
      for (const path of [
        `/reports/registration/offices?${RANGE}`,
        `/reports/registration/offices/${r1}/employees?${RANGE}`,
        `/reports/registration/employees/${userIds.regEmp1}/activity?${RANGE}`,
        `/card-stock/entries?${RANGE}`,
        `/card-stock/reconciliation?${RANGE}`,
        `/reports/readiness?${RANGE}`,
        `/reports/registration/offices/export?format=pdf&${RANGE}`,
      ]) {
        await get('regEmp1', path).expect(403);
      }
      await post('regEmp1', '/card-stock/entries', { registrationStationId: r1, kind: 'COUNT', quantity: 1 }).expect(403);
    });

    it('a registration supervisor sees only their own offices', async () => {
      const mine = await get('regSup1', `/reports/registration/offices?${RANGE}`).expect(200);
      expect(mine.body.offices.map((o: { id: string }) => o.id)).toEqual([r1]);
      const other = await get('regSup2', `/reports/registration/offices?${RANGE}`).expect(200);
      expect(other.body.offices.map((o: { id: string }) => o.id)).toEqual([r2]);

      await get('regSup2', `/reports/registration/offices/${r1}/employees?${RANGE}`).expect(403);
      await get('regSup2', `/reports/registration/employees/${userIds.regEmp1}/activity?${RANGE}`).expect(403);
      await get('regSup2', `/card-stock/entries?registrationStationId=${r1}`).expect(403);
      await get('regSup2', `/card-stock/reconciliation?registrationStationId=${r1}`).expect(403);
      await post('regSup2', '/card-stock/entries', { registrationStationId: r1, kind: 'COUNT', quantity: 5 }).expect(403);

      const stock = await get('regSup1', `/card-stock/reconciliation?${RANGE}`).expect(200);
      expect(stock.body.pools.every((p: { registrationStation: { id: string } }) => p.registrationStation.id === r1)).toBe(true);
    });

    it('the admin sees every office and reads stock, but cannot record it', async () => {
      const all = await get('admin', `/reports/registration/offices?${RANGE}`).expect(200);
      expect(all.body.offices.map((o: { id: string }) => o.id)).toEqual(expect.arrayContaining([r1, r2]));
      await get('admin', `/card-stock/reconciliation?${RANGE}`).expect(200);
      await post('admin', '/card-stock/entries', { registrationStationId: r1, kind: 'COUNT', quantity: 5 }).expect(403);
    });

    it('a station supervisor sees the card figures of their own stations only, and nothing on registration', async () => {
      const res = await get('stSup', `/reports/readiness?municipalityId=${municipalityId}&${RANGE}`).expect(200);
      expect(res.body.sees).toEqual({ stations: 'own', offices: 'none', headline: false });
      expect(res.body.headline).toBeNull();
      expect(res.body.stations.map((s: { id: string }) => s.id)).toEqual([s1]);
      expect(res.body.offices).toEqual([]);
      // S2's fill-up is not in their numbers.
      const day = res.body.daily.find((d: { day: string }) => d.day === '2026-09-14');
      expect(day.withoutCard).toBe(4);
      await get('stSup', `/reports/registration/offices?${RANGE}`).expect(403);
      await get('stSup', `/card-stock/reconciliation?${RANGE}`).expect(403);
    });

    it('a registration supervisor sees their own offices issuance only, with no headline', async () => {
      const res = await get('regSup1', `/reports/readiness?municipalityId=${municipalityId}&${RANGE}`).expect(200);
      expect(res.body.sees).toEqual({ stations: 'none', offices: 'own', headline: false });
      expect(res.body.headline).toBeNull();
      expect(res.body.stations).toEqual([]);
      expect(res.body.offices.map((o: { id: string }) => o.id)).toEqual([r1]);
    });
  });

  // ── 1. office monitoring ────────────────────────────────────────────

  describe('registration-office monitoring', () => {
    it('counts cards by kind and standing, vehicles, duplicates, corrections and people per office', async () => {
      const res = await get('admin', `/reports/registration/offices?${RANGE}`).expect(200);
      const office = res.body.offices.find((o: { id: string }) => o.id === r1);
      expect(office.cards).toMatchObject({
        // Issued here in range: first x3 on the 12th/14th/15th, a lost-card replacement, the misprint and its reprint
        // (the 7-1000001 vehicle's card was issued on 1 September, outside the range).
        issued: 6,
        first: 4,
        replacements: { lost: 1, damaged: 0, detailsChanged: 0, total: 1 },
        failedPrintReprints: 1,
        wastedCards: 1,
        active: 5,
        cancelled: 1,
        replaced: 0,
      });
      expect(office.vehicles).toMatchObject({
        registered: 6,
        duplicatesCaught: 2,
        corrections: { requested: 3, pending: 1, approved: 1, rejected: 1 },
      });
      expect(office.people).toMatchObject({ total: 3, active: 2, deactivated: 1 });
      expect(new Date(office.people.lastLoginAt).toISOString()).toBe('2026-10-03T08:00:00.000Z');
      const other = res.body.offices.find((o: { id: string }) => o.id === r2);
      expect(other.cards.issued).toBe(1);
      expect(other.vehicles.duplicatesCaught).toBe(1);
    });

    it('says since when duplicates have been recorded, never inventing earlier history', async () => {
      const res = await get('admin', `/reports/registration/offices?${RANGE}`).expect(200);
      expect(res.body.duplicatesRecordedSince).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('per employee: vehicles, cards, reprints, failed prints, test prints and corrections', async () => {
      const res = await get('regSup1', `/reports/registration/offices/${r1}/employees?${RANGE}`).expect(200);
      const emp = res.body.employees.find((e: { id: string }) => e.id === userIds.regEmp1);
      expect(emp).toMatchObject({
        vehiclesRegistered: 6,
        cardsIssued: 6,
        reprints: 1, // the second print of one card
        failedPrints: 1,
        testPrints: 1,
        correctionsRequested: 3,
        isActive: true,
      });
      expect(res.body.employees.find((e: { id: string }) => e.id === userIds.regEmp2).isActive).toBe(false);
    });

    it("an employee's timeline lists their audit entries and never personal data", async () => {
      const res = await get('regSup1', `/reports/registration/employees/${userIds.regEmp1}/activity?${RANGE}`).expect(200);
      expect(res.body.employee.offices.map((o: { id: string }) => o.id)).toEqual([r1]);
      const row = res.body.rows.find((r: { action: string; entityType: string }) => r.entityType === 'VehicleOwner');
      expect(row.detail).toEqual({ cardNumber: 'P4C-SAFE' });
      expect(JSON.stringify(res.body)).not.toContain('119999999999');
      expect(JSON.stringify(res.body)).not.toContain('0912345678');
    });

    it('day boundaries follow Tripoli midnight: 23:59:59.999 is the 14th, 00:00:00.000 the 15th', async () => {
      const issuedOn = async (from: string, to: string) =>
        (await get('admin', `/reports/registration/offices?from=${from}&to=${to}`).expect(200)).body.offices.find((o: { id: string }) => o.id === r1).cards.issued;
      expect(await issuedOn('2026-09-14', '2026-09-14')).toBe(1); // only the card at 21:59:59.999Z
      expect(await issuedOn('2026-09-15', '2026-09-15')).toBe(2); // the card at 22:00:00Z and the one at 09:00Z
    });

    it('rejects a malformed or reversed range', async () => {
      await get('admin', '/reports/registration/offices?from=2026-9-1&to=2026-09-20').expect(400);
      expect((await get('admin', '/reports/registration/offices?from=2026-09-20&to=2026-09-10').expect(400)).body.message).toBe('RANGE_REVERSED');
    });
  });

  // ── 2. card stock ───────────────────────────────────────────────────

  describe('card-stock reconciliation', () => {
    const entry = (kind: 'RECEIVED' | 'COUNT', quantity: number, occurredAt: string, extra: object = {}) =>
      post('regSup1', '/card-stock/entries', { registrationStationId: r1, kind, quantity, occurredAt, ...extra });
    const entries: Record<string, { id: string }> = {};
    const STOCK_RANGE = 'from=2026-09-01&to=2026-09-09';

    it('records counts, and prints inside each window are counted by the system', async () => {
      entries.t1 = (await entry('COUNT', 100, '2026-09-01T08:00:00.000Z').expect(201)).body;
      await prisma.cardPrint.createMany({
        data: [
          ...Array.from({ length: 8 }, () => ({ registrationStationId: r1, deskId: d1, kind: 'CARD' as const, printedById: userIds.regEmp1, printedAt: new Date('2026-09-01T12:00:00Z') })),
          ...Array.from({ length: 2 }, () => ({ registrationStationId: r1, deskId: d1, kind: 'TEST' as const, printedById: userIds.regEmp1, printedAt: new Date('2026-09-01T12:30:00Z') })),
        ],
      });
      entries.t2 = (await entry('COUNT', 90, '2026-09-02T08:00:00.000Z').expect(201)).body;
      await prisma.cardPrint.createMany({
        data: Array.from({ length: 15 }, () => ({ registrationStationId: r1, deskId: d1, kind: 'CARD' as const, printedById: userIds.regEmp1, printedAt: new Date('2026-09-02T12:00:00Z') })),
      });
      entries.t3 = (await entry('COUNT', 70, '2026-09-03T08:00:00.000Z').expect(201)).body;
      entries.t4 = (await entry('COUNT', 80, '2026-09-04T08:00:00.000Z').expect(201)).body;

      const res = await get('regSup1', `/card-stock/reconciliation?registrationStationId=${r1}&${STOCK_RANGE}`).expect(200);
      const pool = res.body.pools.find((p: { desk: unknown }) => p.desk === null);
      expect(pool.windows.map((w: { used: number; prints: { total: number; test: number }; difference: number; status: string }) => [w.used, w.prints.total, w.prints.test, w.difference, w.status])).toEqual([
        [10, 10, 2, 0, 'OK'], // 100 → 90: 10 used; 8 card + 2 test prints
        [20, 15, 0, 5, 'UNACCOUNTED'], // 90 → 70: 20 left the box, 15 recorded: 5 cards unaccounted for
        [-10, 0, 0, -10, 'NEGATIVE'], // 70 → 80: more blanks than before: a counting error
      ]);
      expect(pool.totals).toMatchObject({ unaccountedCards: 5, unaccountedWindows: 1, negativeWindows: 1 });
    });

    it('a delivery between two counts is part of the arithmetic', async () => {
      await entry('RECEIVED', 50, '2026-09-05T08:00:00.000Z').expect(201);
      await entry('COUNT', 125, '2026-09-06T08:00:00.000Z').expect(201); // 80 + 50 − 125 = 5 used, 0 printed
      const res = await get('regSup1', `/card-stock/reconciliation?registrationStationId=${r1}&${STOCK_RANGE}`).expect(200);
      const last = res.body.pools.find((p: { desk: unknown }) => p.desk === null).windows.at(-1);
      expect(last).toMatchObject({ received: 50, used: 5, difference: 5, status: 'UNACCOUNTED' });
    });

    it('a correction never edits: it is a new linked entry, and it changes the windows around it', async () => {
      const fix = await post('regSup1', `/card-stock/entries/${entries.t3!.id}/corrections`, { quantity: 75, reason: 'Miscounted a stack' }).expect(201);
      expect(fix.body).toMatchObject({ kind: 'CORRECTION', correctsEntryId: entries.t3!.id, quantity: 75 });

      const original = await prisma.stockEntry.findUniqueOrThrow({ where: { id: entries.t3!.id } });
      expect(original.quantity).toBe(70); // the original is untouched

      const res = await get('regSup1', `/card-stock/reconciliation?registrationStationId=${r1}&${STOCK_RANGE}`).expect(200);
      const windows = res.body.pools.find((p: { desk: unknown }) => p.desk === null).windows;
      expect(windows[1]).toMatchObject({ used: 15, difference: 0, status: 'OK' }); // 90 → 75: now matches the 15 prints
      expect(windows[2]).toMatchObject({ used: -5, difference: -5, status: 'NEGATIVE' });

      const list = await get('regSup1', `/card-stock/entries?registrationStationId=${r1}&${STOCK_RANGE}`).expect(200);
      const shown = list.body.entries.find((e: { id: string }) => e.id === entries.t3!.id);
      expect(shown).toMatchObject({ originalQuantity: 70, quantity: 75, corrected: true });
      expect(shown.corrections[0]).toMatchObject({ quantity: 75, reason: 'Miscounted a stack' });
    });

    it('the latest of several corrections wins; a correction needs a reason; only the original can be corrected', async () => {
      await post('regSup1', `/card-stock/entries/${entries.t3!.id}/corrections`, { quantity: 72, reason: 'Counted again' }).expect(201);
      const list = await get('regSup1', `/card-stock/entries?registrationStationId=${r1}&${STOCK_RANGE}`).expect(200);
      expect(list.body.entries.find((e: { id: string }) => e.id === entries.t3!.id).quantity).toBe(72);

      await post('regSup1', `/card-stock/entries/${entries.t3!.id}/corrections`, { quantity: 70 }).expect(400);
      await post('regSup1', `/card-stock/entries/${entries.t3!.id}/corrections`, { quantity: 70, reason: 'ab' }).expect(400);
      const aCorrection = await prisma.stockEntry.findFirstOrThrow({ where: { correctsEntryId: entries.t3!.id } });
      expect((await post('regSup1', `/card-stock/entries/${aCorrection.id}/corrections`, { quantity: 1, reason: 'Trying a correction of a correction' }).expect(400)).body.message).toBe('CORRECT_THE_ORIGINAL');
      await post('regSup2', `/card-stock/entries/${entries.t3!.id}/corrections`, { quantity: 1, reason: 'Not my office' }).expect(403);
    });

    it('entries can never be edited or deleted: no such endpoint, and the database refuses too', async () => {
      const id = entries.t1!.id;
      for (const method of ['patch', 'put', 'delete'] as const) {
        const res = await api()[method](`/api/v1/card-stock/entries/${id}`).set('Authorization', `Bearer ${tokens.regSup1}`).send({ quantity: 1 });
        expect([404, 405]).toContain(res.status);
      }
      await expect(prisma.stockEntry.update({ where: { id }, data: { quantity: 1 } })).rejects.toThrow(/insert-only/);
      await expect(prisma.stockEntry.delete({ where: { id } })).rejects.toThrow(/insert-only/);
      expect((await prisma.stockEntry.findUniqueOrThrow({ where: { id } })).quantity).toBe(100);
    });

    it('refuses a future date, an empty delivery, a negative count and a desk of another office', async () => {
      const future = new Date(Date.now() + 3 * 86_400_000).toISOString();
      expect((await entry('COUNT', 5, future).expect(400)).body.message).toBe('DATE_IN_THE_FUTURE');
      expect((await entry('RECEIVED', 0, '2026-09-07T08:00:00.000Z').expect(400)).body.message).toBe('DELIVERY_NEEDS_A_QUANTITY');
      await entry('COUNT', -3, '2026-09-07T08:00:00.000Z').expect(400);
      expect((await entry('COUNT', 5, '2026-09-07T08:00:00.000Z', { deskId: d2 }).expect(400)).body.message).toBe('DESK_NOT_AT_THIS_STATION');
    });

    it('a count can be kept per desk, reconciled against that desk only', async () => {
      await entry('COUNT', 50, '2026-09-08T08:00:00.000Z', { deskId: d1 }).expect(201);
      await prisma.cardPrint.createMany({
        data: Array.from({ length: 4 }, () => ({ registrationStationId: r1, deskId: d1, kind: 'CARD' as const, printedById: userIds.regEmp1, printedAt: new Date('2026-09-08T12:00:00Z') })),
      });
      await entry('COUNT', 46, '2026-09-09T08:00:00.000Z', { deskId: d1 }).expect(201);
      const res = await get('regSup1', `/card-stock/reconciliation?registrationStationId=${r1}&${STOCK_RANGE}`).expect(200);
      const deskPool = res.body.pools.find((p: { desk: { id: string } | null }) => p.desk?.id === d1);
      expect(deskPool.windows).toHaveLength(1);
      expect(deskPool.windows[0]).toMatchObject({ used: 4, difference: 0, status: 'OK' });
    });

    it('audits every entry and correction with who made it', async () => {
      const rows = await prisma.auditLog.findMany({
        where: { userId: userIds.regSup1, action: { in: ['STOCK_ENTRY', 'STOCK_CORRECTION'] } },
      });
      expect(rows.some((r) => r.action === 'STOCK_ENTRY')).toBe(true);
      expect(rows.some((r) => r.action === 'STOCK_CORRECTION')).toBe(true);
    });
  });

  // ── 3. deadline readiness ───────────────────────────────────────────

  describe('deadline readiness', () => {
    it('shows cards against no cards per station and per day, with typed, unregistered and override apart', async () => {
      const res = await get('admin', `/reports/readiness?municipalityId=${municipalityId}&${RANGE}`).expect(200);
      const s1Row = res.body.stations.find((s: { id: string }) => s.id === s1);
      expect(s1Row).toMatchObject({
        withCard: 4, // two scans, then the two scans either side of Tripoli midnight
        typedRegistered: 1,
        typedUnregistered: 2,
        emergencyOverride: 1,
        withoutCard: 4,
        distinctCardlessPlates: 4,
      });
      expect(res.body.stations.find((s: { id: string }) => s.id === s2)).toMatchObject({ withCard: 0, typedUnregistered: 1, distinctCardlessPlates: 1 });
      const day14 = res.body.daily.find((d: { day: string }) => d.day === '2026-09-14');
      expect(day14).toMatchObject({ withCard: 3, withoutCard: 5, typedRegistered: 1, typedUnregistered: 3, emergencyOverride: 1, distinctCardlessPlates: 5 });
    });

    it('splits the daily figures at Tripoli midnight, and cards issued per office per day', async () => {
      const res = await get('admin', `/reports/readiness?municipalityId=${municipalityId}&from=2026-09-14&to=2026-09-15`).expect(200);
      const [d14, d15] = res.body.daily;
      expect(d14).toMatchObject({ day: '2026-09-14', withCard: 3 }); // two at 09:00 and the one at 21:59:59.999Z
      expect(d15).toMatchObject({ day: '2026-09-15', withCard: 1 }); // the one at 22:00:00Z
      expect(d14.cardsIssued).toBe(1); // the card at 21:59:59.999Z
      expect(d15.cardsIssued).toBe(2); // 22:00:00Z and 09:00Z
      const office = res.body.offices.find((o: { id: string }) => o.id === r1);
      expect(office.daily.map((x: { day: string; issued: number }) => [x.day, x.issued])).toEqual([['2026-09-14', 1], ['2026-09-15', 2]]);
    });

    it('says plainly when some identification rows are only approximate (the phase 4a backfill)', async () => {
      const res = await get('admin', `/reports/readiness?municipalityId=${municipalityId}&${RANGE}`).expect(200);
      expect(res.body.approximateRows).toBe(1); // the one TYPED_REGISTERED fill-up that predates the field
      expect(res.body.approximateBefore).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    describe('the headline estimate', () => {
      const today = tripoliDay(new Date());
      const recent = (daysAgo: number) => `${addDays(today, -daysAgo)}T12:00:00.000Z`;
      const setDeadline = (day: string | null) =>
        prisma.municipality.update({ where: { id: municipalityId }, data: { cardRequiredFromDate: day ? new Date(`${day}T00:00:00.000Z`) : null } });
      const headline = async () =>
        (await get('admin', `/reports/readiness?municipalityId=${municipalityId}&days=7`).expect(200)).body.headline;

      beforeAll(async () => {
        // Six different plates filled up without a card in the last week (one twice), …
        const cardless = [1, 2, 3, 4, 5, 6].map((n) => `6-${plateBase}${n}`);
        for (const [i, plate] of cardless.entries()) {
          await makeFillUp({ station: s1, at: recent(1 + (i % 3)), identifiedBy: 'TYPED_UNREGISTERED', plate });
        }
        await makeFillUp({ station: s1, at: recent(1), identifiedBy: 'TYPED_UNREGISTERED', plate: cardless[0]! });
        // …seven first cards were issued in that week, and one of those vehicles also fills up typed:
        // it already has an active card, so it is no longer "still without a card".
        const cardedVehicles = [];
        for (let i = 0; i < 7; i++) {
          const vehicle = await makeVehicle({ office: i % 2 === 0 ? r1 : r2, by: 'regEmp1', plate: `5-${plateBase}${i}4` });
          await makeCard({ vehicleId: vehicle.id, office: i % 2 === 0 ? r1 : r2, desk: i % 2 === 0 ? d1 : d2, by: 'regEmp1', at: recent(2), reason: 'FIRST_ISSUE' });
          cardedVehicles.push(vehicle);
        }
        await makeFillUp({ station: s1, at: recent(1), identifiedBy: 'TYPED_REGISTERED', vehicleId: cardedVehicles[0]!.id });
      });

      it('without a deadline: the days needed alone, with nothing to compare against', async () => {
        await setDeadline(null);
        expect(await headline()).toMatchObject({ cardlessPlates: 6, averagePerDay: 1, daysNeeded: 6, deadline: null, daysLeft: null, verdict: 'NO_DEADLINE' });
      });

      it('with a deadline far enough away: on track', async () => {
        await setDeadline(addDays(today, 30));
        expect(await headline()).toMatchObject({ daysNeeded: 6, daysLeft: 30, verdict: 'ON_TRACK', shortfall: 0 });
      });

      it('with a deadline too close: at risk, with how many plates the current pace would miss', async () => {
        await setDeadline(addDays(today, 3));
        expect(await headline()).toMatchObject({ daysNeeded: 6, daysLeft: 3, verdict: 'AT_RISK', shortfall: 3 });
      });

      it('with the deadline passed', async () => {
        await setDeadline(today);
        expect(await headline()).toMatchObject({ daysLeft: 0, verdict: 'DEADLINE_PASSED', shortfall: 6 });
      });

      afterAll(async () => {
        await setDeadline(null);
      });
    });
  });

  // ── exports ─────────────────────────────────────────────────────────

  describe('PDF exports', () => {
    const isPdf = (res: request.Response) => (res.body as Buffer).subarray(0, 5).toString() === '%PDF-';
    const binary = (res: request.Response, callback: (err: Error | null, body: Buffer) => void) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => callback(null, Buffer.concat(chunks)));
    };

    it('the three reports and the two older ones export a real PDF through the Chromium renderer', async () => {
      for (const [as, path] of [
        ['admin', `/reports/registration/offices/export?format=pdf&${RANGE}`],
        ['regSup1', `/card-stock/reconciliation/export?format=pdf&from=2026-09-01&to=2026-09-09`],
        ['admin', `/reports/readiness/export?format=pdf&municipalityId=${municipalityId}&${RANGE}`],
      ] as const) {
        const res = await get(as, path).buffer(true).parse(binary as never).expect(200);
        expect(res.headers['content-type']).toBe('application/pdf');
        expect(isPdf(res)).toBe(true);
        expect((res.body as Buffer).length).toBeGreaterThan(3000);
      }
    }, 120_000);

    it('refuses an export format other than pdf, and scopes the export like the report', async () => {
      await get('admin', `/reports/registration/offices/export?format=docx&${RANGE}`).expect(400);
      await get('regEmp1', `/reports/registration/offices/export?format=pdf&${RANGE}`).expect(403);
    });
  });
});
