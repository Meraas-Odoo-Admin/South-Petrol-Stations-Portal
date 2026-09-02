import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

// M4 (docs/IMPLEMENTATION_PLAN.md §11): reporting API + export. All fixture
// fill-ups below are inserted directly via Prisma (not through POST
// /fillups), so the rule engine never runs — irrelevant here, this module
// only reads.
//
// "All stations" (omitted stationId / dashboard) queries aggregate across
// EVERY station in the DB, not just this file's fixtures — other e2e spec
// files running in the same suite invocation may also insert real
// FillUpTransaction rows dated "today". Assertions on those aggregate
// numbers use >= against this file's own known contribution rather than
// exact equality; assertions scoped to a specific stationId/ownerId/
// vehicleId (all unique to this file) are exact.
//
// Round 6: the driverId daily-report filter and the /reports/drivers/:id/
// history endpoint were both removed along with the rest of the Driver
// management surface (see docs/DESIGN_owner_based_fillups.md) — replaced
// below with an ownerId filter, scoped through the vehicle's owner
// instead of a per-fill-up driver.
describe('Reports (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const runId = Date.now().toString(36);
  const password = 'BoundaryTest123!';
  const testDate = new Date().toISOString().slice(0, 10);

  const usernameScoped = `e2e_rpt_scoped_${runId}`;
  const usernameAllStations = `e2e_rpt_all_${runId}`;
  const usernameNoPerm = `e2e_rpt_noperm_${runId}`;

  let scopedUserId: string;
  let allStationsUserId: string;
  let noPermUserId: string;
  let scopedRoleId: string;
  let allStationsRoleId: string;

  let company: { id: string };
  let stationA: { id: string; internalCode: string; name: string };
  let stationB: { id: string; internalCode: string; name: string };
  let ownerId: string;
  let owner2Id: string;
  let vehicleId: string;
  let vehicle2Id: string;
  let fillUpIds: string[] = [];

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    prisma = moduleRef.get(PrismaService);

    company = await prisma.company.create({ data: { name: `E2E RPT Company ${runId}` } });
    stationA = await prisma.station.create({
      data: { internalCode: `E2E-RPT-A-${runId}`, stationNumber: '1', name: 'E2E RPT Station A', companyId: company.id },
    });
    stationB = await prisma.station.create({
      data: { internalCode: `E2E-RPT-B-${runId}`, stationNumber: '2', name: 'E2E RPT Station B', companyId: company.id },
    });

    const owner = await prisma.vehicleOwner.create({
      data: { identityType: 'NATIONAL_ID', identityNumber: `e2e-rpt-${runId}`, fullName: 'E2E RPT Owner' },
    });
    ownerId = owner.id;
    const owner2 = await prisma.vehicleOwner.create({
      data: { identityType: 'NATIONAL_ID', identityNumber: `e2e-rpt-2-${runId}`, fullName: 'E2E RPT Owner Two' },
    });
    owner2Id = owner2.id;
    const vehicle = await prisma.vehicle.create({
      data: { internalCode: `E2E-RPT-VEH-${runId}`, currentPlate: `E2E-RPT-PLATE-${runId}`, ownerId },
    });
    vehicleId = vehicle.id;
    // A second vehicle, owned by owner2 — used to prove the ownerId
    // daily-report filter narrows by OWNER, not just by vehicle (a6 below
    // is recorded here, not on the first vehicle).
    const vehicle2 = await prisma.vehicle.create({
      data: { internalCode: `E2E-RPT-VEH-2-${runId}`, currentPlate: `E2E-RPT-PLATE-2-${runId}`, ownerId: owner2Id },
    });
    vehicle2Id = vehicle2.id;

    const viewPermission = await prisma.permission.upsert({
      where: { key: 'reports:view' },
      create: { key: 'reports:view' },
      update: {},
    });
    const viewAllPermission = await prisma.permission.upsert({
      where: { key: 'reports:view_all_stations' },
      create: { key: 'reports:view_all_stations' },
      update: {},
    });
    // GET /reports/vehicles/:id/history is gated on vehicles:read, not
    // reports:view (see the comment on that route) — both test roles need
    // this too, or the history assertion below 403s instead of exercising
    // the scoping logic it's meant to test.
    const vehiclesReadPermission = await prisma.permission.upsert({
      where: { key: 'vehicles:read' },
      create: { key: 'vehicles:read' },
      update: {},
    });

    const scopedRole = await prisma.role.create({ data: { name: `e2e_rpt_scoped_role_${runId}` } });
    scopedRoleId = scopedRole.id;
    await prisma.rolePermission.createMany({
      data: [
        { roleId: scopedRole.id, permissionId: viewPermission.id },
        { roleId: scopedRole.id, permissionId: vehiclesReadPermission.id },
      ],
    });

    // Holds reports:view_all_stations but is NOT flagged
    // unrestrictedStationAccess on the role itself — the M4 scope-resolution
    // logic keys off the PERMISSION, not the role flag, so this
    // deliberately proves that distinction.
    const allStationsRole = await prisma.role.create({ data: { name: `e2e_rpt_allstations_role_${runId}` } });
    allStationsRoleId = allStationsRole.id;
    await prisma.rolePermission.createMany({
      data: [
        { roleId: allStationsRole.id, permissionId: viewPermission.id },
        { roleId: allStationsRole.id, permissionId: viewAllPermission.id },
        { roleId: allStationsRole.id, permissionId: vehiclesReadPermission.id },
      ],
    });

    async function createUser(username: string) {
      return prisma.user.create({
        data: { username, passwordHash: await argon2.hash(password), fullName: `E2E RPT ${username}` },
      });
    }

    const scopedUser = await createUser(usernameScoped);
    scopedUserId = scopedUser.id;
    await prisma.userRole.create({ data: { userId: scopedUser.id, roleId: scopedRole.id } });
    await prisma.userStationScope.create({ data: { userId: scopedUser.id, stationId: stationA.id } });

    const allStationsUser = await createUser(usernameAllStations);
    allStationsUserId = allStationsUser.id;
    await prisma.userRole.create({ data: { userId: allStationsUser.id, roleId: allStationsRole.id } });

    const noPermUser = await createUser(usernameNoPerm);
    noPermUserId = noPermUser.id;

    // ── Fixture fill-ups ─────────────────────────────────────────────────
    // stationA: 5 total (3 plain, 1 pending exception, 1 approved exception).
    // stationB: 2 total (1 plain, 1 pending exception) — used to prove
    // scoped visibility excludes it and all-stations visibility includes it.
    const occurredAt = new Date(`${testDate}T10:00:00.000Z`);

    async function createFillUp(stationId: string, quantityLiters: number, key: string) {
      return prisma.fillUpTransaction.create({
        data: {
          vehicleId,
          stationId,
          fuelType: 'PETROL_95',
          quantityLiters,
          occurredAt,
          recordedById: scopedUserId,
          idempotencyKey: `e2e-rpt-${runId}-${key}`,
        },
      });
    }

    const a1 = await createFillUp(stationA.id, 10, 'a1');
    const a2 = await createFillUp(stationA.id, 10, 'a2');
    const a3 = await createFillUp(stationA.id, 10, 'a3');
    const a4Pending = await prisma.fillUpTransaction.create({
      data: {
        vehicleId,
        stationId: stationA.id,
        fuelType: 'PETROL_95',
        quantityLiters: 10,
        occurredAt,
        recordedById: scopedUserId,
        idempotencyKey: `e2e-rpt-${runId}-a4`,
        isException: true,
      },
    });
    const exceptionType = await prisma.exceptionType.upsert({
      where: { key: 'E2E_RPT_EXCEPTION_TYPE' },
      create: { key: 'E2E_RPT_EXCEPTION_TYPE', name: 'E2E RPT exception type', requiresProof: false },
      update: {},
    });
    await prisma.exception.create({
      data: { fillUpTransactionId: a4Pending.id, exceptionTypeId: exceptionType.id, reason: 'pending', approvedById: null },
    });

    const a5Approved = await prisma.fillUpTransaction.create({
      data: {
        vehicleId,
        stationId: stationA.id,
        fuelType: 'PETROL_95',
        quantityLiters: 10,
        occurredAt,
        recordedById: scopedUserId,
        idempotencyKey: `e2e-rpt-${runId}-a5`,
        isException: true,
      },
    });
    await prisma.exception.create({
      data: {
        fillUpTransactionId: a5Approved.id,
        exceptionTypeId: exceptionType.id,
        reason: 'approved',
        approvedById: allStationsUserId,
      },
    });

    // Distinct owner (via vehicle2) + fuel type at stationA — used to prove
    // the new ownerId/fuelType daily-report filter dimensions actually
    // narrow results, not just apply the pre-existing stationId/date pair.
    const a6OtherOwner = await prisma.fillUpTransaction.create({
      data: {
        vehicleId: vehicle2Id,
        stationId: stationA.id,
        fuelType: 'DIESEL',
        quantityLiters: 7,
        occurredAt,
        recordedById: scopedUserId,
        idempotencyKey: `e2e-rpt-${runId}-a6`,
      },
    });

    const b1 = await createFillUp(stationB.id, 20, 'b1');
    const b2Pending = await prisma.fillUpTransaction.create({
      data: {
        vehicleId,
        stationId: stationB.id,
        fuelType: 'PETROL_95',
        quantityLiters: 5,
        occurredAt,
        recordedById: scopedUserId,
        idempotencyKey: `e2e-rpt-${runId}-b2`,
        isException: true,
      },
    });
    await prisma.exception.create({
      data: { fillUpTransactionId: b2Pending.id, exceptionTypeId: exceptionType.id, reason: 'pending b', approvedById: null },
    });

    fillUpIds = [a1.id, a2.id, a3.id, a4Pending.id, a5Approved.id, a6OtherOwner.id, b1.id, b2Pending.id];
  }, 30_000);

  afterAll(async () => {
    await prisma.exception.deleteMany({ where: { fillUpTransactionId: { in: fillUpIds } } });
    await prisma.fillUpTransaction.deleteMany({ where: { id: { in: fillUpIds } } });

    const allUserIds = [scopedUserId, allStationsUserId, noPermUserId];
    await prisma.auditLog.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.userStationScope.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: allUserIds } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: { in: [scopedRoleId, allStationsRoleId] } } });
    await prisma.role.deleteMany({ where: { id: { in: [scopedRoleId, allStationsRoleId] } } });
    await prisma.vehiclePlateHistory.deleteMany({ where: { vehicleId: { in: [vehicleId, vehicle2Id] } } });
    await prisma.vehicle.deleteMany({ where: { id: { in: [vehicleId, vehicle2Id] } } });
    await prisma.vehicleOwner.delete({ where: { id: ownerId } });
    await prisma.vehicleOwner.delete({ where: { id: owner2Id } });
    await prisma.station.deleteMany({ where: { id: { in: [stationA.id, stationB.id] } } });
    await prisma.company.delete({ where: { id: company.id } });
    await app.close();
  });

  const tokenCache = new Map<string, string>();
  async function login(username: string): Promise<string> {
    const cached = tokenCache.get(username);
    if (cached) {
      return cached;
    }
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username, password })
      .expect(200);
    tokenCache.set(username, res.body.accessToken);
    return res.body.accessToken;
  }

  const loginAsScoped = () => login(usernameScoped);
  const loginAsAllStations = () => login(usernameAllStations);
  const loginAsNoPerm = () => login(usernameNoPerm);

  // ── 401 / 403 ────────────────────────────────────────────────────────

  it('rejects unauthenticated requests to every report endpoint', async () => {
    const server = app.getHttpServer();
    await request(server).get('/api/v1/reports/daily').expect(401);
    await request(server).get('/api/v1/reports/violations').expect(401);
    await request(server).get(`/api/v1/reports/vehicles/${vehicleId}/history`).expect(401);
    await request(server).get('/api/v1/reports/dashboard').expect(401);
  });

  it('blocks an actor without reports:view from the per-station endpoints, and without reports:view_all_stations from the dashboard', async () => {
    const accessToken = await loginAsNoPerm();
    const server = app.getHttpServer();
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${accessToken}`);

    await auth(request(server).get('/api/v1/reports/daily')).expect(403);
    await auth(request(server).get('/api/v1/reports/violations')).expect(403);
    await auth(request(server).get('/api/v1/reports/dashboard')).expect(403);
  });

  // ── GET /reports/daily ───────────────────────────────────────────────

  it('gives a scoped reports:view holder an exact daily report for their own station', async () => {
    const accessToken = await loginAsScoped();
    const res = await request(app.getHttpServer())
      .get(`/api/v1/reports/daily?stationId=${stationA.id}&date=${testDate}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    // toMatchObject, not toEqual — round 4 feedback added `rows` (the raw
    // fill-up list backing the results table) and `totalBeforeFilters` to
    // this response; asserting the full row array here would duplicate the
    // fixture data for no real coverage gain, so only the aggregate numbers
    // this test is actually about are checked exactly.
    expect(res.body).toMatchObject({
      stationId: stationA.id,
      date: testDate,
      ownerId: null,
      fuelType: null,
      // 6 fill-ups now: the original 5 (a1-a5, vehicle1/owner1) plus
      // a6OtherOwner (vehicle2/owner2, DIESEL, 7L) — added to prove the
      // ownerId/fuelType filters below actually narrow, not just apply the
      // pre-existing pair live.
      totalFillUps: 6,
      totalLiters: 57,
      exceptionsPending: 1,
      exceptionsApproved: 1,
      totalBeforeFilters: 6,
    });
    expect(res.body.rows).toHaveLength(6);
  });

  it('narrows the daily report to one vehicle owner via the ownerId filter', async () => {
    const accessToken = await loginAsScoped();

    const owner1Res = await request(app.getHttpServer())
      .get(`/api/v1/reports/daily?stationId=${stationA.id}&date=${testDate}&ownerId=${ownerId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(owner1Res.body).toMatchObject({ ownerId, totalFillUps: 5, totalLiters: 50 });

    const owner2Res = await request(app.getHttpServer())
      .get(`/api/v1/reports/daily?stationId=${stationA.id}&date=${testDate}&ownerId=${owner2Id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(owner2Res.body).toMatchObject({ ownerId: owner2Id, totalFillUps: 1, totalLiters: 7 });
  });

  it('narrows the daily report to one fuel type via the new fuelType filter (item 13)', async () => {
    const accessToken = await loginAsScoped();

    const dieselRes = await request(app.getHttpServer())
      .get(`/api/v1/reports/daily?stationId=${stationA.id}&date=${testDate}&fuelType=DIESEL`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(dieselRes.body).toMatchObject({ fuelType: 'DIESEL', totalFillUps: 1, totalLiters: 7 });

    const petrolRes = await request(app.getHttpServer())
      .get(`/api/v1/reports/daily?stationId=${stationA.id}&date=${testDate}&fuelType=PETROL_95`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(petrolRes.body).toMatchObject({ fuelType: 'PETROL_95', totalFillUps: 5, totalLiters: 50 });
  });

  it('rejects an invalid fuelType value on the daily report', async () => {
    const accessToken = await loginAsScoped();
    await request(app.getHttpServer())
      .get(`/api/v1/reports/daily?stationId=${stationA.id}&date=${testDate}&fuelType=NOT_A_FUEL`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(400);
  });

  it('blocks a scoped reports:view holder from querying another station\'s daily report', async () => {
    const accessToken = await loginAsScoped();
    await request(app.getHttpServer())
      .get(`/api/v1/reports/daily?stationId=${stationB.id}&date=${testDate}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
  });

  it('requires stationId for a scoped caller without reports:view_all_stations', async () => {
    const accessToken = await loginAsScoped();
    const res = await request(app.getHttpServer())
      .get(`/api/v1/reports/daily?date=${testDate}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(400);
    expect(res.body.message).toBe('stationId is required unless you hold reports:view_all_stations.');
  });

  it('lets a reports:view_all_stations holder query any single station, or omit stationId for an all-stations summary', async () => {
    const accessToken = await loginAsAllStations();
    const server = app.getHttpServer();

    const stationBRes = await request(server)
      .get(`/api/v1/reports/daily?stationId=${stationB.id}&date=${testDate}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(stationBRes.body).toMatchObject({
      stationId: stationB.id,
      date: testDate,
      ownerId: null,
      fuelType: null,
      totalFillUps: 2,
      totalLiters: 25,
      exceptionsPending: 1,
      exceptionsApproved: 0,
      totalBeforeFilters: 2,
    });
    expect(stationBRes.body.rows).toHaveLength(2);

    // Omitted stationId: aggregates EVERY station, not just this file's —
    // see the file header comment. >= this file's own known total (5 + 2).
    const allRes = await request(server)
      .get(`/api/v1/reports/daily?date=${testDate}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(allRes.body.stationId).toBeNull();
    expect(allRes.body.totalFillUps).toBeGreaterThanOrEqual(7);
    expect(allRes.body.totalLiters).toBeGreaterThanOrEqual(75);
    expect(allRes.body.exceptionsPending).toBeGreaterThanOrEqual(2);
    expect(allRes.body.exceptionsApproved).toBeGreaterThanOrEqual(1);
  });

  // ── GET /reports/violations ──────────────────────────────────────────

  it('filters violations by station scope and status', async () => {
    const accessToken = await loginAsScoped();
    const server = app.getHttpServer();

    const pendingRes = await request(server)
      .get(`/api/v1/reports/violations?stationId=${stationA.id}&status=pending`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(pendingRes.body.total).toBe(1);
    expect(pendingRes.body.rows[0].reason).toBe('pending');

    const approvedRes = await request(server)
      .get(`/api/v1/reports/violations?stationId=${stationA.id}&status=approved`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(approvedRes.body.total).toBe(1);
    expect(approvedRes.body.rows[0].reason).toBe('approved');

    const allRes = await request(server)
      .get(`/api/v1/reports/violations?stationId=${stationA.id}&status=all`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(allRes.body.total).toBe(2);

    await request(server)
      .get(`/api/v1/reports/violations?stationId=${stationB.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
  });

  // ── GET /reports/vehicles/:id/history ────────────────────────────────

  it('gives a scoped caller only their own station\'s entries in vehicle history, and an all-stations holder everything', async () => {
    const scopedToken = await loginAsScoped();
    const allStationsToken = await loginAsAllStations();
    const server = app.getHttpServer();

    const scopedVehicleRes = await request(server)
      .get(`/api/v1/reports/vehicles/${vehicleId}/history`)
      .set('Authorization', `Bearer ${scopedToken}`)
      .expect(200);
    // 5: a1-a5 (a6OtherOwner is on vehicle2, a different vehicle, so it's
    // not part of vehicle1's own history).
    expect(scopedVehicleRes.body.total).toBe(5);
    expect(scopedVehicleRes.body.rows.every((r: { stationId: string }) => r.stationId === stationA.id)).toBe(true);

    const allVehicleRes = await request(server)
      .get(`/api/v1/reports/vehicles/${vehicleId}/history`)
      .set('Authorization', `Bearer ${allStationsToken}`)
      .expect(200);
    expect(allVehicleRes.body.total).toBe(7);

    // Identity data is NOT masked server-side (§8 masking is UI-only, per
    // the M4 instructions) — the vehicle owner's real identityNumber comes
    // back.
    expect(allVehicleRes.body.rows[0].vehicle.owner.identityNumber).toBeDefined();
  });

  it('404s vehicle history for an id that does not exist', async () => {
    const accessToken = await loginAsAllStations();
    const server = app.getHttpServer();
    await request(server)
      .get('/api/v1/reports/vehicles/does-not-exist/history')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });

  // ── GET /reports/dashboard ────────────────────────────────────────────

  it('requires reports:view_all_stations specifically for the dashboard, not just reports:view', async () => {
    const scopedToken = await loginAsScoped();
    await request(app.getHttpServer())
      .get('/api/v1/reports/dashboard')
      .set('Authorization', `Bearer ${scopedToken}`)
      .expect(403);
  });

  it('gives a reports:view_all_stations holder a per-station breakdown including this file\'s two stations, via a single grouped query', async () => {
    const accessToken = await loginAsAllStations();
    const from = new Date(`${testDate}T00:00:00.000Z`).toISOString();
    const to = new Date(`${testDate}T23:59:59.999Z`).toISOString();

    const res = await request(app.getHttpServer())
      .get(`/api/v1/reports/dashboard?from=${from}&to=${to}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const stationAEntry = res.body.perStation.find((s: { stationId: string }) => s.stationId === stationA.id);
    const stationBEntry = res.body.perStation.find((s: { stationId: string }) => s.stationId === stationB.id);
    expect(stationAEntry).toEqual({
      stationId: stationA.id,
      internalCode: stationA.internalCode,
      name: stationA.name,
      // 6, not 5: includes a6OtherOwner (no exception), same fixture
      // addition as the daily-report tests above.
      totalFillUps: 6,
      totalLiters: 57,
      exceptionCount: 2,
    });
    expect(stationBEntry).toMatchObject({ totalFillUps: 2, totalLiters: 25, exceptionCount: 1 });
    expect(res.body.totalFillUps).toBeGreaterThanOrEqual(7);
    expect(res.body.exceptionRate).toBeGreaterThan(0);
  });

  // ── Export: daily report ─────────────────────────────────────────────

  it('exports the daily report as xlsx and pdf', async () => {
    const accessToken = await loginAsScoped();
    const server = app.getHttpServer();

    const xlsxRes = await request(server)
      .get(`/api/v1/reports/daily/export?stationId=${stationA.id}&date=${testDate}&format=xlsx`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(xlsxRes.headers['content-type']).toContain('spreadsheetml');
    expect(xlsxRes.headers['content-disposition']).toContain('.xlsx');
    expect(Buffer.isBuffer(xlsxRes.body) ? xlsxRes.body.length : xlsxRes.text.length).toBeGreaterThan(0);

    const pdfRes = await request(server)
      .get(`/api/v1/reports/daily/export?stationId=${stationA.id}&date=${testDate}&format=pdf`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(pdfRes.headers['content-type']).toBe('application/pdf');
    expect(pdfRes.headers['content-disposition']).toContain('.pdf');
    expect(Buffer.isBuffer(pdfRes.body) ? pdfRes.body.length : pdfRes.text.length).toBeGreaterThan(0);
  });

  it('rejects a daily-report export request with a missing/invalid format', async () => {
    const accessToken = await loginAsScoped();
    await request(app.getHttpServer())
      .get(`/api/v1/reports/daily/export?stationId=${stationA.id}&date=${testDate}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(400);
  });

  // ── Export: violations ───────────────────────────────────────────────

  it('exports the violations list as xlsx and pdf', async () => {
    const accessToken = await loginAsScoped();
    const server = app.getHttpServer();

    const xlsxRes = await request(server)
      .get(`/api/v1/reports/violations/export?stationId=${stationA.id}&status=all&format=xlsx`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(xlsxRes.headers['content-type']).toContain('spreadsheetml');
    expect(Buffer.isBuffer(xlsxRes.body) ? xlsxRes.body.length : xlsxRes.text.length).toBeGreaterThan(0);

    const pdfRes = await request(server)
      .get(`/api/v1/reports/violations/export?stationId=${stationA.id}&status=all&format=pdf`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(pdfRes.headers['content-type']).toBe('application/pdf');
    expect(Buffer.isBuffer(pdfRes.body) ? pdfRes.body.length : pdfRes.text.length).toBeGreaterThan(0);
  });
});
