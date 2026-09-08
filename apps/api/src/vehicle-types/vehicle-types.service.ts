import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateVehicleTypeDto } from './dto/create-vehicle-type.dto';
import { UpdateVehicleTypeDto } from './dto/update-vehicle-type.dto';

// Settings-managed lookup list — same shape as MunicipalitiesService. Round
// 12: replaces Vehicle.vehicleType's old free-text field so admin/
// system_admin manage the category list themselves, without a deploy.
@Injectable()
export class VehicleTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateVehicleTypeDto, actorId: string) {
    const existing = await this.prisma.vehicleType.findUnique({ where: { name: dto.name } });
    if (existing) {
      throw new ConflictException('A vehicle type with this name already exists.');
    }

    const vehicleType = await this.prisma.vehicleType.create({ data: { name: dto.name } });

    await this.audit.log({
      userId: actorId,
      action: 'CREATE',
      entityType: 'VehicleType',
      entityId: vehicleType.id,
      newValue: { name: vehicleType.name },
    });

    return vehicleType;
  }

  findAll() {
    return this.prisma.vehicleType.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    const vehicleType = await this.prisma.vehicleType.findUnique({ where: { id } });
    if (!vehicleType) {
      throw new NotFoundException('Vehicle type not found.');
    }
    return vehicleType;
  }

  async update(id: string, dto: UpdateVehicleTypeDto, actorId: string) {
    const before = await this.findOne(id);
    const vehicleType = await this.prisma.vehicleType.update({ where: { id }, data: dto });

    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      entityType: 'VehicleType',
      entityId: vehicleType.id,
      oldValue: { name: before.name, isActive: before.isActive },
      newValue: { name: vehicleType.name, isActive: vehicleType.isActive },
    });

    return vehicleType;
  }
}
