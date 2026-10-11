import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RbacService } from '../rbac/rbac.service';
import { generateTemporaryPassword } from '../common/utils/temporary-password';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { SetJobDto } from './dto/set-job.dto';
import { SetPlacesDto } from './dto/set-places.dto';
import {
  ActorFacts,
  Capabilities,
  RoleFacts,
  Side,
  TargetFacts,
  canAssignRole,
  capabilitiesFor,
  isAdminCaller,
  isStaffManagerCaller,
  placeIdsOf,
  placesWithinCallerScope,
} from './user-access';

// Registration pivot, phase 4b: the accounts screen's operations — a list you
// can search and filter, one person's page, and the actions on an account.
// Who may do what to whom is decided in user-access.ts (pure, tested); this
// service loads the facts, applies the decision, writes the change and its
// audit row in one transaction, and ends sessions where access changes.

const FULL_INCLUDE = {
  roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
  stationScope: { include: { station: true } },
  registrationStationScope: { include: { registrationStation: true } },
  directPermissions: { include: { permission: true } },
} satisfies Prisma.UserInclude;

type FullUser = Prisma.UserGetPayload<{ include: typeof FULL_INCLUDE }>;

export type AccountStatus = 'active' | 'deactivated' | 'locked' | 'must_change';

export function accountStatus(
  user: { isActive: boolean; lockedUntil: Date | null; mustChangePassword: boolean },
  now = new Date(),
): AccountStatus {
  if (!user.isActive) return 'deactivated';
  if (user.lockedUntil && user.lockedUntil > now) return 'locked';
  if (user.mustChangePassword) return 'must_change';
  return 'active';
}

function roleFacts(role: FullUser['roles'][number]['role']): RoleFacts {
  return {
    id: role.id,
    name: role.name,
    kind: role.kind,
    permissionKeys: role.permissions.map((p) => p.permission.key),
  };
}

function targetFacts(user: FullUser): TargetFacts {
  const permissions = new Set<string>();
  for (const userRole of user.roles) {
    for (const rp of userRole.role.permissions) permissions.add(rp.permission.key);
  }
  for (const dp of user.directPermissions) permissions.add(dp.permission.key);
  return {
    id: user.id,
    roles: user.roles.map((r) => roleFacts(r.role)),
    permissions,
    stationIds: user.stationScope.map((s) => s.stationId),
    registrationStationIds: user.registrationStationScope.map((s) => s.registrationStationId),
  };
}

function sideOfUser(user: FullUser): Side | null {
  return user.roles.find((r) => r.role.kind)?.role.kind ?? null;
}

// Why an action on this person is refused, as a code the screen maps to
// Arabic. Never an English sentence.
function refusal(caps: Capabilities): ForbiddenException {
  if (!caps.canView) return new ForbiddenException('USER_OUT_OF_SCOPE');
  if (caps.readOnlyReason === 'SELF') return new ForbiddenException('SELF_ACTION');
  if (caps.readOnlyReason === 'PRIVILEGED') return new ForbiddenException('PRIVILEGED_ACCOUNT');
  if (caps.readOnlyReason === 'WORKS_ELSEWHERE') return new ForbiddenException('WORKS_ELSEWHERE');
  return new ForbiddenException('ACTION_NOT_ALLOWED');
}

const phoneOrNull = (value: string | undefined) => {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

@Injectable()
export class UsersAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rbac: RbacService,
  ) {}

  // ── facts ────────────────────────────────────────────────────────────

  private async loadFull(id: string): Promise<FullUser> {
    const user = await this.prisma.user.findUnique({ where: { id }, include: FULL_INCLUDE });
    if (!user) throw new NotFoundException('User not found.');
    return user;
  }

  private async actorFacts(actorId: string): Promise<ActorFacts> {
    const user = await this.loadFull(actorId);
    const facts = targetFacts(user);
    return {
      id: user.id,
      permissions: facts.permissions,
      kind: sideOfUser(user),
      stationIds: new Set(facts.stationIds),
      registrationStationIds: new Set(facts.registrationStationIds),
    };
  }

  // Loads the person and what the caller may do to them; refuses outright
  // when the caller may not even open them.
  private async loadForCaller(actorId: string, id: string) {
    const [actor, user] = await Promise.all([this.actorFacts(actorId), this.loadFull(id)]);
    const caps = capabilitiesFor(actor, targetFacts(user));
    if (!caps.canView) throw refusal(caps);
    return { actor, user, caps };
  }

  private require(caps: Capabilities, key: keyof Omit<Capabilities, 'readOnlyReason'>) {
    if (!caps[key]) throw refusal(caps);
  }

  // ── the list ─────────────────────────────────────────────────────────

  async list(actorId: string, query: ListUsersQueryDto) {
    const actor = await this.actorFacts(actorId);
    const skip = query.skip ?? 0;
    const take = query.take ?? 25;
    const and: Prisma.UserWhereInput[] = [];

    if (query.q?.trim()) {
      const q = query.q.trim();
      and.push({
        OR: [
          { fullName: { contains: q, mode: 'insensitive' } },
          { username: { contains: q, mode: 'insensitive' } },
        ],
      });
    }
    if (query.side === 'ADMIN') and.push({ roles: { some: { role: { kind: null } } } });
    else if (query.side) and.push({ roles: { some: { role: { kind: query.side } } } });
    if (query.roleId) and.push({ roles: { some: { roleId: query.roleId } } });
    if (query.placeId) {
      and.push({
        OR: [
          { stationScope: { some: { stationId: query.placeId } } },
          { registrationStationScope: { some: { registrationStationId: query.placeId } } },
        ],
      });
    }
    const now = new Date();
    if (query.status === 'deactivated') and.push({ isActive: false });
    if (query.status === 'locked') and.push({ isActive: true, lockedUntil: { gt: now } });
    if (query.status === 'must_change') {
      and.push({ isActive: true, mustChangePassword: true, OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }] });
    }
    if (query.status === 'active') {
      and.push({ isActive: true, mustChangePassword: false, OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }] });
    }

    const orderBy: Prisma.UserOrderByWithRelationInput[] = [{ fullName: 'asc' }, { id: 'asc' }];

    if (isAdminCaller(actor)) {
      const where: Prisma.UserWhereInput = and.length ? { AND: and } : {};
      const [total, rows] = await Promise.all([
        this.prisma.user.count({ where }),
        this.prisma.user.findMany({ where, include: FULL_INCLUDE, orderBy, skip, take }),
      ]);
      return { total, skip, take, items: rows.map((u) => this.toListItem(actor, u, now)) };
    }

    if (isStaffManagerCaller(actor) && actor.kind) {
      // Candidates: people on the caller's side with a place in the caller's
      // scope. The capability check below does the exact filtering (single
      // employee job, no place outside the scope).
      const scopeIds = [...(actor.kind === 'PETROL_STATION' ? actor.stationIds : actor.registrationStationIds)];
      and.push({ id: { not: actor.id } });
      and.push({ roles: { some: { role: { kind: actor.kind } } } });
      and.push(
        actor.kind === 'PETROL_STATION'
          ? { stationScope: { some: { stationId: { in: scopeIds } } } }
          : { registrationStationScope: { some: { registrationStationId: { in: scopeIds } } } },
      );
      const rows = await this.prisma.user.findMany({ where: { AND: and }, include: FULL_INCLUDE, orderBy });
      const visible = rows.filter((u) => capabilitiesFor(actor, targetFacts(u)).canView);
      return {
        total: visible.length,
        skip,
        take,
        items: visible.slice(skip, skip + take).map((u) => this.toListItem(actor, u, now)),
      };
    }

    return { total: 0, skip, take, items: [] };
  }

  private toListItem(actor: ActorFacts, user: FullUser, now: Date) {
    const caps = capabilitiesFor(actor, targetFacts(user));
    const job = user.roles[0]?.role ?? null;
    const side = sideOfUser(user);
    const places =
      side === 'PETROL_STATION'
        ? user.stationScope.map((s) => s.station.name)
        : side === 'REGISTRATION'
          ? user.registrationStationScope.map((s) => s.registrationStation.name)
          : [];
    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      status: accountStatus(user, now),
      lastLoginAt: user.lastLoginAt,
      job: job ? { roleId: job.id, name: job.name, kind: job.kind } : null,
      jobCount: user.roles.length,
      sees: user.roles.some((r) => r.role.unrestrictedStationAccess) ? 'ALL' : 'PLACES',
      placeKind: side,
      placeNames: places.slice(0, 2),
      placeCount: places.length,
      canManage: caps.canManageAccount,
    };
  }

  // ── one person ───────────────────────────────────────────────────────

  async detail(actorId: string, id: string) {
    const { actor, user, caps } = await this.loadForCaller(actorId, id);
    const side = sideOfUser(user);
    const roles = await this.assignableRoles(actor);
    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      phone: user.phone,
      isActive: user.isActive,
      mustChangePassword: user.mustChangePassword,
      lockedUntil: user.lockedUntil,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      status: accountStatus(user),
      // The shapes the older endpoints return, kept so nothing that reads them breaks.
      roles: user.roles.map((r) => ({
        roleId: r.roleId,
        role: {
          id: r.role.id,
          name: r.role.name,
          description: r.role.description,
          kind: r.role.kind,
          unrestrictedStationAccess: r.role.unrestrictedStationAccess,
        },
      })),
      stationScope: user.stationScope.map((s) => ({ stationId: s.stationId, station: s.station })),
      registrationStationScope: user.registrationStationScope.map((s) => ({
        registrationStationId: s.registrationStationId,
        registrationStation: s.registrationStation,
      })),
      directPermissions: user.directPermissions.map((p) => ({
        permissionId: p.permissionId,
        permission: { id: p.permission.id, key: p.permission.key, description: p.permission.description },
      })),
      placeKind: side,
      places:
        side === 'PETROL_STATION'
          ? user.stationScope.map((s) => ({ id: s.stationId, internalCode: s.station.internalCode, name: s.station.name }))
          : side === 'REGISTRATION'
            ? user.registrationStationScope.map((s) => ({
                id: s.registrationStationId,
                internalCode: s.registrationStation.internalCode,
                name: s.registrationStation.name,
              }))
            : [],
      sees: user.roles.some((r) => r.role.unrestrictedStationAccess) ? 'ALL' : 'PLACES',
      capabilities: caps,
      assignableJobs: roles,
    };
  }

  // The jobs this caller may give, for the create flow and the job picker.
  async assignableRoles(actor: ActorFacts) {
    const roles = await this.prisma.role.findMany({
      include: { permissions: { include: { permission: true } } },
      orderBy: { name: 'asc' },
    });
    return roles
      .filter((role) =>
        canAssignRole(actor, {
          id: role.id,
          name: role.name,
          kind: role.kind,
          permissionKeys: role.permissions.map((p) => p.permission.key),
        }),
      )
      .map((role) => ({
        id: role.id,
        name: role.name,
        description: role.description,
        kind: role.kind,
        unrestrictedStationAccess: role.unrestrictedStationAccess,
      }));
  }

  async options(actorId: string) {
    const actor = await this.actorFacts(actorId);
    return { jobs: await this.assignableRoles(actor), callerSide: actor.kind };
  }

  // ── create ───────────────────────────────────────────────────────────

  async create(dto: CreateUserDto, actorId: string) {
    const actor = await this.actorFacts(actorId);
    let role: RoleFacts | null = null;

    if (dto.roleId) {
      role = await this.loadRoleFacts(dto.roleId);
      if (!canAssignRole(actor, role)) throw new ForbiddenException('JOB_NOT_ALLOWED');
    } else if (!isAdminCaller(actor)) {
      throw new BadRequestException('JOB_REQUIRED');
    }

    const placeIds = [...new Set(dto.placeIds ?? [])];
    if (role?.kind) {
      if (placeIds.length === 0) throw new BadRequestException('PLACES_REQUIRED');
      await this.assertPlacesExist(role.kind, placeIds);
      if (!placesWithinCallerScope(actor, role.kind, placeIds)) {
        throw new ForbiddenException('PLACES_OUTSIDE_SCOPE');
      }
    } else if (placeIds.length > 0) {
      throw new BadRequestException('PLACES_NOT_FOR_THIS_JOB');
    }

    if (await this.prisma.user.findUnique({ where: { username: dto.username } })) {
      throw new ConflictException('Username is already taken.');
    }

    const generated = dto.password === undefined;
    const password = dto.password ?? generateTemporaryPassword();
    const passwordHash = await argon2.hash(password);

    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username: dto.username,
          passwordHash,
          fullName: dto.fullName,
          phone: phoneOrNull(dto.phone) ?? null,
          mustChangePassword: true,
        },
      });
      if (role) {
        await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });
        if (role.kind === 'PETROL_STATION') {
          await tx.userStationScope.createMany({ data: placeIds.map((stationId) => ({ userId: user.id, stationId })) });
        } else if (role.kind === 'REGISTRATION') {
          await tx.userRegistrationStationScope.createMany({
            data: placeIds.map((registrationStationId) => ({ userId: user.id, registrationStationId })),
          });
        }
      }
      await this.audit.log(
        {
          userId: actorId,
          action: 'CREATE',
          entityType: 'User',
          entityId: user.id,
          newValue: { username: user.username, fullName: user.fullName, job: role?.name ?? null, placeCount: placeIds.length },
        },
        tx,
      );
      return user;
    });

    return {
      id: created.id,
      username: created.username,
      fullName: created.fullName,
      mustChangePassword: created.mustChangePassword,
      // Shown once and never stored in plain text or logged.
      ...(generated ? { temporaryPassword: password } : {}),
    };
  }

  // ── edit ─────────────────────────────────────────────────────────────

  async updateProfile(actorId: string, id: string, dto: UpdateUserDto) {
    const { user, caps } = await this.loadForCaller(actorId, id);
    this.require(caps, 'canEditIdentity');

    const fullName = dto.fullName?.trim();
    const phone = phoneOrNull(dto.phone);
    const data: Prisma.UserUpdateInput = {};
    const changed: string[] = [];
    if (fullName !== undefined && fullName !== user.fullName) {
      data.fullName = fullName;
      changed.push('fullName');
    }
    if (phone !== undefined && phone !== user.phone) {
      data.phone = phone;
      changed.push('phone');
    }
    if (changed.length === 0) return this.detail(actorId, id);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data });
      // The phone number itself is never written to the audit trail
      // (CLAUDE.md rule 10) — only that it changed.
      await this.audit.log(
        {
          userId: actorId,
          action: 'UPDATE',
          entityType: 'User',
          entityId: id,
          oldValue: changed.includes('fullName') ? { fullName: user.fullName } : {},
          newValue: { changed, ...(changed.includes('fullName') ? { fullName } : {}) },
        },
        tx,
      );
    });
    return this.detail(actorId, id);
  }

  async setJob(actorId: string, id: string, dto: SetJobDto) {
    const { actor, user, caps } = await this.loadForCaller(actorId, id);
    this.require(caps, 'canChangeJob');

    const role = await this.loadRoleFacts(dto.roleId);
    if (!canAssignRole(actor, role)) throw new ForbiddenException('JOB_NOT_ALLOWED');

    const oldSide = sideOfUser(user);
    const target = targetFacts(user);
    let placeIds: string[] = [];
    if (role.kind) {
      placeIds = dto.placeIds ? [...new Set(dto.placeIds)] : [...placeIdsOf(target, role.kind)];
      if (placeIds.length === 0) throw new BadRequestException('PLACES_REQUIRED');
      await this.assertPlacesExist(role.kind, placeIds);
    } else if (dto.placeIds && dto.placeIds.length > 0) {
      throw new BadRequestException('PLACES_NOT_FOR_THIS_JOB');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userRole.create({ data: { userId: id, roleId: role.id } });
      // Places belong to a side: replace them for the new side, drop the old
      // side's, so the separation rule is never violated mid-change.
      await tx.userStationScope.deleteMany({ where: { userId: id } });
      await tx.userRegistrationStationScope.deleteMany({ where: { userId: id } });
      if (role.kind === 'PETROL_STATION') {
        await tx.userStationScope.createMany({ data: placeIds.map((stationId) => ({ userId: id, stationId })) });
      } else if (role.kind === 'REGISTRATION') {
        await tx.userRegistrationStationScope.createMany({
          data: placeIds.map((registrationStationId) => ({ userId: id, registrationStationId })),
        });
      }
      await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.log(
        {
          userId: actorId,
          action: 'CHANGE_JOB',
          entityType: 'User',
          entityId: id,
          oldValue: { jobs: user.roles.map((r) => r.role.name), side: oldSide },
          newValue: { job: role.name, side: role.kind, placeCount: placeIds.length },
        },
        tx,
      );
    });

    this.rbac.invalidate(id);
    return this.detail(actorId, id);
  }

  async setPlaces(actorId: string, id: string, dto: SetPlacesDto) {
    const { actor, user, caps } = await this.loadForCaller(actorId, id);
    this.require(caps, 'canSetPlaces');

    const side = sideOfUser(user);
    if (!side) throw new BadRequestException('PLACES_NOT_FOR_THIS_JOB');
    const placeIds = [...new Set(dto.placeIds)];
    if (placeIds.length === 0) throw new BadRequestException('PLACES_REQUIRED');
    await this.assertPlacesExist(side, placeIds);
    if (!placesWithinCallerScope(actor, side, placeIds)) throw new ForbiddenException('PLACES_OUTSIDE_SCOPE');

    const current = new Set(placeIdsOf(targetFacts(user), side));
    const added = placeIds.filter((p) => !current.has(p));
    const removed = [...current].filter((p) => !placeIds.includes(p));

    await this.prisma.$transaction(async (tx) => {
      if (side === 'PETROL_STATION') {
        await tx.userStationScope.deleteMany({ where: { userId: id, stationId: { in: removed } } });
        await tx.userStationScope.createMany({ data: added.map((stationId) => ({ userId: id, stationId })) });
      } else {
        await tx.userRegistrationStationScope.deleteMany({
          where: { userId: id, registrationStationId: { in: removed } },
        });
        await tx.userRegistrationStationScope.createMany({
          data: added.map((registrationStationId) => ({ userId: id, registrationStationId })),
        });
      }
      await this.audit.log(
        {
          userId: actorId,
          action: 'SET_PLACES',
          entityType: 'User',
          entityId: id,
          oldValue: { side, placeIds: [...current] },
          newValue: { side, placeIds, added, removed },
        },
        tx,
      );
    });
    return this.detail(actorId, id);
  }

  // ── account actions ──────────────────────────────────────────────────

  async deactivate(actorId: string, id: string, reason: string) {
    const { user, caps } = await this.loadForCaller(actorId, id);
    this.require(caps, 'canManageAccount');
    if (!user.isActive) throw new ConflictException('ALREADY_INACTIVE');

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { isActive: false } });
      await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.log(
        { userId: actorId, action: 'DEACTIVATE_USER', entityType: 'User', entityId: id, newValue: { reason } },
        tx,
      );
    });
    // The permissions guard checks isActive on every request through this
    // cache, so dropping it ends the person's access on their next request,
    // not when their access token runs out.
    this.rbac.invalidate(id);
    return this.detail(actorId, id);
  }

  async reactivate(actorId: string, id: string, reason: string) {
    const { user, caps } = await this.loadForCaller(actorId, id);
    this.require(caps, 'canManageAccount');
    if (user.isActive) throw new ConflictException('ALREADY_ACTIVE');

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { isActive: true } });
      await this.audit.log(
        { userId: actorId, action: 'REACTIVATE_USER', entityType: 'User', entityId: id, newValue: { reason } },
        tx,
      );
    });
    this.rbac.invalidate(id);
    return this.detail(actorId, id);
  }

  async resetPassword(actorId: string, id: string) {
    const { caps } = await this.loadForCaller(actorId, id);
    this.require(caps, 'canManageAccount');

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await argon2.hash(temporaryPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { passwordHash, mustChangePassword: true, failedLoginAttempts: 0, lockedUntil: null },
      });
      await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      // The password is deliberately absent from the audit row.
      await this.audit.log({ userId: actorId, action: 'RESET_PASSWORD', entityType: 'User', entityId: id }, tx);
    });
    this.rbac.invalidate(id);
    return { temporaryPassword };
  }

  async unlock(actorId: string, id: string) {
    const { caps } = await this.loadForCaller(actorId, id);
    this.require(caps, 'canManageAccount');

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { failedLoginAttempts: 0, lockedUntil: null } });
      await this.audit.log({ userId: actorId, action: 'UNLOCK_USER', entityType: 'User', entityId: id }, tx);
    });
    return this.detail(actorId, id);
  }

  // The latest account-level entries about this person. Logins are left out
  // (the person page shows the last login on its own).
  async activity(actorId: string, id: string) {
    await this.loadForCaller(actorId, id);
    const rows = await this.prisma.auditLog.findMany({
      where: { entityType: 'User', entityId: id, action: { not: 'LOGIN' } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { user: { select: { fullName: true } } },
    });
    return rows.map((row) => {
      const value = (row.newValue ?? {}) as Record<string, unknown>;
      return {
        id: row.id,
        action: row.action,
        createdAt: row.createdAt,
        actorName: row.user?.fullName ?? null,
        reason: typeof value.reason === 'string' ? value.reason : null,
        job: typeof value.job === 'string' ? value.job : typeof value.roleName === 'string' ? value.roleName : null,
      };
    });
  }

  // ── helpers ──────────────────────────────────────────────────────────

  private async loadRoleFacts(roleId: string): Promise<RoleFacts> {
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      include: { permissions: { include: { permission: true } } },
    });
    if (!role) throw new NotFoundException('Role not found.');
    return { id: role.id, name: role.name, kind: role.kind, permissionKeys: role.permissions.map((p) => p.permission.key) };
  }

  private async assertPlacesExist(side: Side, placeIds: string[]) {
    const found =
      side === 'PETROL_STATION'
        ? await this.prisma.station.count({ where: { id: { in: placeIds } } })
        : await this.prisma.registrationStation.count({ where: { id: { in: placeIds } } });
    if (found !== placeIds.length) throw new BadRequestException('PLACE_NOT_FOUND');
  }
}
