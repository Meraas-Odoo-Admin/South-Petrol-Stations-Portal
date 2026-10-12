import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RbacService } from '../rbac/rbac.service';
import { resolveReportRange } from '../common/utils/report-range';
import type { CreateStockEntryDto } from './dto/create-stock-entry.dto';
import type { CorrectStockEntryDto } from './dto/correct-stock-entry.dto';
import type { StockQueryDto } from './dto/stock-query.dto';
import {
  buildWindows,
  completePosition,
  completeWindow,
  effectiveEntries,
  positionSince,
  type PrintCounts,
  type RawEntry,
} from './stock-reconciliation';

// Registration pivot, phase 4c: blank-card stock and its reconciliation.
//
// Entries are INSERT-ONLY (a database trigger refuses UPDATE and DELETE, and
// this service has no such methods). A mistake is fixed by a CORRECTION entry
// linked to the one it corrects, with a reason. Every entry is audited. Who:
// card_stock:record writes (registration supervisors, within their own
// offices); card_stock:read reads (them, and the admins across all offices).

const ENTRY_INCLUDE = {
  desk: { select: { id: true, name: true } },
  createdBy: { select: { id: true, fullName: true } },
  registrationStation: { select: { id: true, name: true, internalCode: true } },
} as const;

// A count can be entered a little ahead of the server's clock (clock drift on a
// desk computer); more than this is a future date, which is refused.
const FUTURE_TOLERANCE_MS = 5 * 60_000;

@Injectable()
export class CardStockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rbac: RbacService,
  ) {}

  // The offices this caller may see: null = all of them.
  private scope(actorId: string): Promise<string[] | null> {
    return this.rbac.getRegistrationStationScope(actorId);
  }

  private async assertStation(actorId: string, registrationStationId: string) {
    const scope = await this.scope(actorId);
    if (scope !== null && !scope.includes(registrationStationId)) {
      throw new ForbiddenException('You do not have access to this registration station.');
    }
    const station = await this.prisma.registrationStation.findUnique({
      where: { id: registrationStationId },
      select: { id: true },
    });
    if (!station) throw new NotFoundException('Registration station not found.');
  }

  async createEntry(dto: CreateStockEntryDto, actorId: string) {
    await this.assertStation(actorId, dto.registrationStationId);
    if (dto.deskId) {
      const desk = await this.prisma.registrationDesk.findUnique({ where: { id: dto.deskId } });
      if (!desk || desk.registrationStationId !== dto.registrationStationId) {
        throw new BadRequestException('DESK_NOT_AT_THIS_STATION');
      }
    }
    if (dto.kind === 'RECEIVED' && dto.quantity < 1) {
      throw new BadRequestException('DELIVERY_NEEDS_A_QUANTITY');
    }
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
    if (occurredAt.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
      throw new BadRequestException('DATE_IN_THE_FUTURE');
    }

    const entry = await this.prisma.$transaction(async (tx) => {
      const created = await tx.stockEntry.create({
        data: {
          registrationStationId: dto.registrationStationId,
          deskId: dto.deskId ?? null,
          kind: dto.kind,
          quantity: dto.quantity,
          occurredAt,
          reason: dto.note?.trim() || null,
          createdById: actorId,
        },
        include: ENTRY_INCLUDE,
      });
      await this.audit.log(
        {
          userId: actorId,
          action: 'STOCK_ENTRY',
          entityType: 'StockEntry',
          entityId: created.id,
          newValue: {
            kind: created.kind,
            quantity: created.quantity,
            registrationStationId: created.registrationStationId,
            deskId: created.deskId,
            occurredAt: created.occurredAt.toISOString(),
          },
        },
        tx,
      );
      return created;
    });
    return entry;
  }

  // Never edits: writes a new CORRECTION entry that points at the original.
  async correct(entryId: string, dto: CorrectStockEntryDto, actorId: string) {
    const target = await this.prisma.stockEntry.findUnique({ where: { id: entryId } });
    if (!target) throw new NotFoundException('Stock entry not found.');
    await this.assertStation(actorId, target.registrationStationId);
    if (target.kind === 'CORRECTION') {
      // Always correct the original; the latest correction of it wins.
      throw new BadRequestException('CORRECT_THE_ORIGINAL');
    }

    const previous = await this.prisma.stockEntry.findFirst({
      where: { correctsEntryId: target.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { quantity: true },
    });

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.stockEntry.create({
        data: {
          registrationStationId: target.registrationStationId,
          deskId: target.deskId,
          kind: 'CORRECTION',
          quantity: dto.quantity,
          // The correction keeps the original's moment: it says what the figure
          // at THAT time really was, not that something happened now.
          occurredAt: target.occurredAt,
          correctsEntryId: target.id,
          reason: dto.reason.trim(),
          createdById: actorId,
        },
        include: ENTRY_INCLUDE,
      });
      await this.audit.log(
        {
          userId: actorId,
          action: 'STOCK_CORRECTION',
          entityType: 'StockEntry',
          entityId: created.id,
          oldValue: { correctsEntryId: target.id, quantity: previous?.quantity ?? target.quantity },
          newValue: { kind: 'CORRECTION', quantity: created.quantity, reason: created.reason },
        },
        tx,
      );
      return created;
    });
  }

  // Entries in a date range (by when they happened), newest first, each original
  // carrying its effective quantity and whether it has been corrected.
  async listEntries(query: StockQueryDto, actorId: string) {
    const range = resolveReportRange(query, 90);
    const stationIds = await this.visibleStations(actorId, query.registrationStationId);

    const rows = await this.prisma.stockEntry.findMany({
      where: {
        registrationStationId: { in: stationIds },
        occurredAt: { gte: range.start, lt: range.endExclusive },
      },
      include: ENTRY_INCLUDE,
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });
    const originals = rows.filter((r) => r.kind !== 'CORRECTION');
    const corrections = await this.prisma.stockEntry.findMany({
      where: { correctsEntryId: { in: originals.map((o) => o.id) } },
      include: ENTRY_INCLUDE,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const byOriginal = new Map<string, typeof corrections>();
    for (const c of corrections) {
      byOriginal.set(c.correctsEntryId!, [...(byOriginal.get(c.correctsEntryId!) ?? []), c]);
    }

    return {
      range: { from: range.from, to: range.to },
      entries: originals.map((o) => {
        const fixes = byOriginal.get(o.id) ?? [];
        const latest = fixes[fixes.length - 1];
        return {
          id: o.id,
          kind: o.kind,
          registrationStation: o.registrationStation,
          desk: o.desk,
          occurredAt: o.occurredAt,
          createdAt: o.createdAt,
          createdBy: o.createdBy,
          note: o.reason,
          originalQuantity: o.quantity,
          quantity: latest ? latest.quantity : o.quantity,
          corrected: Boolean(latest),
          corrections: fixes.map((f) => ({
            id: f.id,
            quantity: f.quantity,
            reason: f.reason,
            createdAt: f.createdAt,
            createdBy: f.createdBy,
          })),
        };
      }),
    };
  }

  private async visibleStations(actorId: string, requested?: string): Promise<string[]> {
    const scope = await this.scope(actorId);
    if (requested) {
      if (scope !== null && !scope.includes(requested)) {
        throw new ForbiddenException('You do not have access to this registration station.');
      }
      return [requested];
    }
    if (scope !== null) return scope;
    const all = await this.prisma.registrationStation.findMany({ select: { id: true } });
    return all.map((s) => s.id);
  }

  private async printCounts(registrationStationId: string, deskId: string | null, after: Date, upTo: Date | null): Promise<PrintCounts> {
    const groups = await this.prisma.cardPrint.groupBy({
      by: ['kind'],
      where: {
        registrationStationId,
        ...(deskId ? { deskId } : {}),
        printedAt: { gt: after, ...(upTo ? { lte: upTo } : {}) },
      },
      _count: { _all: true },
    });
    const card = groups.find((g) => g.kind === 'CARD')?._count._all ?? 0;
    const test = groups.find((g) => g.kind === 'TEST')?._count._all ?? 0;
    return { card, test, total: card + test };
  }

  // The reconciliation per office (and per desk, where counts are kept per desk).
  // A pool is the set of entries it is kept for: the whole office (deskId null,
  // compared with ALL prints at the office) or one desk (compared with that
  // desk's prints). Keep each count to one kind of pool; the two are shown
  // separately and never added together.
  async reconciliation(query: StockQueryDto, actorId: string) {
    const range = resolveReportRange(query, 90);
    const stationIds = await this.visibleStations(actorId, query.registrationStationId);
    const stations = await this.prisma.registrationStation.findMany({
      where: { id: { in: stationIds } },
      select: { id: true, name: true, internalCode: true, desks: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });

    const pools = [];
    for (const station of stations) {
      const entries = await this.prisma.stockEntry.findMany({
        where: { registrationStationId: station.id },
        select: { id: true, kind: true, quantity: true, occurredAt: true, createdAt: true, correctsEntryId: true, deskId: true },
      });
      const deskIds = [...new Set(entries.map((e) => e.deskId))];
      // Always show the office pool, even before it has an entry, so a supervisor
      // sees that nothing has been recorded yet.
      if (!deskIds.includes(null)) deskIds.unshift(null);

      for (const deskId of deskIds) {
        const raw: RawEntry[] = entries
          .filter((e) => e.deskId === deskId)
          .map(({ deskId: _d, ...rest }) => rest);
        const effective = effectiveEntries(raw);

        const openWindows = buildWindows(effective).filter(
          (w) => w.to.at.getTime() >= range.start.getTime() && w.to.at.getTime() < range.endExclusive.getTime(),
        );
        const windows = [];
        for (const w of openWindows) {
          windows.push(completeWindow(w, await this.printCounts(station.id, deskId, w.from.at, w.to.at)));
        }
        const position = positionSince(effective);
        const sinceLastCount = position
          ? completePosition(position, await this.printCounts(station.id, deskId, position.lastCount.at, null))
          : null;

        const unaccounted = windows.filter((w) => w.status === 'UNACCOUNTED').reduce((sum, w) => sum + w.difference, 0);
        pools.push({
          registrationStation: { id: station.id, name: station.name, internalCode: station.internalCode },
          desk: deskId ? (station.desks.find((d) => d.id === deskId) ?? { id: deskId, name: '' }) : null,
          entryCount: raw.filter((e) => e.kind !== 'CORRECTION').length,
          windows,
          sinceLastCount,
          totals: {
            unaccountedCards: unaccounted,
            unaccountedWindows: windows.filter((w) => w.status === 'UNACCOUNTED').length,
            negativeWindows: windows.filter((w) => w.status === 'NEGATIVE').length,
          },
        });
      }
    }
    return { range: { from: range.from, to: range.to }, pools };
  }
}
