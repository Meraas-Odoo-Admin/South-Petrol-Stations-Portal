import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { createHash } from 'crypto';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { REFRESH_COOKIE_NAME } from '../src/auth/auth.controller';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { createMunicipality, deleteMunicipalities } from './support/municipality-fixtures';

// login/refresh/logout are explicitly named in the M1 checklist
// (docs/IMPLEMENTATION_PLAN.md §11), but only login's happy path had any
// coverage before this file (as a means to get a token for unrelated
// tests). This covers the rest of the session lifecycle: refresh
// rotation, logout revocation, and the failed-login lockout.
//
// /auth/login is throttled to 5/min and /auth/refresh to 10/min, PER APP
// INSTANCE — shared across every test in this file, not per-test. The
// lockout scenario alone spends the entire 5-call login budget on
// purpose (that's exactly what MAX_FAILED_ATTEMPTS = 5 requires), so
// every other scenario here mints tokens directly through the real
// AuthService instead of going through POST /auth/login.
let meMunicipalityId: string;

describe('Auth session lifecycle (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authService: AuthService;

  const runId = Date.now().toString(36);
  const password = 'BoundaryTest123!';

  const usernameRefresh = `e2e_auth_refresh_${runId}`;
  const usernameLogout = `e2e_auth_logout_${runId}`;
  const usernameLockout = `e2e_auth_lockout_${runId}`;
  const usernameMe = `e2e_auth_me_${runId}`;
  const usernameChangePw = `e2e_auth_changepw_${runId}`;
  const usernamePending = `e2e_auth_pending_${runId}`;

  let refreshUserId: string;
  let logoutUserId: string;
  let lockoutUserId: string;
  let meUserId: string;
  let changePwUserId: string;
  let pendingUserId: string;
  let meRoleId: string;
  let pendingRoleId: string;
  let meStation: { id: string; internalCode: string; name: string };
  let meCompanyId: string;

  // See station-scoping.e2e-spec.ts / user-management.e2e-spec.ts for why
  // this is 30s and not Jest's 5000ms default.
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

    async function createUser(username: string) {
      return prisma.user.create({
        data: { username, passwordHash: await argon2.hash(password), fullName: `E2E Auth ${username}` },
      });
    }

    const refreshUser = await createUser(usernameRefresh);
    refreshUserId = refreshUser.id;

    const logoutUser = await createUser(usernameLogout);
    logoutUserId = logoutUser.id;

    const lockoutUser = await createUser(usernameLockout);
    lockoutUserId = lockoutUser.id;

    // ── Fixtures for GET /auth/me ────────────────────────────────────────
    const company = await prisma.company.create({ data: { name: `E2E Auth Me Company ${runId}` } });
    meCompanyId = company.id;
    meMunicipalityId = (await createMunicipality(prisma, `E2E Auth Me Municipality ${runId}`)).id;
    meStation = await prisma.station.create({
      data: {
        internalCode: `E2E-AUTH-ME-${runId}`,
        stationNumber: '1',
        name: 'E2E Auth Me Station',
        companyId: company.id,
        municipalityId: meMunicipalityId,
      },
    });
    const mePermission = await prisma.permission.upsert({
      where: { key: 'stations:read' },
      create: { key: 'stations:read' },
      update: {},
    });
    const meRole = await prisma.role.create({ data: { name: `e2e_auth_me_role_${runId}` } });
    meRoleId = meRole.id;
    await prisma.rolePermission.create({ data: { roleId: meRole.id, permissionId: mePermission.id } });

    const meUser = await createUser(usernameMe);
    meUserId = meUser.id;
    await prisma.userRole.create({ data: { userId: meUser.id, roleId: meRole.id } });
    await prisma.userStationScope.create({ data: { userId: meUser.id, stationId: meStation.id } });

    const changePwUser = await createUser(usernameChangePw);
    changePwUserId = changePwUser.id;

    // ── Fixture for the mustChangePassword server-side enforcement tests ──
    // Real vehicles:read grant so a 403 here can only be explained by the
    // password-change gate, not by the user simply lacking the permission.
    const vehiclesReadPermission = await prisma.permission.upsert({
      where: { key: 'vehicles:read' },
      create: { key: 'vehicles:read' },
      update: {},
    });
    const pendingRole = await prisma.role.create({ data: { name: `e2e_auth_pending_role_${runId}` } });
    pendingRoleId = pendingRole.id;
    await prisma.rolePermission.create({ data: { roleId: pendingRole.id, permissionId: vehiclesReadPermission.id } });

    const pendingUser = await prisma.user.create({
      data: {
        username: usernamePending,
        passwordHash: await argon2.hash(password),
        fullName: `E2E Auth ${usernamePending}`,
        mustChangePassword: true,
      },
    });
    pendingUserId = pendingUser.id;
    await prisma.userRole.create({ data: { userId: pendingUser.id, roleId: pendingRole.id } });
  });

  afterAll(async () => {
    const allUserIds = [refreshUserId, logoutUserId, lockoutUserId, meUserId, changePwUserId, pendingUserId];
    await prisma.auditLog.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.userStationScope.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: allUserIds } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: { in: [meRoleId, pendingRoleId] } } });
    await prisma.role.deleteMany({ where: { id: { in: [meRoleId, pendingRoleId] } } });
    await prisma.station.delete({ where: { id: meStation.id } });
    await prisma.company.delete({ where: { id: meCompanyId } });
    await deleteMunicipalities(prisma, [meMunicipalityId]);
    await app.close();
  });

  function extractCookieValue(setCookieHeader: string[] | undefined, name: string): string | undefined {
    const raw = setCookieHeader?.find((c) => c.startsWith(`${name}=`));
    if (!raw) {
      return undefined;
    }
    const value = raw.split(';')[0]?.slice(name.length + 1);
    return value;
  }

  // ── /auth/refresh: rotation invalidates the predecessor ─────────────────
  // Real HTTP /auth/refresh calls used here: 2 (well under the 10/min limit).

  it('rotates the refresh token on a valid /auth/refresh call, and the old cookie is rejected once rotated', async () => {
    const originalPair = await authService.issueTokenPair(refreshUserId, usernameRefresh);
    const originalTokenHash = createHash('sha256').update(originalPair.refreshToken).digest('hex');

    const rotateRes = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE_NAME}=${originalPair.refreshToken}`)
      .expect(200);

    expect(typeof rotateRes.body.accessToken).toBe('string');
    expect(rotateRes.body.accessToken.length).toBeGreaterThan(0);

    const newRefreshCookie = extractCookieValue(
      rotateRes.headers['set-cookie'] as unknown as string[] | undefined,
      REFRESH_COOKIE_NAME,
    );
    expect(newRefreshCookie).toBeDefined();
    expect(newRefreshCookie).not.toBe(originalPair.refreshToken);

    // The OLD refresh token is now revoked in the DB, not just superseded.
    const oldTokenRow = await prisma.refreshToken.findFirst({
      where: { tokenHash: originalTokenHash },
    });
    expect(oldTokenRow?.revokedAt).not.toBeNull();

    // Reusing the old (now-revoked) cookie must be rejected — rotation
    // actually invalidates the predecessor, not just issues a new one
    // alongside it.
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE_NAME}=${originalPair.refreshToken}`)
      .expect(401);
  });

  // ── /auth/refresh: no cookie at all ──────────────────────────────────────
  // Real HTTP /auth/refresh calls used here: 1.

  it('rejects /auth/refresh with no refresh cookie at all', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/auth/refresh').expect(401);
    expect(res.body.message).toBe('Missing refresh token.');
  });

  // ── /auth/logout: valid access token + valid refresh cookie ─────────────
  // Not specially throttled (no @Throttle on the route — inherits the
  // generous global default), so call count isn't a constraint here.

  it('logs out with a valid access token and refresh cookie, revoking the refresh token', async () => {
    const pair = await authService.issueTokenPair(logoutUserId, usernameLogout);
    const tokenHash = createHash('sha256').update(pair.refreshToken).digest('hex');

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${pair.accessToken}`)
      .set('Cookie', `${REFRESH_COOKIE_NAME}=${pair.refreshToken}`)
      .expect(204);

    const tokenRow = await prisma.refreshToken.findFirst({ where: { tokenHash } });
    expect(tokenRow?.revokedAt).not.toBeNull();
  });

  it('rejects /auth/logout with no access token', async () => {
    await request(app.getHttpServer()).post('/api/v1/auth/logout').expect(401);
  });

  it('still returns 204 for /auth/logout when there is a valid access token but no refresh cookie', async () => {
    const pair = await authService.issueTokenPair(logoutUserId, usernameLogout);

    // Deliberately no .set('Cookie', ...) — matches the real branch in
    // AuthController.logout: `if (raw) { revoke }`, then it always clears
    // the cookie and returns 204 regardless of whether one was present.
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${pair.accessToken}`)
      .expect(204);
  });

  // ── Failed-login lockout ─────────────────────────────────────────────────
  // Real HTTP /auth/login calls used here: exactly 5 — the ENTIRE login
  // budget for this file. MAX_FAILED_ATTEMPTS = 5 in auth.service.ts, so
  // this is spent proving the real increment-and-lock path over HTTP.
  // Nothing else in this file calls POST /auth/login.

  it('locks the account after 5 failed attempts, and rejects even the correct password while locked', async () => {
    for (let attempt = 1; attempt <= 5; attempt++) {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ username: usernameLockout, password: 'WrongPassword123!' })
        .expect(401);
      expect(res.body.message).toBe('Invalid username or password.');

      const user = await prisma.user.findUniqueOrThrow({ where: { id: lockoutUserId } });
      expect(user.failedLoginAttempts).toBe(attempt);
      if (attempt < 5) {
        expect(user.lockedUntil).toBeNull();
      } else {
        expect(user.lockedUntil).not.toBeNull();
        expect(user.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
      }
    }

    // Proving "still rejected with the CORRECT password while locked"
    // without a 6th HTTP call: the lockout gate lives in
    // AuthService.validateCredentials, so call it directly — this is the
    // real production method, just below the HTTP/throttle layer.
    await expect(authService.validateCredentials(usernameLockout, password)).rejects.toThrow(
      'Account is temporarily locked. Try again later.',
    );

    // And confirm a successful login resets the counters — again via a
    // direct service call rather than burning more of the throttle
    // budget. Clear the lock first (can't wait out 15 real minutes).
    await prisma.user.update({ where: { id: lockoutUserId }, data: { lockedUntil: null } });
    await authService.validateCredentials(usernameLockout, password);

    const unlockedUser = await prisma.user.findUniqueOrThrow({ where: { id: lockoutUserId } });
    expect(unlockedUser.failedLoginAttempts).toBe(0);
    expect(unlockedUser.lockedUntil).toBeNull();
  });

  // ── GET /auth/me ─────────────────────────────────────────────────────
  // The frontend's one source of truth for "who am I / what can I do" —
  // permissions otherwise only ever exist server-side, checked per-request.

  it('rejects GET /auth/me with no access token', async () => {
    await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
  });

  it('returns the caller\'s own identity, roles, permissions, and station scope', async () => {
    const pair = await authService.issueTokenPair(meUserId, usernameMe);

    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${pair.accessToken}`)
      .expect(200);

    expect(res.body.id).toBe(meUserId);
    expect(res.body.username).toBe(usernameMe);
    expect(res.body.mustChangePassword).toBe(false);
    expect(res.body.roles).toEqual([`e2e_auth_me_role_${runId}`]);
    expect(res.body.permissions).toEqual(['stations:read']);
    expect(res.body.stationScope).toEqual([
      { stationId: meStation.id, internalCode: meStation.internalCode, name: meStation.name },
    ]);
    // Their directorate comes from their station's municipality — never a
    // municipality named in code (after review, 15 Oct 2026).
    const municipality = await prisma.municipality.findUniqueOrThrow({
      where: { id: meMunicipalityId },
      include: { securityAuthority: true },
    });
    expect(res.body.directorates).toEqual([municipality.securityAuthority?.name ?? municipality.name]);
    // Never leaked, same precedent as every other user-facing endpoint.
    expect(res.body.passwordHash).toBeUndefined();
  });

  // ── POST /auth/change-password ───────────────────────────────────────

  it('rejects /auth/change-password with no access token', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/change-password')
      .send({ currentPassword: password, newPassword: 'NewPassword123!' })
      .expect(401);
  });

  it('rejects the wrong currentPassword, and rejects a newPassword shorter than 8 characters', async () => {
    const pair = await authService.issueTokenPair(changePwUserId, usernameChangePw);
    const server = app.getHttpServer();

    await request(server)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${pair.accessToken}`)
      .send({ currentPassword: 'WrongCurrentPassword!', newPassword: 'NewPassword123!' })
      .expect(401);

    await request(server)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${pair.accessToken}`)
      .send({ currentPassword: password, newPassword: 'short' })
      .expect(400);

    const unchangedUser = await prisma.user.findUniqueOrThrow({ where: { id: changePwUserId } });
    expect(await argon2.verify(unchangedUser.passwordHash, password)).toBe(true);
  });

  it('changes the password, clears mustChangePassword, revokes every existing refresh token, and lets the SAME session continue via a freshly issued pair', async () => {
    const server = app.getHttpServer();
    const newPassword = 'BrandNewPassword456!';

    // A second, independent session for this user — proves "revoke every
    // refresh token" is not scoped to only the one making this request.
    const otherSessionPair = await authService.issueTokenPair(changePwUserId, usernameChangePw);
    const otherSessionTokenHash = createHash('sha256').update(otherSessionPair.refreshToken).digest('hex');

    const pair = await authService.issueTokenPair(changePwUserId, usernameChangePw);

    const res = await request(server)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${pair.accessToken}`)
      .send({ currentPassword: password, newPassword })
      .expect(200);
    expect(typeof res.body.accessToken).toBe('string');

    const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: changePwUserId } });
    expect(updatedUser.mustChangePassword).toBe(false);
    expect(await argon2.verify(updatedUser.passwordHash, newPassword)).toBe(true);
    expect(await argon2.verify(updatedUser.passwordHash, password)).toBe(false);

    // The OTHER session's refresh token is now revoked — "forces re-login
    // on other sessions/devices".
    const otherSessionRow = await prisma.refreshToken.findFirst({
      where: { tokenHash: otherSessionTokenHash },
    });
    expect(otherSessionRow?.revokedAt).not.toBeNull();

    // But THIS request's own session can "proceed normally": the new
    // accessToken from the response works immediately, without a fresh
    // login.
    await request(server)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${res.body.accessToken}`)
      .expect(200);

    const auditRow = await prisma.auditLog.findFirst({
      where: { userId: changePwUserId, action: 'CHANGE_PASSWORD' },
    });
    expect(auditRow).toBeDefined();
  });

  // ── mustChangePassword server-side enforcement ───────────────────────
  // Previously only enforced client-side (RequireAuth.tsx redirecting to
  // /change-password) — a still-valid access token for a
  // mustChangePassword: true user could call any other authenticated
  // endpoint directly. PermissionsGuard now fails closed on every route
  // except the ones carrying @AllowPendingPasswordChange().

  it('rejects an unrelated authenticated call from a mustChangePassword:true user even though they hold the permission it needs', async () => {
    const pair = await authService.issueTokenPair(pendingUserId, usernamePending);

    // Sanity check: this user genuinely holds vehicles:read, so a 403 here
    // can only be explained by the pending-password-change gate.
    const res = await request(app.getHttpServer())
      .get('/api/v1/vehicles')
      .set('Authorization', `Bearer ${pair.accessToken}`)
      .expect(403);
    expect(res.body.message).toBe('Password change is required before this action.');
  });

  it('still allows GET /auth/me and POST /auth/logout for a mustChangePassword:true user', async () => {
    const pair = await authService.issueTokenPair(pendingUserId, usernamePending);

    const meRes = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${pair.accessToken}`)
      .expect(200);
    expect(meRes.body.mustChangePassword).toBe(true);

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${pair.accessToken}`)
      .expect(204);
  });

  it('lets the same pending user through to the previously-blocked endpoint immediately after completing the change', async () => {
    const pair = await authService.issueTokenPair(pendingUserId, usernamePending);
    const newPassword = 'PendingNoLongerPending789!';

    await request(app.getHttpServer())
      .get('/api/v1/vehicles')
      .set('Authorization', `Bearer ${pair.accessToken}`)
      .expect(403);

    const changeRes = await request(app.getHttpServer())
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${pair.accessToken}`)
      .send({ currentPassword: password, newPassword })
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/v1/vehicles')
      .set('Authorization', `Bearer ${changeRes.body.accessToken}`)
      .expect(200);
  });
});
