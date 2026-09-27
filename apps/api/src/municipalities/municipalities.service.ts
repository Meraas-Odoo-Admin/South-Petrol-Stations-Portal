import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateMunicipalityDto } from './dto/create-municipality.dto';
import { UpdateMunicipalityDto } from './dto/update-municipality.dto';

// Settings-managed lookup list — same shape as CompaniesService, see
// station-card-field-spec's "why status and ownership-type aren't
// Settings-managed" section for the distinction this pattern rests on.
//
// Registration pivot, phase 1: a municipality is also the rollout unit.
// It's created PREPARING (schema default) and switched to LIVE via
// update() — only once its security authority exists.
@Injectable()
export class MunicipalitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // The station form shows a station's security authority read-only from
  // its municipality (one per municipality, OPEN_ITEMS.md #4) — included
  // here so the form doesn't need a second lookup.
  private readonly include = { securityAuthority: { select: { id: true, name: true } } } as const;

  async create(dto: CreateMunicipalityDto, actorId: string) {
    const existing = await this.prisma.municipality.findUnique({ where: { name: dto.name } });
    if (existing) {
      throw new ConflictException('A municipality with this name already exists.');
    }

    const municipality = await this.prisma.municipality.create({
      data: { name: dto.name },
      include: this.include,
    });

    await this.audit.log({
      userId: actorId,
      action: 'CREATE',
      entityType: 'Municipality',
      entityId: municipality.id,
      newValue: { name: municipality.name, status: municipality.status },
    });

    return municipality;
  }

  findAll() {
    return this.prisma.municipality.findMany({ orderBy: { name: 'asc' }, include: this.include });
  }

  async findOne(id: string) {
    const municipality = await this.prisma.municipality.findUnique({ where: { id }, include: this.include });
    if (!municipality) {
      throw new NotFoundException('Municipality not found.');
    }
    return municipality;
  }

  async update(id: string, dto: UpdateMunicipalityDto, actorId: string) {
    const before = await this.findOne(id);

    // A municipality can't go live without the one security authority
    // that oversees its stations (registration pivot plan §5/§11).
    if (dto.status === 'LIVE' && before.status !== 'LIVE' && !before.securityAuthority) {
      throw new ConflictException(
        "Add this municipality's security authority before switching it to LIVE.",
      );
    }

    if (dto.name && dto.name !== before.name) {
      const existing = await this.prisma.municipality.findUnique({ where: { name: dto.name } });
      if (existing) {
        throw new ConflictException('A municipality with this name already exists.');
      }
    }

    const municipality = await this.prisma.municipality.update({
      where: { id },
      data: dto,
      include: this.include,
    });

    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      entityType: 'Municipality',
      entityId: municipality.id,
      oldValue: { name: before.name, status: before.status },
      newValue: { name: municipality.name, status: municipality.status },
    });

    return municipality;
  }
}
