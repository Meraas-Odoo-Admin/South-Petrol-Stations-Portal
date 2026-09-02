import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateStandingExceptionDto } from './dto/create-standing-exception.dto';
import { FindStandingExceptionsQueryDto } from './dto/find-standing-exceptions-query.dto';

// Interim design — not from the original client questionnaire, flagged in
// docs/OPEN_ITEMS.md. See the schema comment on StandingException for the
// full reasoning.
@Injectable()
export class StandingExceptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateStandingExceptionDto, actorId: string) {
    if (!dto.ownerId && !dto.vehicleId) {
      throw new BadRequestException('At least one of ownerId or vehicleId is required.');
    }
    if (dto.ownerId) {
      const owner = await this.prisma.vehicleOwner.findUnique({ where: { id: dto.ownerId } });
      if (!owner) {
        throw new NotFoundException('Vehicle owner not found.');
      }
    }
    if (dto.vehicleId) {
      const vehicle = await this.prisma.vehicle.findUnique({ where: { id: dto.vehicleId } });
      if (!vehicle) {
        throw new NotFoundException('Vehicle not found.');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.standingException.create({
        data: {
          ownerId: dto.ownerId,
          vehicleId: dto.vehicleId,
          rules: dto.rules,
          reason: dto.reason,
          grantedById: actorId,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        },
      });

      await this.audit.log(
        {
          userId: actorId,
          action: 'GRANT_STANDING_EXCEPTION',
          entityType: 'StandingException',
          entityId: created.id,
          newValue: {
            ownerId: created.ownerId,
            vehicleId: created.vehicleId,
            rules: created.rules,
            reason: created.reason,
            expiresAt: created.expiresAt,
          },
        },
        tx,
      );

      return created;
    });
  }

  async revoke(id: string, actorId: string) {
    const existing = await this.prisma.standingException.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Standing exception not found.');
    }
    if (existing.revokedAt) {
      throw new ConflictException('This standing exception has already been revoked.');
    }

    return this.prisma.$transaction(async (tx) => {
      const revoked = await tx.standingException.update({
        where: { id },
        data: { revokedById: actorId, revokedAt: new Date() },
      });

      await this.audit.log(
        {
          userId: actorId,
          action: 'REVOKE_STANDING_EXCEPTION',
          entityType: 'StandingException',
          entityId: id,
          oldValue: { revokedAt: null },
          newValue: { revokedAt: revoked.revokedAt },
        },
        tx,
      );

      return revoked;
    });
  }

  findAll(query: FindStandingExceptionsQueryDto) {
    const activeOnly = query.activeOnly === 'true';
    return this.prisma.standingException.findMany({
      where: {
        ownerId: query.ownerId || undefined,
        vehicleId: query.vehicleId || undefined,
        ...(activeOnly
          ? { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }] }
          : {}),
      },
      include: {
        owner: { select: { id: true, fullName: true } },
        vehicle: { select: { id: true, internalCode: true, currentPlate: true } },
        grantedBy: { select: { id: true, fullName: true, username: true } },
        revokedBy: { select: { id: true, fullName: true, username: true } },
      },
      orderBy: { grantedAt: 'desc' },
    });
  }
}
