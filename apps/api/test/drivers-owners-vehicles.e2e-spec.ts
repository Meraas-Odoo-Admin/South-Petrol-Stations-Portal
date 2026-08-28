import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

// M2 (docs/IMPLEMENTATION_PLAN.md §11): Drivers, Owners, Vehicles CRUD, the
// driver-vehicle association, and plate history tracking. The one explicit
// acceptance bar the plan states is that changing a vehicle's plate must not
// orphan its history — proven below as a service/e2e-level test, independent
// of FillUpTransaction (which doesn't exist until M3). Extend this test in
// M3 once FillUpTransaction exists, to also prove a real fill-up row created
// under the old plate survives a plate change untouched.
describe('Drivers/Owners/Vehicles (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const runId = Date.now().toString(36);
  // Real-format fixtures (this phase added class-validator format
  // enforcement — see apps/api/src/common/validators/libyan-formats.ts):
  // identityNumber must be 12 digits, currentPlate a city-code+sequence
  // (sequence capped at 7 digits by the format), chassisNumber exactly 17
  // alphanumeric chars. RANDOM, not a Date.now()-derived modulo — an
  // earlier version used `Date.now() % 1_000_000`, which repeats every
  // ~16.7 minutes and genuinely collided with a leftover row from an
  // earlier run of this same suite within one dev session (there are no
  // DELETE endpoints, so old fixture rows never go away). A random digit
  // string has no periodicity to collide on.
  const randomDigits = (n: number) => Math.floor(Math.random() * 10 ** n).toString().padStart(n, '0');
  const numericId11 = randomDigits(11); // fills identityNumber's 11 digits after the type prefix
  const plateSeqA = randomDigits(7);
  const plateSeqB = randomDigits(7);
  const plateSeqOther = randomDigits(7);
  const chassis17 = randomDigits(17);
  const password = 'BoundaryTest123!';

  const usernameManager = `e2e_dov_manager_${runId}`;
  const usernameNoPerm = `e2e_dov_noperm_${runId}`;

  let managerUserId: string;
  let noPermUserId: string;
  let managerRoleId: string;

  // Fixtures shared across the success-path tests below.
  let driverId: string;
  let secondDriverId: string;
  let ownerId: string;
  let vehicleId: string;

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

    const driversManagePermission = await prisma.permission.upsert({
      where: { key: 'drivers:manage' },
      create: { key: 'drivers:manage' },
      update: {},
    });
    // POST /drivers is gated on drivers:create (narrower than :manage, item
    // 1's RBAC fix) — a role that only holds :manage no longer covers
    // creating a NEW driver, only editing existing ones. This fixture's
    // manager role needs both, same as the real station_supervisor/
    // directorate_admin roles in seed.ts.
    const driversCreatePermission = await prisma.permission.upsert({
      where: { key: 'drivers:create' },
      create: { key: 'drivers:create' },
      update: {},
    });
    const ownersPermission = await prisma.permission.upsert({
      where: { key: 'owners:manage' },
      create: { key: 'owners:manage' },
      update: {},
    });
    const vehiclesManagePermission = await prisma.permission.upsert({
      where: { key: 'vehicles:manage' },
      create: { key: 'vehicles:manage' },
      update: {},
    });
    // GET /drivers and GET /vehicles are gated on :read, not :manage, as of
    // M3 — holding :manage alone no longer satisfies them (PermissionsGuard
    // checks the exact permission string, not a tier hierarchy).
    const driversReadPermission = await prisma.permission.upsert({
      where: { key: 'drivers:read' },
      create: { key: 'drivers:read' },
      update: {},
    });
    const vehiclesReadPermission = await prisma.permission.upsert({
      where: { key: 'vehicles:read' },
      create: { key: 'vehicles:read' },
      update: {},
    });

    // Dedicated test-only role — never the real seeded station_supervisor.
    const managerRole = await prisma.role.create({ data: { name: `e2e_dov_manager_role_${runId}` } });
    managerRoleId = managerRole.id;
    await prisma.rolePermission.createMany({
      data: [
        { roleId: managerRole.id, permissionId: driversManagePermission.id },
        { roleId: managerRole.id, permissionId: driversCreatePermission.id },
        { roleId: managerRole.id, permissionId: ownersPermission.id },
        { roleId: managerRole.id, permissionId: vehiclesManagePermission.id },
        { roleId: managerRole.id, permissionId: driversReadPermission.id },
        { roleId: managerRole.id, permissionId: vehiclesReadPermission.id },
      ],
    });

    async function createUser(username: string) {
      return prisma.user.create({
        data: { username, passwordHash: await argon2.hash(password), fullName: `E2E DOV ${username}` },
      });
    }

    const managerUser = await createUser(usernameManager);
    managerUserId = managerUser.id;
    await prisma.userRole.create({ data: { userId: managerUser.id, roleId: managerRole.id } });

    // No role at all — zero permissions, used for every 403 case.
    const noPermUser = await createUser(usernameNoPerm);
    noPermUserId = noPermUser.id;
  }, 30_000);

  afterAll(async () => {
    if (vehicleId) {
      await prisma.driverVehicle.deleteMany({ where: { vehicleId } });
      await prisma.vehiclePlateHistory.deleteMany({ where: { vehicleId } });
      await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
    }
    if (ownerId) {
      await prisma.vehicleOwner.deleteMany({ where: { id: ownerId } });
    }
    await prisma.driver.deleteMany({ where: { id: { in: [driverId, secondDriverId].filter(Boolean) } } });

    const allUserIds = [managerUserId, noPermUserId];
    await prisma.auditLog.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: allUserIds } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: managerRoleId } });
    await prisma.role.delete({ where: { id: managerRoleId } });
    await app.close();
  });

  // Memoized per user — the login endpoint is throttled (5/min).
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

  const loginAsManager = () => login(usernameManager);
  const loginAsNoPerm = () => login(usernameNoPerm);

  // ── 401: unauthenticated ─────────────────────────────────────────────

  it('rejects unauthenticated requests to every driver/owner/vehicle endpoint', async () => {
    const server = app.getHttpServer();
    await request(server).post('/api/v1/drivers').send({}).expect(401);
    await request(server).get('/api/v1/drivers').expect(401);
    await request(server).post('/api/v1/owners').send({}).expect(401);
    await request(server).get('/api/v1/owners').expect(401);
    await request(server).post('/api/v1/vehicles').send({}).expect(401);
    await request(server).get('/api/v1/vehicles').expect(401);
  });

  // ── 403: authenticated but lacking the required permission ─────────────

  it('blocks an actor without drivers:manage/owners:manage/vehicles:manage from every endpoint', async () => {
    const accessToken = await loginAsNoPerm();
    const server = app.getHttpServer();
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${accessToken}`);

    await auth(request(server).post('/api/v1/drivers')).send({
      identityType: 'NATIONAL_ID',
      identityNumber: `should-not-exist-${runId}`,
      fullName: 'Should Not Exist',
    }).expect(403);
    await auth(request(server).get('/api/v1/drivers')).expect(403);
    await auth(request(server).post('/api/v1/owners')).send({ fullName: 'Nope' }).expect(403);
    await auth(request(server).get('/api/v1/owners')).expect(403);
    await auth(request(server).post('/api/v1/vehicles')).send({
      internalCode: `should-not-exist-${runId}`,
      currentPlate: `should-not-exist-${runId}`,
    }).expect(403);
    await auth(request(server).get('/api/v1/vehicles')).expect(403);
  });

  // ── Driver CRUD ──────────────────────────────────────────────────────

  it('lets a properly-permissioned actor create, list, fetch, and update a driver', async () => {
    const accessToken = await loginAsManager();
    const server = app.getHttpServer();

    const createRes = await request(server)
      .post('/api/v1/drivers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        identityType: 'NATIONAL_ID',
        identityNumber: `1${numericId11}`,
        fullName: 'E2E DOV Driver One',
      })
      .expect(201);
    driverId = createRes.body.id;
    expect(createRes.body.fullName).toBe('E2E DOV Driver One');

    const listRes = await request(server)
      .get('/api/v1/drivers')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(listRes.body.map((d: { id: string }) => d.id)).toContain(driverId);

    const getRes = await request(server)
      .get(`/api/v1/drivers/${driverId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(getRes.body.identityNumber).toBe(`1${numericId11}`);

    const updateRes = await request(server)
      .patch(`/api/v1/drivers/${driverId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fullName: 'E2E DOV Driver One (renamed)', phone: '0910000000' })
      .expect(200);
    expect(updateRes.body.fullName).toBe('E2E DOV Driver One (renamed)');
    expect(updateRes.body.phone).toBe('0910000000');
  });

  it('rejects creating a driver with a duplicate (identityType, identityNumber) pair', async () => {
    const accessToken = await loginAsManager();

    await request(app.getHttpServer())
      .post('/api/v1/drivers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        identityType: 'NATIONAL_ID',
        identityNumber: `1${numericId11}`, // same pair as the driver created above
        fullName: 'Duplicate Attempt',
      })
      .expect(409);
  });

  it('rejects a PATCH /drivers/:id body that tries to change identityType/identityNumber, since they are immutable', async () => {
    const accessToken = await loginAsManager();

    // whitelist + forbidNonWhitelisted: UpdateDriverDto has no
    // identityType/identityNumber fields at all, so sending them is a 400,
    // not a silent no-op.
    await request(app.getHttpServer())
      .patch(`/api/v1/drivers/${driverId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ identityNumber: `9${numericId11}` })
      .expect(400);
  });

  // ── Owner CRUD ───────────────────────────────────────────────────────

  it('lets a properly-permissioned actor create, list, fetch, and update a vehicle owner', async () => {
    const accessToken = await loginAsManager();
    const server = app.getHttpServer();

    const createRes = await request(server)
      .post('/api/v1/owners')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fullName: 'E2E DOV Owner One', phone: '0920000000' })
      .expect(201);
    ownerId = createRes.body.id;

    const listRes = await request(server)
      .get('/api/v1/owners')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(listRes.body.map((o: { id: string }) => o.id)).toContain(ownerId);

    const updateRes = await request(server)
      .patch(`/api/v1/owners/${ownerId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ address: 'Sabha' })
      .expect(200);
    expect(updateRes.body.address).toBe('Sabha');
  });

  // ── Vehicle CRUD + search ────────────────────────────────────────────

  it('lets a properly-permissioned actor create a vehicle, and rejects duplicate internalCode/currentPlate', async () => {
    const accessToken = await loginAsManager();
    const server = app.getHttpServer();

    const createRes = await request(server)
      .post('/api/v1/vehicles')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        internalCode: `VEH-${runId}`,
        currentPlate: `5-${plateSeqA}`,
        chassisNumber: chassis17,
        ownerId,
      })
      .expect(201);
    vehicleId = createRes.body.id;
    expect(createRes.body.currentPlate).toBe(`5-${plateSeqA}`);

    await request(server)
      .post('/api/v1/vehicles')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ internalCode: `VEH-${runId}`, currentPlate: `8-${plateSeqB}` })
      .expect(409);

    await request(server)
      .post('/api/v1/vehicles')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ internalCode: `VEH-${runId}-DIFFERENT`, currentPlate: `5-${plateSeqA}` })
      .expect(409);
  });

  it('finds the vehicle by searching internalCode, currentPlate, or chassisNumber', async () => {
    const accessToken = await loginAsManager();
    const server = app.getHttpServer();

    for (const query of [
      `internalCode=${encodeURIComponent(`VEH-${runId}`)}`,
      `currentPlate=${encodeURIComponent(`5-${plateSeqA}`)}`,
      `chassisNumber=${encodeURIComponent(chassis17)}`,
    ]) {
      const res = await request(server)
        .get(`/api/v1/vehicles?${query}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(res.body.map((v: { id: string }) => v.id)).toEqual([vehicleId]);
    }
  });

  it('lets a properly-permissioned actor reassign ownerId through the general PATCH endpoint', async () => {
    const accessToken = await loginAsManager();

    const secondOwnerRes = await request(app.getHttpServer())
      .post('/api/v1/owners')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fullName: 'E2E DOV Owner Two' })
      .expect(201);
    const secondOwnerId = secondOwnerRes.body.id;

    const updateRes = await request(app.getHttpServer())
      .patch(`/api/v1/vehicles/${vehicleId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ownerId: secondOwnerId })
      .expect(200);
    expect(updateRes.body.ownerId).toBe(secondOwnerId);

    // Reassign back to the original owner and clean up the throwaway one.
    await request(app.getHttpServer())
      .patch(`/api/v1/vehicles/${vehicleId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ownerId })
      .expect(200);
    await prisma.vehicleOwner.delete({ where: { id: secondOwnerId } });
  });

  it('rejects a PATCH /vehicles/:id body that tries to change currentPlate directly, since that must go through plate-change', async () => {
    const accessToken = await loginAsManager();

    await request(app.getHttpServer())
      .patch(`/api/v1/vehicles/${vehicleId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPlate: `9-${plateSeqB}` })
      .expect(400);
  });

  // ── Driver-vehicle association ──────────────────────────────────────

  it('associates and removes a driver from a vehicle', async () => {
    const accessToken = await loginAsManager();
    const server = app.getHttpServer();

    const secondDriverRes = await request(server)
      .post('/api/v1/drivers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        identityType: 'ADMINISTRATIVE_ID',
        identityNumber: `9${numericId11}`,
        fullName: 'E2E DOV Driver Two',
      })
      .expect(201);
    secondDriverId = secondDriverRes.body.id;

    const addRes = await request(server)
      .post(`/api/v1/vehicles/${vehicleId}/drivers`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ driverId: secondDriverId, isPrimary: true })
      .expect(201);
    expect(addRes.body.id).toBe(vehicleId);

    const associations = await prisma.driverVehicle.findMany({ where: { vehicleId } });
    expect(associations.map((a) => a.driverId)).toContain(secondDriverId);
    expect(associations.find((a) => a.driverId === secondDriverId)?.isPrimary).toBe(true);

    await request(server)
      .delete(`/api/v1/vehicles/${vehicleId}/drivers/${secondDriverId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const afterRemoval = await prisma.driverVehicle.findMany({ where: { vehicleId } });
    expect(afterRemoval.map((a) => a.driverId)).not.toContain(secondDriverId);
  });

  it('demotes the previous primary driver when a new driver is assigned isPrimary: true, so at most one primary remains', async () => {
    const accessToken = await loginAsManager();
    const server = app.getHttpServer();

    // driverId and secondDriverId were both created in earlier tests and
    // have no association with this vehicle at this point (the prior test
    // removed secondDriverId's association again after asserting it).
    await request(server)
      .post(`/api/v1/vehicles/${vehicleId}/drivers`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ driverId, isPrimary: true })
      .expect(201);

    await request(server)
      .post(`/api/v1/vehicles/${vehicleId}/drivers`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ driverId: secondDriverId, isPrimary: true })
      .expect(201);

    const associations = await prisma.driverVehicle.findMany({ where: { vehicleId } });
    const primaryRows = associations.filter((a) => a.isPrimary);
    expect(primaryRows).toHaveLength(1);
    expect(primaryRows[0]?.driverId).toBe(secondDriverId);

    const driverARow = associations.find((a) => a.driverId === driverId);
    expect(driverARow?.isPrimary).toBe(false);
  });

  // ── Plate change: the M2 "done means" acceptance bar ────────────────
  // docs/IMPLEMENTATION_PLAN.md §11: "changing a vehicle's plate doesn't
  // orphan its fill-up history (write this as a test, not just a manual
  // check)." FillUpTransaction doesn't exist until M3, so this proves the
  // mechanism the fill-up history relies on: the prior VehiclePlateHistory
  // row is preserved (validTo set, not deleted), a new row exists with the
  // new plate, and Vehicle.currentPlate reflects the change — all inside
  // one transaction. Extend this in M3 with a real FillUpTransaction row
  // created under the old plate, and assert it still resolves to the same
  // vehicleId (and is still readable) after the plate change.

  it('changing a vehicle plate preserves the prior history row (closed, not deleted) and opens a new one', async () => {
    const accessToken = await loginAsManager();
    const server = app.getHttpServer();

    const beforeHistory = await prisma.vehiclePlateHistory.findMany({ where: { vehicleId } });
    expect(beforeHistory).toHaveLength(1);
    const originalRow = beforeHistory[0]!;
    expect(originalRow.plate).toBe(`5-${plateSeqA}`);
    expect(originalRow.validTo).toBeNull();

    const newPlate = `8-${plateSeqB}`;
    const res = await request(server)
      .post(`/api/v1/vehicles/${vehicleId}/plate-change`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ newPlate })
      .expect(201);
    expect(res.body.currentPlate).toBe(newPlate);

    const afterHistory = await prisma.vehiclePlateHistory.findMany({
      where: { vehicleId },
      orderBy: { validFrom: 'asc' },
    });
    expect(afterHistory).toHaveLength(2);

    // The original row is PRESERVED with validTo set — not deleted, not
    // overwritten in place.
    const closedRow = afterHistory.find((r) => r.id === originalRow.id);
    expect(closedRow).toBeDefined();
    expect(closedRow!.plate).toBe(`5-${plateSeqA}`);
    expect(closedRow!.validTo).not.toBeNull();

    // The new row is open (validTo: null) with the new plate.
    const openRow = afterHistory.find((r) => r.id !== originalRow.id);
    expect(openRow).toBeDefined();
    expect(openRow!.plate).toBe(newPlate);
    expect(openRow!.validTo).toBeNull();

    const vehicle = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
    expect(vehicle.currentPlate).toBe(newPlate);
  });

  it('rejects a plate-change to the vehicle\'s own current plate, and to a plate already used by another vehicle', async () => {
    const accessToken = await loginAsManager();
    const server = app.getHttpServer();

    const currentVehicle = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });

    await request(server)
      .post(`/api/v1/vehicles/${vehicleId}/plate-change`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ newPlate: currentVehicle.currentPlate })
      .expect(409);

    const otherVehicleRes = await request(server)
      .post('/api/v1/vehicles')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ internalCode: `VEH-${runId}-OTHER`, currentPlate: `15-${plateSeqOther}` })
      .expect(201);
    const otherVehicleId = otherVehicleRes.body.id;

    await request(server)
      .post(`/api/v1/vehicles/${vehicleId}/plate-change`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ newPlate: `15-${plateSeqOther}` })
      .expect(409);

    await prisma.vehiclePlateHistory.deleteMany({ where: { vehicleId: otherVehicleId } });
    await prisma.vehicle.delete({ where: { id: otherVehicleId } });
  });
});
