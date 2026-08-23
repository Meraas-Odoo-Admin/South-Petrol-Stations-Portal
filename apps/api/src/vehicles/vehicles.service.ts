import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { FindVehiclesQueryDto } from './dto/find-vehicles-query.dto';
import { PlateChangeDto } from './dto/plate-change.dto';

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
}
