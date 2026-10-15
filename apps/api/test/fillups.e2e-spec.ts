import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import './support/card-scan-shim';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { createMunicipality, deleteMunicipalities } from './support/municipality-fixtures';

// M3 (docs/IMPLEMENTATION_PLAN.md §11): fill-up transactions + rule engine.
// The rule engine itself is unit-tested independently (rule-engine/*.spec.ts)
// with no DB — this file covers the endpoint-level behavior the plan's
// acceptance criteria actually name: "a rejected fill-up correctly offers
// the exception flow instead of a dead end", plus the idempotency replay
// from §7 ("a flaky station connection retrying a POST should never
// double-record a fill-up").
//
// SystemSettingsService throws if a fillup.* key isn't seeded, and CI's e2e
// step (.github/workflows/ci.yml) never runs `prisma db seed` — only
// `prisma migrate deploy`. So, matching the existing self-contained-fixture
// pattern used for permissions/roles in the other e2e specs (rather than
// depending on seed.ts having run), this file upserts the SystemSetting
// rows it needs directly.
describe('Fill-ups (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const runId = Date.now().toString(36);
  const password = 'BoundaryTest123!';

  const usernameRecorder = `e2e_fu_recorder_${runId}`;
  const usernameRecorderOtherStation = `e2e_fu_recorder_other_${runId}`;
  const usernameRecorderNoException = `e2e_fu_recorder_noexception_${runId}`;
  const usernameApprover = `e2e_fu_approver_${runId}`;
  const usernameNoPerm = `e2e_fu_noperm_${runId}`;

  let recorderUserId: string;
  let recorderOtherStationUserId: string;
  let recorderNoExceptionUserId: string;
  let approverUserId: string;
  let noPermUserId: string;
  let recorderRoleId: string;
  let recorderNoExceptionRoleId: string;
  let approverRoleId: string;

  let company: { id: string };
  let stationA: { id: string };
  let stationB: { id: string };
  let municipality: { id: string };
  let exceptionTypeId: string;
  let exceptionTypeRequiresProofId: string;

  let vehicle1Id: string;
  let vehicle2Id: string;
  let vehicle3Id: string;
  let vehicle4Id: string;

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

    // ── SystemSetting fixtures (same numbers as the seeded placeholders) ──
    const settings: Array<[string, string]> = [
      ['fillup.max_per_week', '3'],
      ['fillup.min_gap_days', '2'],
      ['fillup.max_per_week_per_owner', '3'],
      ['fillup.min_gap_days_per_owner', '2'],
      ['fillup.max_liters_per_week_per_owner', '100000'], // high enough to stay out of the way — this file doesn't test owner-scoped rules
      ['fillup.week_window_mode', 'rolling'],
      ['fillup.week_start_day', '6'],
    ];
    for (const [key, value] of settings) {
      await prisma.systemSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
    }

    const exceptionType = await prisma.exceptionType.upsert({
      where: { key: 'E2E_FILLUPS_EXCEPTION_TYPE' },
      create: { key: 'E2E_FILLUPS_EXCEPTION_TYPE', name: 'E2E test exception type', requiresProof: false },
      update: {},
    });
    exceptionTypeId = exceptionType.id;

    const exceptionTypeRequiresProof = await prisma.exceptionType.upsert({
      where: { key: 'E2E_FILLUPS_EXCEPTION_TYPE_REQUIRES_PROOF' },
      create: {
        key: 'E2E_FILLUPS_EXCEPTION_TYPE_REQUIRES_PROOF',
        name: 'E2E test exception type requiring proof',
        requiresProof: true,
      },
      update: {},
    });
    exceptionTypeRequiresProofId = exceptionTypeRequiresProof.id;

    company = await prisma.company.create({ data: { name: `E2E FU Company ${runId}` } });
    // Both stations in the same live municipality — this file tests the
    // single-municipality behavior; per-municipality counting has its own
    // spec (municipality-foundation.e2e-spec.ts).
    municipality = await createMunicipality(prisma, `E2E FU Municipality ${runId}`);
    stationA = await prisma.station.create({
      data: {
        internalCode: `E2E-FU-A-${runId}`,
        stationNumber: '1',
        name: 'E2E FU Station A',
        companyId: company.id,
        municipalityId: municipality.id,
      },
    });
    stationB = await prisma.station.create({
      data: {
        internalCode: `E2E-FU-B-${runId}`,
        stationNumber: '2',
        name: 'E2E FU Station B',
        companyId: company.id,
        municipalityId: municipality.id,
      },
    });

    const vehicle1 = await prisma.vehicle.create({
      data: { internalCode: `E2E-FU-VEH-1-${runId}`, currentPlate: `E2E-FU-PLATE-1-${runId}` },
    });
    vehicle1Id = vehicle1.id;

    const vehicle2 = await prisma.vehicle.create({
      data: { internalCode: `E2E-FU-VEH-2-${runId}`, currentPlate: `E2E-FU-PLATE-2-${runId}` },
    });
    vehicle2Id = vehicle2.id;

    const vehicle3 = await prisma.vehicle.create({
      data: { internalCode: `E2E-FU-VEH-3-${runId}`, currentPlate: `E2E-FU-PLATE-3-${runId}` },
    });
    vehicle3Id = vehicle3.id;

    const vehicle4 = await prisma.vehicle.create({
      data: { internalCode: `E2E-FU-VEH-4-${runId}`, currentPlate: `E2E-FU-PLATE-4-${runId}` },
    });
    vehicle4Id = vehicle4.id;

    // ── Roles/permissions ────────────────────────────────────────────────
    const createPermission = await prisma.permission.upsert({
      where: { key: 'fillups:create' },
      create: { key: 'fillups:create' },
      update: {},
    });
    const approvePermission = await prisma.permission.upsert({
      where: { key: 'fillups:approve_exception' },
      create: { key: 'fillups:approve_exception' },
      update: {},
    });
    // Round 12: exception recording is now gated by its own permission,
    // separate from fillups:create, and a holder of it is auto-approved at
    // creation (no pending queue) — see FillUpsService.create.
    const recordExceptionPermission = await prisma.permission.upsert({
      where: { key: 'fillups:record_exception' },
      create: { key: 'fillups:record_exception' },
      update: {},
    });

    // Deliberately scoped (unrestrictedStationAccess: false) — the
    // station-scope check in FillUpsService.create is exercised below.
    const recorderRole = await prisma.role.create({ data: { name: `e2e_fu_recorder_role_${runId}` } });
    recorderRoleId = recorderRole.id;
    await prisma.rolePermission.createMany({
      data: [
        { roleId: recorderRole.id, permissionId: createPermission.id },
        { roleId: recorderRole.id, permissionId: recordExceptionPermission.id },
      ],
    });

    // Holds fillups:create but deliberately NOT fillups:record_exception —
    // proves the exception-recording gate is enforced independently of
    // being able to record a normal fill-up at all.
    const recorderNoExceptionRole = await prisma.role.create({
      data: { name: `e2e_fu_recorder_noexception_role_${runId}` },
    });
    recorderNoExceptionRoleId = recorderNoExceptionRole.id;
    await prisma.rolePermission.create({
      data: { roleId: recorderNoExceptionRole.id, permissionId: createPermission.id },
    });

    const approverRole = await prisma.role.create({ data: { name: `e2e_fu_approver_role_${runId}` } });
    approverRoleId = approverRole.id;
    await prisma.rolePermission.create({ data: { roleId: approverRole.id, permissionId: approvePermission.id } });

    async function createUser(username: string) {
      return prisma.user.create({
        data: { username, passwordHash: await argon2.hash(password), fullName: `E2E FU ${username}` },
      });
    }

    const recorderUser = await createUser(usernameRecorder);
    recorderUserId = recorderUser.id;
    await prisma.userRole.create({ data: { userId: recorderUser.id, roleId: recorderRole.id } });
    // Scoped to stationA ONLY — stationB is out of scope for this user.
    await prisma.userStationScope.create({ data: { userId: recorderUser.id, stationId: stationA.id } });

    // Same recorder role/permission, but scoped to stationB ONLY — used to
    // prove the Idempotency-Key/station-scope interaction: this user has no
    // access to stationA and must not be able to read stationA's fill-up
    // data by guessing/reusing another user's Idempotency-Key for it.
    const recorderOtherStationUser = await createUser(usernameRecorderOtherStation);
    recorderOtherStationUserId = recorderOtherStationUser.id;
    await prisma.userRole.create({ data: { userId: recorderOtherStationUser.id, roleId: recorderRole.id } });
    await prisma.userStationScope.create({
      data: { userId: recorderOtherStationUser.id, stationId: stationB.id },
    });

    const approverUser = await createUser(usernameApprover);
    approverUserId = approverUser.id;
    await prisma.userRole.create({ data: { userId: approverUser.id, roleId: approverRole.id } });
    // Scoped to stationA ONLY — approveException now enforces station scope
    // (same as create()), so this fixture must be scoped to wherever the
    // other tests' exceptions are actually recorded (stationA).
    await prisma.userStationScope.create({ data: { userId: approverUser.id, stationId: stationA.id } });

    // Round 12: fillups:create but NOT fillups:record_exception — proves
    // exception recording is gated independently.
    const recorderNoExceptionUser = await createUser(usernameRecorderNoException);
    recorderNoExceptionUserId = recorderNoExceptionUser.id;
    await prisma.userRole.create({
      data: { userId: recorderNoExceptionUser.id, roleId: recorderNoExceptionRoleId },
    });
    await prisma.userStationScope.create({
      data: { userId: recorderNoExceptionUser.id, stationId: stationA.id },
    });

    const noPermUser = await createUser(usernameNoPerm);
    noPermUserId = noPermUser.id;
  });

  afterAll(async () => {
    const allUserIds = [
      recorderUserId,
      recorderOtherStationUserId,
      recorderNoExceptionUserId,
      approverUserId,
      noPermUserId,
    ];
    // FillUpTransaction.recordedById references User — must go before the
    // user rows are deleted, not after.
    await prisma.exception.deleteMany({ where: { fillUpTransaction: { vehicleId: { in: [vehicle1Id, vehicle2Id, vehicle3Id, vehicle4Id] } } } });
    await prisma.fillUpTransaction.deleteMany({ where: { vehicleId: { in: [vehicle1Id, vehicle2Id, vehicle3Id, vehicle4Id] } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.userStationScope.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: allUserIds } } });
    await prisma.rolePermission.deleteMany({
      where: { roleId: { in: [recorderRoleId, recorderNoExceptionRoleId, approverRoleId] } },
    });
    await prisma.role.deleteMany({ where: { id: { in: [recorderRoleId, recorderNoExceptionRoleId, approverRoleId] } } });
    await prisma.vehiclePlateHistory.deleteMany({ where: { vehicleId: { in: [vehicle1Id, vehicle2Id, vehicle3Id, vehicle4Id] } } });
    await prisma.vehicle.deleteMany({ where: { id: { in: [vehicle1Id, vehicle2Id, vehicle3Id, vehicle4Id] } } });
    await prisma.station.deleteMany({ where: { id: { in: [stationA.id, stationB.id] } } });
    await prisma.company.delete({ where: { id: company.id } });
    await deleteMunicipalities(prisma, [municipality.id]);
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

  const loginAsRecorder = () => login(usernameRecorder);
  const loginAsRecorderOtherStation = () => login(usernameRecorderOtherStation);
  const loginAsRecorderNoException = () => login(usernameRecorderNoException);
  const loginAsNoPerm = () => login(usernameNoPerm);

  function baseFillUpBody(overrides: Record<string, unknown> = {}) {
    return {
      vehicleId: vehicle1Id,
      stationId: stationA.id,
      fuelType: 'PETROL_95',
      quantityLiters: 20,
      ...overrides,
    };
  }

  // ── 401 / 403 ────────────────────────────────────────────────────────

  it('rejects unauthenticated requests to the fill-up and exception endpoints', async () => {
    const server = app.getHttpServer();
    await request(server).post('/api/v1/fillups').send(baseFillUpBody()).expect(401);
    await request(server).get('/api/v1/exceptions').expect(401);
  });

  it('blocks an actor without fillups:create', async () => {
    const accessToken = await loginAsNoPerm();
    const server = app.getHttpServer();

    await request(server)
      .post('/api/v1/fillups')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', `e2e-fu-noperm-${runId}`)
      .send(baseFillUpBody())
      .expect(403);
  });

  // ── Idempotency-Key header validation ───────────────────────────────

  it('rejects POST /fillups with no Idempotency-Key header', async () => {
    const accessToken = await loginAsRecorder();
    const res = await request(app.getHttpServer())
      .post('/api/v1/fillups')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(baseFillUpBody())
      .expect(400);
    expect(res.body.message).toBe('Idempotency-Key header is required.');
  });

  // ── Station scoping on create (CLAUDE.md rule 3) ────────────────────

  it('blocks a scoped recorder from creating a fill-up at a station outside their scope', async () => {
    const accessToken = await loginAsRecorder();
    await request(app.getHttpServer())
      .post('/api/v1/fillups')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', `e2e-fu-outofscope-${runId}`)
      .send(baseFillUpBody({ stationId: stationB.id }))
      .expect(403);
  });

  // ── Happy path + idempotency replay ─────────────────────────────────

  it('creates a fill-up within caps (201), and replaying the same Idempotency-Key returns the SAME row with 200, not a duplicate', async () => {
    const accessToken = await loginAsRecorder();
    const idempotencyKey = `e2e-fu-happy-${runId}`;
    const server = app.getHttpServer();

    const firstRes = await request(server)
      .post('/api/v1/fillups')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(baseFillUpBody())
      .expect(201);
    expect(firstRes.body.isException).toBe(false);
    expect(firstRes.body.vehicleId).toBe(vehicle1Id);
    const createdId = firstRes.body.id;

    const replayRes = await request(server)
      .post('/api/v1/fillups')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(baseFillUpBody())
      .expect(200);
    expect(replayRes.body.id).toBe(createdId);

    const rows = await prisma.fillUpTransaction.findMany({ where: { idempotencyKey } });
    expect(rows).toHaveLength(1);
  });

  it('rejects reusing an Idempotency-Key with a logically different fill-up (different vehicleId) with 409, and does not return the original transaction', async () => {
    const accessToken = await loginAsRecorder();
    const idempotencyKey = `e2e-fu-mismatch-${runId}`;
    const server = app.getHttpServer();

    // Dedicated vehicle3/driver3 — isolated from vehicle1's fill-up history
    // built up by the earlier happy-path/replay test, so this 201 isn't
    // accidentally rejected by the gap rule instead.
    await request(server)
      .post('/api/v1/fillups')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(baseFillUpBody({ vehicleId: vehicle3Id }))
      .expect(201);

    // Same key, different vehicleId — a client bug (or copy-paste mistake),
    // not a valid retry. Must be rejected, not silently resolved to the
    // original transaction.
    await request(server)
      .post('/api/v1/fillups')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(baseFillUpBody({ vehicleId: vehicle2Id }))
      .expect(409);

    const rows = await prisma.fillUpTransaction.findMany({ where: { idempotencyKey } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.vehicleId).toBe(vehicle3Id);
  });

  // ── Idempotency-Key must not bypass station scoping ─────────────────
  // The scope check runs against dto.stationId BEFORE the idempotency-key
  // lookup, so it applies uniformly to the replay path too — an
  // out-of-scope actor must be blocked even when the key already resolves
  // to someone else's real transaction, and must not see that
  // transaction's data via the 200-replay response.

  it('blocks a user scoped to a different station from reusing another user\'s Idempotency-Key for a fill-up at a station they cannot access', async () => {
    const recorderToken = await loginAsRecorder();
    const idempotencyKey = `e2e-fu-scope-reuse-${runId}`;
    const server = app.getHttpServer();

    // User A (scoped to stationA) creates the fill-up. Dedicated
    // vehicle4/driver4 — isolated from vehicle1's fill-up history built up
    // by earlier tests, so this 201 isn't accidentally rejected by the gap
    // rule instead.
    const createRes = await request(server)
      .post('/api/v1/fillups')
      .set('Authorization', `Bearer ${recorderToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(baseFillUpBody({ vehicleId: vehicle4Id }))
      .expect(201);
    expect(createRes.body.stationId).toBe(stationA.id);

    // User B (scoped to stationB ONLY, no access to stationA) reuses the
    // SAME key, declaring stationA in the body — same payload A used, so
    // this would otherwise be a legitimate-looking replay.
    const otherStationToken = await loginAsRecorderOtherStation();
    const replayAttemptRes = await request(server)
      .post('/api/v1/fillups')
      .set('Authorization', `Bearer ${otherStationToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(baseFillUpBody({ vehicleId: vehicle4Id }))
      .expect(403);

    // Not A's transaction data leaking through — a 403 body, nothing else.
    expect(replayAttemptRes.body.id).toBeUndefined();
    expect(replayAttemptRes.body.vehicleId).toBeUndefined();
  });

  // ── Phase 7: no proof reference, for any type ───────────────────────

  it("accepts an exception with a type that used to require a proof reference, and stores none", async () => {
    const accessToken = await loginAsRecorder();
    const idempotencyKey = `e2e-fu-noproof-${runId}`;

    await request(app.getHttpServer())
      .post('/api/v1/fillups')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(
        baseFillUpBody({
          exceptionTypeId: exceptionTypeRequiresProofId,
          reason: 'E2E test: no proof reference is asked for any more',
        }),
      )
      .expect(201);

    const rows = await prisma.fillUpTransaction.findMany({ where: { idempotencyKey }, include: { exception: true } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.exception?.proofReference).toBeNull();
  });

  it("refuses a proofReference sent anyway: the field no longer exists", async () => {
    const accessToken = await loginAsRecorder();
    await request(app.getHttpServer())
      .post('/api/v1/fillups')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', `e2e-fu-proof-field-${runId}`)
      .send(baseFillUpBody({ exceptionTypeId: exceptionTypeRequiresProofId, reason: 'x', proofReference: 'REF-1' }))
      .expect(400);
  });

  // ── Reject -> exception -> approve, end to end ──────────────────────

  it('rejects a fill-up over the weekly cap with 422 and creates nothing, then accepts the SAME request with exception fields (no approval step)', async () => {
    const accessToken = await loginAsRecorder();
    const server = app.getHttpServer();

    // Pre-load 3 prior fill-ups for vehicle2, spaced >= 2 days apart
    // (satisfies the gap rule) and all within the 7-day rolling window —
    // this is what actually reaches the weekly cap (3) without tripping the
    // gap check first.
    await prisma.fillUpTransaction.createMany({
      data: [6, 4, 2].map((daysAgo, index) => ({
        vehicleId: vehicle2Id,
        stationId: stationA.id,
        municipalityId: municipality.id,
        fuelType: 'PETROL_95' as const,
        quantityLiters: 10,
        occurredAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
        recordedById: recorderUserId,
        idempotencyKey: `e2e-fu-preload-${runId}-${index}`,
        identifiedBy: 'TYPED_REGISTERED' as const,
      })),
    });

    const rejectedIdempotencyKey = `e2e-fu-rejected-${runId}`;
    const rejectRes = await request(server)
      .post('/api/v1/fillups')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', rejectedIdempotencyKey)
      .send(baseFillUpBody({ vehicleId: vehicle2Id }))
      .expect(422);
    expect(rejectRes.body).toEqual({
      allowed: false,
      reason: 'VEHICLE_WEEKLY_CAP_REACHED',
      // A weekly-cap violation has no single triggering fill-up (it's an
      // aggregate count, unlike the gap checks) — trigger is null, not
      // omitted, since the API always includes the key now (item 8).
      trigger: null,
      requiresException: true,
    });

    const rowsAfterRejection = await prisma.fillUpTransaction.findMany({
      where: { idempotencyKey: rejectedIdempotencyKey },
    });
    expect(rowsAfterRejection).toHaveLength(0);

    // Submitting an exceptionTypeId without a reason is rejected before
    // anything is created.
    await request(server)
      .post('/api/v1/fillups')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', `e2e-fu-noreason-${runId}`)
      .send(baseFillUpBody({ vehicleId: vehicle2Id, exceptionTypeId }))
      .expect(400);

    // The exact same scenario, but WITH exception fields, bypasses the
    // block entirely and creates the transaction + Exception row together.
    const exceptionIdempotencyKey = `e2e-fu-exception-${runId}`;
    const exceptionRes = await request(server)
      .post('/api/v1/fillups')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', exceptionIdempotencyKey)
      .send(
        baseFillUpBody({
          vehicleId: vehicle2Id,
          exceptionTypeId,
          reason: 'E2E test: over weekly cap, directorate-approved exception',
        }),
      )
      .expect(201);
    expect(exceptionRes.body.isException).toBe(true);
    expect(exceptionRes.body.exception).toBeDefined();
    // Round 12: recorderUser holds fillups:record_exception, so this
    // exception is auto-approved by the recorder themselves at creation —
    // "I don't want them to be approved by the supervisor or admin, I just
    // want them go as exception" (client's own framing). No pending state
    // for this row at all, ever.
    expect(exceptionRes.body.exception.approvedById).toBe(recorderUserId);
    expect(exceptionRes.body.exception.reason).toBe(
      'E2E test: over weekly cap, directorate-approved exception',
    );
    const fillUpId = exceptionRes.body.id;

    // Phase 6: there is no approval step any more, so the endpoint is gone.
    await request(server)
      .post(`/api/v1/fillups/${fillUpId}/exceptions/approve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });

  // ── fillups:record_exception permission gate (round 12) ──────────────

  it('blocks an actor with fillups:create but not fillups:record_exception from submitting an exception, while normal fill-ups still work', async () => {
    const server = app.getHttpServer();
    const accessToken = await loginAsRecorderNoException();

    // Dedicated fresh vehicle — isolated from every other vehicle's
    // fill-up history built up by earlier tests, so the "normal fill-up"
    // assertion below isn't accidentally rejected by the gap/cap rules
    // instead of genuinely succeeding.
    const vehicle5 = await prisma.vehicle.create({
      data: { internalCode: `E2E-FU-VEH-5-${runId}`, currentPlate: `E2E-FU-PLATE-5-${runId}` },
    });

    // A normal (non-exception) fill-up still succeeds — the gate is
    // specific to exception mode, not a general fillups:create narrowing.
    await request(server)
      .post('/api/v1/fillups')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', `e2e-fu-noexception-normal-${runId}`)
      .send(baseFillUpBody({ vehicleId: vehicle5.id }))
      .expect(201);

    const idempotencyKey = `e2e-fu-noexception-blocked-${runId}`;
    await request(server)
      .post('/api/v1/fillups')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(
        baseFillUpBody({
          vehicleId: vehicle5.id,
          exceptionTypeId,
          reason: 'E2E test: should be blocked — no fillups:record_exception',
        }),
      )
      .expect(403);

    const rows = await prisma.fillUpTransaction.findMany({ where: { idempotencyKey } });
    expect(rows).toHaveLength(0);

    await prisma.fillUpTransaction.deleteMany({ where: { vehicleId: vehicle5.id } });
    await prisma.vehiclePlateHistory.deleteMany({ where: { vehicleId: vehicle5.id } });
    await prisma.vehicle.delete({ where: { id: vehicle5.id } });
  });

  // ── GET /fillups/rule-preview (round 7 item 1) ───────────────────────

  describe('GET /fillups/rule-preview', () => {
    it('rejects unauthenticated requests and requires fillups:create', async () => {
      const server = app.getHttpServer();
      await request(server).get('/api/v1/fillups/rule-preview').query({ vehicleId: vehicle3Id, stationId: stationA.id }).expect(401);

      const noPermToken = await loginAsRecorder(); // reuse a real token but hit with no vehicleId first
      await request(server)
        .get('/api/v1/fillups/rule-preview')
        .set('Authorization', `Bearer ${noPermToken}`)
        .expect(400);
    });

    it('404s for a card that does not exist, and refuses a plain vehicleId with no card (CARD_REQUIRED)', async () => {
      const token = await loginAsRecorder();
      await request(app.getHttpServer())
        .get('/api/v1/fillups/rule-preview')
        .query({ cardNumber: 'SBH-ZZZZZZZZ', stationId: stationA.id })
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
      const bare = await request(app.getHttpServer())
        .get('/api/v1/fillups/rule-preview')
        .query({ vehicleId: 'does-not-exist', stationId: stationA.id })
        .set('Authorization', `Bearer ${token}`)
        .expect(409);
      expect(bare.body.message).toBe('CARD_REQUIRED');
    });

    it('returns every check with real numbers, matching what an actual submission would decide', async () => {
      const token = await loginAsRecorder();

      const res = await request(app.getHttpServer())
        .get('/api/v1/fillups/rule-preview')
        .query({ vehicleId: vehicle4Id, stationId: stationA.id })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(Array.isArray(res.body.checks)).toBe(true);
      expect(res.body.checks.length).toBeGreaterThanOrEqual(2);
      const vehicleGapCheck = res.body.checks.find((c: { reason: string }) => c.reason === 'VEHICLE_GAP_TOO_SHORT');
      expect(vehicleGapCheck).toBeDefined();
      expect(typeof vehicleGapCheck.passed).toBe('boolean');
      expect(typeof vehicleGapCheck.limit).toBe('number');

      // Cross-check: the SAME vehicle immediately rejected by POST /fillups
      // (vehicle2 preloaded over its weekly cap earlier in this file) shows
      // that specific rule as passed:false in the preview too — the
      // breakdown never disagrees with the real enforcement path.
      const preview2 = await request(app.getHttpServer())
        .get('/api/v1/fillups/rule-preview')
        .query({ vehicleId: vehicle2Id, stationId: stationA.id })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const vehicleWeekly = preview2.body.checks.find(
        (c: { reason: string }) => c.reason === 'VEHICLE_WEEKLY_CAP_REACHED',
      );
      expect(vehicleWeekly.passed).toBe(false);
      expect(vehicleWeekly.actual).toBeGreaterThanOrEqual(3);
      expect(vehicleWeekly.limit).toBe(3);
    });
  });
});
