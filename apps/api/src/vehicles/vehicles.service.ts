import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { VehicleChangeType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { FindVehiclesQueryDto } from './dto/find-vehicles-query.dto';
import { PlateChangeDto } from './dto/plate-change.dto';
import { CreateVehicleChangeRequestDto } from './dto/create-change-request.dto';
import { RejectVehicleChangeRequestDto } from './dto/reject-change-request.dto';
import { FindChangeRequestsQueryDto } from './dto/find-change-requests-query.dto';

// The single field on Vehicle that a given changeType targets, and the
// parallel history table/column it's tracked in once a value has been
// approved-changed at least once. Centralizing this mapping is what keeps
// setOrRequestChange/approveChangeRequest generic across both change
// types instead of two near-duplicate code paths.
const CHANGE_TYPE_FIELD: Record<VehicleChangeType, 'chassisNumber' | 'registrationBooklet'> = {
  [VehicleChangeType.CHASSIS_CHANGE]: 'chassisNumber',
  [VehicleChangeType.BOOKLET_CHANGE]: 'registrationBooklet',
};

// Prisma's findUnique `where` requires a literal known unique-field key —
// a computed `{ [field]: value }` doesn't type-check against
// VehicleWhereUniqueInput, hence the explicit branch here rather than at
// every call site.
function findVehicleByChangeValue(
  prisma: PrismaService,
  changeType: VehicleChangeType,
  value: string,
) {
  return changeType === VehicleChangeType.CHASSIS_CHANGE
    ? prisma.vehicle.findUnique({ where: { chassisNumber: value } })
    : prisma.vehicle.findUnique({ where: { registrationBooklet: value } });
}

@Injectable()
export class VehiclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateVehicleDto, actorId: string) {
    const existingByCode = await this.prisma.vehicle.findUnique({
      where: { internalCode: dto.internalCode },
    });
    if (existingByCode) {
      throw new ConflictException('internalCode is already in use.');
    }

    const existingByPlate = await this.prisma.vehicle.findUnique({
      where: { currentPlate: dto.currentPlate },
    });
    if (existingByPlate) {
      throw new ConflictException('currentPlate is already in use.');
    }

    if (dto.chassisNumber) {
      const existingByChassis = await this.prisma.vehicle.findUnique({
        where: { chassisNumber: dto.chassisNumber },
      });
      if (existingByChassis) {
        throw new ConflictException('chassisNumber is already in use.');
      }
    }

    if (dto.registrationBooklet) {
      const existingByBooklet = await this.prisma.vehicle.findUnique({
        where: { registrationBooklet: dto.registrationBooklet },
      });
      if (existingByBooklet) {
        throw new ConflictException('registrationBooklet is already in use.');
      }
    }

    if (dto.ownerId) {
      const owner = await this.prisma.vehicleOwner.findUnique({ where: { id: dto.ownerId } });
      if (!owner) {
        throw new NotFoundException('Vehicle owner not found.');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const vehicle = await tx.vehicle.create({ data: dto });

      // Seed the plate history with the vehicle's initial plate so
      // plate-change always has a current (validTo: null) row to close.
      await tx.vehiclePlateHistory.create({
        data: { vehicleId: vehicle.id, plate: vehicle.currentPlate },
      });

      await this.audit.log(
        {
          userId: actorId,
          action: 'CREATE',
          entityType: 'Vehicle',
          entityId: vehicle.id,
          newValue: { internalCode: vehicle.internalCode, currentPlate: vehicle.currentPlate },
        },
        tx,
      );

      return vehicle;
    });
  }

  findAll(query: FindVehiclesQueryDto) {
    return this.prisma.vehicle.findMany({
      where: {
        internalCode: query.internalCode ? { contains: query.internalCode } : undefined,
        currentPlate: query.currentPlate ? { contains: query.currentPlate } : undefined,
        chassisNumber: query.chassisNumber ? { contains: query.chassisNumber } : undefined,
        // Independent OR search — a caller who doesn't know whether their
        // typed term is an internal code or a plate (the "find this
        // vehicle" use case from the fill-up form / lookup search) needs
        // both tried, not ANDed against the precise fields above.
        OR: query.search
          ? [
              { internalCode: { contains: query.search, mode: 'insensitive' } },
              { currentPlate: { contains: query.search, mode: 'insensitive' } },
            ]
          : undefined,
      },
      skip: query.skip,
      take: query.take,
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(id: string) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id } });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found.');
    }
    return vehicle;
  }

  // Separate from findOne — that one stays a lean single-row lookup used
  // internally by update/changePlate/addDriver/etc (no reason to pay for
  // plate history + driver joins on every internal call). This is only for
  // GET /vehicles/:id, the actual detail page — plate history (oldest
  // first, so "history" reads chronologically) and driver associations
  // (with isPrimary) were previously not returned by the API at all, so
  // the vehicle detail page had nowhere to source them from (item 6).
  async findOneDetailed(id: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, fullName: true } },
        plateHistory: { orderBy: { validFrom: 'asc' } },
        drivers: {
          include: { driver: { select: { id: true, fullName: true, identityType: true, identityNumber: true } } },
        },
      },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found.');
    }
    return vehicle;
  }

  async update(id: string, dto: UpdateVehicleDto, actorId: string) {
    const before = await this.findOne(id);

    if (dto.ownerId) {
      const owner = await this.prisma.vehicleOwner.findUnique({ where: { id: dto.ownerId } });
      if (!owner) {
        throw new NotFoundException('Vehicle owner not found.');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const vehicle = await tx.vehicle.update({ where: { id }, data: dto });

      await this.audit.log(
        {
          userId: actorId,
          action: 'UPDATE',
          entityType: 'Vehicle',
          entityId: vehicle.id,
          oldValue: { ownerId: before.ownerId, usageType: before.usageType },
          newValue: { ownerId: vehicle.ownerId, usageType: vehicle.usageType },
        },
        tx,
      );

      return vehicle;
    });
  }

  // Dedicated endpoint, not part of general update(): closes the current
  // VehiclePlateHistory row and opens a new one atomically with the
  // Vehicle.currentPlate write, so fill-up history never gets orphaned by a
  // plate change (docs/IMPLEMENTATION_PLAN.md §11, M2 "done means").
  async changePlate(id: string, dto: PlateChangeDto, actorId: string) {
    const vehicle = await this.findOne(id);

    if (dto.newPlate === vehicle.currentPlate) {
      throw new ConflictException('newPlate is the same as the current plate.');
    }

    const existingByPlate = await this.prisma.vehicle.findUnique({
      where: { currentPlate: dto.newPlate },
    });
    if (existingByPlate) {
      throw new ConflictException('currentPlate is already in use by another vehicle.');
    }

    return this.prisma.$transaction(async (tx) => {
      const currentHistoryRow = await tx.vehiclePlateHistory.findFirst({
        where: { vehicleId: id, validTo: null },
        orderBy: { validFrom: 'desc' },
      });
      if (currentHistoryRow) {
        await tx.vehiclePlateHistory.update({
          where: { id: currentHistoryRow.id },
          data: { validTo: new Date() },
        });
      }

      await tx.vehiclePlateHistory.create({
        data: { vehicleId: id, plate: dto.newPlate },
      });

      const updated = await tx.vehicle.update({
        where: { id },
        data: { currentPlate: dto.newPlate },
      });

      await this.audit.log(
        {
          userId: actorId,
          action: 'PLATE_CHANGE',
          entityType: 'Vehicle',
          entityId: id,
          oldValue: { currentPlate: vehicle.currentPlate },
          newValue: { currentPlate: updated.currentPlate },
        },
        tx,
      );

      return updated;
    });
  }

  async addDriver(vehicleId: string, driverId: string, isPrimary: boolean, actorId: string) {
    await this.findOne(vehicleId);
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) {
      throw new NotFoundException('Driver not found.');
    }

    await this.prisma.$transaction(async (tx) => {
      // Invariant: at most one DriverVehicle row with isPrimary: true per
      // vehicleId. Enforced here, not at the DB level — Prisma's schema
      // doesn't support partial unique indexes without hand-written SQL,
      // and a service-layer demotion inside this transaction is enough.
      // Only runs when the incoming row is itself becoming primary; a
      // non-primary upsert must not touch anyone else's isPrimary flag.
      if (isPrimary) {
        await tx.driverVehicle.updateMany({
          where: { vehicleId, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      // Re-adding an existing (driverId, vehicleId) pair is intentionally
      // an update-in-place (e.g. to flip isPrimary), not a rejected
      // duplicate — don't "fix" this into a conflict error later.
      await tx.driverVehicle.upsert({
        where: { driverId_vehicleId: { driverId, vehicleId } },
        create: { driverId, vehicleId, isPrimary },
        update: { isPrimary },
      });

      await this.audit.log(
        {
          userId: actorId,
          action: 'ADD_VEHICLE_DRIVER',
          entityType: 'Vehicle',
          entityId: vehicleId,
          newValue: { driverId, isPrimary },
        },
        tx,
      );
    });

    return this.findOne(vehicleId);
  }

  async removeDriver(vehicleId: string, driverId: string, actorId: string) {
    await this.findOne(vehicleId);

    await this.prisma.$transaction(async (tx) => {
      await tx.driverVehicle.deleteMany({ where: { vehicleId, driverId } });

      await this.audit.log(
        {
          userId: actorId,
          action: 'REMOVE_VEHICLE_DRIVER',
          entityType: 'Vehicle',
          entityId: vehicleId,
          oldValue: { driverId },
        },
        tx,
      );
    });

    return this.findOne(vehicleId);
  }

  // ── Chassis/registration-booklet change requests (anti-fraud) ────────
  //
  // Displacing an ALREADY-SET chassisNumber/registrationBooklet is gated
  // behind supervisor/admin approval (VehicleChangeRequest) — the
  // requested value never takes effect until approved. A first-time
  // null -> value set is NOT gated: there's no established identity to
  // displace yet, so approval would add friction without closing any
  // actual hole (the @unique constraint already blocks the abuse case of
  // reusing someone else's value). This branch is generic on "was there
  // already a non-null value" — not hardcoded to chassisNumber or
  // registrationBooklet specifically.

  async setOrRequestChange(vehicleId: string, dto: CreateVehicleChangeRequestDto, actorId: string) {
    const vehicle = await this.findOne(vehicleId);
    const field = CHANGE_TYPE_FIELD[dto.changeType];
    const currentValue = vehicle[field];

    if (currentValue === dto.requestedValue) {
      throw new ConflictException('requestedValue is the same as the current value.');
    }

    const existing = await findVehicleByChangeValue(this.prisma, dto.changeType, dto.requestedValue);
    if (existing) {
      throw new ConflictException(`${field} is already in use by another vehicle.`);
    }

    if (currentValue === null) {
      const updated = await this.prisma.$transaction(async (tx) => {
        const result = await tx.vehicle.update({
          where: { id: vehicleId },
          data: { [field]: dto.requestedValue },
        });

        await this.audit.log(
          {
            userId: actorId,
            action: dto.changeType === VehicleChangeType.CHASSIS_CHANGE ? 'CHASSIS_SET' : 'BOOKLET_SET',
            entityType: 'Vehicle',
            entityId: vehicleId,
            newValue: { [field]: dto.requestedValue },
          },
          tx,
        );

        return result;
      });

      return { requiresApproval: false as const, vehicle: updated };
    }

    const pending = await this.prisma.vehicleChangeRequest.findFirst({
      where: { vehicleId, changeType: dto.changeType, status: 'PENDING' },
    });
    if (pending) {
      throw new ConflictException(
        'A pending change request already exists for this vehicle and change type.',
      );
    }

    const request = await this.prisma.$transaction(async (tx) => {
      const created = await tx.vehicleChangeRequest.create({
        data: {
          vehicleId,
          changeType: dto.changeType,
          currentValue,
          requestedValue: dto.requestedValue,
          reason: dto.reason,
          proofReference: dto.proofReference,
          requestedById: actorId,
        },
      });

      await this.audit.log(
        {
          userId: actorId,
          action: 'VEHICLE_CHANGE_REQUESTED',
          entityType: 'VehicleChangeRequest',
          entityId: created.id,
          newValue: { vehicleId, changeType: dto.changeType, requestedValue: dto.requestedValue },
        },
        tx,
      );

      return created;
    });

    return { requiresApproval: true as const, changeRequest: request };
  }

  listChangeRequests(query: FindChangeRequestsQueryDto) {
    return this.prisma.vehicleChangeRequest.findMany({
      where: query.status ? { status: query.status } : undefined,
      include: { vehicle: { select: { id: true, internalCode: true, currentPlate: true } } },
      skip: query.skip,
      take: query.take,
      orderBy: { createdAt: 'desc' },
    });
  }

  private async findChangeRequestOrThrow(id: string) {
    const request = await this.prisma.vehicleChangeRequest.findUnique({ where: { id } });
    if (!request) {
      throw new NotFoundException('Vehicle change request not found.');
    }
    return request;
  }

  async approveChangeRequest(id: string, actorId: string) {
    const request = await this.findChangeRequestOrThrow(id);
    if (request.status !== 'PENDING') {
      throw new ConflictException(`This change request has already been ${request.status.toLowerCase()}.`);
    }

    const field = CHANGE_TYPE_FIELD[request.changeType];

    // Re-check at approval time, not just at request time — the target
    // value's availability can change in between (same reasoning as
    // changePlate's own re-check).
    const existing = await findVehicleByChangeValue(this.prisma, request.changeType, request.requestedValue);
    if (existing && existing.id !== request.vehicleId) {
      throw new ConflictException(`${field} is already in use by another vehicle.`);
    }

    return this.prisma.$transaction(async (tx) => {
      if (request.changeType === VehicleChangeType.CHASSIS_CHANGE) {
        const currentHistoryRow = await tx.vehicleChassisHistory.findFirst({
          where: { vehicleId: request.vehicleId, validTo: null },
          orderBy: { validFrom: 'desc' },
        });
        if (currentHistoryRow) {
          await tx.vehicleChassisHistory.update({
            where: { id: currentHistoryRow.id },
            data: { validTo: new Date() },
          });
        }
        await tx.vehicleChassisHistory.create({
          data: { vehicleId: request.vehicleId, chassisNumber: request.requestedValue },
        });
      } else {
        const currentHistoryRow = await tx.vehicleBookletHistory.findFirst({
          where: { vehicleId: request.vehicleId, validTo: null },
          orderBy: { validFrom: 'desc' },
        });
        if (currentHistoryRow) {
          await tx.vehicleBookletHistory.update({
            where: { id: currentHistoryRow.id },
            data: { validTo: new Date() },
          });
        }
        await tx.vehicleBookletHistory.create({
          data: { vehicleId: request.vehicleId, registrationBooklet: request.requestedValue },
        });
      }

      await tx.vehicle.update({
        where: { id: request.vehicleId },
        data: { [field]: request.requestedValue },
      });

      const updatedRequest = await tx.vehicleChangeRequest.update({
        where: { id },
        data: { status: 'APPROVED', decidedById: actorId, decidedAt: new Date() },
      });

      await this.audit.log(
        {
          userId: actorId,
          action: 'VEHICLE_CHANGE_APPROVED',
          entityType: 'VehicleChangeRequest',
          entityId: id,
          oldValue: { [field]: request.currentValue },
          newValue: { [field]: request.requestedValue },
        },
        tx,
      );

      return updatedRequest;
    });
  }

  async rejectChangeRequest(id: string, dto: RejectVehicleChangeRequestDto, actorId: string) {
    const request = await this.findChangeRequestOrThrow(id);
    if (request.status !== 'PENDING') {
      throw new ConflictException(`This change request has already been ${request.status.toLowerCase()}.`);
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedRequest = await tx.vehicleChangeRequest.update({
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
          action: 'VEHICLE_CHANGE_REJECTED',
          entityType: 'VehicleChangeRequest',
          entityId: id,
          newValue: { rejectionReason: dto.reason },
        },
        tx,
      );

      return updatedRequest;
    });
  }
}
