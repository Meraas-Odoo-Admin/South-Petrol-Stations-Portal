import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Municipality } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RbacService } from '../rbac/rbac.service';
import { tripoliDay } from '../common/utils/grace-stage';
import { CreateMunicipalityDto } from './dto/create-municipality.dto';
import { UpdateMunicipalityDto } from './dto/update-municipality.dto';
import { ListMunicipalitiesQueryDto } from './dto/list-municipalities-query.dto';
import { MunicipalityPeopleQueryDto, MunicipalityPlacesQueryDto } from './dto/municipality-lists-query.dto';
import { PICKER_LIMIT, PageQueryDto, pageOf, type Paged } from '../common/dto/page-query.dto';

export interface PlaceRow {
  kind: 'STATION' | 'OFFICE';
  id: string;
  code: string;
  name: string;
  number: string | null;
  company: string | null;
  locality: string | null;
  status: string;
  archivedAt: Date | null;
  address: string | null;
}
export interface PersonRow {
  id: string;
  fullName: string;
  username: string;
  isActive: boolean;
  locked: boolean;
  lastLoginAt: Date | null;
  job: { id: string; name: string } | null;
}
export interface ActivityRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: Date;
  actorName: string | null;
}

// The name the security directorate of a municipality is created with. The
// super admin may rename it afterwards.
export function defaultAuthorityName(municipalityName: string): string {
  return `مديرية أمن ${municipalityName}`;
}

// Settings-managed lookup list - same shape as CompaniesService, see
// station-card-field-spec's "why status and ownership-type aren't
// Settings-managed" section for the distinction this pattern rests on.
//
// Registration pivot, phase 1: a municipality is also the rollout unit.
// It's created PREPARING (schema default) and switched to LIVE via
// update().
//
// Phase 5A: municipalities are the core. Creating one creates its security
// directorate («مديرية أمن ‹الاسم›») in the same step; "delete" is archive; a
// municipality manager reads and edits only their own municipality, enforced
// here in the service (CLAUDE.md rule 3), not just in the screens.
@Injectable()
export class MunicipalitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rbac: RbacService,
  ) {}

  // The station form shows a station's security authority read-only from
  // its municipality (one per municipality, OPEN_ITEMS.md #4) - included
  // here so the form doesn't need a second lookup.
  private readonly include = { securityAuthority: { select: { id: true, name: true } } } as const;

  // What the API (and so the UI) sees: the two dates as plain YYYY-MM-DD
  // calendar days and the stage computed server-side for right now.
  private present<T extends Municipality>(municipality: T) {
    const { awarenessStartDate: _a, cardRequiredFromDate: _c, ...rest } = municipality;
    return {
      ...rest,
      // The calendar day (Tripoli) the activation switch was last turned on.
      activatedOn: municipality.activatedAt ? tripoliDay(municipality.activatedAt) : null,
    };
  }

  // ── scope ────────────────────────────────────────────────────────────

  // READ access: the municipalities the caller is confined to plus the ones
  // their own stations/offices are in. null = everything.
  private async assertCanRead(userId: string, municipalityId: string) {
    const visible = await this.rbac.getVisibleMunicipalityIds(userId);
    if (visible !== null && !visible.includes(municipalityId)) {
      throw new ForbiddenException('You do not have access to this municipality.');
    }
  }

  // WRITE access: only inside the caller's own municipality scope.
  private async assertCanManage(userId: string, municipalityId: string) {
    const scope = await this.rbac.getMunicipalityScope(userId);
    if (scope !== null && !scope.includes(municipalityId)) {
      throw new ForbiddenException('You do not have access to this municipality.');
    }
  }

  // ── create ───────────────────────────────────────────────────────────

  async create(dto: CreateMunicipalityDto, actorId: string) {
    const name = dto.name.trim();
    const existing = await this.prisma.municipality.findUnique({ where: { name } });
    if (existing) {
      throw new ConflictException('MUNICIPALITY_NAME_TAKEN');
    }
    if (dto.code && (await this.prisma.municipality.findUnique({ where: { code: dto.code } }))) {
      throw new ConflictException('MUNICIPALITY_CODE_TAKEN');
    }
    const authorityName = defaultAuthorityName(name);
    if (await this.prisma.securityAuthority.findUnique({ where: { name: authorityName } })) {
      throw new ConflictException('SECURITY_AUTHORITY_NAME_TAKEN');
    }

    const municipality = await this.prisma.$transaction(async (tx) => {
      // Every municipality has exactly one security directorate (client-
      // confirmed), so it is created in the same step - never picked or
      // forgotten later.
      const created = await tx.municipality.create({
        data: { name, code: dto.code, securityAuthority: { create: { name: authorityName } } },
        include: this.include,
      });
      await this.audit.log(
        {
          userId: actorId,
          action: 'CREATE',
          entityType: 'Municipality',
          entityId: created.id,
          newValue: { name: created.name, status: created.status, securityAuthority: authorityName },
        },
        tx,
      );
      return created;
    });

    return this.present(municipality);
  }

  // ── read ─────────────────────────────────────────────────────────────

  async findAll(userId: string, query: ListMunicipalitiesQueryDto = {}) {
    const visible = await this.rbac.getVisibleMunicipalityIds(userId);
    const where: Prisma.MunicipalityWhereInput = {
      ...(visible !== null ? { id: { in: visible } } : {}),
      archivedAt: query.archived === 'only' ? { not: null } : query.archived === 'include' ? undefined : null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.q?.trim()
        ? {
            OR: [
              { name: { contains: query.q.trim(), mode: 'insensitive' } },
              { code: { contains: query.q.trim(), mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.municipality.findMany({
      where,
      include: {
        ...this.include,
        _count: { select: { stations: true, registrationStations: true } },
      },
      orderBy: { name: 'asc' },
      take: PICKER_LIMIT,
    });
    const dir = query.dir === 'desc' ? -1 : 1;
    const sorted = [...rows];
    if (query.sort === 'status') sorted.sort((a, b) => a.status.localeCompare(b.status) * dir);
    else if (query.sort === 'stations') sorted.sort((a, b) => (a._count.stations - b._count.stations) * dir);
    else if (query.sort === 'offices') {
      sorted.sort((a, b) => (a._count.registrationStations - b._count.registrationStations) * dir);
    } else if (query.sort === 'created') sorted.sort((a, b) => (a.createdAt.getTime() - b.createdAt.getTime()) * dir);
    else if (dir < 0) sorted.reverse();
    return sorted.map(({ _count, ...m }) => ({
      ...this.present(m),
      stationCount: _count.stations,
      officeCount: _count.registrationStations,
    }));
  }

  async findOne(id: string, userId: string) {
    await this.assertCanRead(userId, id);
    return this.present(await this.findRaw(id));
  }

  private async findRaw(id: string) {
    const municipality = await this.prisma.municipality.findUnique({ where: { id }, include: this.include });
    if (!municipality) {
      throw new NotFoundException('Municipality not found.');
    }
    return municipality;
  }

  // The municipality, its stage and dates, and COUNTS of what is in it (the
  // lists themselves are paged: places(), people(), activity()).
  async overview(id: string, userId: string) {
    await this.assertCanRead(userId, id);
    const municipality = await this.findRaw(id);

    const [stationCount, officeCount, byJob, peopleTotal] = await Promise.all([
      this.prisma.station.count({ where: { municipalityId: id, archivedAt: null } }),
      this.prisma.registrationStation.count({ where: { municipalityId: id, archivedAt: null } }),
      this.prisma.userRole.groupBy({
        by: ['roleId'],
        where: { user: this.peopleWhere(id) },
        _count: { _all: true },
      }),
      this.prisma.user.count({ where: this.peopleWhere(id) }),
    ]);
    const roles = await this.prisma.role.findMany({
      where: { id: { in: byJob.map((j) => j.roleId) } },
      select: { id: true, name: true },
    });
    const roleName = new Map(roles.map((r) => [r.id, r.name]));

    const activatedBy = municipality.activatedById
      ? await this.prisma.user.findUnique({ where: { id: municipality.activatedById }, select: { fullName: true } })
      : null;
    return {
      municipality: { ...this.present(municipality), activatedByName: activatedBy?.fullName ?? null },
      counts: { stations: stationCount, offices: officeCount, people: peopleTotal },
      people: {
        total: peopleTotal,
        byJob: byJob
          .map((j) => ({ roleId: j.roleId, name: roleName.get(j.roleId) ?? '', count: j._count._all }))
          .sort((a, b) => b.count - a.count),
      },
    };
  }

  // The people of a municipality: its managers, and everyone with a station or
  // office of it in their scope. Archived accounts are left out.
  private peopleWhere(id: string): Prisma.UserWhereInput {
    return {
      archivedAt: null,
      OR: [
        { municipalityScope: { some: { municipalityId: id } } },
        { stationScope: { some: { station: { municipalityId: id } } } },
        { registrationStationScope: { some: { registrationStation: { municipalityId: id } } } },
      ],
    };
  }

  // «المحطات والمكاتب»: petrol stations and registration offices in ONE list,
  // paged, searched, filtered and sorted in the database (a parameterised UNION;
  // sort columns come from a fixed map, never from the request).
  async places(id: string, userId: string, query: MunicipalityPlacesQueryDto): Promise<Paged<PlaceRow>> {
    await this.assertCanRead(userId, id);
    await this.findRaw(id);
    const { skip, take } = pageOf(query);
    const q = query.q?.trim();
    const locality = query.locality?.trim();
    const archivedOnly = query.status === 'ARCHIVED';
    const like = (text: string) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

    const stationWhere: Prisma.Sql[] = [Prisma.sql`s."municipalityId" = ${id}`];
    const officeWhere: Prisma.Sql[] = [Prisma.sql`r."municipalityId" = ${id}`];
    if (q) {
      stationWhere.push(
        Prisma.sql`(s."name" ILIKE ${like(q)} OR s."internalCode" ILIKE ${like(q)} OR s."stationNumber" ILIKE ${like(q)})`,
      );
      officeWhere.push(Prisma.sql`(r."name" ILIKE ${like(q)} OR r."internalCode" ILIKE ${like(q)})`);
    }
    if (locality) {
      stationWhere.push(Prisma.sql`s."locality" ILIKE ${like(locality)}`);
      officeWhere.push(Prisma.sql`r."locality" ILIKE ${like(locality)}`);
    }
    stationWhere.push(archivedOnly ? Prisma.sql`s."archivedAt" IS NOT NULL` : Prisma.sql`s."archivedAt" IS NULL`);
    officeWhere.push(archivedOnly ? Prisma.sql`r."archivedAt" IS NOT NULL` : Prisma.sql`r."archivedAt" IS NULL`);
    if (query.status && !archivedOnly) {
      stationWhere.push(Prisma.sql`s."status"::text = ${query.status}`);
      officeWhere.push(Prisma.sql`r."status"::text = ${query.status}`);
    }
    if (query.companyId) stationWhere.push(Prisma.sql`s."companyId" = ${query.companyId}`);

    const stationSelect = Prisma.sql`
      SELECT 'STATION' AS "kind", s."id", s."internalCode" AS "code", s."name", s."stationNumber" AS "number",
             c."name" AS "company", s."locality", s."status"::text AS "status", s."archivedAt", NULL::text AS "address"
      FROM "Station" s JOIN "Company" c ON c."id" = s."companyId"
      WHERE ${Prisma.join(stationWhere, ' AND ')}`;
    const officeSelect = Prisma.sql`
      SELECT 'OFFICE' AS "kind", r."id", r."internalCode" AS "code", r."name", NULL::text AS "number",
             NULL::text AS "company", r."locality", r."status"::text AS "status", r."archivedAt", r."address"
      FROM "RegistrationStation" r
      WHERE ${Prisma.join(officeWhere, ' AND ')}`;

    // A company filter only ever matches stations (an office has no company).
    const wantStations = query.kind !== 'OFFICE';
    const wantOffices = query.kind !== 'STATION' && !query.companyId;
    if (!wantStations && !wantOffices) return { total: 0, skip, take, items: [] };
    const union =
      wantStations && wantOffices
        ? Prisma.sql`${stationSelect} UNION ALL ${officeSelect}`
        : wantStations
          ? stationSelect
          : officeSelect;

    const dir = query.dir === 'desc' ? Prisma.sql`DESC` : Prisma.sql`ASC`;
    const column = {
      name: Prisma.sql`"name"`,
      code: Prisma.sql`"code"`,
      type: Prisma.sql`"kind"`,
      status: Prisma.sql`"status"`,
      company: Prisma.sql`"company"`,
      locality: Prisma.sql`"locality"`,
    }[query.sort ?? 'code'];
    const orderBy = Prisma.sql`ORDER BY ${column} ${dir} NULLS LAST, "code" ASC`;

    const [rows, count] = await Promise.all([
      this.prisma.$queryRaw<PlaceRow[]>`SELECT * FROM (${union}) p ${orderBy} LIMIT ${take} OFFSET ${skip}`,
      this.prisma.$queryRaw<Array<{ n: bigint }>>`SELECT COUNT(*) AS n FROM (${union}) p`,
    ]);
    return { total: Number(count[0]?.n ?? 0), skip, take, items: rows };
  }

  // «الأشخاص»: a page of the municipality's people.
  async people(id: string, userId: string, query: MunicipalityPeopleQueryDto): Promise<Paged<PersonRow>> {
    await this.assertCanRead(userId, id);
    await this.findRaw(id);
    const { skip, take } = pageOf(query);
    const now = new Date();
    const and: Prisma.UserWhereInput[] = [this.peopleWhere(id)];
    if (query.q?.trim()) {
      const q = query.q.trim();
      and.push({
        OR: [
          { fullName: { contains: q, mode: 'insensitive' } },
          { username: { contains: q, mode: 'insensitive' } },
        ],
      });
    }
    if (query.roleId) and.push({ roles: { some: { roleId: query.roleId } } });
    if (query.status === 'deactivated') and.push({ isActive: false });
    if (query.status === 'locked') and.push({ isActive: true, lockedUntil: { gt: now } });
    if (query.status === 'active') {
      and.push({ isActive: true, OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }] });
    }
    const dir = query.dir === 'desc' ? 'desc' : 'asc';
    const orderBy: Prisma.UserOrderByWithRelationInput[] =
      query.sort === 'username'
        ? [{ username: dir }, { id: 'asc' }]
        : query.sort === 'lastLogin'
          ? [{ lastLoginAt: { sort: dir, nulls: 'last' } }, { id: 'asc' }]
          : [{ fullName: dir }, { id: 'asc' }];
    const where: Prisma.UserWhereInput = { AND: and };
    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy,
        skip,
        take,
        select: {
          id: true,
          fullName: true,
          username: true,
          isActive: true,
          lockedUntil: true,
          lastLoginAt: true,
          roles: { select: { role: { select: { id: true, name: true } } } },
        },
      }),
    ]);
    return {
      total,
      skip,
      take,
      items: rows.map((p) => ({
        id: p.id,
        fullName: p.fullName,
        username: p.username,
        isActive: p.isActive,
        locked: Boolean(p.lockedUntil && p.lockedUntil > now),
        lastLoginAt: p.lastLoginAt,
        job: p.roles[0]?.role ?? null,
      })),
    };
  }

  // «سجل النشاط»: what happened in the municipality, its stations, offices and
  // people, newest first, a page at a time.
  async activity(id: string, userId: string, query: PageQueryDto): Promise<Paged<ActivityRow>> {
    await this.assertCanRead(userId, id);
    await this.findRaw(id);
    const { skip, take } = pageOf(query);
    const [stations, offices, users] = await Promise.all([
      this.prisma.station.findMany({ where: { municipalityId: id }, select: { id: true } }),
      this.prisma.registrationStation.findMany({ where: { municipalityId: id }, select: { id: true } }),
      this.prisma.user.findMany({ where: this.peopleWhere(id), select: { id: true } }),
    ]);
    const where: Prisma.AuditLogWhereInput = {
      action: { not: 'LOGIN' },
      OR: [
        { entityType: 'Municipality', entityId: id },
        { entityType: 'Station', entityId: { in: stations.map((s) => s.id) } },
        { entityType: 'RegistrationStation', entityId: { in: offices.map((o) => o.id) } },
        { entityType: 'User', entityId: { in: users.map((u) => u.id) } },
      ],
    };
    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
        include: { user: { select: { fullName: true } } },
      }),
    ]);
    return {
      total,
      skip,
      take,
      items: rows.map((row) => ({
        id: row.id,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        createdAt: row.createdAt,
        actorName: row.user?.fullName ?? null,
      })),
    };
  }

  // ── update ───────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateMunicipalityDto, actorId: string) {
    // Only inside the caller's own municipality scope.
    await this.assertCanManage(actorId, id);
    const before = await this.findRaw(id);
    if (before.archivedAt) {
      throw new ConflictException('MUNICIPALITY_ARCHIVED');
    }

    const switchingOn = dto.status === 'LIVE' && before.status !== 'LIVE';
    const switchingOff = dto.status === 'PREPARING' && before.status === 'LIVE';
    if (switchingOff && !dto.reason?.trim()) {
      throw new BadRequestException('REASON_REQUIRED');
    }

    if (dto.name && dto.name !== before.name) {
      const existing = await this.prisma.municipality.findUnique({ where: { name: dto.name } });
      if (existing) {
        throw new ConflictException('MUNICIPALITY_NAME_TAKEN');
      }
    }

    if (dto.code && dto.code !== before.code) {
      const taken = await this.prisma.municipality.findUnique({ where: { code: dto.code } });
      if (taken) {
        throw new ConflictException('MUNICIPALITY_CODE_TAKEN');
      }
    }

    if (dto.securityAuthorityName !== undefined && dto.securityAuthorityName !== before.securityAuthority?.name) {
      const taken = await this.prisma.securityAuthority.findUnique({ where: { name: dto.securityAuthorityName } });
      if (taken && taken.id !== before.securityAuthority?.id) {
        throw new ConflictException('SECURITY_AUTHORITY_NAME_TAKEN');
      }
    }

    const { reason, securityAuthorityName, ...data } = dto;

    const municipality = await this.prisma.$transaction(async (tx) => {
      // A municipality can't be switched on without the one directorate that
      // oversees its stations. New ones get it at creation; one created
      // before that rule gets it here, at the moment it is switched on.
      const needsAuthority = !before.securityAuthority && (dto.status === 'LIVE' || securityAuthorityName !== undefined);
      if (needsAuthority) {
        await tx.securityAuthority.create({
          data: {
            name: securityAuthorityName ?? defaultAuthorityName(dto.name ?? before.name),
            municipalityId: id,
          },
        });
      } else if (securityAuthorityName !== undefined && before.securityAuthority) {
        await tx.securityAuthority.update({
          where: { id: before.securityAuthority.id },
          data: { name: securityAuthorityName },
        });
      }
      return tx.municipality.update({
        where: { id },
        data: {
          ...data,
          // The date and the person are recorded when the switch is turned on.
          ...(switchingOn ? { activatedAt: new Date(), activatedById: actorId } : {}),
        },
        include: this.include,
      });
    });

    // Turning the switch on or off is its own audit entry (with the reason for
    // off), besides the general update row.
    if (switchingOn || switchingOff) {
      await this.audit.log({
        userId: actorId,
        action: switchingOn ? 'ACTIVATE' : 'DEACTIVATE',
        entityType: 'Municipality',
        entityId: municipality.id,
        oldValue: { status: before.status },
        newValue: { status: municipality.status, ...(switchingOff ? { reason: reason!.trim() } : {}) },
      });
    }

    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      entityType: 'Municipality',
      entityId: municipality.id,
      oldValue: { name: before.name, status: before.status, code: before.code, securityAuthority: before.securityAuthority?.name ?? null },
      newValue: {
        name: municipality.name,
        status: municipality.status,
        code: municipality.code,
        securityAuthority: municipality.securityAuthority?.name ?? null,
      },
    });

    return this.present(municipality);
  }

  // ── archive / restore ────────────────────────────────────────────────

  // "Delete" means archive: the municipality leaves the daily screens and
  // takes no new fill-ups or registrations, and every fill-up, card and audit
  // row stays. A LIVE municipality is archived only with its name typed, like
  // switching it back to preparing.
  async archive(id: string, dto: { confirmName?: string; reason: string }, actorId: string) {
    await this.assertCanManage(actorId, id);
    const before = await this.findRaw(id);
    if (before.archivedAt) {
      throw new ConflictException('ALREADY_ARCHIVED');
    }
    if (before.status === 'LIVE' && dto.confirmName?.trim() !== before.name) {
      throw new BadRequestException('CONFIRMATION_NAME_MISMATCH');
    }
    const municipality = await this.prisma.municipality.update({
      where: { id },
      data: { archivedAt: new Date(), archivedById: actorId },
      include: this.include,
    });
    await this.audit.log({
      userId: actorId,
      action: 'ARCHIVE',
      entityType: 'Municipality',
      entityId: id,
      newValue: { name: municipality.name, status: municipality.status, reason: dto.reason },
    });
    return this.present(municipality);
  }

  async restore(id: string, dto: { reason: string }, actorId: string) {
    await this.assertCanManage(actorId, id);
    const before = await this.findRaw(id);
    if (!before.archivedAt) {
      throw new ConflictException('NOT_ARCHIVED');
    }
    const municipality = await this.prisma.municipality.update({
      where: { id },
      data: { archivedAt: null, archivedById: null },
      include: this.include,
    });
    await this.audit.log({
      userId: actorId,
      action: 'RESTORE',
      entityType: 'Municipality',
      entityId: id,
      newValue: { name: municipality.name, reason: dto.reason },
    });
    return this.present(municipality);
  }
}
