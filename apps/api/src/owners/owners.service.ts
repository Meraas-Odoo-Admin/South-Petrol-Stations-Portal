import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateOwnerDto } from './dto/create-owner.dto';
import { UpdateOwnerDto } from './dto/update-owner.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

@Injectable()
export class OwnersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateOwnerDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const owner = await tx.vehicleOwner.create({ data: dto });

      await this.audit.log(
        {
          userId: actorId,
          action: 'CREATE',
          entityType: 'VehicleOwner',
          entityId: owner.id,
          newValue: { fullName: owner.fullName },
        },
        tx,
      );

      return owner;
    });
  }

  findAll(query: PaginationQueryDto) {
    return this.prisma.vehicleOwner.findMany({
      skip: query.skip,
      take: query.take,
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(id: string) {
    const owner = await this.prisma.vehicleOwner.findUnique({ where: { id } });
    if (!owner) {
      throw new NotFoundException('Vehicle owner not found.');
    }
    return owner;
  }

  async update(id: string, dto: UpdateOwnerDto, actorId: string) {
    const before = await this.findOne(id);

    return this.prisma.$transaction(async (tx) => {
      const owner = await tx.vehicleOwner.update({ where: { id }, data: dto });

      await this.audit.log(
        {
          userId: actorId,
          action: 'UPDATE',
          entityType: 'VehicleOwner',
          entityId: owner.id,
          oldValue: { fullName: before.fullName, phone: before.phone, address: before.address },
          newValue: { fullName: owner.fullName, phone: owner.phone, address: owner.address },
        },
        tx,
      );

      return owner;
    });
  }
}
