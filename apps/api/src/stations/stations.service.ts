import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RbacService } from '../rbac/rbac.service';
import { CreateStationDto } from './dto/create-station.dto';
import { UpdateStationDto } from './dto/update-station.dto';

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
@Injectable()
export class StationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rbac: RbacService,
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

  async create(dto: CreateStationDto, actorId: string) {
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
          ...this.resolveOperatorFields(dto),
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
    fuelAvailability: true,
  } as const;

  private async canSeePreparingStations(userId: string): Promise<boolean> {
    const permissions = await this.rbac.getPermissionsForUser(userId);
    return permissions.has('stations:view_preparing');
  }

  async findAll(userId: string) {
    const scope = await this.rbac.getStationScope(userId);
    const includePreparing = await this.canSeePreparingStations(userId);
    const where: Prisma.StationWhereInput = {
      ...(scope !== null ? { id: { in: scope } } : {}),
      ...(includePreparing ? {} : { OR: [{ municipalityId: null }, { municipality: { status: 'LIVE' } }] }),
    };
    return this.prisma.station.findMany({
      where,
      include: this.cardInclude,
      orderBy: { internalCode: 'asc' },
    });
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

  async update(id: string, dto: UpdateStationDto, userId: string, actorId: string) {
    const before = await this.findOne(id, userId);
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
        data: { ...rest, ...this.resolveOperatorFields(dto) },
        include: this.cardInclude,
      });

      await this.audit.log(
        {
          userId: actorId,
          action: 'UPDATE',
          entityType: 'Station',
          entityId: station.id,
          oldValue: { name: before.name, status: before.status },
          newValue: { name: station.name, status: station.status },
        },
        tx,
      );

      return station;
    });
  }
}
