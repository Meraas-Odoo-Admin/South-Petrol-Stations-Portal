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
// rule engine's data access touches the database. Both lookups filter on
// the municipality STAMPED on each fill-up (FillUpTransaction.
// municipalityId), never on its station's current municipality — see the
// schema comment on that column.
@Injectable()
export class FillUpsRepository implements FillUpHistoryReader {
  constructor(private readonly prisma: PrismaService) {}

  async getRecentForVehicle(
    vehicleId: string,
    municipalityId: string,
    before: Date,
    lookbackDays: number,
  ): Promise<FillUpHistoryRecord[]> {
    const rows = await this.prisma.fillUpTransaction.findMany({
      where: {
        vehicleId,
        municipalityId,
        occurredAt: { gte: new Date(before.getTime() - lookbackDays * DAY_MS), lt: before },
      },
      orderBy: { occurredAt: 'desc' },
      select: { vehicleId: true, occurredAt: true, quantityLiters: true },
    });
    return rows.map((r) => ({ ...r, quantityLiters: Number(r.quantityLiters) }));
  }

  // Unregistered plate (Phase 4a): rows with no vehicle yet, matched by the
  // normalized plate inside the municipality they were stamped with.
  async getRecentForPlate(
    normalizedPlate: string,
    municipalityId: string,
    before: Date,
    lookbackDays: number,
  ): Promise<FillUpHistoryRecord[]> {
    const rows = await this.prisma.fillUpTransaction.findMany({
      where: {
        vehicleId: null,
        normalizedPlate,
        municipalityId,
        occurredAt: { gte: new Date(before.getTime() - lookbackDays * DAY_MS), lt: before },
      },
      orderBy: { occurredAt: 'desc' },
      select: { vehicleId: true, occurredAt: true, quantityLiters: true },
    });
    return rows.map((r) => ({ ...r, quantityLiters: Number(r.quantityLiters) }));
  }

  async getRecentForOwner(
    ownerId: string,
    municipalityId: string,
    before: Date,
    lookbackDays: number,
  ): Promise<FillUpHistoryRecord[]> {
    const rows = await this.prisma.fillUpTransaction.findMany({
      where: {
        vehicle: { ownerId },
        municipalityId,
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
    ownerId: string | null;
    rule: RuleFailureReason;
    at: Date;
  }): Promise<{ id: string } | null> {
    const grant = await this.prisma.standingException.findFirst({
      where: {
        OR: params.ownerId
          ? [{ vehicleId: params.vehicleId }, { ownerId: params.ownerId }]
          : [{ vehicleId: params.vehicleId }],
        rules: { has: params.rule },
        revokedAt: null,
        AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gte: params.at } }] }],
      },
      select: { id: true },
    });
    return grant;
  }
}
