import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

// M6 (item: standing/continuous exceptions). fill-up-rule-engine.spec.ts
// already unit-tests FillUpRuleEngine.evaluate() resolving a violation
// against a StandingExceptionReader with a fake reader — that proves the
// ENGINE'S logic is right, but not that granting one through the real API
// actually reaches the real Prisma-backed reader and gets recorded on the
// real FillUpTransaction row. This file closes that gap end to end: grant
// via POST /standing-exceptions, trip the rule it covers via POST
// /fillups, confirm the transaction carries standingExceptionId/
// coveredRule, then revoke and confirm the SAME rule trips again.
describe('Standing exceptions (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const runId = Date.now().toString(36);
  const password = 'BoundaryTest123!';

  const usernameGranter = `e2e_se_granter_${runId}`;
  const usernameRecorder = `e2e_se_recorder_${runId}`;
  const usernameNoPerm = `e2e_se_noperm_${runId}`;

  let granterUserId: string;
  let recorderUserId: string;
  let noPermUserId: string;
  let granterRoleId: string;
  let recorderRoleId: string;

  let company: { id: string };
  let station: { id: string };
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

    const settings: Array<[string, string]> = [
      ['fillup.max_per_week', '3'],
      ['fillup.min_gap_days', '2'],
      ['fillup.max_per_week_per_owner', '3'],
      ['fillup.min_gap_days_per_owner', '2'],
      ['fillup.max_liters_per_week_per_owner', '1000'],
      ['fillup.week_window_mode', 'rolling'],
      ['fillup.week_start_day', '6'],
    ];
    for (const [key, value] of settings) {
      await prisma.systemSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
    }

    company = await prisma.company.create({ data: { name: `E2E SE Company ${runId}` } });
    station = await prisma.station.create({
      data: { internalCode: `E2E-SE-A-${runId}`, stationNumber: '1', name: 'E2E SE Station', companyId: company.id },
    });

    const vehicle = await prisma.vehicle.create({
      data: { internalCode: `E2E-SE-VEH-1-${runId}`, currentPlate: `E2E-SE-PLATE-1-${runId}` },
    });
    vehicleId = vehicle.id;

    // Prior fill-up 1 day ago — inside min_gap_days (2) — so any subsequent
    // fill-up trips VEHICLE_GAP_TOO_SHORT until either a standing exception
    // covers it or enough time passes.
    await prisma.fillUpTransaction.create({
      data: {
        vehicleId,
        stationId: station.id,
        fuelType: 'PETROL_95',
        quantityLiters: 20,
        occurredAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        recordedById: (await prisma.user.create({
          data: { username: `e2e_se_seed_${runId}`, passwordHash: await argon2.hash(password), fullName: 'seed' },
        })).id,
        idempotencyKey: `e2e-se-preload-${runId}`,
      },
    });

    const createFillupsPermission = await prisma.permission.upsert({
      where: { key: 'fillups:create' },
      create: { key: 'fillups:create' },
      update: {},
    });
    const manageStandingPermission = await prisma.permission.upsert({
      where: { key: 'standing_exceptions:manage' },
      create: { key: 'standing_exceptions:manage' },
      update: {},
    });
    const readVehiclesPermission = await prisma.permission.upsert({
      where: { key: 'vehicles:read' },
      create: { key: 'vehicles:read' },
      update: {},
    });

    // Granter: standing_exceptions:manage + vehicles:read, no fillups:create
    // — grant/revoke rights are exercised independently of recording.
    const granterRole = await prisma.role.create({ data: { name: `e2e_se_granter_role_${runId}` } });
    granterRoleId = granterRole.id;
    await prisma.rolePermission.createMany({
      data: [
        { roleId: granterRole.id, permissionId: manageStandingPermission.id },
        { roleId: granterRole.id, permissionId: readVehiclesPermission.id },
      ],
    });

    // Recorder: fillups:create + vehicles:read (same as the real
    // station_employee role in seed.ts) — cannot grant/revoke, only
    // benefits from (or is blocked by) whatever standing exceptions
    // already exist, and can see them via GET (gated on vehicles:read).
    const recorderRole = await prisma.role.create({ data: { name: `e2e_se_recorder_role_${runId}` } });
    recorderRoleId = recorderRole.id;
    await prisma.rolePermission.createMany({
      data: [
        { roleId: recorderRole.id, permissionId: createFillupsPermission.id },
        { roleId: recorderRole.id, permissionId: readVehiclesPermission.id },
      ],
    });

    async function createUser(username: string) {
      return prisma.user.create({
        data: { username, passwordHash: await argon2.hash(password), fullName: `E2E SE ${username}` },
      });
    }

    const granterUser = await createUser(usernameGranter);
    granterUserId = granterUser.id;
    await prisma.userRole.create({ data: { userId: granterUser.id, roleId: granterRole.id } });

    const recorderUser = await createUser(usernameRecorder);
    recorderUserId = recorderUser.id;
    await prisma.userRole.create({ data: { userId: recorderUser.id, roleId: recorderRole.id } });
    await prisma.userStationScope.create({ data: { userId: recorderUser.id, stationId: station.id } });

    const noPermUser = await createUser(usernameNoPerm);
    noPermUserId = noPermUser.id;
  }, 30_000);

  afterAll(async () => {
    const allUserIds = [granterUserId, recorderUserId, noPermUserId];
    await prisma.standingException.deleteMany({ where: { vehicleId } });
    await prisma.exception.deleteMany({ where: { fillUpTransaction: { vehicleId } } });
    await prisma.fillUpTransaction.deleteMany({ where: { vehicleId } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.userStationScope.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: allUserIds } } });
    // seed user created inline for recordedById on the preload fill-up
    await prisma.user.deleteMany({ where: { username: `e2e_se_seed_${runId}` } });
    await prisma.user.deleteMany({ where: { id: { in: allUserIds } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: { in: [granterRoleId, recorderRoleId] } } });
    await prisma.role.deleteMany({ where: { id: { in: [granterRoleId, recorderRoleId] } } });
    await prisma.vehicle.delete({ where: { id: vehicleId } });
    await prisma.station.delete({ where: { id: station.id } });
    await prisma.company.delete({ where: { id: company.id } });
    await app.close();
  });

  const tokenCache = new Map<string, string>();
  async function login(username: string): Promise<string> {
    const cached = tokenCache.get(username);
    if (cached) return cached;
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username, password })
      .expect(200);
    tokenCache.set(username, res.body.accessToken);
    return res.body.accessToken;
  }

  const loginAsGranter = () => login(usernameGranter);
  const loginAsRecorder = () => login(usernameRecorder);
  const loginAsNoPerm = () => login(usernameNoPerm);

  function attemptFillUp(idempotencyKey: string, token: string) {
    return request(app.getHttpServer())
      .post('/api/v1/fillups')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        vehicleId,
        stationId: station.id,
        fuelType: 'PETROL_95',
        quantityLiters: 15,
      });
  }

  it('rejects standing-exception create/revoke for a caller without standing_exceptions:manage', async () => {
    const token = await loginAsNoPerm();
    await request(app.getHttpServer())
      .post('/api/v1/standing-exceptions')
      .set('Authorization', `Bearer ${token}`)
      .send({ vehicleId, rules: ['VEHICLE_GAP_TOO_SHORT'], reason: 'should be blocked' })
      .expect(403);
  });

  it('without a grant, the fill-up trips VEHICLE_GAP_TOO_SHORT as expected', async () => {
    const token = await loginAsRecorder();
    const res = await attemptFillUp(`e2e-se-nogrant-${runId}`, token).expect(422);
    expect(res.body.reason).toBe('VEHICLE_GAP_TOO_SHORT');
  });

  it('grants a standing exception, the covered rule is now auto-allowed and the transaction records which grant covered it, then revoking makes it trip again', async () => {
    const granterToken = await loginAsGranter();
    const recorderToken = await loginAsRecorder();

    const grantRes = await request(app.getHttpServer())
      .post('/api/v1/standing-exceptions')
      .set('Authorization', `Bearer ${granterToken}`)
      .send({ vehicleId, rules: ['VEHICLE_GAP_TOO_SHORT'], reason: 'E2E: medical exemption test' })
      .expect(201);
    const grantId = grantRes.body.id;
    expect(grantRes.body.rules).toEqual(['VEHICLE_GAP_TOO_SHORT']);

    // Same fill-up that tripped the rule in the previous test now succeeds
    // (201, not 422) purely because the grant exists.
    const coveredRes = await attemptFillUp(`e2e-se-covered-${runId}`, recorderToken).expect(201);
    expect(coveredRes.body.standingExceptionId).toBe(grantId);
    expect(coveredRes.body.coveredRule).toBe('VEHICLE_GAP_TOO_SHORT');
    expect(coveredRes.body.isException).toBe(false); // auto-allowed, not the one-time Exception flow

    // GET /standing-exceptions (vehicles:read is enough — not
    // standing_exceptions:manage) shows the active grant.
    const listRes = await request(app.getHttpServer())
      .get(`/api/v1/standing-exceptions?vehicleId=${vehicleId}`)
      .set('Authorization', `Bearer ${recorderToken}`)
      .expect(200);
    expect(listRes.body.some((g: { id: string }) => g.id === grantId)).toBe(true);

    // Revoke — requires standing_exceptions:manage, recorder cannot do it.
    await request(app.getHttpServer())
      .post(`/api/v1/standing-exceptions/${grantId}/revoke`)
      .set('Authorization', `Bearer ${recorderToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .post(`/api/v1/standing-exceptions/${grantId}/revoke`)
      .set('Authorization', `Bearer ${granterToken}`)
      .expect(201);

    // The rule now trips again — the revoked grant no longer covers it.
    // The just-created "covered" fill-up (1 minute ago) is itself now the
    // nearest prior fill-up, so this also confirms VEHICLE_GAP_TOO_SHORT
    // fires off a genuinely fresh trigger, not stale state.
    const afterRevokeRes = await attemptFillUp(`e2e-se-revoked-${runId}`, recorderToken).expect(422);
    expect(afterRevokeRes.body.reason).toBe('VEHICLE_GAP_TOO_SHORT');
  });
});
