import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { createMunicipality, deleteMunicipalities } from './support/municipality-fixtures';
import { deleteAuditRows } from '../prisma/audit-removal';

// This is the actual mechanism that grants and revokes access — the
// endpoints under test here decide who gets a role (and therefore
// permissions) and which stations someone can see. Unlike
// station-scoping.e2e-spec.ts (which builds its fixtures with direct
// Prisma writes), everything that changes access in THIS file goes
// through the real HTTP endpoints in users.controller.ts, so a bug in
// the controller's permission wiring or the service's cache-invalidation
// calls would actually be caught here.
let umMunicipalityId: string;

describe('User management endpoints (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authService: AuthService;

  const runId = Date.now().toString(36);
  const password = 'BoundaryTest123!';

  const usernameManager = `e2e_um_manager_${runId}`;
  const usernameNoPerm = `e2e_um_noperm_${runId}`;
  const usernameRoleAssignTarget = `e2e_um_role_assign_${runId}`;
  const usernameRoleRemoveTarget = `e2e_um_role_remove_${runId}`;
  const usernameScopeAddTarget = `e2e_um_scope_add_${runId}`;
  const usernameScopeRemoveTarget = `e2e_um_scope_remove_${runId}`;

  let companyA: { id: string };
  let companyB: { id: string };
  let stationA: { id: string };
  let stationB: { id: string };
  let scopedRoleId: string;
  let managerRoleId: string;

  let managerUserId: string;
  let noPermUserId: string;
  let roleAssignTargetId: string;
  let roleRemoveTargetId: string;
  let scopeAddTargetId: string;
  let scopeRemoveTargetId: string;
  // Populated by the "create a user" test itself, cleaned up in afterAll.
  let createdViaEndpointUserId: string | undefined;

  // Explicit timeout, well over Jest's 5000ms default: a cold NestJS+Prisma
  // bootstrap plus this fixture setup measured 320-916ms across several
  // cold runs (fresh caches, restarted DB) in station-scoping.e2e-spec.ts,
  // but a prior run of that same suite genuinely blew past 5000ms on a
  // one-off external stall — Jest gave up mid-hook and moved on to
  // afterAll while the original beforeAll kept running unattended in the
  // background, leaving orphaned rows in the DB with no LOGIN audit trail
  // (proving no test ever ran) once it finally finished. 30s gives real
  // headroom over the ~1s typical cost without masking a genuine hang for
  // minutes. Applied here too since this suite bootstraps the same way.
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
    authService = moduleRef.get(AuthService);

    companyA = await prisma.company.create({ data: { name: `E2E UM Company A ${runId}` } });
    companyB = await prisma.company.create({ data: { name: `E2E UM Company B ${runId}` } });

    umMunicipalityId = (await createMunicipality(prisma, `E2E UM Municipality ${runId}`)).id;
    stationA = await prisma.station.create({
      data: {
        internalCode: `E2E-UM-A-${runId}`,
        stationNumber: '1',
        name: 'E2E UM Station A',
        companyId: companyA.id,
        municipalityId: umMunicipalityId,
      },
    });
    stationB = await prisma.station.create({
      data: {
        internalCode: `E2E-UM-B-${runId}`,
        stationNumber: '1',
        name: 'E2E UM Station B',
        companyId: companyB.id,
        municipalityId: umMunicipalityId,
      },
    });

    const usersManagePermission = await prisma.permission.upsert({
      where: { key: 'users:manage' },
      create: { key: 'users:manage' },
      update: {},
    });
    const rolesManagePermission = await prisma.permission.upsert({
      where: { key: 'roles:manage' },
      create: { key: 'roles:manage' },
      update: {},
    });
    const stationsReadPermission = await prisma.permission.upsert({
      where: { key: 'stations:read' },
      create: { key: 'stations:read' },
      update: {},
    });

    // Dedicated test-only roles — never the real seeded roles.
    const managerRole = await prisma.role.create({ data: { name: `e2e_um_manager_role_${runId}` } });
    managerRoleId = managerRole.id;
    await prisma.rolePermission.createMany({
      data: [
        { roleId: managerRole.id, permissionId: usersManagePermission.id },
        { roleId: managerRole.id, permissionId: rolesManagePermission.id },
      ],
    });

    // The role being granted/revoked in the tests below. Deliberately just
    // stations:read, not unrestrictedStationAccess, so station-scope
    // changes are observable through it.
    const scopedRole = await prisma.role.create({ data: { name: `e2e_um_scoped_role_${runId}` } });
    scopedRoleId = scopedRole.id;
    await prisma.rolePermission.create({
      data: { roleId: scopedRole.id, permissionId: stationsReadPermission.id },
    });

    async function createUser(username: string) {
      return prisma.user.create({
        data: { username, passwordHash: await argon2.hash(password), fullName: `E2E UM ${username}` },
      });
    }

    const managerUser = await createUser(usernameManager);
    managerUserId = managerUser.id;
    await prisma.userRole.create({ data: { userId: managerUser.id, roleId: managerRole.id } });

    // No role at all — zero permissions, used for every 403 case.
    const noPermUser = await createUser(usernameNoPerm);
    noPermUserId = noPermUser.id;

    // Starts with NO role — the "assign role" test proves both the grant
    // and that it takes effect on the very next request.
    const roleAssignTarget = await createUser(usernameRoleAssignTarget);
    roleAssignTargetId = roleAssignTarget.id;

    // Starts already holding scopedRole — the "remove role" test proves
    // the revoke takes effect immediately too.
    const roleRemoveTarget = await createUser(usernameRoleRemoveTarget);
    roleRemoveTargetId = roleRemoveTarget.id;
    await prisma.userRole.create({ data: { userId: roleRemoveTarget.id, roleId: scopedRole.id } });

    // Holds scopedRole but ZERO UserStationScope rows — the "add scope"
    // test proves the grant, through the real endpoint, actually opens
    // access to stationA (and only stationA).
    const scopeAddTarget = await createUser(usernameScopeAddTarget);
    scopeAddTargetId = scopeAddTarget.id;
    await prisma.userRole.create({ data: { userId: scopeAddTarget.id, roleId: scopedRole.id } });

    // Holds scopedRole AND is already scoped to stationA — the "remove
    // scope" test proves the revoke, through the real endpoint, actually
    // closes access again.
    const scopeRemoveTarget = await createUser(usernameScopeRemoveTarget);
    scopeRemoveTargetId = scopeRemoveTarget.id;
    await prisma.userRole.create({ data: { userId: scopeRemoveTarget.id, roleId: scopedRole.id } });
    await prisma.userStationScope.create({
      data: { userId: scopeRemoveTarget.id, stationId: stationA.id },
    });
  });

  afterAll(async () => {
    const allUserIds = [
      managerUserId,
      noPermUserId,
      roleAssignTargetId,
      roleRemoveTargetId,
      scopeAddTargetId,
      scopeRemoveTargetId,
      ...(createdViaEndpointUserId ? [createdViaEndpointUserId] : []),
    ];
    await deleteAuditRows(prisma, { where: { userId: { in: allUserIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.userStationScope.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: allUserIds } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: { in: [managerRoleId, scopedRoleId] } } });
    await prisma.role.deleteMany({ where: { id: { in: [managerRoleId, scopedRoleId] } } });
    await prisma.station.delete({ where: { id: stationA.id } });
    await prisma.station.delete({ where: { id: stationB.id } });
    await prisma.company.delete({ where: { id: companyA.id } });
    await prisma.company.delete({ where: { id: companyB.id } });
    await deleteMunicipalities(prisma, [umMunicipalityId]);
    await app.close();
  });

  // Memoized per user — the login endpoint is throttled (5/min) and this
  // suite logs in as more than 5 distinct users.
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

  // The four "target" users below don't need to exercise the throttled
  // /auth/login endpoint themselves — that path already has its own
  // coverage (here, via manager/noPerm, and in station-scoping.e2e-spec.ts).
  // Minting their access tokens directly through the real AuthService
  // keeps this suite well under the 5/min login throttle while still
  // going through the actual token-issuing code, not a hand-rolled JWT.
  const mintedTokenCache = new Map<string, string>();
  async function mintAccessToken(userId: string, username: string): Promise<string> {
    const cached = mintedTokenCache.get(userId);
    if (cached) {
      return cached;
    }
    const pair = await authService.issueTokenPair(userId, username);
    mintedTokenCache.set(userId, pair.accessToken);
    return pair.accessToken;
  }

  // ── 401: unauthenticated ─────────────────────────────────────────────

  it('rejects unauthenticated requests to every user-management endpoint', async () => {
    const server = app.getHttpServer();
    await request(server).post('/api/v1/users').send({}).expect(401);
    await request(server).get('/api/v1/users').expect(401);
    await request(server).get(`/api/v1/users/${managerUserId}`).expect(401);
    await request(server).post(`/api/v1/users/${managerUserId}/roles`).send({}).expect(401);
    await request(server).delete(`/api/v1/users/${managerUserId}/roles/${scopedRoleId}`).expect(401);
    await request(server)
      .post(`/api/v1/users/${managerUserId}/station-scope`)
      .send({})
      .expect(401);
    await request(server)
      .delete(`/api/v1/users/${managerUserId}/station-scope/${stationA.id}`)
      .expect(401);
  });

  // ── 403: authenticated but lacking the required permission ─────────────

  it('blocks an actor without users:manage/roles:manage from every user-management endpoint', async () => {
    const accessToken = await loginAsNoPerm();
    const server = app.getHttpServer();
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${accessToken}`);

    await auth(request(server).post('/api/v1/users')).send({
      username: `should_not_be_created_${runId}`,
      password: 'Whatever123!',
      fullName: 'Should Not Exist',
    }).expect(403);
    await auth(request(server).get('/api/v1/users')).expect(403);
    await auth(request(server).get(`/api/v1/users/${managerUserId}`)).expect(403);
    await auth(request(server).post(`/api/v1/users/${roleAssignTargetId}/roles`))
      .send({ roleId: scopedRoleId })
      .expect(403);
    await auth(
      request(server).delete(`/api/v1/users/${roleRemoveTargetId}/roles/${scopedRoleId}`),
    ).expect(403);
    await auth(request(server).post(`/api/v1/users/${scopeAddTargetId}/station-scope`))
      .send({ stationId: stationA.id })
      .expect(403);
    await auth(
      request(server).delete(
        `/api/v1/users/${scopeRemoveTargetId}/station-scope/${stationA.id}`,
      ),
    ).expect(403);
  });

  // ── Success cases ────────────────────────────────────────────────────

  it('lets a properly-permissioned actor create a user', async () => {
    const accessToken = await loginAsManager();

    const res = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        username: `e2e_um_created_${runId}`,
        password: 'BrandNewUser123!',
        fullName: 'E2E UM Created User',
      })
      .expect(201);

    expect(res.body.username).toBe(`e2e_um_created_${runId}`);
    expect(res.body.mustChangePassword).toBe(true);
    expect(res.body.passwordHash).toBeUndefined();
    createdViaEndpointUserId = res.body.id;
  });

  it('lets a properly-permissioned actor list and fetch users', async () => {
    const accessToken = await loginAsManager();
    const server = app.getHttpServer();

    // Phase 4b: the list is searchable and paged ({ items, total }), so look
    // the manager up by username rather than assuming they are on page one.
    const listRes = await request(server)
      .get('/api/v1/users')
      .query({ q: usernameManager })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(listRes.body.items.map((u: { id: string }) => u.id)).toContain(managerUserId);

    const oneRes = await request(server)
      .get(`/api/v1/users/${managerUserId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(oneRes.body.username).toBe(usernameManager);
    expect(oneRes.body.passwordHash).toBeUndefined();
  });

  // ── Role assignment: grant takes effect on the very next request ───────

  it('assigning a role through the endpoint grants the new permission on the very next request, without waiting out the cache TTL', async () => {
    const targetToken = await mintAccessToken(roleAssignTargetId, usernameRoleAssignTarget);

    // Before: no role at all, so a permission-gated route 403s.
    await request(app.getHttpServer())
      .get('/api/v1/stations')
      .set('Authorization', `Bearer ${targetToken}`)
      .expect(403);

    const managerToken = await loginAsManager();
    await request(app.getHttpServer())
      .post(`/api/v1/users/${roleAssignTargetId}/roles`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ roleId: scopedRoleId })
      .expect(201);

    // After: SAME already-issued token, no new login — proves the guard
    // re-checks permissions server-side rather than trusting anything
    // baked into the JWT, and that RbacService.invalidate() actually ran.
    await request(app.getHttpServer())
      .get('/api/v1/stations')
      .set('Authorization', `Bearer ${targetToken}`)
      .expect(200);
  });

  // ── Role removal: revoke takes effect on the very next request ─────────

  it('removing a role through the endpoint revokes the permission on the very next request, without waiting out the cache TTL', async () => {
    const targetToken = await mintAccessToken(roleRemoveTargetId, usernameRoleRemoveTarget);

    // Before: already holds scopedRole, so the route succeeds.
    await request(app.getHttpServer())
      .get('/api/v1/stations')
      .set('Authorization', `Bearer ${targetToken}`)
      .expect(200);

    const managerToken = await loginAsManager();
    await request(app.getHttpServer())
      .delete(`/api/v1/users/${roleRemoveTargetId}/roles/${scopedRoleId}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);

    // After: SAME token, immediately 403.
    await request(app.getHttpServer())
      .get('/api/v1/stations')
      .set('Authorization', `Bearer ${targetToken}`)
      .expect(403);
  });

  // ── Station-scope add: through the real endpoint, not direct Prisma ────

  it('adding a station scope through the endpoint actually opens access to that station, and only that station', async () => {
    const targetToken = await mintAccessToken(scopeAddTargetId, usernameScopeAddTarget);

    // Before: has stations:read but zero UserStationScope rows — sees
    // nothing (the exact bug fixed in 2bbae64/93eecfe, now proven through
    // the management endpoint rather than a direct Prisma write).
    await request(app.getHttpServer())
      .get(`/api/v1/stations/${stationA.id}`)
      .set('Authorization', `Bearer ${targetToken}`)
      .expect(403);

    const managerToken = await loginAsManager();
    await request(app.getHttpServer())
      .post(`/api/v1/users/${scopeAddTargetId}/station-scope`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ stationId: stationA.id })
      .expect(201);

    // After: stationA now reachable, stationB still isn't.
    await request(app.getHttpServer())
      .get(`/api/v1/stations/${stationA.id}`)
      .set('Authorization', `Bearer ${targetToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/stations/${stationB.id}`)
      .set('Authorization', `Bearer ${targetToken}`)
      .expect(403);
  });

  // ── Station-scope removal: through the real endpoint ────────────────────

  it('removing a station scope through the endpoint actually closes access to that station again', async () => {
    const targetToken = await mintAccessToken(scopeRemoveTargetId, usernameScopeRemoveTarget);

    // Before: already scoped to stationA — reachable.
    await request(app.getHttpServer())
      .get(`/api/v1/stations/${stationA.id}`)
      .set('Authorization', `Bearer ${targetToken}`)
      .expect(200);

    const managerToken = await loginAsManager();
    await request(app.getHttpServer())
      .delete(`/api/v1/users/${scopeRemoveTargetId}/station-scope/${stationA.id}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);

    // After: same station, same (unchanged) role — now unreachable.
    await request(app.getHttpServer())
      .get(`/api/v1/stations/${stationA.id}`)
      .set('Authorization', `Bearer ${targetToken}`)
      .expect(403);
  });
});
