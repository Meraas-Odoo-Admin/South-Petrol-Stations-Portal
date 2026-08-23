import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { FillUpHistoryReader, FillUpHistoryRecord } from './rule-engine/types';

const DAY_MS = 24 * 60 * 60 * 1000;

// Prisma-backed implementation of FillUpHistoryReader — the only place the
// rule engine's data access touches the database.
@Injectable()
export class FillUpsRepository implements FillUpHistoryReader {
  constructor(private readonly prisma: PrismaService) {}

  async getRecentForVehicle(
    vehicleId: string,
    before: Date,
    lookbackDays: number,
  ): Promise<FillUpHistoryRecord[]> {
    const rows = await this.prisma.fillUpTransaction.findMany({
      where: {
        vehicleId,
        occurredAt: { gte: new Date(before.getTime() - lookbackDays * DAY_MS), lt: before },
      },
      orderBy: { occurredAt: 'desc' },
      select: { occurredAt: true },
    });
    return rows;
  }

  async getRecentForDriver(
    driverId: string,
    before: Date,
    lookbackDays: number,
  ): Promise<FillUpHistoryRecord[]> {
    const rows = await this.prisma.fillUpTransaction.findMany({
      where: {
        driverId,
        occurredAt: { gte: new Date(before.getTime() - lookbackDays * DAY_MS), lt: before },
      },
      orderBy: { occurredAt: 'desc' },
      select: { occurredAt: true },
    });
    return rows;
  }
}
