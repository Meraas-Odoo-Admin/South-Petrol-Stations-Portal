import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RbacService } from '../rbac/rbac.service';
import { CreateRegistrationStationDto } from './dto/create-registration-station.dto';
import { UpdateRegistrationStationDto } from './dto/update-registration-station.dto';

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

  private async assertMunicipalityExists(municipalityId: string) {
    const municipality = await this.prisma.municipality.findUnique({ where: { id: municipalityId } });
    if (!municipality) {
      throw new NotFoundException('Municipality not found.');
    }
  }

  async create(dto: CreateRegistrationStationDto, actorId: string) {
    await this.assertMunicipalityExists(dto.municipalityId);
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

  async findAll(userId: string) {
    const scope = await this.rbac.getRegistrationStationScope(userId);
    return this.prisma.registrationStation.findMany({
      where: scope !== null ? { id: { in: scope } } : undefined,
      include: this.include,
      orderBy: { internalCode: 'asc' },
    });
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
    if (dto.municipalityId && dto.municipalityId !== before.municipalityId) {
      await this.assertMunicipalityExists(dto.municipalityId);
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

  // The registration stations a driver can actually go to right now, in one
  // municipality: status ACTIVE, in a LIVE municipality. Used by the pump's
  // refusal and awareness messages and by the posted A4 sheet, always read
  // live — a station that opens or closes is right on the next call.
  async listActiveForMunicipality(municipalityId: string) {
    return this.prisma.registrationStation.findMany({
      where: { municipalityId, status: 'ACTIVE', municipality: { status: 'LIVE' } },
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
      select: { id: true, status: true, municipality: { select: { status: true } } },
    });
    if (!station) {
      throw new NotFoundException('Registration station not found.');
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
