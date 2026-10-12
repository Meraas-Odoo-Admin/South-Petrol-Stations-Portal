import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { RequireAnyPermission } from '../common/decorators/require-any-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { RbacService } from '../rbac/rbac.service';
import { isSupervisorJob, PERM_MANAGE_PRIVILEGED } from '../users/user-access';

// Read-only — Role rows are seeded/fixed, not created through the UI (same
// as Permission). Exists so the admin panel's user-role-assignment picker
// has something to populate itself from; no GET /roles endpoint existed
// anywhere before this.
@ApiTags('roles')
@Controller('roles')
export class RolesController {
  constructor(private readonly prisma: PrismaService) {}

  @RequirePermission('roles:manage')
  @Get()
  findAll() {
    return this.prisma.role.findMany({
      select: { id: true, name: true, description: true, unrestrictedStationAccess: true, kind: true },
      orderBy: { name: 'asc' },
    });
  }
}

// Round 12: read-only, same reasoning as RolesController above — Permission
// rows are seeded, not created through the UI. Exists so the new per-user
// direct-permission picker (UsersAdminPage) has something to populate
// itself from; no GET /permissions endpoint existed anywhere before this.
@ApiTags('permissions')
@Controller('permissions')
export class PermissionsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  // Phase 5A: a municipality manager adjusting a supervisor's permissions is
  // offered only the set supervisor-level jobs may hold (never a lever that
  // manages people or the system). The super admin sees them all.
  @RequireAnyPermission('roles:manage', 'users:manage_municipality_staff')
  @Get()
  async findAll(@CurrentUser() actor: AuthenticatedUser) {
    const all = await this.prisma.permission.findMany({
      select: { id: true, key: true, description: true },
      orderBy: { key: 'asc' },
    });
    const held = await this.rbac.getPermissionsForUser(actor.id);
    if (held.has('roles:manage')) return all;

    const roles = await this.prisma.role.findMany({ include: { permissions: { include: { permission: true } } } });
    const delegable = new Set<string>();
    for (const role of roles) {
      const facts = {
        id: role.id,
        name: role.name,
        kind: role.kind,
        municipalityScoped: role.municipalityScoped,
        permissionKeys: role.permissions.map((p) => p.permission.key),
      };
      if (!isSupervisorJob(facts)) continue;
      for (const key of facts.permissionKeys) delegable.add(key);
    }
    return all.filter(
      (p) =>
        delegable.has(p.key) &&
        !p.key.startsWith('users:') &&
        !p.key.startsWith('roles:') &&
        p.key !== PERM_MANAGE_PRIVILEGED,
    );
  }
}
