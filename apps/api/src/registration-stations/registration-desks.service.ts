import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RegistrationStationsService } from './registration-stations.service';
import { CreateRegistrationDeskDto } from './dto/create-registration-desk.dto';
import { UpdateRegistrationDeskDto } from './dto/update-registration-desk.dto';

// Registration pivot, phase 3: desks at a registration station. Admins
// manage them next to the station; registration staff read them (scoped,
// through RegistrationStationsService.findOne) to pick theirs once per
// device. Every card records its desk.
@Injectable()
export class RegistrationDesksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly registrationStations: RegistrationStationsService,
  ) {}

  async list(registrationStationId: string, userId: string) {
    await this.registrationStations.findOne(registrationStationId, userId);
    return this.prisma.registrationDesk.findMany({
      where: { registrationStationId },
      orderBy: { name: 'asc' },
    });
  }

  private async assertNameFree(registrationStationId: string, name: string, exceptId?: string) {
    const existing = await this.prisma.registrationDesk.findUnique({
      where: { registrationStationId_name: { registrationStationId, name } },
    });
    if (existing && existing.id !== exceptId) {
      throw new ConflictException('DESK_NAME_TAKEN');
    }
  }

  async create(registrationStationId: string, dto: CreateRegistrationDeskDto, actorId: string) {
    await this.registrationStations.findOne(registrationStationId, actorId);
    const name = dto.name.trim();
    await this.assertNameFree(registrationStationId, name);
    return this.prisma.$transaction(async (tx) => {
      const desk = await tx.registrationDesk.create({ data: { ...dto, name, registrationStationId } });
      await this.audit.log(
        {
          userId: actorId,
          action: 'CREATE',
          entityType: 'RegistrationDesk',
          entityId: desk.id,
          newValue: { registrationStationId, name: desk.name, printerModel: desk.printerModel, printerSerial: desk.printerSerial },
        },
        tx,
      );
      return desk;
    });
  }

  async update(id: string, dto: UpdateRegistrationDeskDto, actorId: string) {
    const before = await this.prisma.registrationDesk.findUnique({ where: { id } });
    if (!before) {
      throw new NotFoundException('Registration desk not found.');
    }
    await this.registrationStations.findOne(before.registrationStationId, actorId);
    const name = dto.name?.trim();
    if (name && name !== before.name) {
      await this.assertNameFree(before.registrationStationId, name, id);
    }
    return this.prisma.$transaction(async (tx) => {
      const desk = await tx.registrationDesk.update({ where: { id }, data: { ...dto, ...(name ? { name } : {}) } });
      await this.audit.log(
        {
          userId: actorId,
          action: 'UPDATE',
          entityType: 'RegistrationDesk',
          entityId: id,
          oldValue: { name: before.name, printerModel: before.printerModel, printerSerial: before.printerSerial, isActive: before.isActive },
          newValue: { name: desk.name, printerModel: desk.printerModel, printerSerial: desk.printerSerial, isActive: desk.isActive },
        },
        tx,
      );
      return desk;
    });
  }
}
