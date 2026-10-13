import { arabicCount } from '@fuel-tracking/shared-types';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { FuelType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RbacService } from '../rbac/rbac.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  computeLevel,
  decideAlerts,
  reconcilePeriod,
  statusOf,
  type Dispense,
  type FuelEntryRaw,
  type PeriodReconciliation,
  type StorageSetup,
} from './stock-level';
import type {
  ConfigureStorageDto,
  CorrectDeliveryDto,
  RecordDeliveryDto,
  ResetLevelDto,
  StockEntriesQueryDto,
} from './dto/fuel-stock.dto';

// Phase 5B: fuel storage at stations.
//
// Who may do what is decided by permission, never by role name:
//   fuel_stock:manage        set up tanks, record and correct deliveries, reset,
//                            hide the levels from employees (station supervisors)
//   fuel_stock:read          see every figure and the history (supervisors,
//                            municipality managers, super admin)
//   fuel_stock:read_visible  see the current level per fuel type, and only while
//                            the station's switch shows stock to employees
// and always inside the caller's station scope.

export const FUEL_LABELS_AR: Record<FuelType, string> = {
  PETROL_95: 'بنزين 95',
  DIESEL: 'ديزل',
  KEROSENE: 'كيروسين',
};

// A delivery can be entered a little ahead of the server's clock; more than
// this is a future date, which is refused.
const FUTURE_TOLERANCE_MS = 5 * 60_000;

const ENTRY_SELECT = {
  id: true,
  fuelType: true,
  kind: true,
  liters: true,
  occurredAt: true,
  truckPlate: true,
  waybillNumber: true,
  driverName: true,
  correctsEntryId: true,
  reason: true,
  createdAt: true,
  createdBy: { select: { id: true, fullName: true } },
} as const;

export interface StationFuelLevel {
  fuelType: FuelType;
  fuelLabel: string;
  configured: boolean;
  capacityLiters: number | null;
  level: number | null;
  /** Share of the tank, 0..100, only when the level is a real amount. */
  percentFull: number | null;
  status: 'OK' | 'LOW' | 'EMPTY' | 'DATA_WARNING' | 'NOT_SET_UP';
  /** Only for callers who may see the figures behind the level. */
  detail?: {
    openingLevelLiters: number;
    openedAt: Date;
    baselineAt: Date;
    delivered: number;
    dispensed: number;
    lastResetAt: Date | null;
  };
}

@Injectable()
export class FuelStockService {
  private readonly logger = new Logger(FuelStockService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rbac: RbacService,
    private readonly settings: SystemSettingsService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── access ───────────────────────────────────────────────────────────

  private async assertInScope(stationId: string, actorId: string) {
    const scope = await this.rbac.getStationScope(actorId);
    if (scope !== null && !scope.includes(stationId)) {
      throw new ForbiddenException('You do not have access to this station.');
    }
  }

  private async station(stationId: string) {
    const station = await this.prisma.station.findUnique({
      where: { id: stationId },
      select: {
        id: true,
        name: true,
        internalCode: true,
        municipalityId: true,
        showStockToEmployees: true,
        archivedAt: true,
      },
    });
    if (!station) throw new NotFoundException('Station not found.');
    return station;
  }

  private async writable(stationId: string, actorId: string) {
    await this.assertInScope(stationId, actorId);
    const station = await this.station(stationId);
    if (station.archivedAt) throw new ConflictException('STATION_ARCHIVED');
    return station;
  }

  private async threshold(): Promise<number> {
    return this.settings.getNumber('stock.low_threshold_liters');
  }

  // ── reading the level ────────────────────────────────────────────────

  private setupOf(storage: { openingLevelLiters: unknown; openedAt: Date }): StorageSetup {
    return { openingLevel: Number(storage.openingLevelLiters), openedAt: storage.openedAt };
  }

  private async entriesOf(stationId: string, fuelType: FuelType): Promise<FuelEntryRaw[]> {
    const rows = await this.prisma.fuelStockEntry.findMany({
      where: { stationId, fuelType },
      select: {
        id: true,
        kind: true,
        liters: true,
        occurredAt: true,
        createdAt: true,
        correctsEntryId: true,
      },
    });
    return rows.map((r) => ({ ...r, liters: Number(r.liters) }));
  }

  private async dispensesOf(
    stationId: string,
    fuelType: FuelType,
    since: Date,
  ): Promise<Dispense[]> {
    const rows = await this.prisma.fillUpTransaction.findMany({
      where: { stationId, fuelType, occurredAt: { gt: since } },
      select: { occurredAt: true, quantityLiters: true },
    });
    return rows.map((r) => ({ occurredAt: r.occurredAt, liters: Number(r.quantityLiters) }));
  }

  // The computed level of one fuel type at one station (null: no storage set up).
  async currentLevel(stationId: string, fuelType: FuelType) {
    const storage = await this.prisma.stationFuelStorage.findUnique({
      where: { stationId_fuelType: { stationId, fuelType } },
    });
    if (!storage) return null;
    const setup = this.setupOf(storage);
    const [entries, dispenses] = await Promise.all([
      this.entriesOf(stationId, fuelType),
      this.dispensesOf(stationId, fuelType, setup.openedAt),
    ]);
    return { storage, setup, entries, dispenses, level: computeLevel(setup, entries, dispenses) };
  }

  // Every fuel type the station sells (or has storage for), with its level. A
  // caller who may not see stock gets `visible: false` and no figures at all.
  async levels(stationId: string, actorId: string) {
    await this.assertInScope(stationId, actorId);
    const station = await this.station(stationId);
    const permissions = await this.rbac.getPermissionsForUser(actorId);
    const full = permissions.has('fuel_stock:read');
    if (!full) {
      if (!permissions.has('fuel_stock:read_visible')) {
        throw new ForbiddenException('You may not see fuel stock.');
      }
      if (!station.showStockToEmployees) {
        return {
          stationId,
          visible: false as const,
          showToEmployees: false,
          threshold: null,
          levels: [],
        };
      }
    }

    const [threshold, storages, availability] = await Promise.all([
      this.threshold(),
      this.prisma.stationFuelStorage.findMany({ where: { stationId } }),
      this.prisma.stationFuelAvailability.findMany({ where: { stationId } }),
    ]);
    const fuelTypes = new Set<FuelType>([
      ...availability.filter((a) => a.isAvailable).map((a) => a.fuelType),
      ...storages.map((s) => s.fuelType),
    ]);

    const levels: StationFuelLevel[] = [];
    for (const fuelType of [...fuelTypes].sort()) {
      const current = await this.currentLevel(stationId, fuelType);
      if (!current) {
        levels.push({
          fuelType,
          fuelLabel: FUEL_LABELS_AR[fuelType],
          configured: false,
          capacityLiters: null,
          level: null,
          percentFull: null,
          status: 'NOT_SET_UP',
        });
        continue;
      }
      const capacity = Number(current.storage.capacityLiters);
      const level = current.level.level;
      const entry: StationFuelLevel = {
        fuelType,
        fuelLabel: FUEL_LABELS_AR[fuelType],
        configured: true,
        capacityLiters: capacity,
        // A negative figure is never shown as an amount: the status says the
        // records are wrong, and the supervisor sees the number in `detail`.
        level: level < 0 ? null : level,
        percentFull:
          level < 0 || capacity <= 0 ? null : Math.min(100, Math.round((level / capacity) * 100)),
        status: statusOf(level, threshold),
      };
      if (full) {
        entry.detail = {
          openingLevelLiters: Number(current.storage.openingLevelLiters),
          openedAt: current.storage.openedAt,
          baselineAt: current.level.baselineAt,
          delivered: current.level.delivered,
          dispensed: current.level.dispensed,
          lastResetAt: current.level.lastResetAt,
        };
        if (level < 0) (entry.detail as Record<string, unknown>).computedLevel = level;
      }
      levels.push(entry);
    }
    return {
      stationId,
      visible: true as const,
      showToEmployees: station.showStockToEmployees,
      threshold,
      levels,
    };
  }

  // The figures of the municipality or system, per station and fuel type: for
  // the managers' reports and summary. Callers pass the stations already
  // narrowed to their scope.
  async levelsForStations(stationIds: string[]) {
    const threshold = await this.threshold();
    const storages = await this.prisma.stationFuelStorage.findMany({
      where: { stationId: { in: stationIds } },
    });
    const rows: Array<{
      stationId: string;
      fuelType: FuelType;
      capacityLiters: number;
      level: number;
      status: ReturnType<typeof statusOf>;
    }> = [];
    for (const storage of storages) {
      const current = await this.currentLevel(storage.stationId, storage.fuelType);
      if (!current) continue;
      rows.push({
        stationId: storage.stationId,
        fuelType: storage.fuelType,
        capacityLiters: Number(storage.capacityLiters),
        level: current.level.level,
        status: statusOf(current.level.level, threshold),
      });
    }
    return { threshold, rows };
  }

  // Fuel reconciliation of one station and fuel type over a period.
  async reconcile(
    stationId: string,
    fuelType: FuelType,
    from: Date,
    to: Date,
  ): Promise<PeriodReconciliation | null> {
    const storage = await this.prisma.stationFuelStorage.findUnique({
      where: { stationId_fuelType: { stationId, fuelType } },
    });
    if (!storage) return null;
    const setup = this.setupOf(storage);
    const [entries, dispenses] = await Promise.all([
      this.entriesOf(stationId, fuelType),
      this.dispensesOf(stationId, fuelType, setup.openedAt),
    ]);
    return reconcilePeriod(setup, entries, dispenses, from, to);
  }

  // The entries, newest first, each delivery carrying its effective liters and
  // its corrections.
  async listEntries(stationId: string, query: StockEntriesQueryDto, actorId: string) {
    await this.assertInScope(stationId, actorId);
    await this.station(stationId);
    // Corrections are not rows of their own: each hangs under its delivery. So
    // the page is of ORIGINAL entries, and the total counts only those.
    const where = {
      stationId,
      kind: { not: 'CORRECTION' as const },
      ...(query.fuelType ? { fuelType: query.fuelType } : {}),
    };
    const skip = query.skip ?? 0;
    const take = query.take ?? 25;
    const [total, originals] = await Promise.all([
      this.prisma.fuelStockEntry.count({ where }),
      this.prisma.fuelStockEntry.findMany({
        where,
        select: ENTRY_SELECT,
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
    ]);
    const corrections = await this.prisma.fuelStockEntry.findMany({
      where: { correctsEntryId: { in: originals.map((o) => o.id) } },
      select: ENTRY_SELECT,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const byOriginal = new Map<string, typeof corrections>();
    for (const c of corrections) {
      byOriginal.set(c.correctsEntryId!, [...(byOriginal.get(c.correctsEntryId!) ?? []), c]);
    }
    return {
      total,
      skip,
      take,
      entries: originals.map((o) => {
        const fixes = byOriginal.get(o.id) ?? [];
        const latest = fixes[fixes.length - 1];
        return {
          id: o.id,
          fuelType: o.fuelType,
          fuelLabel: FUEL_LABELS_AR[o.fuelType],
          kind: o.kind,
          occurredAt: o.occurredAt,
          createdAt: o.createdAt,
          createdBy: o.createdBy,
          truckPlate: o.truckPlate,
          waybillNumber: o.waybillNumber,
          driverName: o.driverName,
          reason: o.reason,
          // For a RESET: the level it had before it was zeroed.
          originalLiters: Number(o.liters),
          liters: latest ? Number(latest.liters) : Number(o.liters),
          corrected: Boolean(latest),
          corrections: fixes.map((f) => ({
            id: f.id,
            liters: Number(f.liters),
            reason: f.reason,
            createdAt: f.createdAt,
            createdBy: f.createdBy,
          })),
        };
      }),
    };
  }

  // ── writing ──────────────────────────────────────────────────────────

  async configure(
    stationId: string,
    fuelType: FuelType,
    dto: ConfigureStorageDto,
    actorId: string,
  ) {
    await this.writable(stationId, actorId);
    const openedAt = dto.openedAt ? new Date(dto.openedAt) : new Date();
    if (openedAt.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
      throw new BadRequestException('DATE_IN_THE_FUTURE');
    }

    const existing = await this.prisma.stationFuelStorage.findUnique({
      where: { stationId_fuelType: { stationId, fuelType } },
    });

    if (existing) {
      const openingChanged =
        Number(existing.openingLevelLiters) !== dto.openingLevelLiters ||
        (dto.openedAt !== undefined && existing.openedAt.getTime() !== openedAt.getTime());
      if (openingChanged) {
        // The opening level anchors every figure after it: it is fixed once
        // anything has been recorded against it. A wrong opening is fixed with
        // a delivery correction or, if the book is hopeless, a reset.
        const entries = await this.prisma.fuelStockEntry.count({ where: { stationId, fuelType } });
        if (entries > 0) throw new ConflictException('OPENING_LEVEL_LOCKED');
      }
      if (dto.capacityLiters < Number(existing.openingLevelLiters) && !openingChanged) {
        throw new BadRequestException('CAPACITY_BELOW_LEVEL');
      }
    }
    if (dto.openingLevelLiters > dto.capacityLiters) {
      throw new BadRequestException('OPENING_ABOVE_CAPACITY');
    }

    const storage = await this.prisma.$transaction(async (tx) => {
      const saved = existing
        ? await tx.stationFuelStorage.update({
            where: { id: existing.id },
            data: {
              capacityLiters: dto.capacityLiters,
              openingLevelLiters: dto.openingLevelLiters,
              ...(dto.openedAt ? { openedAt } : {}),
            },
          })
        : await tx.stationFuelStorage.create({
            data: {
              stationId,
              fuelType,
              capacityLiters: dto.capacityLiters,
              openingLevelLiters: dto.openingLevelLiters,
              openedAt,
              createdById: actorId,
            },
          });
      await this.audit.log(
        {
          userId: actorId,
          action: existing ? 'FUEL_STORAGE_UPDATE' : 'FUEL_STORAGE_SETUP',
          entityType: 'StationFuelStorage',
          entityId: saved.id,
          oldValue: existing
            ? {
                capacityLiters: Number(existing.capacityLiters),
                openingLevelLiters: Number(existing.openingLevelLiters),
              }
            : null,
          newValue: {
            stationId,
            fuelType,
            capacityLiters: dto.capacityLiters,
            openingLevelLiters: dto.openingLevelLiters,
            openedAt: saved.openedAt.toISOString(),
          },
        },
        tx,
      );
      return saved;
    });
    await this.afterChange(stationId, fuelType);
    return {
      id: storage.id,
      fuelType,
      capacityLiters: dto.capacityLiters,
      openingLevelLiters: dto.openingLevelLiters,
    };
  }

  private async requireStorage(stationId: string, fuelType: FuelType) {
    const storage = await this.prisma.stationFuelStorage.findUnique({
      where: { stationId_fuelType: { stationId, fuelType } },
    });
    if (!storage) throw new ConflictException('STORAGE_NOT_SET_UP');
    return storage;
  }

  async recordDelivery(
    stationId: string,
    fuelType: FuelType,
    dto: RecordDeliveryDto,
    actorId: string,
  ) {
    await this.writable(stationId, actorId);
    const storage = await this.requireStorage(stationId, fuelType);
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
    if (occurredAt.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
      throw new BadRequestException('DATE_IN_THE_FUTURE');
    }
    // A delivery from before the opening moment is already inside the opening
    // level: recording it would be silently ignored, so it is refused instead.
    if (occurredAt.getTime() < storage.openedAt.getTime()) {
      throw new BadRequestException('DELIVERY_BEFORE_OPENING');
    }

    const entry = await this.prisma.$transaction(async (tx) => {
      const created = await tx.fuelStockEntry.create({
        data: {
          stationId,
          fuelType,
          kind: 'DELIVERY',
          liters: dto.liters,
          occurredAt,
          truckPlate: dto.truckPlate,
          waybillNumber: dto.waybillNumber,
          driverName: dto.driverName?.trim() || null,
          createdById: actorId,
        },
        select: ENTRY_SELECT,
      });
      await this.audit.log(
        {
          userId: actorId,
          action: 'FUEL_DELIVERY',
          entityType: 'FuelStockEntry',
          entityId: created.id,
          newValue: {
            stationId,
            fuelType,
            liters: dto.liters,
            occurredAt: occurredAt.toISOString(),
            waybillNumber: dto.waybillNumber,
          },
        },
        tx,
      );
      return created;
    });
    await this.afterChange(stationId, fuelType);
    return { ...entry, liters: Number(entry.liters) };
  }

  // Never edits: writes a CORRECTION entry that points at the delivery.
  async correctDelivery(entryId: string, dto: CorrectDeliveryDto, actorId: string) {
    const target = await this.prisma.fuelStockEntry.findUnique({ where: { id: entryId } });
    if (!target) throw new NotFoundException('Stock entry not found.');
    await this.writable(target.stationId, actorId);
    if (target.kind !== 'DELIVERY') {
      // Always correct the original delivery; the latest correction of it wins.
      throw new BadRequestException('CORRECT_THE_DELIVERY');
    }
    const previous = await this.prisma.fuelStockEntry.findFirst({
      where: { correctsEntryId: target.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { liters: true },
    });
    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.fuelStockEntry.create({
        data: {
          stationId: target.stationId,
          fuelType: target.fuelType,
          kind: 'CORRECTION',
          liters: dto.liters,
          // The correction keeps the delivery's own moment: it says what the
          // delivery really was, not that something happened now.
          occurredAt: target.occurredAt,
          correctsEntryId: target.id,
          reason: dto.reason,
          createdById: actorId,
        },
        select: ENTRY_SELECT,
      });
      await this.audit.log(
        {
          userId: actorId,
          action: 'FUEL_DELIVERY_CORRECTION',
          entityType: 'FuelStockEntry',
          entityId: row.id,
          oldValue: {
            correctsEntryId: target.id,
            liters: Number(previous?.liters ?? target.liters),
          },
          newValue: { liters: dto.liters, reason: dto.reason },
        },
        tx,
      );
      return row;
    });
    await this.afterChange(target.stationId, target.fuelType);
    return { ...created, liters: Number(created.liters) };
  }

  // The client asked for it: a button that sets a fuel type's level to zero.
  // Recorded as a RESET entry (who, when, previous level, reason), audited, and
  // told to the municipality managers. The level then continues from zero.
  async reset(stationId: string, fuelType: FuelType, dto: ResetLevelDto, actorId: string) {
    const station = await this.writable(stationId, actorId);
    await this.requireStorage(stationId, fuelType);
    const current = await this.currentLevel(stationId, fuelType);
    const previous = current?.level.level ?? 0;

    const entry = await this.prisma.$transaction(async (tx) => {
      const created = await tx.fuelStockEntry.create({
        data: {
          stationId,
          fuelType,
          kind: 'RESET',
          // The previous level (a level below zero is stored as zero; the
          // audit row keeps the exact figure).
          liters: Math.max(0, previous),
          occurredAt: new Date(),
          reason: dto.reason,
          createdById: actorId,
        },
        select: ENTRY_SELECT,
      });
      // After a reset the level is zero, which is below the threshold: the
      // supervisor who did it is not alerted about the low level they caused.
      await tx.stationFuelStorage.update({
        where: { stationId_fuelType: { stationId, fuelType } },
        data: { lowStockAlerted: true, negativeAlerted: false },
      });
      await this.audit.log(
        {
          userId: actorId,
          action: 'FUEL_RESET',
          entityType: 'FuelStockEntry',
          entityId: created.id,
          oldValue: { level: previous },
          newValue: { stationId, fuelType, level: 0, reason: dto.reason },
        },
        tx,
      );
      return created;
    });

    await this.notifications.notifyScope(
      { stationId },
      ['notifications:municipality_events'],
      {
        kind: 'FUEL_RESET',
        title: `تصفير مخزون ${FUEL_LABELS_AR[fuelType]} في ${station.name}`,
        body: `المخزون المسجّل قبل التصفير: ${arabicCount(Math.round(previous), 'liter')}. السبب: ${dto.reason}`,
        link: `/manage/stations/${stationId}?tab=fuel`,
        entityType: 'Station',
        entityId: stationId,
      },
      { exceptUserId: actorId },
    );
    return { ...entry, liters: Number(entry.liters), previousLevel: previous };
  }

  async setVisibility(stationId: string, show: boolean, actorId: string) {
    const station = await this.writable(stationId, actorId);
    if (station.showStockToEmployees === show) return { stationId, showToEmployees: show };
    await this.prisma.$transaction(async (tx) => {
      await tx.station.update({ where: { id: stationId }, data: { showStockToEmployees: show } });
      await this.audit.log(
        {
          userId: actorId,
          action: 'STOCK_VISIBILITY',
          entityType: 'Station',
          entityId: stationId,
          oldValue: { showStockToEmployees: station.showStockToEmployees },
          newValue: { showStockToEmployees: show },
        },
        tx,
      );
    });
    return { stationId, showToEmployees: show };
  }

  // ── alerts ───────────────────────────────────────────────────────────

  // Called after anything that can move a level: a fill-up, a delivery, a
  // correction, a set-up. Best effort: it must never fail the action that
  // called it. It alerts once per crossing (see decideAlerts).
  async afterChange(stationId: string, fuelType: FuelType): Promise<void> {
    try {
      const current = await this.currentLevel(stationId, fuelType);
      if (!current) return;
      const threshold = await this.threshold();
      const decision = decideAlerts(current.level.level, threshold, {
        lowStockAlerted: current.storage.lowStockAlerted,
        negativeAlerted: current.storage.negativeAlerted,
      });
      if (
        decision.next.lowStockAlerted !== current.storage.lowStockAlerted ||
        decision.next.negativeAlerted !== current.storage.negativeAlerted
      ) {
        await this.prisma.stationFuelStorage.update({
          where: { id: current.storage.id },
          data: decision.next,
        });
      }
      if (!decision.alertLow && !decision.alertNegative) return;

      const station = await this.station(stationId);
      const fuel = FUEL_LABELS_AR[fuelType];
      const link = `/my-station?tab=fuel`;
      const managerLink = `/manage/stations/${stationId}?tab=fuel`;

      if (decision.alertLow) {
        const payload = {
          kind: 'LOW_STOCK',
          title: `مخزون ${fuel} منخفض في ${station.name}`,
          body: `المتبقي نحو ${arabicCount(Math.round(Math.max(0, current.level.level)), 'liter')}، أقل من الحد ${arabicCount(Math.round(threshold), 'liter')}.`,
          entityType: 'Station',
          entityId: stationId,
        };
        // One notification per person, however many of these tiers they are in
        // (a manager who is also scoped to the station is told once): the
        // supervisor's screen first, then the manager's, then the employees'
        // (only when the supervisor lets them see stock).
        await this.notifications.notifyScopeOnce({ stationId }, payload, [
          { permissions: ['notifications:station_events'], link },
          { permissions: ['notifications:municipality_events'], link: managerLink },
          ...(station.showStockToEmployees
            ? [{ permissions: ['fuel_stock:read_visible'], link: '/' }]
            : []),
        ]);
      }
      if (decision.alertNegative) {
        await this.notifications.notifyScope({ stationId }, ['notifications:station_events'], {
          kind: 'NEGATIVE_STOCK',
          title: `مخزون ${fuel} في ${station.name}: بيانات تحتاج مراجعة`,
          body: 'المخزون المحسوب أقل من الصفر: يوجد توريد غير مسجّل أو مستوى افتتاحي غير صحيح.',
          link,
          entityType: 'Station',
          entityId: stationId,
        });
      }
    } catch (error) {
      this.logger.warn(
        `stock alert check failed for ${stationId}/${fuelType}: ${(error as Error).message}`,
      );
    }
  }
}
