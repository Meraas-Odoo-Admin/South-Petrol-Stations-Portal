import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PICKER_LIMIT } from '../common/dto/page-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateRouteDto } from './dto/create-route.dto';
import { UpdateRouteDto } from './dto/update-route.dto';

// Settings-managed lookup list for the station's ownership/haulage route
// (خط الإعداد) — same shape as CompaniesService/MunicipalitiesService.
@Injectable()
export class RoutesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateRouteDto, actorId: string) {
    const existing = await this.prisma.route.findUnique({ where: { name: dto.name } });
    if (existing) {
      throw new ConflictException('A route with this name already exists.');
    }

    const route = await this.prisma.route.create({ data: { name: dto.name } });

    await this.audit.log({
      userId: actorId,
      action: 'CREATE',
      entityType: 'Route',
      entityId: route.id,
      newValue: { name: route.name },
    });

    return route;
  }

  findAll(q?: string) {
    return this.prisma.route.findMany({ where: q?.trim() ? { name: { contains: q.trim(), mode: 'insensitive' as const } } : undefined, orderBy: { name: 'asc' }, take: PICKER_LIMIT });
  }

  async findOne(id: string) {
    const route = await this.prisma.route.findUnique({ where: { id } });
    if (!route) {
      throw new NotFoundException('Route not found.');
    }
    return route;
  }

  async update(id: string, dto: UpdateRouteDto, actorId: string) {
    const before = await this.findOne(id);
    const route = await this.prisma.route.update({ where: { id }, data: dto });

    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      entityType: 'Route',
      entityId: route.id,
      oldValue: { name: before.name, isActive: before.isActive },
      newValue: { name: route.name, isActive: route.isActive },
    });

    return route;
  }
}
