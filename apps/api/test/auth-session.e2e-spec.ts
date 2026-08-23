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
describe('Auth session lifecycle (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authService: AuthService;

  const runId = Date.now().toString(36);
  const password = 'BoundaryTest123!';

  const usernameRefresh = `e2e_auth_refresh_${runId}`;
  const usernameLogout = `e2e_auth_logout_${runId}`;
  const usernameLockout = `e2e_auth_lockout_${runId}`;

  let refreshUserId: string;
  let logoutUserId: string;
  let lockoutUserId: string;

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
  }, 30_000);

  afterAll(async () => {
    const allUserIds = [refreshUserId, logoutUserId, lockoutUserId];
    await prisma.auditLog.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: allUserIds } } });
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
});
