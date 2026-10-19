import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RbacService } from '../rbac/rbac.service';
import { parseDurationToMs } from '../common/utils/duration';
import { NotificationsService } from '../notifications/notifications.service';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

// Refresh tokens are high-entropy random values, not JWTs — they're opaque,
// revocable, and looked up by exact hash match, so a fast deterministic hash
// (not argon2) is the right tool: argon2's salting makes indexed lookup
// impossible, and the token's own entropy already defeats offline guessing.
function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly rbac: RbacService,
    private readonly notifications: NotificationsService,
  ) {}

  // A login that failed, in the audit log (after review, 15 Oct 2026): until
  // then only successful logins were there, so guessing showed nowhere until an
  // account locked. No actor (nobody is signed in); the account tried is the
  // entity, and the name typed is kept when no such account exists.
  private async logFailedLogin(
    reason: 'UNKNOWN_USER' | 'INACTIVE' | 'LOCKED' | 'WRONG_PASSWORD',
    username: string,
    user: { id: string } | null,
    extra: Record<string, string | number> = {},
    ipAddress?: string,
  ) {
    await this.audit
      .log({
        userId: null,
        action: 'LOGIN_FAILED',
        entityType: 'User',
        entityId: user?.id ?? '-',
        newValue: { reason, username: username.slice(0, 64), ...extra },
        ipAddress: ipAddress ?? null,
      })
      .catch(() => undefined);
  }

  async validateCredentials(username: string, password: string, ipAddress?: string) {
    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user || !user.isActive) {
      await this.logFailedLogin(user ? 'INACTIVE' : 'UNKNOWN_USER', username, user, {}, ipAddress);
      throw new UnauthorizedException('Invalid username or password.');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await this.logFailedLogin('LOCKED', username, user, {}, ipAddress);
      throw new UnauthorizedException('Account is temporarily locked. Try again later.');
    }

    const passwordValid = await argon2.verify(user.passwordHash, password);
    if (!passwordValid) {
      const failedAttempts = user.failedLoginAttempts + 1;
      const lockedUntil =
        failedAttempts >= MAX_FAILED_ATTEMPTS
          ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000)
          : null;
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: failedAttempts, lockedUntil },
      });
      await this.logFailedLogin('WRONG_PASSWORD', username, user, { failedAttempts }, ipAddress);
      if (lockedUntil) {
        await this.audit
          .log({
            userId: null,
            action: 'ACCOUNT_LOCKED',
            entityType: 'User',
            entityId: user.id,
            newValue: { lockedUntil: lockedUntil.toISOString(), minutes: LOCKOUT_MINUTES },
            ipAddress: ipAddress ?? null,
          })
          .catch(() => undefined);
        await this.notifications.lockedOut(user.id).catch(() => undefined);
      }
      throw new UnauthorizedException('Invalid username or password.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    await this.audit.log({
      userId: user.id,
      action: 'LOGIN',
      entityType: 'User',
      entityId: user.id,
      ipAddress: ipAddress ?? null,
    });

    return user;
  }

  async issueTokenPair(userId: string, username: string): Promise<TokenPair> {
    const accessToken = this.jwt.sign(
      { sub: userId, username },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN', '15m'),
      },
    );

    const rawRefreshToken = randomBytes(64).toString('hex');
    const refreshExpiresAt = new Date(
      Date.now() + parseDurationToMs(this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d')),
    );

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashRefreshToken(rawRefreshToken),
        expiresAt: refreshExpiresAt,
      },
    });

    return { accessToken, refreshToken: rawRefreshToken, refreshExpiresAt };
  }

  async rotateRefreshToken(rawRefreshToken: string): Promise<TokenPair> {
    const tokenHash = hashRefreshToken(rawRefreshToken);
    const existing = await this.prisma.refreshToken.findFirst({
      where: { tokenHash, revokedAt: null },
      include: { user: true },
    });

    if (!existing || existing.expiresAt < new Date() || !existing.user.isActive) {
      throw new UnauthorizedException('Refresh token is invalid or expired.');
    }

    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });

    // Not audited (after review, 19 Oct 2026): every signed-in session renews
    // every 15 minutes, which buried the audit log in noise. Sign-in, sign-out,
    // failed attempts and lock-outs are what oversight reads.
    return this.issueTokenPair(existing.user.id, existing.user.username);
  }

  async logout(rawRefreshToken: string, userId: string | null): Promise<void> {
    const tokenHash = hashRefreshToken(rawRefreshToken);
    const existing = await this.prisma.refreshToken.findFirst({
      where: { tokenHash, revokedAt: null },
    });
    if (!existing) {
      return;
    }
    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });
    await this.audit.log({
      userId: userId ?? existing.userId,
      action: 'LOGOUT',
      entityType: 'RefreshToken',
      entityId: existing.id,
    });
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException();
    }

    const currentPasswordValid = await argon2.verify(user.passwordHash, currentPassword);
    if (!currentPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect.');
    }

    const passwordHash = await argon2.hash(newPassword);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash, mustChangePassword: false },
      });

      // Revokes every RefreshToken row for this user, including the one
      // backing the very request that's calling this method — "forces
      // re-login on other sessions/devices" per the M4 instructions.
      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      await this.audit.log(
        { userId, action: 'CHANGE_PASSWORD', entityType: 'User', entityId: userId },
        tx,
      );
    });

    // mustChangePassword just flipped to false — without this, PermissionsGuard
    // keeps 403ing every other endpoint for up to CACHE_TTL_MS (the RBAC
    // cache doesn't know yet), even though this same request just issues a
    // fresh access token below that the frontend immediately uses to
    // navigate away from the change-password screen.
    this.rbac.invalidate(userId);

    // The instructions also require the mustChangePassword frontend flow
    // to "proceed normally" right after this call succeeds — which isn't
    // possible if THIS session's own refresh token was just revoked above
    // along with everyone else's. Issuing a fresh pair here (same as
    // login/refresh) resolves that: this session keeps working
    // immediately, while every OTHER session's now-revoked token fails on
    // its next refresh attempt.
    return this.issueTokenPair(user.id, user.username);
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: { include: { role: true } },
        stationScope: { include: { station: { include: { municipality: { include: { securityAuthority: true } } } } } },
        registrationStationScope: {
          include: { registrationStation: { include: { municipality: { include: { securityAuthority: true } } } } },
        },
        municipalityScope: { include: { municipality: { include: { securityAuthority: true } } } },
      },
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    // The user's own directorates, from their places — the name the super
    // admin gave the municipality's security authority, or the municipality's
    // name when it has none yet.
    const municipalities = [
      ...user.municipalityScope.map((s) => s.municipality),
      ...user.stationScope.map((s) => s.station.municipality),
      ...user.registrationStationScope.map((s) => s.registrationStation.municipality),
    ];
    const directorates = [...new Set(municipalities.map((m) => m.securityAuthority?.name ?? m.name))].sort((a, b) =>
      a.localeCompare(b, 'ar'),
    );

    const permissions = await this.rbac.getPermissionsForUser(userId);

    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      mustChangePassword: user.mustChangePassword,
      roles: user.roles.map((userRole) => userRole.role.name),
      permissions: [...permissions],
      stationScope: user.stationScope.map((scope) => ({
        stationId: scope.stationId,
        internalCode: scope.station.internalCode,
        name: scope.station.name,
      })),
      registrationStationScope: user.registrationStationScope.map((scope) => ({
        registrationStationId: scope.registrationStationId,
        internalCode: scope.registrationStation.internalCode,
        name: scope.registrationStation.name,
      })),
      directorates,
    };
  }
}
