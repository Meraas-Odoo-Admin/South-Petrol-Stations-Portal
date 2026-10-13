import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RbacService } from '../rbac/rbac.service';
import { CreateRegistrationStationDto } from './dto/create-registration-station.dto';
import { UpdateRegistrationStationDto } from './dto/update-registration-station.dto';
import { ListRegistrationStationsQueryDto } from './dto/list-registration-stations-query.dto';
import { PICKER_LIMIT, pageOf } from '../common/dto/page-query.dto';
import { NotificationsService } from '../notifications/notifications.service';

// Registration pivot, phase 2: police-station registration desks — the
// only places a vehicle or owner is registered. Scope is enforced HERE, in
// the service layer (CLAUDE.md rule 3), against UserRegistrationStationScope
// — same contract as StationsService's petrol-station scoping.
@Injectable()
export class RegistrationStationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rbac: RbacService,
    private readonly notifications: NotificationsService,
  ) {}

  // The station list/detail and the registration screen's picker show the
  // municipality (with its status) and, through it, the security
  // authority — one per municipality, so there's no authority field here.
  private readonly include = {
    municipality: {
      select: {
        id: true,
        name: true,
        status: true,
        securityAuthority: { select: { id: true, name: true } },
      },
    },
  } as const;

  // Same pattern as StationsService.generateInternalCode.
  private async generateInternalCode(): Promise<string> {
    const count = await this.prisma.registrationStation.count();
    for (let offset = 0; offset < 20; offset++) {
      const candidate = `REG-${String(count + 1 + offset).padStart(6, '0')}`;
      const existing = await this.prisma.registrationStation.findUnique({ where: { internalCode: candidate } });
      if (!existing) {
        return candidate;
      }
    }
    throw new Error('Could not generate a unique registration station internal code after 20 attempts.');
  }

  // Phase 5A: an office is created inside a municipality the caller is
  // confined to (the super admin: any non-archived one).
  private async assertMunicipalityExists(municipalityId: string, actorId: string) {
    const scope = await this.rbac.getMunicipalityScope(actorId);
    if (scope !== null && !scope.includes(municipalityId)) {
      throw new ForbiddenException('You do not have access to this municipality.');
    }
    const municipality = await this.prisma.municipality.findUnique({ where: { id: municipalityId } });
    if (!municipality) {
      throw new NotFoundException('Municipality not found.');
    }
    if (municipality.archivedAt) {
      throw new ConflictException('MUNICIPALITY_ARCHIVED');
    }
  }

  async create(dto: CreateRegistrationStationDto, actorId: string) {
    await this.assertMunicipalityExists(dto.municipalityId, actorId);
    const internalCode = await this.generateInternalCode();

    return this.prisma.$transaction(async (tx) => {
      const station = await tx.registrationStation.create({
        data: { ...dto, internalCode },
        include: this.include,
      });
      await this.audit.log(
        {
          userId: actorId,
          action: 'CREATE',
          entityType: 'RegistrationStation',
          entityId: station.id,
          // No contactPhone — phone numbers are never logged (CLAUDE.md rule 10).
          newValue: {
            internalCode: station.internalCode,
            name: station.name,
            municipalityId: station.municipalityId,
            status: station.status,
          },
        },
        tx,
      );
      return station;
    });
  }

  // Phase 5A: archived offices leave the daily lists; a holder of
  // registration_stations:manage reaches them under the "archived" filter.
  // The PICKER list (at most PICKER_LIMIT offices); findPage() is for screens.
  async findAll(userId: string, query: ListRegistrationStationsQueryDto = {}) {
    const { where, orderBy } = await this.listQuery(userId, query);
    return this.prisma.registrationStation.findMany({ where, include: this.include, orderBy, take: PICKER_LIMIT });
  }

  async findPage(userId: string, query: ListRegistrationStationsQueryDto = {}) {
    const { where, orderBy } = await this.listQuery(userId, query);
    const { skip, take } = pageOf(query);
    const [total, items] = await Promise.all([
      this.prisma.registrationStation.count({ where }),
      this.prisma.registrationStation.findMany({ where, include: this.include, orderBy, skip, take }),
    ]);
    return { total, skip, take, items };
  }

  private async listQuery(userId: string, query: ListRegistrationStationsQueryDto) {
    const scope = await this.rbac.getRegistrationStationScope(userId);
    const permissions = await this.rbac.getPermissionsForUser(userId);
    const archived = permissions.has('registration_stations:manage') ? query.archived : undefined;
    const and: Prisma.RegistrationStationWhereInput[] = [];
    if (scope !== null) and.push({ id: { in: scope } });
    and.push({ archivedAt: archived === 'only' ? { not: null } : archived === 'include' ? undefined : null });
    if (query.municipalityId) and.push({ municipalityId: query.municipalityId });
    if (query.status) and.push({ status: query.status });
    if (query.locality?.trim()) and.push({ locality: { contains: query.locality.trim(), mode: 'insensitive' } });
    if (query.q?.trim()) {
      const q = query.q.trim();
      and.push({
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { internalCode: { contains: q, mode: 'insensitive' } },
          { address: { contains: q, mode: 'insensitive' } },
        ],
      });
    }
    const dir = query.dir ?? 'asc';
    const orderBy: Prisma.RegistrationStationOrderByWithRelationInput[] =
      query.sort === 'name'
        ? [{ name: dir }, { internalCode: 'asc' }]
        : query.sort === 'status'
          ? [{ status: dir }, { internalCode: 'asc' }]
          : query.sort === 'municipality'
            ? [{ municipality: { name: dir } }, { internalCode: 'asc' }]
            : [{ internalCode: dir }];
    return { where: { AND: and } satisfies Prisma.RegistrationStationWhereInput, orderBy };
  }

  async findOne(id: string, userId: string) {
    const station = await this.prisma.registrationStation.findUnique({ where: { id }, include: this.include });
    if (!station) {
      throw new NotFoundException('Registration station not found.');
    }
    const scope = await this.rbac.getRegistrationStationScope(userId);
    if (scope !== null && !scope.includes(station.id)) {
      throw new ForbiddenException('You do not have access to this registration station.');
    }
    return station;
  }

  async update(id: string, dto: UpdateRegistrationStationDto, actorId: string) {
    const before = await this.findOne(id, actorId);
    if (before.archivedAt) {
      throw new ConflictException('REGISTRATION_STATION_ARCHIVED');
    }
    if (dto.municipalityId && dto.municipalityId !== before.municipalityId) {
      await this.assertMunicipalityExists(dto.municipalityId, actorId);
    }

    return this.prisma.$transaction(async (tx) => {
      const station = await tx.registrationStation.update({ where: { id }, data: dto, include: this.include });
      await this.audit.log(
        {
          userId: actorId,
          action: 'UPDATE',
          entityType: 'RegistrationStation',
          entityId: id,
          oldValue: { name: before.name, municipalityId: before.municipalityId, status: before.status },
          newValue: { name: station.name, municipalityId: station.municipalityId, status: station.status },
        },
        tx,
      );
      return station;
    });
  }

  // The office's own page: audit entries about it, and its recent output.
  async activity(id: string, userId: string, query: { skip?: number; take?: number } = {}) {
    await this.findOne(id, userId);
    const { skip, take } = pageOf(query);
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const where = { entityType: 'RegistrationStation', entityId: id };
    const [total, rows, vehicles, cards] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
        include: { user: { select: { fullName: true } } },
      }),
      this.prisma.vehicle.count({ where: { registeredAtRegistrationStationId: id, createdAt: { gte: since } } }),
      this.prisma.vehicleCard.count({ where: { registrationStationId: id, issuedAt: { gte: since } } }),
    ]);
    return {
      total,
      skip,
      take,
      vehiclesLast30Days: vehicles,
      cardsLast30Days: cards,
      items: rows.map((r) => ({
        id: r.id,
        action: r.action,
        createdAt: r.createdAt,
        actorName: r.user?.fullName ?? null,
        reason: typeof (r.newValue as { reason?: unknown } | null)?.reason === 'string' ? (r.newValue as { reason: string }).reason : null,
      })),
    };
  }

  // "Delete" means archive: the office leaves the daily screens and takes no
  // new registrations, while every vehicle, card and audit row stays.
  async archive(id: string, reason: string, actorId: string) {
    const before = await this.findOne(id, actorId);
    if (before.archivedAt) {
      throw new ConflictException('ALREADY_ARCHIVED');
    }
    const archived = await this.prisma.$transaction(async (tx) => {
      const station = await tx.registrationStation.update({
        where: { id },
        data: { archivedAt: new Date(), archivedById: actorId },
        include: this.include,
      });
      await this.audit.log(
        {
          userId: actorId,
          action: 'ARCHIVE',
          entityType: 'RegistrationStation',
          entityId: id,
          newValue: { internalCode: station.internalCode, reason },
        },
        tx,
      );
      return station;
    });
    await this.notifications.notifyScope(
      { registrationStationId: id },
      ['notifications:municipality_events'],
      {
        kind: 'OFFICE_ARCHIVED',
        title: `أُرشف مكتب تسجيل ${archived.name}`,
        body: `السبب: ${reason}`,
        link: `/manage/offices/${id}`,
        entityType: 'RegistrationStation',
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
    if (before.municipality && (await this.prisma.municipality.findUnique({ where: { id: before.municipalityId } }))?.archivedAt) {
      throw new ConflictException('MUNICIPALITY_ARCHIVED');
    }
    return this.prisma.$transaction(async (tx) => {
      const station = await tx.registrationStation.update({
        where: { id },
        data: { archivedAt: null, archivedById: null },
        include: this.include,
      });
      await this.audit.log(
        {
          userId: actorId,
          action: 'RESTORE',
          entityType: 'RegistrationStation',
          entityId: id,
          newValue: { internalCode: station.internalCode, reason },
        },
        tx,
      );
      return station;
    });
  }

  // The registration stations a driver can actually go to right now, in one
  // municipality: status ACTIVE, in a LIVE municipality. Used by the pump's
  // refusal and awareness messages and by the posted A4 sheet, always read
  // live — a station that opens or closes is right on the next call.
  async listActiveForMunicipality(municipalityId: string) {
    return this.prisma.registrationStation.findMany({
      where: { municipalityId, status: 'ACTIVE', archivedAt: null, municipality: { status: 'LIVE', archivedAt: null } },
      select: { id: true, name: true, address: true, workingHours: true, contactPhone: true },
      orderBy: { name: 'asc' },
    });
  }

  // Every registration action (VehiclesService.create, OwnersService.create)
  // runs through this before writing anything. Refusals use machine-
  // checkable markers the registration screen maps to Arabic (same
  // convention as Phase 1's STATION_HAS_NO_MUNICIPALITY/MUNICIPALITY_NOT_LIVE):
  //  - 403: the station is outside the actor's registration-station scope;
  //  - REGISTRATION_STATION_NOT_ACTIVE: closed or temporarily closed;
  //  - MUNICIPALITY_NOT_LIVE: its municipality is still PREPARING.
  async assertCanRegisterAt(registrationStationId: string, actorId: string) {
    const scope = await this.rbac.getRegistrationStationScope(actorId);
    if (scope !== null && !scope.includes(registrationStationId)) {
      throw new ForbiddenException('You do not have access to this registration station.');
    }
    const station = await this.prisma.registrationStation.findUnique({
      where: { id: registrationStationId },
      select: { id: true, status: true, archivedAt: true, municipality: { select: { status: true, archivedAt: true } } },
    });
    if (!station) {
      throw new NotFoundException('Registration station not found.');
    }
    if (station.archivedAt) {
      throw new ConflictException('REGISTRATION_STATION_ARCHIVED');
    }
    if (station.municipality.archivedAt) {
      throw new ConflictException('MUNICIPALITY_ARCHIVED');
    }
    if (station.status !== 'ACTIVE') {
      throw new ConflictException('REGISTRATION_STATION_NOT_ACTIVE');
    }
    if (station.municipality.status !== 'LIVE') {
      throw new ConflictException('MUNICIPALITY_NOT_LIVE');
    }
    return station;
  }
}
