import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Municipality, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RbacService } from '../rbac/rbac.service';
import {
  calendarDayString,
  calendarDayToDate,
  computeStage,
  isValidCalendarDay,
  tripoliDay,
} from '../common/utils/grace-stage';
import { CreateMunicipalityDto } from './dto/create-municipality.dto';
import { UpdateMunicipalityDto } from './dto/update-municipality.dto';
import { ListMunicipalitiesQueryDto } from './dto/list-municipalities-query.dto';

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
    return {
      ...municipality,
      awarenessStartDate: calendarDayString(municipality.awarenessStartDate),
      cardRequiredFromDate: calendarDayString(municipality.cardRequiredFromDate),
      stage: computeStage(new Date(), municipality),
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

  // Everything about one municipality in one place: its stations and
  // offices, its people (by job), its stage and dates and its activity.
  async overview(id: string, userId: string) {
    await this.assertCanRead(userId, id);
    const municipality = await this.findRaw(id);

    const [stations, offices, people] = await Promise.all([
      this.prisma.station.findMany({
        where: { municipalityId: id },
        select: { id: true, internalCode: true, name: true, stationNumber: true, status: true, archivedAt: true, company: { select: { name: true } } },
        orderBy: { internalCode: 'asc' },
      }),
      this.prisma.registrationStation.findMany({
        where: { municipalityId: id },
        select: { id: true, internalCode: true, name: true, status: true, archivedAt: true, address: true },
        orderBy: { internalCode: 'asc' },
      }),
      this.prisma.user.findMany({
        where: {
          archivedAt: null,
          OR: [
            { municipalityScope: { some: { municipalityId: id } } },
            { stationScope: { some: { station: { municipalityId: id } } } },
            { registrationStationScope: { some: { registrationStation: { municipalityId: id } } } },
          ],
        },
        select: {
          id: true,
          fullName: true,
          username: true,
          isActive: true,
          lastLoginAt: true,
          roles: { select: { role: { select: { id: true, name: true } } } },
        },
        orderBy: { fullName: 'asc' },
      }),
    ]);

    const byJob = new Map<string, { roleId: string; name: string; count: number }>();
    for (const person of people) {
      const job = person.roles[0]?.role;
      if (!job) continue;
      const entry = byJob.get(job.id) ?? { roleId: job.id, name: job.name, count: 0 };
      entry.count += 1;
      byJob.set(job.id, entry);
    }

    const stationIds = stations.map((s) => s.id);
    const officeIds = offices.map((o) => o.id);
    const userIds = people.map((p) => p.id);
    const activity = await this.prisma.auditLog.findMany({
      where: {
        action: { not: 'LOGIN' },
        OR: [
          { entityType: 'Municipality', entityId: id },
          { entityType: 'Station', entityId: { in: stationIds } },
          { entityType: 'RegistrationStation', entityId: { in: officeIds } },
          { entityType: 'User', entityId: { in: userIds } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: { user: { select: { fullName: true } } },
    });

    return {
      municipality: this.present(municipality),
      stations,
      offices,
      people: {
        total: people.length,
        byJob: [...byJob.values()],
        items: people.slice(0, 200).map((p) => ({
          id: p.id,
          fullName: p.fullName,
          username: p.username,
          isActive: p.isActive,
          lastLoginAt: p.lastLoginAt,
          job: p.roles[0]?.role ?? null,
        })),
      },
      activity: activity.map((row) => ({
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

  async update(
    id: string,
    dto: UpdateMunicipalityDto,
    actorId: string,
    options: { stageDatesOnly?: boolean } = {},
  ) {
    if (options.stageDatesOnly) {
      // confirmName only accompanies the deadline's typed-name check.
      const allowed = new Set(['awarenessStartDate', 'cardRequiredFromDate', 'confirmName']);
      const extra = Object.keys(dto).filter((key) => (dto as Record<string, unknown>)[key] !== undefined && !allowed.has(key));
      if (extra.length > 0) {
        throw new ForbiddenException('STAGE_DATES_ONLY');
      }
    }
    // Only inside the caller's own municipality scope.
    await this.assertCanManage(actorId, id);
    const before = await this.findRaw(id);
    if (before.archivedAt) {
      throw new ConflictException('MUNICIPALITY_ARCHIVED');
    }
    const stageDates = this.resolveStageDates(before, dto);

    if (dto.status === 'PREPARING' && before.status === 'LIVE' && dto.confirmName?.trim() !== before.name) {
      throw new BadRequestException('CONFIRMATION_NAME_MISMATCH');
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

    const {
      confirmName: _confirmName,
      awarenessStartDate: _awareness,
      cardRequiredFromDate: _deadline,
      securityAuthorityName,
      ...data
    } = dto;

    const municipality = await this.prisma.$transaction(async (tx) => {
      // A municipality can't be live without the one directorate that
      // oversees its stations. New ones get it at creation; one created
      // before that rule gets it here, at the moment it goes live.
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
          ...(stageDates.changed.awarenessStartDate
            ? { awarenessStartDate: stageDates.next.awarenessStartDate ? calendarDayToDate(stageDates.next.awarenessStartDate) : null }
            : {}),
          ...(stageDates.changed.cardRequiredFromDate
            ? { cardRequiredFromDate: stageDates.next.cardRequiredFromDate ? calendarDayToDate(stageDates.next.cardRequiredFromDate) : null }
            : {}),
        },
        include: this.include,
      });
    });

    // Moving a stage date changes what every pump does from that day on, so
    // it gets its own audit entry with the old and new values.
    if (stageDates.changed.awarenessStartDate || stageDates.changed.cardRequiredFromDate) {
      await this.audit.log({
        userId: actorId,
        action: 'UPDATE_STAGE_DATES',
        entityType: 'Municipality',
        entityId: municipality.id,
        oldValue: {
          awarenessStartDate: calendarDayString(before.awarenessStartDate),
          cardRequiredFromDate: calendarDayString(before.cardRequiredFromDate),
        },
        newValue: stageDates.next,
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

  // Validates a change to the two stage dates and returns what changed.
  //  - each must be a real calendar day;
  //  - awareness must start before the deadline (checked on the resulting
  //    pair, so changing one against the stored other is covered);
  //  - a deadline moved to today (Tripoli) or earlier starts enforcement
  //    immediately, so - like LIVE -> PREPARING - it needs the municipality's
  //    name typed as confirmation, on the API as well as in the UI.
  private resolveStageDates(
    before: Municipality,
    dto: UpdateMunicipalityDto,
  ): {
    next: { awarenessStartDate: string | null; cardRequiredFromDate: string | null };
    changed: { awarenessStartDate: boolean; cardRequiredFromDate: boolean };
  } {
    const current = {
      awarenessStartDate: calendarDayString(before.awarenessStartDate),
      cardRequiredFromDate: calendarDayString(before.cardRequiredFromDate),
    };
    const next = { ...current };
    for (const field of ['awarenessStartDate', 'cardRequiredFromDate'] as const) {
      if (dto[field] === undefined) continue;
      const value = dto[field];
      if (value !== null && !isValidCalendarDay(value)) {
        throw new BadRequestException('INVALID_DATE');
      }
      next[field] = value;
    }
    if (next.awarenessStartDate && next.cardRequiredFromDate && next.awarenessStartDate >= next.cardRequiredFromDate) {
      throw new BadRequestException('AWARENESS_NOT_BEFORE_DEADLINE');
    }
    const changed = {
      awarenessStartDate: next.awarenessStartDate !== current.awarenessStartDate,
      cardRequiredFromDate: next.cardRequiredFromDate !== current.cardRequiredFromDate,
    };
    if (
      changed.cardRequiredFromDate &&
      next.cardRequiredFromDate &&
      next.cardRequiredFromDate <= tripoliDay(new Date()) &&
      dto.confirmName?.trim() !== before.name
    ) {
      throw new BadRequestException('CONFIRMATION_NAME_MISMATCH');
    }
    return { next, changed };
  }
}
