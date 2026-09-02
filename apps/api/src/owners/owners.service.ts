import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateOwnerDto } from './dto/create-owner.dto';
import { UpdateOwnerDto } from './dto/update-owner.dto';
import { FindOwnersQueryDto } from './dto/find-owners-query.dto';

@Injectable()
export class OwnersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateOwnerDto, actorId: string) {
    const existing = await this.prisma.vehicleOwner.findUnique({
      where: {
        identityType_identityNumber: {
          identityType: dto.identityType,
          identityNumber: dto.identityNumber,
        },
      },
    });
    if (existing) {
      throw new ConflictException('An owner with this identity type and number already exists.');
    }

    return this.prisma.$transaction(async (tx) => {
      const owner = await tx.vehicleOwner.create({ data: dto });

      await this.audit.log(
        {
          userId: actorId,
          action: 'CREATE',
          entityType: 'VehicleOwner',
          entityId: owner.id,
          newValue: { identityType: owner.identityType, fullName: owner.fullName },
        },
        tx,
      );

      return owner;
    });
  }

  findAll(query: FindOwnersQueryDto) {
    const search = query.search?.trim();
    return this.prisma.vehicleOwner.findMany({
      where: search
        ? {
            OR: [
              { fullName: { contains: search } },
              { identityNumber: { contains: search } },
            ],
          }
        : undefined,
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

  // Same "reveal is the auditable action, not just holding the permission"
  // policy as DriversService.revealIdentity — see that file's history for
  // the original reasoning (round 4 item 10).
  async revealIdentity(id: string, actorId: string) {
    const owner = await this.findOne(id);
    await this.audit.log({
      userId: actorId,
      action: 'REVEAL_NATIONAL_ID',
      entityType: 'VehicleOwner',
      entityId: id,
      // Never log the actual national ID (CLAUDE.md rule 10) — just that a
      // reveal happened.
      newValue: { revealed: true },
    });
    return { identityNumber: owner.identityNumber };
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
