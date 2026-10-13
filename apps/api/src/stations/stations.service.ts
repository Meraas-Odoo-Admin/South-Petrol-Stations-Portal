import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RbacService } from '../rbac/rbac.service';
import { CreateStationDto } from './dto/create-station.dto';
import { UpdateStationDto } from './dto/update-station.dto';
import { ListStationsQueryDto } from './dto/list-stations-query.dto';
import { PICKER_LIMIT, pageOf } from '../common/dto/page-query.dto';
import { NotificationsService } from '../notifications/notifications.service';

// Station-scoped access is enforced HERE, in the service layer — not in the
// controller and not in the UI. Every read goes through the caller's scope
// from UserStationScope before touching the database result.
// See docs/IMPLEMENTATION_PLAN.md §5 and CLAUDE.md rule 3.
//
// Registration pivot, phase 1: on top of scope, a station in a PREPARING
// municipality is visible only on admin screens — i.e. to holders of
// stations:view_preparing (a permission check, never a role-name check;
// not stations:manage, which station supervisors also hold). Everyone else sees only
// stations whose municipality is LIVE, plus stations with no municipality
// yet, which stay visible so that recording at one fails with the fill-up
// screen's clear "no municipality" message instead of the station silently
// vanishing. Fill-ups at either kind are refused by FillUpsService.
// The fuel types a station sells, in a stable order, for the audit trail.
function soldFuelTypes(rows: Array<{ fuelType: string; isAvailable: boolean }>): string[] {
  return rows
    .filter((r) => r.isAvailable)
    .map((r) => r.fuelType)
    .sort();
}

@Injectable()
export class StationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rbac: RbacService,
    private readonly notifications: NotificationsService,
  ) {}

  // Same pattern as VehiclesService.generateInternalCode — station-card-
  // field-spec's explicit ask: this is never something an admin types by
  // hand, since it's the one identifier guaranteed unique across every
  // company's own overlapping stationNumber sequences.
  private async generateInternalCode(): Promise<string> {
    const count = await this.prisma.station.count();
    for (let offset = 0; offset < 20; offset++) {
      const candidate = `STN-${String(count + 1 + offset).padStart(6, '0')}`;
      const existing = await this.prisma.station.findUnique({ where: { internalCode: candidate } });
      if (!existing) {
        return candidate;
      }
    }
    throw new Error('Could not generate a unique station internal code after 20 attempts.');
  }

  // operatorSameAsSupervisor is a real toggle, not just a display
  // convenience — when set, operatorName/operatorPhone are stored as null
  // rather than a duplicated copy of the supervisor's own fields, so a
  // later change to the supervisor's phone doesn't leave a stale operator
  // number behind. Shared by create/update so both enforce it identically.
  private resolveOperatorFields(dto: {
    operatorSameAsSupervisor?: boolean;
    operatorName?: string;
    operatorPhone?: string;
  }) {
    if (dto.operatorSameAsSupervisor) {
      return { operatorSameAsSupervisor: true, operatorName: null, operatorPhone: null };
    }
    return dto;
  }

  // Phase 5A: a station is created inside a municipality the caller is
  // confined to. The super admin (unrestricted) may use any non-archived one.
  private async assertMunicipalityWritable(municipalityId: string | undefined, actorId: string) {
    const scope = await this.rbac.getMunicipalityScope(actorId);
    if (scope !== null) {
      if (!municipalityId) throw new BadRequestException('MUNICIPALITY_REQUIRED');
      if (!scope.includes(municipalityId)) {
        throw new ForbiddenException('You do not have access to this municipality.');
      }
    }
    if (municipalityId) {
      const municipality = await this.prisma.municipality.findUnique({ where: { id: municipalityId } });
      if (!municipality) throw new NotFoundException('Municipality not found.');
      if (municipality.archivedAt) throw new ConflictException('MUNICIPALITY_ARCHIVED');
    }
  }

  async create(dto: CreateStationDto, actorId: string) {
    await this.assertMunicipalityWritable(dto.municipalityId, actorId);
    const internalCode = dto.internalCode?.trim() || (await this.generateInternalCode());

    // Only re-check uniqueness for an explicitly-supplied code —
    // generateInternalCode() above already confirmed its own candidate is
    // free, and re-checking it here would just be a redundant query.
    if (dto.internalCode?.trim()) {
      const existingByCode = await this.prisma.station.findUnique({ where: { internalCode } });
      if (existingByCode) {
        throw new ConflictException('internalCode is already in use.');
      }
    }

    const existingByCompanyAndNumber = await this.prisma.station.findUnique({
      where: {
        companyId_stationNumber: { companyId: dto.companyId, stationNumber: dto.stationNumber },
      },
    });
    if (existingByCompanyAndNumber) {
      throw new ConflictException('This company already has a station with that stationNumber.');
    }

    const { fuelTypes, ...rest } = dto;

    return this.prisma.$transaction(async (tx) => {
      const station = await tx.station.create({
        data: {
          ...rest,
          ...this.resolveOperatorFields(rest),
          internalCode,
          fuelAvailability: fuelTypes?.length
            ? { create: fuelTypes.map((fuelType) => ({ fuelType, isAvailable: true })) }
            : undefined,
        },
        include: this.cardInclude,
      });

      await this.audit.log(
        {
          userId: actorId,
          action: 'CREATE',
          entityType: 'Station',
          entityId: station.id,
          newValue: { internalCode: station.internalCode, companyId: station.companyId },
        },
        tx,
      );

      return station;
    });
  }

  // station-card-field-spec: the list/card views show the municipality,
  // route, and security-authority NAMES, not their ids — include the
  // relations here rather than making every reader join them itself, same
  // reasoning as VehiclesService.findAll including `owner`.
  //
  // The security authority is read through the municipality (one per
  // municipality); the legacy Station.securityAuthority relation is no
  // longer included.
  private readonly cardInclude = {
    municipality: { include: { securityAuthority: { select: { id: true, name: true } } } },
    route: true,
    company: { select: { id: true, name: true } },
    fuelAvailability: true,
  } as const;

  private async canSeePreparingStations(userId: string): Promise<boolean> {
    const permissions = await this.rbac.getPermissionsForUser(userId);
    return permissions.has('stations:view_preparing');
  }

  // Phase 5A: archived stations are left out of every daily list; a manager
  // reaches them under the "archived" filter (and only a holder of
  // stations:create may ask for it - a supervisor never sees archived ones).
  // The PICKER list: every station the caller may choose from, capped at
  // PICKER_LIMIT rows. Screens that show rows use findPage().
  async findAll(userId: string, query: ListStationsQueryDto = {}) {
    const { where, orderBy } = await this.listQuery(userId, query);
    return this.prisma.station.findMany({ where, include: this.cardInclude, orderBy, take: PICKER_LIMIT });
  }

  // One page of the list, with the total: search, filters and sort run here.
  async findPage(userId: string, query: ListStationsQueryDto = {}) {
    const { where, orderBy } = await this.listQuery(userId, query);
    const { skip, take } = pageOf(query);
    const [total, items] = await Promise.all([
      this.prisma.station.count({ where }),
      this.prisma.station.findMany({ where, include: this.cardInclude, orderBy, skip, take }),
    ]);
    return { total, skip, take, items };
  }

  private async listQuery(userId: string, query: ListStationsQueryDto) {
    const scope = await this.rbac.getStationScope(userId);
    const permissions = await this.rbac.getPermissionsForUser(userId);
    const includePreparing = permissions.has('stations:view_preparing');
    const mayArchive = permissions.has('stations:create');
    const archived = mayArchive ? query.archived : undefined;
    const and: Prisma.StationWhereInput[] = [];
    if (scope !== null) and.push({ id: { in: scope } });
    if (!includePreparing) and.push({ municipality: { status: 'LIVE' } });
    and.push({ archivedAt: archived === 'only' ? { not: null } : archived === 'include' ? undefined : null });
    if (query.municipalityId) and.push({ municipalityId: query.municipalityId });
    if (query.companyId) and.push({ companyId: query.companyId });
    if (query.status) and.push({ status: query.status });
    if (query.locality?.trim()) and.push({ locality: { contains: query.locality.trim(), mode: 'insensitive' } });
    if (query.q?.trim()) {
      const q = query.q.trim();
      and.push({
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { internalCode: { contains: q, mode: 'insensitive' } },
          { stationNumber: { contains: q, mode: 'insensitive' } },
        ],
      });
    }
    const dir = query.dir ?? 'asc';
    const orderBy: Prisma.StationOrderByWithRelationInput[] =
      query.sort === 'name'
        ? [{ name: dir }, { internalCode: 'asc' }]
        : query.sort === 'status'
          ? [{ status: dir }, { internalCode: 'asc' }]
          : query.sort === 'company'
            ? [{ company: { name: dir } }, { internalCode: 'asc' }]
            : query.sort === 'municipality'
              ? [{ municipality: { name: dir } }, { internalCode: 'asc' }]
              : [{ internalCode: dir }];
    return { where: { AND: and } satisfies Prisma.StationWhereInput, orderBy };
  }

  async findOne(id: string, userId: string) {
    const station = await this.prisma.station.findUnique({ where: { id }, include: this.cardInclude });
    if (!station) {
      throw new NotFoundException('Station not found.');
    }
    if (station.municipality?.status === 'PREPARING' && !(await this.canSeePreparingStations(userId))) {
      // Not live yet — outside admin screens it doesn't exist.
      throw new NotFoundException('Station not found.');
    }

    const scope = await this.rbac.getStationScope(userId);
    if (scope !== null && !scope.includes(station.id)) {
      // The station is real, but out of this user's scope. Guessing IDs
      // must not leak whether the station exists, but it also must not
      // succeed — 403, not the station's data.
      throw new ForbiddenException('You do not have access to this station.');
    }

    return station;
  }

  // The station's own page: what happened to it lately (audit entries about
  // the station, and the people changes at it) and how busy it has been.
  // Scope-checked like findOne.
  async activity(id: string, userId: string, query: { skip?: number; take?: number } = {}) {
    await this.findOne(id, userId);
    const { skip, take } = pageOf(query);
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const where = { entityType: 'Station', entityId: id };
    const [total, rows, fillUpsLast30Days] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
        include: { user: { select: { fullName: true } } },
      }),
      this.prisma.fillUpTransaction.count({ where: { stationId: id, occurredAt: { gte: since } } }),
    ]);
    return {
      total,
      skip,
      take,
      fillUpsLast30Days,
      items: rows.map((r) => ({
        id: r.id,
        action: r.action,
        createdAt: r.createdAt,
        actorName: r.user?.fullName ?? null,
        reason: typeof (r.newValue as { reason?: unknown } | null)?.reason === 'string' ? (r.newValue as { reason: string }).reason : null,
      })),
    };
  }

  // "Delete" means archive: the station disappears from daily screens and no
  // fill-up can be recorded at it, while every fill-up and audit row stays.
  async archive(id: string, reason: string, actorId: string) {
    const before = await this.findOne(id, actorId);
    if (before.archivedAt) {
      throw new ConflictException('ALREADY_ARCHIVED');
    }
    const archived = await this.prisma.$transaction(async (tx) => {
      const station = await tx.station.update({
        where: { id },
        data: { archivedAt: new Date(), archivedById: actorId },
        include: this.cardInclude,
      });
      await this.audit.log(
        {
          userId: actorId,
          action: 'ARCHIVE',
          entityType: 'Station',
          entityId: id,
          newValue: { internalCode: station.internalCode, reason },
        },
        tx,
      );
      return station;
    });
    await this.notifications.notifyScope(
      { stationId: id },
      ['notifications:municipality_events'],
      {
        kind: 'STATION_ARCHIVED',
        title: `أُرشف محطة ${archived.name}`,
        body: `السبب: ${reason}`,
        link: `/manage/stations/${id}`,
        entityType: 'Station',
        entityId: id,
      },
      { exceptUserId: actorId },
    );
    return archived;
  }

  async restore(id: string, reason: string, actorId: string) {
    const before = await this.findOne(id, actorId);
    if (!before.archivedAt) {
      throw new ConflictException('NOT_ARCHIVED');
    }
    if (before.municipalityId) {
      const municipality = await this.prisma.municipality.findUnique({ where: { id: before.municipalityId } });
      if (municipality?.archivedAt) throw new ConflictException('MUNICIPALITY_ARCHIVED');
    }
    return this.prisma.$transaction(async (tx) => {
      const station = await tx.station.update({
        where: { id },
        data: { archivedAt: null, archivedById: null },
        include: this.cardInclude,
      });
      await this.audit.log(
        {
          userId: actorId,
          action: 'RESTORE',
          entityType: 'Station',
          entityId: id,
          newValue: { internalCode: station.internalCode, reason },
        },
        tx,
      );
      return station;
    });
  }

  async update(id: string, dto: UpdateStationDto, userId: string, actorId: string) {
    const before = await this.findOne(id, userId);
    if (before.archivedAt) {
      throw new ConflictException('STATION_ARCHIVED');
    }
    // A station supervisor controls their own station - the fuel types it
    // sells - and nothing else about it: name, company, municipality, status
    // and contacts are the municipality manager's (stations:create).
    const permissions = await this.rbac.getPermissionsForUser(actorId);
    if (!permissions.has('stations:create')) {
      const extra = Object.keys(dto).filter(
        (key) => (dto as Record<string, unknown>)[key] !== undefined && key !== 'fuelTypes',
      );
      if (extra.length > 0) {
        throw new ForbiddenException('STATION_FIELDS_RESTRICTED');
      }
    } else if (dto.municipalityId && dto.municipalityId !== before.municipalityId) {
      await this.assertMunicipalityWritable(dto.municipalityId, actorId);
    }
    const { fuelTypes, ...rest } = dto;

    return this.prisma.$transaction(async (tx) => {
      // Full replace when fuelTypes is supplied — delete availability rows
      // for any fuel type no longer in the set, then upsert the rest, so
      // the multi-select genuinely reflects "this is the full set now,"
      // not an incremental add.
      if (fuelTypes) {
        await tx.stationFuelAvailability.deleteMany({
          where: { stationId: id, fuelType: { notIn: fuelTypes } },
        });
        for (const fuelType of fuelTypes) {
          await tx.stationFuelAvailability.upsert({
            where: { stationId_fuelType: { stationId: id, fuelType } },
            create: { stationId: id, fuelType, isAvailable: true },
            update: { isAvailable: true },
          });
        }
      }

      const station = await tx.station.update({
        where: { id },
        data: { ...rest, ...this.resolveOperatorFields(rest) },
        include: this.cardInclude,
      });

      await this.audit.log(
        {
          userId: actorId,
          action: 'UPDATE',
          entityType: 'Station',
          entityId: station.id,
          // A change of the fuel types a station sells is always visible in the
          // audit trail, by who and from what to what (client decision, #62).
          oldValue: {
            name: before.name,
            status: before.status,
            ...(fuelTypes ? { fuelTypes: soldFuelTypes(before.fuelAvailability) } : {}),
          },
          newValue: {
            name: station.name,
            status: station.status,
            ...(fuelTypes ? { fuelTypes: soldFuelTypes(station.fuelAvailability) } : {}),
          },
        },
        tx,
      );

      return station;
    });
  }
}
