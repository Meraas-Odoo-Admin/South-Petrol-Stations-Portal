import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { createMunicipality, deleteMunicipalities } from './support/municipality-fixtures';

// M2 (docs/IMPLEMENTATION_PLAN.md §11): Owners, Vehicles CRUD and plate
// history tracking. The one explicit acceptance bar the plan states is that
// changing a vehicle's plate must not orphan its history — proven below as
// a service/e2e-level test, independent of FillUpTransaction (which didn't
// exist until M3). Extended in M3 once FillUpTransaction existed.
//
// Round 6: the Driver CRUD and driver-vehicle association blocks that used
// to live here were removed along with the Driver management endpoints
// (see docs/DESIGN_owner_based_fillups.md) — fill-ups no longer require
// driver identity, and VehicleOwner now carries the identityType/
// identityNumber pair that used to be Driver-only.
describe('Owners/Vehicles (e2e)', () => {
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
  // Registration pivot, phase 2: owners/vehicles are registered AT a
  // registration station the actor is scoped to.
  let municipalityId: string;
  let registrationStationId: string;

  // Fixtures shared across the success-path tests below.
  let ownerId: string;
  let vehicleId: string;
  let identityChangeConflictOwnerId: string;

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
    // GET /vehicles is gated on :read, not :manage, as of M3 — holding
    // :manage alone no longer satisfies it (PermissionsGuard checks the
    // exact permission string, not a tier hierarchy).
    const vehiclesReadPermission = await prisma.permission.upsert({
      where: { key: 'vehicles:read' },
      create: { key: 'vehicles:read' },
      update: {},
    });
    // Round 12: ownerId moved off the general PATCH endpoint onto the
    // change-request flow (see VehicleChangeType.OWNER_CHANGE) — this
    // manager role needs both ends of that flow to exercise it below.
    const vehiclesRequestChangePermission = await prisma.permission.upsert({
      where: { key: 'vehicles:request_change' },
      create: { key: 'vehicles:request_change' },
      update: {},
    });
    const vehiclesApproveChangePermission = await prisma.permission.upsert({
      where: { key: 'vehicles:approve_change' },
      create: { key: 'vehicles:approve_change' },
      update: {},
    });
    // Round 20: owner identity change-request permissions.
    const ownersRequestChangePermission = await prisma.permission.upsert({
      where: { key: 'owners:request_change' },
      create: { key: 'owners:request_change' },
      update: {},
    });
    const ownersApproveChangePermission = await prisma.permission.upsert({
      where: { key: 'owners:approve_change' },
      create: { key: 'owners:approve_change' },
      update: {},
    });

    // Registration pivot, phase 2: owner lookup (GET /owners, /owners/:id)
    // is its own read permission now.
    const ownersReadPermission = await prisma.permission.upsert({
      where: { key: 'owners:read' },
      create: { key: 'owners:read' },
      update: {},
    });

    // Dedicated test-only role — never the real seeded station_supervisor.
    const managerRole = await prisma.role.create({ data: { name: `e2e_dov_manager_role_${runId}` } });
    managerRoleId = managerRole.id;
    await prisma.rolePermission.createMany({
      data: [
        { roleId: managerRole.id, permissionId: ownersPermission.id },
        { roleId: managerRole.id, permissionId: ownersReadPermission.id },
        { roleId: managerRole.id, permissionId: vehiclesManagePermission.id },
        { roleId: managerRole.id, permissionId: vehiclesReadPermission.id },
        { roleId: managerRole.id, permissionId: vehiclesRequestChangePermission.id },
        { roleId: managerRole.id, permissionId: vehiclesApproveChangePermission.id },
        { roleId: managerRole.id, permissionId: ownersRequestChangePermission.id },
        { roleId: managerRole.id, permissionId: ownersApproveChangePermission.id },
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

    municipalityId = (await createMunicipality(prisma, `E2E DOV Municipality ${runId}`)).id;
    registrationStationId = (
      await prisma.registrationStation.create({
        data: {
          internalCode: `E2E-DOV-REG-${runId}`,
          name: 'E2E DOV registration station',
          municipalityId,
          address: 'E2E',
        },
      })
    ).id;
    await prisma.userRegistrationStationScope.create({
      data: { userId: managerUser.id, registrationStationId },
    });

    // No role at all — zero permissions, used for every 403 case.
    const noPermUser = await createUser(usernameNoPerm);
    noPermUserId = noPermUser.id;
  }, 30_000);

  afterAll(async () => {
    if (vehicleId) {
      // Round 12: the OWNER_CHANGE change-request test leaves
      // VehicleChangeRequest rows referencing this vehicle — must go
      // before the vehicle delete, same FK-order reasoning as
      // vehiclePlateHistory below.
      await prisma.vehicleChangeRequest.deleteMany({ where: { vehicleId } });
      await prisma.vehiclePlateHistory.deleteMany({ where: { vehicleId } });
      await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
    }
    if (ownerId) {
      // Round 20: OwnerChangeRequest rows referencing this owner must go
      // before the owner delete, same FK-order reasoning as the vehicle
      // change requests above.
      await prisma.ownerChangeRequest.deleteMany({ where: { ownerId } });
      await prisma.vehicleOwner.deleteMany({ where: { id: ownerId } });
    }
    if (identityChangeConflictOwnerId) {
      await prisma.vehicleOwner.deleteMany({ where: { id: identityChangeConflictOwnerId } });
    }

    const allUserIds = [managerUserId, noPermUserId];
    await prisma.auditLog.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.userRegistrationStationScope.deleteMany({ where: { userId: { in: allUserIds } } });
    // Vehicles registered here (including auto-coded ones this file doesn't
    // track individually) reference the station and the manager.
    await prisma.vehicle.updateMany({
      where: { registeredAtRegistrationStationId: registrationStationId },
      data: { registeredAtRegistrationStationId: null, registeredById: null },
    });
    await prisma.registrationStation.delete({ where: { id: registrationStationId } });
    await deleteMunicipalities(prisma, [municipalityId]);
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

  it('rejects unauthenticated requests to every owner/vehicle endpoint', async () => {
    const server = app.getHttpServer();
    await request(server).post('/api/v1/owners').send({}).expect(401);
    await request(server).get('/api/v1/owners').expect(401);
    await request(server).post('/api/v1/vehicles').send({}).expect(401);
    await request(server).get('/api/v1/vehicles').expect(401);
  });

  // ── 403: authenticated but lacking the required permission ─────────────

  it('blocks an actor without owners:manage/vehicles:manage from every endpoint', async () => {
    const accessToken = await loginAsNoPerm();
    const server = app.getHttpServer();
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${accessToken}`);

    await auth(request(server).post('/api/v1/owners')).send({ fullName: 'Nope' }).expect(403);
    await auth(request(server).get('/api/v1/owners')).expect(403);
    await auth(request(server).post('/api/v1/vehicles')).send({ registrationStationId,
      internalCode: `should-not-exist-${runId}`,
      currentPlate: `should-not-exist-${runId}`,
    }).expect(403);
    await auth(request(server).get('/api/v1/vehicles')).expect(403);
  });

  // ── Owner CRUD ───────────────────────────────────────────────────────

  it('lets a properly-permissioned actor create, list, fetch, and update a vehicle owner', async () => {
    const accessToken = await loginAsManager();
    const server = app.getHttpServer();

    const createRes = await request(server)
      .post('/api/v1/owners')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ registrationStationId,
        fullName: 'E2E DOV Owner One',
        identityType: 'NATIONAL_ID',
        identityNumber: `1${numericId11}`,
        phone: '0920000000',
      })
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

  it('rejects creating an owner with a duplicate (identityType, identityNumber) pair', async () => {
    const accessToken = await loginAsManager();

    await request(app.getHttpServer())
      .post('/api/v1/owners')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ registrationStationId,
        fullName: 'Duplicate Attempt',
        identityType: 'NATIONAL_ID',
        identityNumber: `1${numericId11}`, // same pair as the owner created above
        phone: '0930000000',
      })
      .expect(409);
  });

  it('rejects a PATCH /owners/:id body that tries to change identityType/identityNumber, since they are immutable', async () => {
    const accessToken = await loginAsManager();

    // whitelist + forbidNonWhitelisted: UpdateOwnerDto has no
    // identityType/identityNumber fields at all, so sending them is a 400,
    // not a silent no-op.
    await request(app.getHttpServer())
      .patch(`/api/v1/owners/${ownerId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ identityNumber: `9${numericId11}` })
      .expect(400);
  });

  // ── Owner identity change requests (round 20) ───────────────────────

  it('blocks an actor without owners:request_change/owners:approve_change from the owner change-request endpoints', async () => {
    const accessToken = await loginAsNoPerm();
    const server = app.getHttpServer();
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${accessToken}`);

    await auth(request(server).post(`/api/v1/owners/${ownerId}/change-requests`))
      .send({ identityType: 'NATIONAL_ID', identityNumber: `1${randomDigits(11)}`, reason: 'x', proofReference: 'y' })
      .expect(403);
    await auth(request(server).get('/api/v1/owners/change-requests')).expect(403);
  });

  it('creates a pending owner identity change request, blocks a second pending request for the same owner, then approves it', async () => {
    const accessToken = await loginAsManager();
    const server = app.getHttpServer();
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${accessToken}`);
    const newIdentityNumber = `1${randomDigits(11)}`;

    const requestRes = await auth(request(server).post(`/api/v1/owners/${ownerId}/change-requests`))
      .send({
        identityType: 'NATIONAL_ID',
        identityNumber: newIdentityNumber,
        reason: 'Typed the wrong national ID at onboarding.',
        proofReference: 'ref-001',
      })
      .expect(201);
    expect(requestRes.body.status).toBe('PENDING');
    const changeRequestId = requestRes.body.id;

    // A second pending request for the same owner is a 409, same as the
    // vehicle change-request flow.
    await auth(request(server).post(`/api/v1/owners/${ownerId}/change-requests`))
      .send({
        identityType: 'NATIONAL_ID',
        identityNumber: `1${randomDigits(11)}`,
        reason: 'Another attempt',
        proofReference: 'ref-002',
      })
      .expect(409);

    const listRes = await auth(request(server).get('/api/v1/owners/change-requests')).query({ status: 'PENDING' }).expect(200);
    expect(listRes.body.map((r: { id: string }) => r.id)).toContain(changeRequestId);

    const approveRes = await auth(request(server).post(`/api/v1/owners/change-requests/${changeRequestId}/approve`)).expect(201);
    expect(approveRes.body.status).toBe('APPROVED');

    // The owner's identityNumber actually changed.
    const ownerRes = await auth(request(server).get(`/api/v1/owners/${ownerId}`)).expect(200);
    expect(ownerRes.body.identityNumber).toBe(newIdentityNumber);

    // Approving an already-decided request is a 409.
    await auth(request(server).post(`/api/v1/owners/change-requests/${changeRequestId}/approve`)).expect(409);
  });

  it('rejects an owner identity change request when the target identity is already used by another owner', async () => {
    const accessToken = await loginAsManager();
    const server = app.getHttpServer();
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${accessToken}`);

    const conflictOwnerRes = await auth(request(server).post('/api/v1/owners'))
      .send({ registrationStationId,
        fullName: 'E2E DOV Owner Conflict Target',
        identityType: 'NATIONAL_ID',
        identityNumber: `2${randomDigits(11)}`,
        phone: '0940000000',
      })
      .expect(201);
    identityChangeConflictOwnerId = conflictOwnerRes.body.id;

    await auth(request(server).post(`/api/v1/owners/${ownerId}/change-requests`))
      .send({
        identityType: 'NATIONAL_ID',
        identityNumber: conflictOwnerRes.body.identityNumber,
        reason: 'Trying to reuse another owner\'s identity',
        proofReference: 'ref-003',
      })
      .expect(409);
  });

  it('lets a pending owner identity change request be rejected with a reason', async () => {
    const accessToken = await loginAsManager();
    const server = app.getHttpServer();
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${accessToken}`);

    const requestRes = await auth(request(server).post(`/api/v1/owners/${ownerId}/change-requests`))
      .send({
        identityType: 'ADMINISTRATIVE_ID',
        identityNumber: `9${randomDigits(11)}`,
        reason: 'Second correction attempt',
        proofReference: 'ref-004',
      })
      .expect(201);

    const rejectRes = await auth(request(server).post(`/api/v1/owners/change-requests/${requestRes.body.id}/reject`))
      .send({ reason: 'Proof reference does not match records.' })
      .expect(201);
    expect(rejectRes.body.status).toBe('REJECTED');
    expect(rejectRes.body.rejectionReason).toBe('Proof reference does not match records.');
  });

  // ── Vehicle CRUD + search ────────────────────────────────────────────

  it('lets a properly-permissioned actor create a vehicle, and rejects duplicate internalCode/currentPlate', async () => {
    const accessToken = await loginAsManager();
    const server = app.getHttpServer();

    const createRes = await request(server)
      .post('/api/v1/vehicles')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ registrationStationId,
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
      .send({ registrationStationId, internalCode: `VEH-${runId}`, currentPlate: `8-${plateSeqB}`, ownerId })
      .expect(409);

    await request(server)
      .post('/api/v1/vehicles')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ registrationStationId, internalCode: `VEH-${runId}-DIFFERENT`, currentPlate: `5-${plateSeqA}`, ownerId })
      .expect(409);
  });

  // Round 5 feedback item 3: internalCode is no longer something a station
  // employee types on the create-vehicle form — VehiclesService.create()
  // assigns the next "V-######" code itself when the field is omitted.
  it('auto-generates a "V-######" internalCode when none is supplied, and it is a real usable unique code', async () => {
    const accessToken = await loginAsManager();
    const server = app.getHttpServer();

    const res = await request(server)
      .post('/api/v1/vehicles')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ registrationStationId, currentPlate: `12-${randomDigits(7)}`, ownerId })
      .expect(201);

    expect(res.body.internalCode).toMatch(/^V-\d{6}$/);

    // The generated code is real and immediately unique — creating another
    // vehicle with no internalCode gets a DIFFERENT one, not a collision.
    const secondRes = await request(server)
      .post('/api/v1/vehicles')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ registrationStationId, currentPlate: `12-${randomDigits(7)}`, ownerId })
      .expect(201);
    expect(secondRes.body.internalCode).toMatch(/^V-\d{6}$/);
    expect(secondRes.body.internalCode).not.toBe(res.body.internalCode);
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

  // Round 12: ownerId/usageType affect FillUpRuleEngine eligibility, so they
  // no longer go through the general PATCH endpoint at all (forbidNonWhitelisted
  // rejects them outright) — they route through the same approval-gated
  // change-request flow chassisNumber/registrationBooklet already used.
  it('rejects ownerId/usageType on the general PATCH endpoint — they must go through change-requests', async () => {
    const accessToken = await loginAsManager();

    await request(app.getHttpServer())
      .patch(`/api/v1/vehicles/${vehicleId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ownerId: 'some-other-owner-id' })
      .expect(400);

    await request(app.getHttpServer())
      .patch(`/api/v1/vehicles/${vehicleId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ usageType: 'GOVERNMENT' })
      .expect(400);
  });

  it('reassigns ownerId through the OWNER_CHANGE change-request flow, approval-gated since the vehicle already has an owner', async () => {
    const accessToken = await loginAsManager();

    const secondOwnerRes = await request(app.getHttpServer())
      .post('/api/v1/owners')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ registrationStationId,
        fullName: 'E2E DOV Owner Two',
        identityType: 'NATIONAL_ID',
        identityNumber: `2${numericId11}`,
        phone: '0940000000',
      })
      .expect(201);
    const secondOwnerId = secondOwnerRes.body.id;

    const requestRes = await request(app.getHttpServer())
      .post(`/api/v1/vehicles/${vehicleId}/change-requests`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        changeType: 'OWNER_CHANGE',
        requestedValue: secondOwnerId,
        reason: 'E2E DOV owner reassignment test',
        proofReference: 'E2E-PROOF-OWNER-CHANGE',
      })
      .expect(201);
    expect(requestRes.body.requiresApproval).toBe(true);

    await request(app.getHttpServer())
      .post(`/api/v1/vehicles/change-requests/${requestRes.body.changeRequest.id}/approve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    const vehicleRes = await request(app.getHttpServer())
      .get(`/api/v1/vehicles/${vehicleId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(vehicleRes.body.ownerId).toBe(secondOwnerId);

    // Reassign back to the original owner (also approval-gated) and clean
    // up the throwaway one.
    const revertRes = await request(app.getHttpServer())
      .post(`/api/v1/vehicles/${vehicleId}/change-requests`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        changeType: 'OWNER_CHANGE',
        requestedValue: ownerId,
        reason: 'E2E DOV owner revert',
        proofReference: 'E2E-PROOF-OWNER-REVERT',
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/vehicles/change-requests/${revertRes.body.changeRequest.id}/approve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
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
      .send({ registrationStationId, internalCode: `VEH-${runId}-OTHER`, currentPlate: `15-${plateSeqOther}`, ownerId })
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
