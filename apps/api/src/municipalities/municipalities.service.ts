import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateMunicipalityDto } from './dto/create-municipality.dto';
import { UpdateMunicipalityDto } from './dto/update-municipality.dto';

// Settings-managed lookup list — same shape as CompaniesService, see
// station-card-field-spec's "why status and ownership-type aren't
// Settings-managed" section for the distinction this pattern rests on.
@Injectable()
export class MunicipalitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateMunicipalityDto, actorId: string) {
    const existing = await this.prisma.municipality.findUnique({ where: { name: dto.name } });
    if (existing) {
      throw new ConflictException('A municipality with this name already exists.');
    }

    const municipality = await this.prisma.municipality.create({ data: { name: dto.name } });

    await this.audit.log({
      userId: actorId,
      action: 'CREATE',
      entityType: 'Municipality',
      entityId: municipality.id,
      newValue: { name: municipality.name },
    });

    return municipality;
  }

  findAll() {
    return this.prisma.municipality.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    const municipality = await this.prisma.municipality.findUnique({ where: { id } });
    if (!municipality) {
      throw new NotFoundException('Municipality not found.');
    }
    return municipality;
  }

  async update(id: string, dto: UpdateMunicipalityDto, actorId: string) {
    const before = await this.findOne(id);
    const municipality = await this.prisma.municipality.update({ where: { id }, data: dto });

    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      entityType: 'Municipality',
      entityId: municipality.id,
      oldValue: { name: before.name, isActive: before.isActive },
      newValue: { name: municipality.name, isActive: municipality.isActive },
    });

    return municipality;
  }
}
