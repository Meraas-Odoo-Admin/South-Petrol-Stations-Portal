import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { RoleKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RbacService } from '../rbac/rbac.service';
import { PERM_MANAGE_PRIVILEGED } from './user-access';

const USER_INCLUDE = {
  roles: { include: { role: true } },
  stationScope: { include: { station: true } },
  registrationStationScope: { include: { registrationStation: true } },
  directPermissions: { include: { permission: true } },
} as const;

function toSafeUser<T extends { passwordHash: string }>(user: T) {
  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rbac: RbacService,
  ) {}

  async findAll() {
    const users = await this.prisma.user.findMany({
      include: USER_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    return users.map(toSafeUser);
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: USER_INCLUDE,
    });
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    return toSafeUser(user);
  }

  async assignRole(userId: string, roleId: string, actorId: string) {
    await this.ensureUserExists(userId);
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      include: { permissions: { include: { permission: true } } },
    });
    if (!role) {
      throw new NotFoundException('Role not found.');
    }
    await this.assertMayEdit(actorId, userId, {
      raising: true,
      grants: role.permissions.map((p) => p.permission.key),
    });
    if (role.kind) {
      await this.assertSeparation(userId, role.kind);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.upsert({
        where: { userId_roleId: { userId, roleId } },
        create: { userId, roleId },
        update: {},
      });

      await this.audit.log(
        {
          userId: actorId,
          action: 'ASSIGN_ROLE',
          entityType: 'User',
          entityId: userId,
          newValue: { roleId, roleName: role.name },
        },
        tx,
      );
    });

    this.rbac.invalidate(userId);
    return this.findOne(userId);
  }

  async removeRole(userId: string, roleId: string, actorId: string) {
    await this.ensureUserExists(userId);
    await this.assertMayEdit(actorId, userId);

    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId, roleId } });

      await this.audit.log(
        {
          userId: actorId,
          action: 'REMOVE_ROLE',
          entityType: 'User',
          entityId: userId,
          oldValue: { roleId },
        },
        tx,
      );
    });

    this.rbac.invalidate(userId);
    return this.findOne(userId);
  }

  async addStationScope(userId: string, stationId: string, actorId: string) {
    await this.ensureUserExists(userId);
    await this.assertMayEdit(actorId, userId);
    const station = await this.prisma.station.findUnique({ where: { id: stationId } });
    if (!station) {
      throw new NotFoundException('Station not found.');
    }
    await this.assertSeparation(userId, 'PETROL_STATION');

    await this.prisma.$transaction(async (tx) => {
      await tx.userStationScope.upsert({
        where: { userId_stationId: { userId, stationId } },
        create: { userId, stationId },
        update: {},
      });

      await this.audit.log(
        {
          userId: actorId,
          action: 'ADD_STATION_SCOPE',
          entityType: 'User',
          entityId: userId,
          newValue: { stationId, internalCode: station.internalCode },
        },
        tx,
      );
    });

    return this.findOne(userId);
  }

  // Round 12: grant/revoke a Permission directly to this ONE user,
  // independent of their roles — see UserPermission's schema comment. Same
  // upsert/deleteMany + audit + invalidate shape as assignRole/removeRole
  // above, since it's the same kind of "add/remove one join row" operation.
  async grantPermission(userId: string, permissionId: string, actorId: string) {
    await this.ensureUserExists(userId);
    const permission = await this.prisma.permission.findUnique({ where: { id: permissionId } });
    if (!permission) {
      throw new NotFoundException('Permission not found.');
    }
    await this.assertMayEdit(actorId, userId, { raising: true, grants: [permission.key] });

    await this.prisma.$transaction(async (tx) => {
      await tx.userPermission.upsert({
        where: { userId_permissionId: { userId, permissionId } },
        create: { userId, permissionId, grantedById: actorId },
        update: {},
      });

      await this.audit.log(
        {
          userId: actorId,
          action: 'GRANT_PERMISSION',
          entityType: 'User',
          entityId: userId,
          newValue: { permissionId, permissionKey: permission.key },
        },
        tx,
      );
    });

    this.rbac.invalidate(userId);
    return this.findOne(userId);
  }

  async revokePermission(userId: string, permissionId: string, actorId: string) {
    await this.ensureUserExists(userId);
    await this.assertMayEdit(actorId, userId);

    await this.prisma.$transaction(async (tx) => {
      await tx.userPermission.deleteMany({ where: { userId, permissionId } });

      await this.audit.log(
        {
          userId: actorId,
          action: 'REVOKE_PERMISSION',
          entityType: 'User',
          entityId: userId,
          oldValue: { permissionId },
        },
        tx,
      );
    });

    this.rbac.invalidate(userId);
    return this.findOne(userId);
  }

  async removeStationScope(userId: string, stationId: string, actorId: string) {
    await this.ensureUserExists(userId);
    await this.assertMayEdit(actorId, userId);

    await this.prisma.$transaction(async (tx) => {
      await tx.userStationScope.deleteMany({ where: { userId, stationId } });

      await this.audit.log(
        {
          userId: actorId,
          action: 'REMOVE_STATION_SCOPE',
          entityType: 'User',
          entityId: userId,
          oldValue: { stationId },
        },
        tx,
      );
    });

    return this.findOne(userId);
  }

  async addRegistrationStationScope(userId: string, registrationStationId: string, actorId: string) {
    await this.ensureUserExists(userId);
    await this.assertMayEdit(actorId, userId);
    const station = await this.prisma.registrationStation.findUnique({ where: { id: registrationStationId } });
    if (!station) {
      throw new NotFoundException('Registration station not found.');
    }
    await this.assertSeparation(userId, 'REGISTRATION');

    await this.prisma.$transaction(async (tx) => {
      await tx.userRegistrationStationScope.upsert({
        where: { userId_registrationStationId: { userId, registrationStationId } },
        create: { userId, registrationStationId },
        update: {},
      });
      await this.audit.log(
        {
          userId: actorId,
          action: 'ADD_REGISTRATION_STATION_SCOPE',
          entityType: 'User',
          entityId: userId,
          newValue: { registrationStationId, internalCode: station.internalCode },
        },
        tx,
      );
    });

    return this.findOne(userId);
  }

  async removeRegistrationStationScope(userId: string, registrationStationId: string, actorId: string) {
    await this.ensureUserExists(userId);
    await this.assertMayEdit(actorId, userId);

    await this.prisma.$transaction(async (tx) => {
      await tx.userRegistrationStationScope.deleteMany({ where: { userId, registrationStationId } });
      await this.audit.log(
        {
          userId: actorId,
          action: 'REMOVE_REGISTRATION_STATION_SCOPE',
          entityType: 'User',
          entityId: userId,
          oldValue: { registrationStationId },
        },
        tx,
      );
    });

    return this.findOne(userId);
  }

  // Registration pivot, phase 2 — separation of duties: the person who
  // creates a vehicle's identity must never be the one recording its fuel.
  // A user is on the PETROL_STATION side if they hold a role of that kind
  // or any petrol-station scope, and on the REGISTRATION side likewise;
  // anything that would put them on both is refused. Decided from
  // Role.kind (data), never from role names (CLAUDE.md rule 2). Admin
  // roles have no kind and sit above both sides.
  private async assertSeparation(userId: string, adding: RoleKind) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        roles: { select: { role: { select: { name: true, kind: true } } } },
        _count: { select: { stationScope: true, registrationStationScope: true } },
      },
    });
    const other: RoleKind = adding === 'PETROL_STATION' ? 'REGISTRATION' : 'PETROL_STATION';
    const conflictingRole = user.roles.find((r) => r.role.kind === other)?.role.name ?? null;
    const hasOtherScope =
      other === 'REGISTRATION' ? user._count.registrationStationScope > 0 : user._count.stationScope > 0;
    if (conflictingRole || hasOtherScope) {
      // Machine-checkable marker (the admin screen maps it to Arabic) plus
      // which side the user is already on and why.
      throw new ConflictException({
        message: 'ROLE_SEPARATION_CONFLICT',
        details: { existingSide: other, requestedSide: adding, conflictingRole },
      });
    }
  }

  // Phase 4b — no privilege escalation, whichever endpoint is used:
  //  - nobody raises their OWN role or permissions (raising: true);
  //  - an account, role or permission that carries users:manage_system_admins
  //    is touched only by someone who holds it too, so a directorate admin
  //    cannot make or edit a system admin. Decided from permissions, never
  //    from a role name (CLAUDE.md rule 2).
  private async assertMayEdit(
    actorId: string,
    targetId: string,
    options: { raising?: boolean; grants?: string[] } = {},
  ) {
    if (options.raising && actorId === targetId) {
      throw new ForbiddenException('SELF_ACTION');
    }
    const actorPermissions = await this.rbac.getPermissionsForUser(actorId);
    if (actorPermissions.has(PERM_MANAGE_PRIVILEGED)) return;

    if (options.grants?.includes(PERM_MANAGE_PRIVILEGED)) {
      throw new ForbiddenException('PRIVILEGED_ACCOUNT');
    }
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: {
        roles: { select: { role: { select: { permissions: { select: { permission: { select: { key: true } } } } } } } },
        directPermissions: { select: { permission: { select: { key: true } } } },
      },
    });
    const targetKeys = [
      ...(target?.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.key)) ?? []),
      ...(target?.directPermissions.map((p) => p.permission.key) ?? []),
    ];
    if (targetKeys.includes(PERM_MANAGE_PRIVILEGED)) {
      throw new ForbiddenException('PRIVILEGED_ACCOUNT');
    }
  }

  private async ensureUserExists(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found.');
    }
  }
}
