import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  FillUpHistoryReader,
  FillUpHistoryRecord,
  RuleFailureReason,
  StandingExceptionReader,
} from './rule-engine/types';

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
      select: { vehicleId: true, occurredAt: true, quantityLiters: true },
    });
    return rows.map((r) => ({ ...r, quantityLiters: Number(r.quantityLiters) }));
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
      select: { vehicleId: true, occurredAt: true, quantityLiters: true },
    });
    return rows.map((r) => ({ ...r, quantityLiters: Number(r.quantityLiters) }));
  }
}

// Prisma-backed implementation of StandingExceptionReader.
@Injectable()
export class StandingExceptionsRepository implements StandingExceptionReader {
  constructor(private readonly prisma: PrismaService) {}

  async findActiveCovering(params: {
    vehicleId: string;
    driverId: string;
    rule: RuleFailureReason;
    at: Date;
  }): Promise<{ id: string } | null> {
    const grant = await this.prisma.standingException.findFirst({
      where: {
        OR: [{ vehicleId: params.vehicleId }, { driverId: params.driverId }],
        rules: { has: params.rule },
        revokedAt: null,
        AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gte: params.at } }] }],
      },
      select: { id: true },
    });
    return grant;
  }
}
