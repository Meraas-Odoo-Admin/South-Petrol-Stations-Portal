import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface CacheEntry {
  permissions: Set<string>;
  unrestrictedStationAccess: boolean;
  // Phase 5A: at least one of the user's roles is confined to the
  // municipalities in UserMunicipalityScope.
  municipalityScoped: boolean;
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
        // Round 12: a permission can also be granted directly to this
        // specific user, independent of their roles (see UserPermission's
        // schema comment) — "given to certain users they pick, not per
        // role". Always ADDITIVE on top of role-derived permissions below,
        // never a narrower override.
        directPermissions: { include: { permission: true } },
      },
    });

    const permissions = new Set<string>();
    let unrestrictedStationAccess = false;
    let municipalityScoped = false;
    if (user) {
      for (const userRole of user.roles) {
        if (userRole.role.unrestrictedStationAccess) {
          unrestrictedStationAccess = true;
        }
        if (userRole.role.municipalityScoped) {
          municipalityScoped = true;
        }
        for (const rolePermission of userRole.role.permissions) {
          permissions.add(rolePermission.permission.key);
        }
      }
      for (const userPermission of user.directPermissions) {
        permissions.add(userPermission.permission.key);
      }
    }

    // A user that no longer exists is treated as inactive with no grants —
    // same effect as UnauthorizedException, just via an empty permission set.
    const entry: CacheEntry = {
      permissions,
      unrestrictedStationAccess,
      municipalityScoped,
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

  // The municipalities this user is confined to (UserMunicipalityScope), for
  // a role marked municipalityScoped. null = unrestricted (the super admin);
  // [] = none, never "all" - a municipality manager with no municipality
  // assigned sees and changes nothing.
  async getMunicipalityScope(userId: string): Promise<string[] | null> {
    const info = await this.loadUserRbacInfo(userId);
    if (info.unrestrictedStationAccess) {
      return null;
    }
    if (!info.municipalityScoped) {
      return [];
    }
    const rows = await this.prisma.userMunicipalityScope.findMany({
      where: { userId },
      select: { municipalityId: true },
    });
    return rows.map((r) => r.municipalityId);
  }

  // "Sees every station" is an explicit, admin-managed flag on Role
  // (unrestrictedStationAccess) - NEVER inferred from an empty
  // UserStationScope list. A scoped role with zero assigned stations must
  // see NOTHING, not everything: returns [] (not null) in that case.
  // Returns null only when the user holds a role with
  // unrestrictedStationAccess: true.
  //
  // Phase 5A: a municipality manager's scope is every station in their
  // municipality (plus any explicit rows), expanded here - so every service
  // that already intersects its queries with this list is municipality-bound
  // without knowing municipalities exist. Archived stations stay in the list
  // (a manager restores them); recording at one is refused elsewhere.
  async getStationScope(userId: string): Promise<string[] | null> {
    const info = await this.loadUserRbacInfo(userId);
    if (info.unrestrictedStationAccess) {
      return null;
    }

    const scopes = await this.prisma.userStationScope.findMany({
      where: { userId },
      select: { stationId: true },
    });
    const ids = new Set(scopes.map((s) => s.stationId));
    if (info.municipalityScoped) {
      const inMunicipalities = await this.prisma.station.findMany({
        where: { municipality: { userScopes: { some: { userId } } } },
        select: { id: true },
      });
      for (const station of inMunicipalities) ids.add(station.id);
    }
    return [...ids];
  }

  // Registration pivot, phase 2: the same contract as getStationScope, for
  // registration stations (UserRegistrationStationScope). Phase 5A: expanded
  // by the municipality scope the same way. [] means none, never all.
  async getRegistrationStationScope(userId: string): Promise<string[] | null> {
    const info = await this.loadUserRbacInfo(userId);
    if (info.unrestrictedStationAccess) {
      return null;
    }

    const scopes = await this.prisma.userRegistrationStationScope.findMany({
      where: { userId },
      select: { registrationStationId: true },
    });
    const ids = new Set(scopes.map((s) => s.registrationStationId));
    if (info.municipalityScoped) {
      const inMunicipalities = await this.prisma.registrationStation.findMany({
        where: { municipality: { userScopes: { some: { userId } } } },
        select: { id: true },
      });
      for (const station of inMunicipalities) ids.add(station.id);
    }
    return [...ids];
  }

  // The municipalities this user may READ: their municipality scope plus the
  // municipalities of the stations and offices they work at. null = all.
  async getVisibleMunicipalityIds(userId: string): Promise<string[] | null> {
    const info = await this.loadUserRbacInfo(userId);
    if (info.unrestrictedStationAccess) {
      return null;
    }
    const [own, stations, offices] = await Promise.all([
      this.prisma.userMunicipalityScope.findMany({ where: { userId }, select: { municipalityId: true } }),
      this.prisma.station.findMany({
        where: { userScopes: { some: { userId } }, municipalityId: { not: null } },
        select: { municipalityId: true },
      }),
      this.prisma.registrationStation.findMany({
        where: { userScopes: { some: { userId } } },
        select: { municipalityId: true },
      }),
    ]);
    const ids = new Set<string>();
    if (info.municipalityScoped) for (const row of own) ids.add(row.municipalityId);
    for (const row of stations) if (row.municipalityId) ids.add(row.municipalityId);
    for (const row of offices) ids.add(row.municipalityId);
    return [...ids];
  }
}
