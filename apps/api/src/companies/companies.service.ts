import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PICKER_LIMIT } from '../common/dto/page-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateCompanyDto, actorId: string) {
    const existing = await this.prisma.company.findUnique({ where: { name: dto.name } });
    if (existing) {
      throw new ConflictException('A company with this name already exists.');
    }

    const company = await this.prisma.company.create({ data: { name: dto.name } });

    await this.audit.log({
      userId: actorId,
      action: 'CREATE',
      entityType: 'Company',
      entityId: company.id,
      newValue: { name: company.name },
    });

    return company;
  }

  findAll(q?: string) {
    return this.prisma.company.findMany({ where: q?.trim() ? { name: { contains: q.trim(), mode: 'insensitive' as const } } : undefined, orderBy: { name: 'asc' }, take: PICKER_LIMIT });
  }

  async findOne(id: string) {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) {
      throw new NotFoundException('Company not found.');
    }
    return company;
  }

  async update(id: string, dto: UpdateCompanyDto, actorId: string) {
    const before = await this.findOne(id);
    const company = await this.prisma.company.update({ where: { id }, data: dto });

    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      entityType: 'Company',
      entityId: company.id,
      oldValue: { name: before.name, isActive: before.isActive },
      newValue: { name: company.name, isActive: company.isActive },
    });

    return company;
  }
}
