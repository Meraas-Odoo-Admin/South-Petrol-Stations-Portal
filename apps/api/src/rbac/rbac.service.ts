import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface CacheEntry {
  permissions: Set<string>;
  expiresAt: number;
}

const CACHE_TTL_MS = 30_000;

@Injectable()
export class RbacService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly prisma: PrismaService) {}

  async getPermissionsForUser(userId: string): Promise<Set<string>> {
    const cached = this.cache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.permissions;
    }

    const roles = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });

    const permissions = new Set<string>();
    for (const userRole of roles) {
      for (const rolePermission of userRole.role.permissions) {
        permissions.add(rolePermission.permission.key);
      }
    }

    this.cache.set(userId, { permissions, expiresAt: Date.now() + CACHE_TTL_MS });
    return permissions;
  }

  // Roles/permissions changed for this user — drop any cached grant set so
  // the next request reflects it immediately instead of waiting out the TTL.
  invalidate(userId: string): void {
    this.cache.delete(userId);
  }

  // Empty scope = directorate-wide access (per docs/IMPLEMENTATION_PLAN.md §5).
  // Returns null when unrestricted, otherwise the list of station IDs the
  // user is confined to.
  async getStationScope(userId: string): Promise<string[] | null> {
    const scopes = await this.prisma.userStationScope.findMany({
      where: { userId },
      select: { stationId: true },
    });
    if (scopes.length === 0) {
      return null;
    }
    return scopes.map((s) => s.stationId);
  }
}
