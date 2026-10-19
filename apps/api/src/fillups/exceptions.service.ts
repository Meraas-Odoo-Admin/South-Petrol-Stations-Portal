import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RbacService } from '../rbac/rbac.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { addDays, isCalendarDay, tripoliMidnight } from '../common/utils/tripoli';
import { tripoliDay } from '../common/utils/grace-stage';
import type { RuleFailureReason } from './rule-engine/types';

export const STRICT_KEY = 'exceptions.strict_limit';
export const THRESHOLD_KEY = 'exceptions.station_daily_threshold';

export interface ExceptionUse {
  used: number; // uses of this type at this station today, BEFORE this one
  limit: number | null;
  over: boolean; // this use would pass the limit
  strict: boolean;
}

// Phase 6: exception types with daily limits per station. Replaces the old
// approve-each-exception flow and per-vehicle standing exceptions: a use is
// logged at once, counted against its type's daily limit at the station,
// flagged (and the supervisor and municipality manager notified, once per type
// per station per day) when over, refused when the strict switch is on, and a
// station with too many exceptions in a day is flagged the same way.
@Injectable()
export class ExceptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rbac: RbacService,
    private readonly settings: SystemSettingsService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── settings: the global value, and a municipality's own (which wins) ────

  private async globalStrict(): Promise<boolean> {
    return (await this.settings.getString(STRICT_KEY)) === 'true';
  }

  private async globalThreshold(): Promise<number> {
    return this.settings.getNumber(THRESHOLD_KEY);
  }

  private async municipalityValue(municipalityId: string, key: string): Promise<string | null> {
    const row = await this.prisma.municipalitySetting.findUnique({
      where: { municipalityId_key: { municipalityId, key } },
      select: { value: true },
    });
    return row?.value ?? null;
  }

  async strictFor(municipalityId: string): Promise<boolean> {
    const own = await this.municipalityValue(municipalityId, STRICT_KEY);
    return own !== null ? own === 'true' : this.globalStrict();
  }

  async thresholdFor(municipalityId: string): Promise<number> {
    const own = await this.municipalityValue(municipalityId, THRESHOLD_KEY);
    return own !== null ? Number(own) : this.globalThreshold();
  }

  async getSettings(municipalityId: string | undefined, actorId: string) {
    const global = { strictLimit: await this.globalStrict(), stationDailyThreshold: await this.globalThreshold() };
    if (!municipalityId) return { global, municipality: null, effective: global };
    await this.assertMunicipalityAccess(municipalityId, actorId);
    const [strict, threshold] = await Promise.all([
      this.municipalityValue(municipalityId, STRICT_KEY),
      this.municipalityValue(municipalityId, THRESHOLD_KEY),
    ]);
    const municipality = {
      strictLimit: strict === null ? null : strict === 'true',
      stationDailyThreshold: threshold === null ? null : Number(threshold),
    };
    return {
      global,
      municipality,
      effective: {
        strictLimit: municipality.strictLimit ?? global.strictLimit,
        stationDailyThreshold: municipality.stationDailyThreshold ?? global.stationDailyThreshold,
      },
    };
  }

  async setGlobalSettings(dto: { strictLimit?: boolean; stationDailyThreshold?: number }, actorId: string) {
    const before = await this.getSettings(undefined, actorId);
    await this.prisma.$transaction(async (tx) => {
      if (dto.strictLimit !== undefined) {
        await tx.systemSetting.update({ where: { key: STRICT_KEY }, data: { value: String(dto.strictLimit) } });
      }
      if (dto.stationDailyThreshold !== undefined) {
        await tx.systemSetting.update({ where: { key: THRESHOLD_KEY }, data: { value: String(dto.stationDailyThreshold) } });
      }
      await this.audit.log(
        {
          userId: actorId,
          action: 'UPDATE_EXCEPTION_SETTINGS',
          entityType: 'SystemSetting',
          entityId: 'exceptions',
          oldValue: before.global,
          newValue: {
            strictLimit: dto.strictLimit ?? before.global.strictLimit,
            stationDailyThreshold: dto.stationDailyThreshold ?? before.global.stationDailyThreshold,
          },
        },
        tx,
      );
    });
    this.settings.invalidate();
    return this.getSettings(undefined, actorId);
  }

  async setMunicipalitySettings(
    municipalityId: string,
    dto: { strictLimit?: boolean | null; stationDailyThreshold?: number | null },
    actorId: string,
  ) {
    await this.assertMunicipalityAccess(municipalityId, actorId);
    const before = await this.getSettings(municipalityId, actorId);
    await this.prisma.$transaction(async (tx) => {
      const apply = async (key: string, value: string | null | undefined) => {
        if (value === undefined) return;
        if (value === null) {
          await tx.municipalitySetting.deleteMany({ where: { municipalityId, key } });
        } else {
          await tx.municipalitySetting.upsert({
            where: { municipalityId_key: { municipalityId, key } },
            create: { municipalityId, key, value, updatedById: actorId },
            update: { value, updatedById: actorId },
          });
        }
      };
      await apply(STRICT_KEY, dto.strictLimit === undefined ? undefined : dto.strictLimit === null ? null : String(dto.strictLimit));
      await apply(
        THRESHOLD_KEY,
        dto.stationDailyThreshold === undefined ? undefined : dto.stationDailyThreshold === null ? null : String(dto.stationDailyThreshold),
      );
      await this.audit.log(
        {
          userId: actorId,
          action: 'UPDATE_EXCEPTION_SETTINGS',
          entityType: 'Municipality',
          entityId: municipalityId,
          oldValue: before.municipality,
          newValue: {
            strictLimit: dto.strictLimit === undefined ? before.municipality?.strictLimit ?? null : dto.strictLimit,
            stationDailyThreshold:
              dto.stationDailyThreshold === undefined ? before.municipality?.stationDailyThreshold ?? null : dto.stationDailyThreshold,
          },
        },
        tx,
      );
    });
    return this.getSettings(municipalityId, actorId);
  }

  // A municipality manager changes only their own municipality; the super admin
  // (no municipality scope list) any.
  async assertMunicipalityAccess(municipalityId: string, actorId: string) {
    const exists = await this.prisma.municipality.findUnique({ where: { id: municipalityId }, select: { id: true } });
    if (!exists) throw new NotFoundException('Municipality not found.');
    const scope = await this.rbac.getMunicipalityScope(actorId);
    if (scope !== null && !scope.includes(municipalityId)) {
      throw new ForbiddenException('You do not have access to this municipality.');
    }
  }

  // ── a day, in Libya time ────────────────────────────────────────────────

  dayOf(at: Date) {
    const day = tripoliDay(at);
    return { day, start: tripoliMidnight(day), end: tripoliMidnight(addDays(day, 1)) };
  }

  // ── types for a station ─────────────────────────────────────────────────

  // The active types usable at this station (global ones, and its own
  // municipality's), each with how many times it was used here today and
  // whether going past its limit is refused (strict).
  async typesForStation(stationId: string, actorId: string) {
    const scope = await this.rbac.getStationScope(actorId);
    if (scope !== null && !scope.includes(stationId)) {
      throw new ForbiddenException('You do not have access to this station.');
    }
    const station = await this.prisma.station.findUnique({ where: { id: stationId }, select: { municipalityId: true } });
    if (!station) throw new NotFoundException('Station not found.');
    const [types, strict] = await Promise.all([
      this.prisma.exceptionType.findMany({
        where: {
          isActive: true,
          OR: [{ municipalityId: null }, ...(station.municipalityId ? [{ municipalityId: station.municipalityId }] : [])],
        },
        orderBy: { name: 'asc' },
      }),
      station.municipalityId ? this.strictFor(station.municipalityId) : this.globalStrict(),
    ]);
    const { start, end } = this.dayOf(new Date());
    const counts = await this.prisma.exception.groupBy({
      by: ['exceptionTypeId'],
      where: { fillUpTransaction: { stationId, occurredAt: { gte: start, lt: end } } },
      _count: { _all: true },
    });
    const usedBy = new Map(counts.map((c) => [c.exceptionTypeId, c._count._all]));
    return types.map((t) => ({
      id: t.id,
      key: t.key,
      name: t.name,
      isActive: t.isActive,
      overridableRules: t.overridableRules as RuleFailureReason[],
      dailyLimitPerStation: t.dailyLimitPerStation,
      municipalityId: t.municipalityId,
      usedToday: usedBy.get(t.id) ?? 0,
      strictLimit: strict,
    }));
  }

  // ── a use ───────────────────────────────────────────────────────────────

  // Validates the type against the station and the rule that blocked the
  // fill-up, and counts today's uses. Throws when the type does not apply, or
  // when the limit is passed and the strict switch is on.
  async assessUse(input: {
    type: { id: string; name: string; isActive: boolean; overridableRules: string[]; dailyLimitPerStation: number | null; municipalityId: string | null };
    stationId: string;
    municipalityId: string;
    triggerReason: RuleFailureReason | null;
    at: Date;
  }): Promise<ExceptionUse> {
    const { type } = input;
    if (!type.isActive) throw new NotFoundException('Exception type not found or inactive.');
    if (type.municipalityId !== null && type.municipalityId !== input.municipalityId) {
      throw new ConflictException('EXCEPTION_TYPE_NOT_FOR_MUNICIPALITY');
    }
    if (input.triggerReason && type.overridableRules.length > 0 && !type.overridableRules.includes(input.triggerReason)) {
      throw new ConflictException('EXCEPTION_TYPE_NOT_FOR_RULE');
    }
    const { start, end } = this.dayOf(input.at);
    const used = await this.prisma.exception.count({
      where: {
        exceptionTypeId: type.id,
        fillUpTransaction: { stationId: input.stationId, occurredAt: { gte: start, lt: end } },
      },
    });
    const limit = type.dailyLimitPerStation;
    const over = limit !== null && used >= limit;
    const strict = await this.strictFor(input.municipalityId);
    if (over && strict) {
      throw new ConflictException({ message: 'EXCEPTION_LIMIT_REACHED', details: { typeName: type.name, limit } });
    }
    return { used, limit, over, strict };
  }

  // After a use is recorded: flag a type over its limit (once per type per
  // station per day) and a station over the daily threshold (once per day), and
  // tell the station supervisor and the municipality manager. Best effort.
  async afterUse(input: {
    stationId: string;
    municipalityId: string;
    typeId: string;
    typeName: string;
    use: ExceptionUse;
    at: Date;
    actorId: string;
  }) {
    try {
      const { day, start, end } = this.dayOf(input.at);
      const station = await this.prisma.station.findUnique({ where: { id: input.stationId }, select: { name: true } });
      const where = station?.name ?? '';
      const dayDate = new Date(`${day}T00:00:00.000Z`);
      const once = async (kind: string, typeId: string) => {
        try {
          await this.prisma.exceptionFlag.create({
            data: { stationId: input.stationId, day: dayDate, kind, exceptionTypeId: typeId },
          });
          return true;
        } catch (error) {
          if ((error as { code?: string }).code === 'P2002') return false;
          throw error;
        }
      };
      const permissions = ['notifications:station_events', 'notifications:municipality_events'];
      if (input.use.over && (await once('TYPE_OVER_LIMIT', input.typeId))) {
        await this.notifications.notifyScope(
          { stationId: input.stationId },
          permissions,
          {
            kind: 'EXCEPTION_OVER_LIMIT',
            title: `تجاوز حد الاستثناء اليومي في ${where}`,
            body: `تجاوزت المحطة الحد اليومي لاستثناء «${input.typeName}» (${input.use.limit}).`,
            link: '/reports/violations',
            entityType: 'Station',
            entityId: input.stationId,
            dedupeKey: `exc-limit:${input.stationId}:${day}:${input.typeId}`,
          },
          { exceptUserId: input.actorId },
        );
      }
      const total = await this.prisma.exception.count({
        where: { fillUpTransaction: { stationId: input.stationId, occurredAt: { gte: start, lt: end } } },
      });
      const threshold = await this.thresholdFor(input.municipalityId);
      if (total > threshold && (await once('STATION_THRESHOLD', ''))) {
        await this.notifications.notifyScope(
          { stationId: input.stationId },
          permissions,
          {
            kind: 'EXCEPTION_STATION_FLAGGED',
            title: `عدد استثناءات غير معقول في ${where}`,
            body: `بلغت استثناءات المحطة اليوم ${total}، وهو أكثر من الحد ${threshold}.`,
            link: '/reports/violations',
            entityType: 'Station',
            entityId: input.stationId,
            dedupeKey: `exc-station:${input.stationId}:${day}`,
          },
          { exceptUserId: input.actorId },
        );
      }
    } catch {
      // never fails the fill-up
    }
  }

  // ── views ───────────────────────────────────────────────────────────────

  private parseRange(from?: string, to?: string) {
    const today = tripoliDay(new Date());
    const fromDay = from ?? addDays(today, -6);
    const toDay = to ?? today;
    if (!isCalendarDay(fromDay) || !isCalendarDay(toDay) || fromDay > toDay) {
      throw new BadRequestException('INVALID_RANGE');
    }
    return { fromDay, toDay, start: tripoliMidnight(fromDay), end: tripoliMidnight(addDays(toDay, 1)) };
  }

  // A station's exceptions (a supervisor sees only theirs, a manager those of
  // their municipality): one row per use, with the flagged ones marked.
  async list(
    query: { stationId?: string; municipalityId?: string; from?: string; to?: string; typeId?: string; employeeId?: string; flaggedOnly?: boolean; skip?: number; take?: number },
    actorId: string,
  ) {
    const range = this.parseRange(query.from, query.to);
    const stationScope = await this.rbac.getStationScope(actorId);
    if (query.stationId && stationScope !== null && !stationScope.includes(query.stationId)) {
      throw new ForbiddenException('You do not have access to this station.');
    }
    if (query.municipalityId) await this.assertVisibleMunicipality(query.municipalityId, actorId);
    const where: Prisma.ExceptionWhereInput = {
      ...(query.typeId ? { exceptionTypeId: query.typeId } : {}),
      ...(query.flaggedOnly ? { overLimit: true } : {}),
      fillUpTransaction: {
        occurredAt: { gte: range.start, lt: range.end },
        ...(query.stationId ? { stationId: query.stationId } : {}),
        ...(query.employeeId ? { recordedById: query.employeeId } : {}),
        ...(query.municipalityId ? { municipalityId: query.municipalityId } : {}),
        ...(stationScope !== null && !query.stationId ? { stationId: { in: stationScope } } : {}),
      },
    };
    const take = Math.min(Math.max(query.take ?? 25, 1), 100);
    const [total, rows, flags] = await Promise.all([
      this.prisma.exception.count({ where }),
      this.prisma.exception.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip ?? 0,
        take,
        include: {
          exceptionType: { select: { id: true, name: true } },
          fillUpTransaction: {
            select: {
              id: true,
              occurredAt: true,
              stationId: true,
              station: { select: { name: true } },
              vehicle: { select: { currentPlate: true } },
              recordedBy: { select: { id: true, fullName: true } },
              fuelType: true,
              quantityLiters: true,
            },
          },
        },
      }),
      this.prisma.exceptionFlag.findMany({
        where: {
          kind: 'STATION_THRESHOLD',
          day: { gte: new Date(`${range.fromDay}T00:00:00.000Z`), lte: new Date(`${range.toDay}T00:00:00.000Z`) },
          ...(query.stationId ? { stationId: query.stationId } : stationScope !== null ? { stationId: { in: stationScope } } : {}),
        },
        select: { stationId: true, day: true },
      }),
    ]);
    const flagged = new Set(flags.map((f) => `${f.stationId}:${f.day.toISOString().slice(0, 10)}`));
    return {
      range: { from: range.fromDay, to: range.toDay },
      total,
      rows: rows.map((e) => ({
        id: e.id,
        occurredAt: e.fillUpTransaction.occurredAt,
        stationId: e.fillUpTransaction.stationId,
        station: e.fillUpTransaction.station.name,
        plate: e.fillUpTransaction.vehicle?.currentPlate ?? null,
        type: e.exceptionType.name,
        typeId: e.exceptionType.id,
        rule: e.triggerReason,
        reason: e.reason,
        employeeId: e.fillUpTransaction.recordedBy.id,
        employee: e.fillUpTransaction.recordedBy.fullName,
        fuelType: e.fillUpTransaction.fuelType,
        liters: Number(e.fillUpTransaction.quantityLiters),
        overLimit: e.overLimit,
        stationFlagged: flagged.has(`${e.fillUpTransaction.stationId}:${tripoliDay(e.fillUpTransaction.occurredAt)}`),
      })),
    };
  }

  private async assertVisibleMunicipality(municipalityId: string, actorId: string) {
    const visible = await this.rbac.getVisibleMunicipalityIds(actorId);
    if (visible !== null && !visible.includes(municipalityId)) {
      throw new ForbiddenException('You do not have access to this municipality.');
    }
  }

  // Station by station for a municipality; without one, each municipality the
  // caller sees as one row (the super admin's view).
  async byStation(query: { municipalityId?: string; from?: string; to?: string }, actorId: string) {
    const range = this.parseRange(query.from, query.to);
    const visible = await this.rbac.getVisibleMunicipalityIds(actorId);

    if (!query.municipalityId) {
      const municipalities = await this.prisma.municipality.findMany({
        where: { archivedAt: null, ...(visible !== null ? { id: { in: visible } } : {}) },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });
      const rows = [];
      for (const m of municipalities) {
        const summary = await this.stationRows(m.id, range);
        rows.push({
          municipalityId: m.id,
          municipality: m.name,
          count: summary.reduce((t, s) => t + s.count, 0),
          flaggedStations: summary.filter((s) => s.flagged).length,
          stations: summary.length,
        });
      }
      return { range: { from: range.fromDay, to: range.toDay }, municipalities: rows, stations: null };
    }

    await this.assertVisibleMunicipality(query.municipalityId, actorId);
    const stations = await this.stationRows(query.municipalityId, range);
    return {
      range: { from: range.fromDay, to: range.toDay },
      municipalities: null,
      threshold: await this.thresholdFor(query.municipalityId),
      stations,
    };
  }

  private async stationRows(municipalityId: string, range: { fromDay: string; toDay: string; start: Date; end: Date }) {
    const [stations, threshold] = await Promise.all([
      this.prisma.station.findMany({
        where: { municipalityId, archivedAt: null },
        select: { id: true, name: true, stationNumber: true, company: { select: { name: true } } },
        orderBy: { name: 'asc' },
      }),
      this.thresholdFor(municipalityId),
    ]);
    const ids = stations.map((s) => s.id);
    if (ids.length === 0) return [];
    const [byType, overLimit, flagDays] = await Promise.all([
      this.prisma.exception.groupBy({
        by: ['exceptionTypeId'],
        where: { fillUpTransaction: { stationId: { in: ids }, occurredAt: { gte: range.start, lt: range.end } } },
        _count: { _all: true },
      }),
      this.prisma.exception.findMany({
        where: { overLimit: true, fillUpTransaction: { stationId: { in: ids }, occurredAt: { gte: range.start, lt: range.end } } },
        select: { fillUpTransaction: { select: { stationId: true } } },
      }),
      this.prisma.exceptionFlag.findMany({
        where: {
          kind: 'STATION_THRESHOLD',
          stationId: { in: ids },
          day: { gte: new Date(`${range.fromDay}T00:00:00.000Z`), lte: new Date(`${range.toDay}T00:00:00.000Z`) },
        },
        select: { stationId: true },
      }),
    ]);
    void byType;
    const perStation = await this.prisma.fillUpTransaction.groupBy({
      by: ['stationId'],
      where: { stationId: { in: ids }, isException: true, occurredAt: { gte: range.start, lt: range.end } },
      _count: { _all: true },
    });
    const count = new Map(perStation.map((r) => [r.stationId, r._count._all]));
    const over = new Map<string, number>();
    for (const r of overLimit) over.set(r.fillUpTransaction.stationId, (over.get(r.fillUpTransaction.stationId) ?? 0) + 1);
    const flagCount = new Map<string, number>();
    for (const f of flagDays) flagCount.set(f.stationId, (flagCount.get(f.stationId) ?? 0) + 1);
    return stations.map((s) => ({
      stationId: s.id,
      station: s.name,
      stationNumber: s.stationNumber,
      company: s.company.name,
      count: count.get(s.id) ?? 0,
      overLimit: over.get(s.id) ?? 0,
      daysOverThreshold: flagCount.get(s.id) ?? 0,
      threshold,
      flagged: (flagCount.get(s.id) ?? 0) > 0,
    }));
  }
}
