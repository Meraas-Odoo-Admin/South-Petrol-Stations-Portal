import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RbacService } from '../rbac/rbac.service';
import { CreateStationDto } from './dto/create-station.dto';
import { UpdateStationDto } from './dto/update-station.dto';

// Station-scoped access is enforced HERE, in the service layer — not in the
// controller and not in the UI. Every read goes through the caller's scope
// from UserStationScope before touching the database result.
// See docs/IMPLEMENTATION_PLAN.md §5 and CLAUDE.md rule 3.
@Injectable()
export class StationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rbac: RbacService,
  ) {}

  async create(dto: CreateStationDto, actorId: string) {
    const existingByCode = await this.prisma.station.findUnique({
      where: { internalCode: dto.internalCode },
    });
    if (existingByCode) {
      throw new ConflictException('internalCode is already in use.');
    }

    const existingByCompanyAndNumber = await this.prisma.station.findUnique({
      where: {
        companyId_stationNumber: { companyId: dto.companyId, stationNumber: dto.stationNumber },
      },
    });
    if (existingByCompanyAndNumber) {
      throw new ConflictException('This company already has a station with that stationNumber.');
    }

    return this.prisma.$transaction(async (tx) => {
      const station = await tx.station.create({ data: dto });

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

  async findAll(userId: string) {
    const scope = await this.rbac.getStationScope(userId);
    return this.prisma.station.findMany({
      where: scope ? { id: { in: scope } } : undefined,
      orderBy: { internalCode: 'asc' },
    });
  }

  async findOne(id: string, userId: string) {
    const station = await this.prisma.station.findUnique({ where: { id } });
    if (!station) {
      throw new NotFoundException('Station not found.');
    }

    const scope = await this.rbac.getStationScope(userId);
    if (scope && !scope.includes(station.id)) {
      // The station is real, but out of this user's scope. Guessing IDs
      // must not leak whether the station exists, but it also must not
      // succeed — 403, not the station's data.
      throw new ForbiddenException('You do not have access to this station.');
    }

    return station;
  }

  async update(id: string, dto: UpdateStationDto, userId: string, actorId: string) {
    const before = await this.findOne(id, userId);

    return this.prisma.$transaction(async (tx) => {
      const station = await tx.station.update({ where: { id }, data: dto });

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
