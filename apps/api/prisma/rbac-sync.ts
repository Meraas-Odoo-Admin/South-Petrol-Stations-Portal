import type { PrismaClient } from '@prisma/client';
import {
  PERMISSIONS,
  ROLE_KINDS,
  ROLE_PERMISSIONS,
  UNRESTRICTED_STATION_ACCESS_ROLES,
  type RoleKindKey,
} from './rbac-catalog';

// Shared by seed.ts and bootstrap-prod.ts. Makes the database's Permission/
// Role/RolePermission rows match rbac-catalog.ts — including REMOVING a
// role's grants that the catalog no longer lists. Upsert-only syncing (what
// both scripts did before phase 2) could only ever add: taking
// vehicles:manage off station_employee in the catalog would have left it
// granted in every database that already existed, production included.
//
// Deliberately left alone:
//  - roles that aren't in the catalog (nothing to compare them against);
//  - per-user grants (UserPermission) — an admin's individual decision,
//    not part of any role;
//  - Permission rows the catalog dropped (a UserPermission may still point
//    at one; an orphaned permission with no role grants is harmless).
export interface RbacCatalog {
  permissions: ReadonlyArray<{ key: string; description?: string }>;
  rolePermissions: Record<string, string[]>;
  roleKinds: Record<string, RoleKindKey>;
  unrestrictedRoles: ReadonlySet<string>;
}

export const DEFAULT_RBAC_CATALOG: RbacCatalog = {
  permissions: PERMISSIONS,
  rolePermissions: ROLE_PERMISSIONS,
  roleKinds: ROLE_KINDS,
  unrestrictedRoles: UNRESTRICTED_STATION_ACCESS_ROLES,
};

export interface RbacSyncResult {
  rolesByName: Map<string, { id: string }>;
  removed: Array<{ role: string; permission: string }>;
}

export async function syncRbacCatalog(
  prisma: PrismaClient,
  catalog: RbacCatalog = DEFAULT_RBAC_CATALOG,
  log: (line: string) => void = console.log,
): Promise<RbacSyncResult> {
  for (const permission of catalog.permissions) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      create: permission,
      update: { description: permission.description },
    });
  }

  const rolesByName = new Map<string, { id: string }>();
  const removed: RbacSyncResult['removed'] = [];

  for (const [roleName, permissionKeys] of Object.entries(catalog.rolePermissions)) {
    const unrestrictedStationAccess = catalog.unrestrictedRoles.has(roleName);
    const kind = catalog.roleKinds[roleName] ?? null;
    const role = await prisma.role.upsert({
      where: { name: roleName },
      create: { name: roleName, unrestrictedStationAccess, kind },
      update: { unrestrictedStationAccess, kind },
    });
    rolesByName.set(roleName, role);

    for (const key of permissionKeys) {
      const permission = await prisma.permission.findUniqueOrThrow({ where: { key } });
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        create: { roleId: role.id, permissionId: permission.id },
        update: {},
      });
    }

    const stale = await prisma.rolePermission.findMany({
      where: { roleId: role.id, permission: { key: { notIn: permissionKeys } } },
      include: { permission: { select: { key: true } } },
    });
    for (const grant of stale) {
      await prisma.rolePermission.delete({
        where: { roleId_permissionId: { roleId: grant.roleId, permissionId: grant.permissionId } },
      });
      removed.push({ role: roleName, permission: grant.permission.key });
      log(`[rbac-sync] removed ${grant.permission.key} from role ${roleName} (no longer in rbac-catalog.ts)`);
    }
  }

  if (removed.length === 0) {
    log('[rbac-sync] role permissions already match rbac-catalog.ts — nothing removed');
  }

  return { rolesByName, removed };
}
