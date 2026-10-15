import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { checkArabicPersonName } from '@fuel-tracking/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateOwnerDto } from './dto/create-owner.dto';
import { UpdateOwnerDto } from './dto/update-owner.dto';
import { FindOwnersQueryDto } from './dto/find-owners-query.dto';
import { CreateOwnerChangeRequestDto } from './dto/create-owner-change-request.dto';
import { RejectOwnerChangeRequestDto } from './dto/reject-owner-change-request.dto';
import { FindOwnerChangeRequestsQueryDto } from './dto/find-owner-change-requests-query.dto';
import { RegistrationStationsService } from '../registration-stations/registration-stations.service';
import type { Prisma } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class OwnersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly registrationStations: RegistrationStationsService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(dto: CreateOwnerDto, actorId: string) {
    const { registrationStationId, ...ownerFields } = dto;
    await this.registrationStations.assertCanRegisterAt(registrationStationId, actorId);

    // ── an individual ───────────────────────────────────────────────
    const { identityType, identityNumber } = dto;
    const existing = await this.prisma.vehicleOwner.findUnique({
      where: { identityType_identityNumber: { identityType, identityNumber } },
    });
    if (existing) {
      throw new ConflictException('An owner with this identity type and number already exists.');
    }

    return this.prisma.$transaction(async (tx) => {
      const owner = await tx.vehicleOwner.create({
        data: {
          ownerKind: 'INDIVIDUAL',
          identityType,
          identityNumber,
          fullName: ownerFields.fullName.trim().replace(/\s+/g, ' '),
          phone: ownerFields.phone,
          address: ownerFields.address,
        },
      });

      await this.audit.log(
        {
          userId: actorId,
          action: 'CREATE',
          entityType: 'VehicleOwner',
          entityId: owner.id,
          newValue: { identityType: owner.identityType, fullName: owner.fullName, registrationStationId },
        },
        tx,
      );

      return owner;
    });
  }

  findAll(query: FindOwnersQueryDto) {
    if (Boolean(query.identityType) !== Boolean(query.identityNumber)) {
      throw new BadRequestException('identityType and identityNumber must be given together.');
    }
    if (query.identityType && query.identityNumber) {
      return this.prisma.vehicleOwner.findMany({
        where: { identityType: query.identityType, identityNumber: query.identityNumber.trim() },
      });
    }
    const search = query.search?.trim();
    return this.prisma.vehicleOwner.findMany({
      where: {
        ...(search
          ? {
              OR: [
                { fullName: { contains: search, mode: 'insensitive' as const } },
                { identityNumber: { contains: search } },
              ],
            }
          : {}),
      },
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
    const data: Prisma.VehicleOwnerUpdateInput = { ...dto };
    if (dto.fullName !== undefined) {
      // The same name rule as at registration.
      const check = checkArabicPersonName(dto.fullName, 'اسم المالك');
      if (!check.ok) throw new BadRequestException(check.message);
      data.fullName = check.value;
    }

    return this.prisma.$transaction(async (tx) => {
      const owner = await tx.vehicleOwner.update({ where: { id }, data });

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

  // Round 20: identityType/identityNumber are deliberately excluded from
  // UpdateOwnerDto (see that file's comment) — this is the sanctioned
  // side-channel around that immutability, mirroring
  // VehiclesService.setOrRequestChange's anti-fraud gate for chassis/
  // booklet/plate. Unlike that method there is no "first value ever set"
  // bypass case: identityType/identityNumber are required at owner
  // creation, so every correction here is a genuine displacement of an
  // already-established identity and always goes through approval.
  async requestIdentityChange(ownerId: string, dto: CreateOwnerChangeRequestDto, actorId: string) {
    const request = await this.requestIdentityChangeCore(ownerId, dto, actorId);
    await this.notifications.notifyOfficesOf(actorId, ['notifications:office_events'], {
      kind: 'CORRECTION_REQUESTED',
      title: 'طلب تصحيح هوية مالك بانتظار الموافقة',
      body: 'قدّم موظف تسجيل طلب تصحيح لرقم هوية مالك.',
      link: '/vehicles/change-requests',
      entityType: 'VehicleOwner',
      entityId: ownerId,
    });
    return request;
  }

  private async requestIdentityChangeCore(ownerId: string, dto: CreateOwnerChangeRequestDto, actorId: string) {
    const owner = await this.findOne(ownerId);

    if (owner.identityType === dto.identityType && owner.identityNumber === dto.identityNumber) {
      throw new ConflictException('The requested identity is the same as the current one.');
    }

    // Compound-unique on VehicleOwner — always a conflict candidate, unlike
    // most VehicleChangeRequest types.
    const conflict = await this.prisma.vehicleOwner.findUnique({
      where: {
        identityType_identityNumber: { identityType: dto.identityType, identityNumber: dto.identityNumber },
      },
    });
    if (conflict) {
      throw new ConflictException('Another owner already has this identity type and number.');
    }

    const pending = await this.prisma.ownerChangeRequest.findFirst({
      where: { ownerId, status: 'PENDING' },
    });
    if (pending) {
      throw new ConflictException('A pending identity change request already exists for this owner.');
    }

    const request = await this.prisma.$transaction(async (tx) => {
      const created = await tx.ownerChangeRequest.create({
        data: {
          ownerId,
          currentIdentityType: owner.identityType,
          currentIdentityNumber: owner.identityNumber,
          requestedIdentityType: dto.identityType,
          requestedIdentityNumber: dto.identityNumber,
          reason: dto.reason,
          requestedById: actorId,
        },
      });

      await this.audit.log(
        {
          userId: actorId,
          action: 'OWNER_IDENTITY_CHANGE_REQUESTED',
          entityType: 'OwnerChangeRequest',
          entityId: created.id,
          // Never log the actual identity numbers (CLAUDE.md rule 10) —
          // just the types involved.
          newValue: { ownerId, currentIdentityType: owner.identityType, requestedIdentityType: dto.identityType },
        },
        tx,
      );

      return created;
    });

    return request;
  }

  listChangeRequests(query: FindOwnerChangeRequestsQueryDto) {
    return this.prisma.ownerChangeRequest.findMany({
      where: query.status ? { status: query.status } : undefined,
      include: { owner: { select: { id: true, fullName: true } } },
      skip: query.skip,
      take: query.take,
      orderBy: { createdAt: 'desc' },
    });
  }

  private async findChangeRequestOrThrow(id: string) {
    const request = await this.prisma.ownerChangeRequest.findUnique({ where: { id } });
    if (!request) {
      throw new NotFoundException('Owner change request not found.');
    }
    return request;
  }

  async approveChangeRequest(id: string, actorId: string) {
    const decided = await this.approveChangeRequestCore(id, actorId);
    await this.notifications.notifyUsers([decided.requestedById], {
      kind: 'CORRECTION_APPROVED',
      title: 'تمت الموافقة على طلب تصحيح الهوية',
      body: 'طُبّق التصحيح الذي طلبته على هوية المالك.',
      link: '/vehicles/change-requests',
      entityType: 'VehicleOwner',
      entityId: decided.ownerId,
    });
    return decided;
  }

  private async approveChangeRequestCore(id: string, actorId: string) {
    const request = await this.findChangeRequestOrThrow(id);
    if (request.status !== 'PENDING') {
      throw new ConflictException(`This change request has already been ${request.status.toLowerCase()}.`);
    }

    // Re-check at approval time, not just at request time — same
    // reasoning as VehiclesService.approveChangeRequest.
    const conflict = await this.prisma.vehicleOwner.findUnique({
      where: {
        identityType_identityNumber: {
          identityType: request.requestedIdentityType,
          identityNumber: request.requestedIdentityNumber,
        },
      },
    });
    if (conflict && conflict.id !== request.ownerId) {
      throw new ConflictException('Another owner already has this identity type and number.');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.vehicleOwner.update({
        where: { id: request.ownerId },
        data: {
          identityType: request.requestedIdentityType,
          identityNumber: request.requestedIdentityNumber,
        },
      });

      const updatedRequest = await tx.ownerChangeRequest.update({
        where: { id },
        data: { status: 'APPROVED', decidedById: actorId, decidedAt: new Date() },
      });

      await this.audit.log(
        {
          userId: actorId,
          action: 'OWNER_IDENTITY_CHANGE_APPROVED',
          entityType: 'OwnerChangeRequest',
          entityId: id,
          oldValue: { identityType: request.currentIdentityType },
          newValue: { identityType: request.requestedIdentityType },
        },
        tx,
      );

      return updatedRequest;
    });
  }

  async rejectChangeRequest(id: string, dto: RejectOwnerChangeRequestDto, actorId: string) {
    const decided = await this.rejectChangeRequestCore(id, dto, actorId);
    await this.notifications.notifyUsers([decided.requestedById], {
      kind: 'CORRECTION_REJECTED',
      title: 'رُفض طلب تصحيح الهوية',
      body: decided.rejectionReason ? `السبب: ${decided.rejectionReason}` : 'رفضه مدير المكتب.',
      link: '/vehicles/change-requests',
      entityType: 'VehicleOwner',
      entityId: decided.ownerId,
    });
    return decided;
  }

  private async rejectChangeRequestCore(id: string, dto: RejectOwnerChangeRequestDto, actorId: string) {
    const request = await this.findChangeRequestOrThrow(id);
    if (request.status !== 'PENDING') {
      throw new ConflictException(`This change request has already been ${request.status.toLowerCase()}.`);
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedRequest = await tx.ownerChangeRequest.update({
        where: { id },
        data: {
          status: 'REJECTED',
          decidedById: actorId,
          decidedAt: new Date(),
          rejectionReason: dto.reason,
        },
      });

      await this.audit.log(
        {
          userId: actorId,
          action: 'OWNER_IDENTITY_CHANGE_REJECTED',
          entityType: 'OwnerChangeRequest',
          entityId: id,
          newValue: { rejectionReason: dto.reason },
        },
        tx,
      );

      return updatedRequest;
    });
  }
}
