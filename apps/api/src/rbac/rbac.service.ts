import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface CacheEntry {
  permissions: Set<string>;
  unrestrictedStationAccess: boolean;
  isActive: boolean;
  mustChangePassword: boolean;
  expiresAt: number;
}

// KNOWN GAP (found in review, tracked for M2): isActive is cached under
// this same TTL. There is currently no deactivate-user endpoint anywhere
// in the codebase, so this has never been exercised outside a test that
// manually calls invalidate(). When one is built, it MUST call
// invalidate(userId) immediately after flipping isActive to false —
// otherwise a deactivated user's still-valid access token keeps
// authorizing requests for up to CACHE_TTL_MS, not "the next request".
// Role/scope removal already does this correctly (see UsersService).
const CACHE_TTL_MS = 30_000;

@Injectable()
export class RbacService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly prisma: PrismaService) {}

  // Single cached lookup backing getPermissionsForUser, isUserActive, and
  // the unrestrictedStationAccess check in getStationScope — one DB round
  // trip per user per 30s window instead of one per method.
  private async loadUserRbacInfo(userId: string): Promise<CacheEntry> {
    const cached = this.cache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        isActive: true,
        mustChangePassword: true,
        roles: {
          include: { role: { include: { permissions: { include: { permission: true } } } } },
        },
      },
    });

    const permissions = new Set<string>();
    let unrestrictedStationAccess = false;
    if (user) {
      for (const userRole of user.roles) {
        if (userRole.role.unrestrictedStationAccess) {
          unrestrictedStationAccess = true;
        }
        for (const rolePermission of userRole.role.permissions) {
          permissions.add(rolePermission.permission.key);
        }
      }
    }

    // A user that no longer exists is treated as inactive with no grants —
    // same effect as UnauthorizedException, just via an empty permission set.
    const entry: CacheEntry = {
      permissions,
      unrestrictedStationAccess,
      isActive: user?.isActive ?? false,
      mustChangePassword: user?.mustChangePassword ?? true,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
    this.cache.set(userId, entry);
    return entry;
  }

  async getPermissionsForUser(userId: string): Promise<Set<string>> {
    const info = await this.loadUserRbacInfo(userId);
    return info.permissions;
  }

  async isUserActive(userId: string): Promise<boolean> {
    const info = await this.loadUserRbacInfo(userId);
    return info.isActive;
  }

  async mustChangePassword(userId: string): Promise<boolean> {
    const info = await this.loadUserRbacInfo(userId);
    return info.mustChangePassword;
  }

  // Roles/permissions/active-status changed for this user — drop the cached
  // bundle so the next request reflects it immediately instead of waiting
  // out the TTL. Any code path that revokes access (role removal, station
  // scope removal, and — when it's built — user deactivation) MUST call
  // this right after the DB write, or the change only takes effect once
  // the cache entry naturally expires (up to CACHE_TTL_MS later).
  invalidate(userId: string): void {
    this.cache.delete(userId);
  }

  // "Sees every station" is an explicit, admin-managed flag on Role
  // (unrestrictedStationAccess) — NEVER inferred from an empty
  // UserStationScope list. A scoped role with zero assigned stations must
  // see NOTHING, not everything: returns [] (not null) in that case.
  // Returns null only when the user holds a role with
  // unrestrictedStationAccess: true.
  async getStationScope(userId: string): Promise<string[] | null> {
    const info = await this.loadUserRbacInfo(userId);
    if (info.unrestrictedStationAccess) {
      return null;
    }

    const scopes = await this.prisma.userStationScope.findMany({
      where: { userId },
      select: { stationId: true },
    });
    return scopes.map((s) => s.stationId);
  }
}
