import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

@Injectable()
export class DriversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateDriverDto, actorId: string) {
    const existing = await this.prisma.driver.findUnique({
      where: {
        identityType_identityNumber: {
          identityType: dto.identityType,
          identityNumber: dto.identityNumber,
        },
      },
    });
    if (existing) {
      throw new ConflictException('A driver with this identity type and number already exists.');
    }

    return this.prisma.$transaction(async (tx) => {
      const driver = await tx.driver.create({ data: dto });

      await this.audit.log(
        {
          userId: actorId,
          action: 'CREATE',
          entityType: 'Driver',
          entityId: driver.id,
          newValue: { identityType: driver.identityType, fullName: driver.fullName },
        },
        tx,
      );

      return driver;
    });
  }

  findAll(query: PaginationQueryDto) {
    return this.prisma.driver.findMany({
      skip: query.skip,
      take: query.take,
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(id: string) {
    const driver = await this.prisma.driver.findUnique({ where: { id } });
    if (!driver) {
      throw new NotFoundException('Driver not found.');
    }
    return driver;
  }

  async update(id: string, dto: UpdateDriverDto, actorId: string) {
    const before = await this.findOne(id);

    return this.prisma.$transaction(async (tx) => {
      const driver = await tx.driver.update({ where: { id }, data: dto });

      await this.audit.log(
        {
          userId: actorId,
          action: 'UPDATE',
          entityType: 'Driver',
          entityId: driver.id,
          oldValue: { fullName: before.fullName, phone: before.phone },
          newValue: { fullName: driver.fullName, phone: driver.phone },
        },
        tx,
      );

      return driver;
    });
  }
}
