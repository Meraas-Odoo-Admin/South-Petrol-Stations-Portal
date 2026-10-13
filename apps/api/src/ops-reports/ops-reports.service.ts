import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { FuelType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { FuelStockService, FUEL_LABELS_AR } from '../fuel-stock/fuel-stock.service';
import { CardStockService } from '../card-stock/card-stock.service';
import { ReadinessService } from '../readiness/readiness.service';
import { resolveReportRange } from '../common/utils/report-range';
import { tripoliDay } from '../common/utils/grace-stage';
import { addDays, eachDay, tripoliMidnight, type TripoliRange } from '../common/utils/tripoli';
import { levelAt, statusOf } from '../fuel-stock/stock-level';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { col, type Cell, type OpsReport, type ReportTable } from './ops-report-types';
import type { OpsReportQueryDto } from './dto/ops-report-query.dto';

// Phase 5B, section 3: the reports each role's job needs. Every report returns
// named tables (see ops-report-types.ts) so one screen draws them all and the
// CSV export is exactly the rows shown. Scope is decided here, from the
// caller's station / office / municipality scope - never from the role name -
// and every id in the query is checked against it.

export const IDENTIFICATION_LABELS_AR: Record<string, string> = {
  CARD_SCAN: 'بطاقة',
  TYPED_REGISTERED: 'لوحة مكتوبة (مسجّلة)',
  TYPED_UNREGISTERED: 'لوحة غير مسجّلة',
  EMERGENCY_OVERRIDE: 'تجاوز طارئ',
};
const CARD_REASON_LABELS_AR: Record<string, string> = {
  FIRST_ISSUE: 'أول بطاقة',
  LOST: 'بدل فاقد',
  DAMAGED: 'بدل تالف',
  FAILED_PRINT: 'إعادة طباعة',
  DETAILS_CHANGED: 'تغيّر البيانات',
};
const STOCK_STATUS_AR: Record<string, string> = {
  OK: 'سليم',
  LOW: 'منخفض',
  EMPTY: 'فارغ',
  DATA_WARNING: 'بيانات تحتاج مراجعة',
};
const VERDICT_AR: Record<string, string> = {
  NONE_REMAINING: 'لا أحد بلا بطاقة',
  NO_ISSUANCE: 'لم تُصدر بطاقات مؤخرًا',
  NO_DEADLINE: 'لا موعد نهائي',
  DEADLINE_PASSED: 'فات الموعد',
  ON_TRACK: 'في المسار',
  AT_RISK: 'معرّض للتأخر',
};

const DAY_OF_FILLUP = Prisma.sql`((f."occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Tripoli')::date`;
const DAY_OF_CARD = Prisma.sql`((c."issuedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Tripoli')::date`;
const DAY_OF_VEHICLE = Prisma.sql`((v."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Tripoli')::date`;

const dayString = (value: Date | string): string => (typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10));
const MAX_SERIES_DAYS = 62;

interface FillupFilter {
  stationIds: string[];
  range: TripoliRange;
  fuelType?: string;
  employeeId?: string;
  identification?: string;
}

@Injectable()
export class OpsReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly fuelStock: FuelStockService,
    private readonly cardStock: CardStockService,
    private readonly readiness: ReadinessService,
    private readonly settings: SystemSettingsService,
  ) {}

  // ── scope ────────────────────────────────────────────────────────────

  private async stationsInScope(actorId: string, filter: { stationId?: string; companyId?: string; municipalityId?: string }) {
    const scope = await this.rbac.getStationScope(actorId);
    if (filter.stationId && scope !== null && !scope.includes(filter.stationId)) {
      throw new ForbiddenException('You do not have access to this station.');
    }
    const stations = await this.prisma.station.findMany({
      where: {
        ...(scope !== null ? { id: { in: scope } } : {}),
        ...(filter.stationId ? { id: filter.stationId } : {}),
        ...(filter.companyId ? { companyId: filter.companyId } : {}),
        ...(filter.municipalityId ? { municipalityId: filter.municipalityId } : {}),
      },
      select: { id: true, name: true, internalCode: true, municipalityId: true, company: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });
    return stations;
  }

  private async officesInScope(actorId: string, filter: { officeId?: string; municipalityId?: string }) {
    const scope = await this.rbac.getRegistrationStationScope(actorId);
    if (filter.officeId && scope !== null && !scope.includes(filter.officeId)) {
      throw new ForbiddenException('You do not have access to this registration station.');
    }
    return this.prisma.registrationStation.findMany({
      where: {
        ...(scope !== null ? { id: { in: scope } } : {}),
        ...(filter.officeId ? { id: filter.officeId } : {}),
        ...(filter.municipalityId ? { municipalityId: filter.municipalityId } : {}),
      },
      select: { id: true, name: true, internalCode: true, municipalityId: true },
      orderBy: { name: 'asc' },
    });
  }

  // The municipality a municipality-wide report is about: the one asked for
  // (must be in the caller's reach), else the first LIVE one they may see.
  private async chooseMunicipality(actorId: string, requested?: string) {
    const scope = await this.rbac.getMunicipalityScope(actorId);
    const visible = await this.prisma.municipality.findMany({
      where: { archivedAt: null, ...(scope !== null ? { id: { in: scope } } : {}) },
      select: { id: true, name: true, status: true, cardRequiredFromDate: true },
      orderBy: { name: 'asc' },
    });
    if (visible.length === 0) throw new ForbiddenException('No municipality is available to you.');
    if (requested) {
      const found = visible.find((m) => m.id === requested);
      if (!found) throw new ForbiddenException('You do not have access to this municipality.');
      return { chosen: found, visible };
    }
    return { chosen: visible.find((m) => m.status === 'LIVE') ?? visible[0]!, visible };
  }

  private fillupWhere(f: FillupFilter): Prisma.Sql {
    const parts: Prisma.Sql[] = [
      f.stationIds.length > 0 ? Prisma.sql`f."stationId" IN (${Prisma.join(f.stationIds)})` : Prisma.sql`FALSE`,
      Prisma.sql`f."occurredAt" >= ${f.range.start} AND f."occurredAt" < ${f.range.endExclusive}`,
    ];
    if (f.fuelType) parts.push(Prisma.sql`f."fuelType"::text = ${f.fuelType}`);
    if (f.employeeId) parts.push(Prisma.sql`f."recordedById" = ${f.employeeId}`);
    if (f.identification) parts.push(Prisma.sql`f."identifiedBy"::text = ${f.identification}`);
    return Prisma.join(parts, ' AND ');
  }

  // ── registration employee: their own day ─────────────────────────────

  async myDay(query: OpsReportQueryDto, actorId: string): Promise<OpsReport> {
    const range = resolveReportRange(query, 1);
    const [vehicles, cards, failed] = await Promise.all([
      this.prisma.$queryRaw<Array<{ day: Date; n: number }>>`
        SELECT ${DAY_OF_VEHICLE} AS day, count(*)::int AS n FROM "Vehicle" v
        WHERE v."registeredById" = ${actorId} AND v."createdAt" >= ${range.start} AND v."createdAt" < ${range.endExclusive}
        GROUP BY 1`,
      this.prisma.$queryRaw<Array<{ day: Date; n: number }>>`
        SELECT ${DAY_OF_CARD} AS day, count(*)::int AS n FROM "VehicleCard" c
        WHERE c."issuedById" = ${actorId} AND c."issuedAt" >= ${range.start} AND c."issuedAt" < ${range.endExclusive}
        GROUP BY 1`,
      this.prisma.$queryRaw<Array<{ day: Date; n: number }>>`
        SELECT ((c."cancelledAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Tripoli')::date AS day, count(*)::int AS n
        FROM "VehicleCard" c
        WHERE c."cancelledById" = ${actorId} AND c."cancelReason" = 'FAILED_PRINT'
          AND c."cancelledAt" >= ${range.start} AND c."cancelledAt" < ${range.endExclusive}
        GROUP BY 1`,
    ]);
    const pick = (rows: Array<{ day: Date; n: number }>, day: string) =>
      rows.find((r) => dayString(r.day) === day)?.n ?? 0;
    const days = eachDay(range.from, range.to);
    const rows = days.map((day) => ({
      day,
      vehicles: pick(vehicles, day),
      cards: pick(cards, day),
      failed: pick(failed, day),
    }));
    const total = (key: 'vehicles' | 'cards' | 'failed') => rows.reduce((t, r) => t + r[key], 0);
    return {
      report: 'my-day',
      title: 'يومي',
      range: { from: range.from, to: range.to },
      subject: [],
      tables: [
        {
          id: 'summary',
          title: 'ملخص الفترة',
          columns: [
            col('vehicles', 'مركبات سجّلتها', 'number'),
            col('cards', 'بطاقات أصدرتها', 'number'),
            col('failed', 'طباعات فاشلة', 'number'),
          ],
          rows: [{ vehicles: total('vehicles'), cards: total('cards'), failed: total('failed') }],
        },
        {
          id: 'days',
          title: 'حسب اليوم',
          columns: [
            col('day', 'اليوم', 'date'),
            col('vehicles', 'مركبات مسجّلة', 'number'),
            col('cards', 'بطاقات صادرة', 'number'),
            col('failed', 'طباعات فاشلة', 'number'),
          ],
          rows,
        },
      ],
    };
  }

  // ── station employee: their shift, nothing else ──────────────────────

  async myShift(actorId: string): Promise<OpsReport> {
    const today = tripoliDay(new Date());
    const range = resolveReportRange({ from: today, to: today }, 1);
    const fillUps = await this.prisma.fillUpTransaction.findMany({
      where: { recordedById: actorId, occurredAt: { gte: range.start, lt: range.endExclusive } },
      select: {
        id: true,
        occurredAt: true,
        fuelType: true,
        quantityLiters: true,
        identifiedBy: true,
        typedPlate: true,
        vehicle: { select: { currentPlate: true } },
        station: { select: { name: true } },
      },
      orderBy: { occurredAt: 'desc' },
      take: 500,
    });
    const byFuel = new Map<string, { count: number; liters: number }>();
    for (const f of fillUps) {
      const row = byFuel.get(f.fuelType) ?? { count: 0, liters: 0 };
      row.count += 1;
      row.liters += Number(f.quantityLiters);
      byFuel.set(f.fuelType, row);
    }
    return {
      report: 'my-shift',
      title: 'مناوبتي',
      range: { from: range.from, to: range.to },
      subject: [],
      tables: [
        {
          id: 'totals',
          title: 'إجمالي اليوم',
          columns: [col('fuel', 'نوع الوقود'), col('count', 'عدد التعبئات', 'number'), col('liters', 'اللترات', 'liters')],
          rows: [...byFuel.entries()].map(([fuel, v]) => ({
            fuel: FUEL_LABELS_AR[fuel as FuelType],
            count: v.count,
            liters: Math.round(v.liters * 10) / 10,
          })),
        },
        {
          id: 'fillups',
          title: 'تعبئات اليوم',
          columns: [
            col('time', 'الوقت', 'datetime'),
            col('station', 'المحطة'),
            col('plate', 'اللوحة'),
            col('fuel', 'الوقود'),
            col('liters', 'اللترات', 'liters'),
            col('how', 'التعريف'),
          ],
          rows: fillUps.map((f) => ({
            time: f.occurredAt.toISOString(),
            station: f.station.name,
            plate: f.vehicle?.currentPlate ?? f.typedPlate ?? '—',
            fuel: FUEL_LABELS_AR[f.fuelType],
            liters: Number(f.quantityLiters),
            how: IDENTIFICATION_LABELS_AR[f.identifiedBy] ?? f.identifiedBy,
          })),
        },
      ],
    };
  }

  // ── registration office manager ──────────────────────────────────────

  async office(query: OpsReportQueryDto, actorId: string): Promise<OpsReport> {
    const range = resolveReportRange(query, 7);
    const offices = await this.officesInScope(actorId, { officeId: query.officeId });
    const ids = offices.map((o) => o.id);
    const empty: OpsReport = {
      report: 'office',
      title: 'تقارير المكتب',
      range: { from: range.from, to: range.to },
      subject: offices.map((o) => ({ id: o.id, name: o.name })),
      tables: [],
    };
    if (ids.length === 0) return empty;

    const inRange = { gte: range.start, lt: range.endExclusive };
    const employeeFilter = query.employeeId ? { issuedById: query.employeeId } : {};
    const reasonFilter = query.cardReason ? { reason: query.cardReason } : {};

    const [people, cards, failedPrints, vehicles, duplicates, corrections, cardsPerDay] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          registrationStationScope: { some: { registrationStationId: { in: ids } } },
          ...(query.employeeId ? { id: query.employeeId } : {}),
        },
        select: { id: true, fullName: true, isActive: true, lastLoginAt: true },
        orderBy: { fullName: 'asc' },
      }),
      this.prisma.vehicleCard.groupBy({
        by: ['issuedById', 'registrationStationId'],
        where: { registrationStationId: { in: ids }, issuedAt: inRange, ...employeeFilter, ...reasonFilter },
        _count: { _all: true },
      }),
      this.prisma.vehicleCard.groupBy({
        by: ['cancelledById', 'registrationStationId'],
        where: {
          registrationStationId: { in: ids },
          cancelReason: 'FAILED_PRINT',
          cancelledAt: inRange,
          ...(query.employeeId ? { cancelledById: query.employeeId } : {}),
        },
        _count: { _all: true },
      }),
      this.prisma.vehicle.groupBy({
        by: ['registeredById', 'registeredAtRegistrationStationId'],
        where: {
          registeredAtRegistrationStationId: { in: ids },
          createdAt: inRange,
          ...(query.employeeId ? { registeredById: query.employeeId } : {}),
        },
        _count: { _all: true },
      }),
      this.prisma.duplicateCatch.groupBy({
        by: ['registrationStationId', 'userId'],
        where: {
          registrationStationId: { in: ids },
          occurredAt: inRange,
          ...(query.employeeId ? { userId: query.employeeId } : {}),
        },
        _count: { _all: true },
      }),
      this.prisma.$queryRaw<Array<{ user: string; status: string; n: number }>>`
        SELECT r."requestedById" AS "user", r."status"::text AS status, count(*)::int AS n
        FROM (
          SELECT "requestedById", "status", "createdAt" FROM "VehicleChangeRequest"
          UNION ALL
          SELECT "requestedById", "status", "createdAt" FROM "OwnerChangeRequest"
        ) r
        WHERE r."requestedById" IN (
          SELECT "userId" FROM "UserRegistrationStationScope" WHERE "registrationStationId" IN (${Prisma.join(ids)})
        )
        GROUP BY 1, 2`,
      this.prisma.$queryRaw<Array<{ day: Date; reason: string; n: number }>>`
        SELECT ${DAY_OF_CARD} AS day, c."reason"::text AS reason, count(*)::int AS n
        FROM "VehicleCard" c
        WHERE c."registrationStationId" IN (${Prisma.join(ids)})
          AND c."issuedAt" >= ${range.start} AND c."issuedAt" < ${range.endExclusive}
          ${query.employeeId ? Prisma.sql`AND c."issuedById" = ${query.employeeId}` : Prisma.empty}
          ${query.cardReason ? Prisma.sql`AND c."reason"::text = ${query.cardReason}` : Prisma.empty}
        GROUP BY 1, 2`,
    ]);

    const sumBy = <T extends { _count: { _all: number } }>(rows: T[], test: (r: T) => boolean) =>
      rows.filter(test).reduce((t, r) => t + r._count._all, 0);

    const employeeRows = people.map((p) => {
      const pending = corrections.filter((c) => c.user === p.id && c.status === 'PENDING').reduce((t, c) => t + c.n, 0);
      const decided = corrections
        .filter((c) => c.user === p.id && (c.status === 'APPROVED' || c.status === 'REJECTED'))
        .reduce((t, c) => t + c.n, 0);
      return {
        employeeId: p.id,
        employee: p.fullName,
        vehicles: sumBy(vehicles, (r) => r.registeredById === p.id),
        cards: sumBy(cards, (r) => r.issuedById === p.id),
        failed: sumBy(failedPrints, (r) => r.cancelledById === p.id),
        duplicates: sumBy(duplicates, (r) => r.userId === p.id),
        pending,
        decided,
        active: p.isActive ? 'فعّال' : 'موقوف',
        lastLogin: p.lastLoginAt ? p.lastLoginAt.toISOString() : null,
      };
    });

    const officeRows = offices.map((o) => ({
      office: o.name,
      vehicles: sumBy(vehicles, (r) => r.registeredAtRegistrationStationId === o.id),
      cards: sumBy(cards, (r) => r.registrationStationId === o.id),
      wasted: sumBy(failedPrints, (r) => r.registrationStationId === o.id),
      duplicates: sumBy(duplicates, (r) => r.registrationStationId === o.id),
    }));

    const days = eachDay(range.from, range.to);
    const dayRows = days.map((day) => {
      const own = cardsPerDay.filter((r) => dayString(r.day) === day);
      const row: Record<string, Cell> = { day, total: own.reduce((t, r) => t + r.n, 0) };
      for (const reason of Object.keys(CARD_REASON_LABELS_AR)) {
        row[reason] = own.filter((r) => r.reason === reason).reduce((t, r) => t + r.n, 0);
      }
      return row;
    });

    // Card stock and its reconciliation, per office pool.
    const stockRows: Array<Record<string, Cell>> = [];
    for (const office of offices) {
      const result = await this.cardStock.reconciliation(
        { registrationStationId: office.id, from: query.from, to: query.to },
        actorId,
      );
      for (const pool of result.pools) {
        stockRows.push({
          office: pool.registrationStation.name,
          pool: pool.desk ? `مكتب ${pool.desk.name}` : 'المكتب كله',
          entries: pool.entryCount,
          expected: pool.sinceLastCount ? pool.sinceLastCount.expectedRemaining : null,
          unaccounted: pool.totals.unaccountedCards,
          status:
            pool.totals.unaccountedCards > 0 ? 'بطاقات غير مبرَّرة' : pool.totals.negativeWindows > 0 ? 'يحتاج مراجعة' : 'سليم',
        });
      }
    }

    return {
      ...empty,
      tables: [
        {
          id: 'office',
          title: 'المكتب في الفترة',
          columns: [
            col('office', 'المكتب'),
            col('vehicles', 'مركبات مسجّلة', 'number'),
            col('cards', 'بطاقات صادرة', 'number'),
            col('wasted', 'بطاقات تالفة', 'number'),
            col('duplicates', 'تكرارات أُوقفت', 'number'),
          ],
          rows: officeRows,
        },
        {
          id: 'employees',
          title: 'نشاط كل موظف',
          columns: [
            col('employee', 'الموظف'),
            col('vehicles', 'مركبات', 'number'),
            col('cards', 'بطاقات', 'number'),
            col('failed', 'طباعات فاشلة', 'number'),
            col('duplicates', 'تكرارات أوقفها', 'number'),
            col('pending', 'تصحيحات معلّقة', 'number'),
            col('decided', 'تصحيحات مقرّرة', 'number'),
            col('active', 'الحالة', 'status'),
            col('lastLogin', 'آخر دخول', 'datetime'),
          ],
          rows: employeeRows,
        },
        {
          id: 'days',
          title: 'البطاقات حسب اليوم والسبب',
          columns: [
            col('day', 'اليوم', 'date'),
            col('total', 'الإجمالي', 'number'),
            ...Object.entries(CARD_REASON_LABELS_AR).map(([k, label]) => col(k, label, 'number')),
          ],
          rows: dayRows,
        },
        {
          id: 'card-stock',
          title: 'مخزون البطاقات والمطابقة',
          note: 'المتوقع بعد آخر جرد = آخر جرد + المستلم − المطبوع.',
          columns: [
            col('office', 'المكتب'),
            col('pool', 'الصندوق'),
            col('entries', 'قيود', 'number'),
            col('expected', 'المتوقع المتبقي', 'number'),
            col('unaccounted', 'بطاقات غير مبرَّرة', 'number'),
            col('status', 'الحالة', 'status'),
          ],
          rows: stockRows,
          flagKey: 'unaccounted',
        },
      ],
    };
  }

  // ── station supervisor ───────────────────────────────────────────────

  async station(query: OpsReportQueryDto, actorId: string): Promise<OpsReport> {
    const range = resolveReportRange(query, 7);
    const stations = await this.stationsInScope(actorId, { stationId: query.stationId });
    const stationIds = stations.map((s) => s.id);
    const base: OpsReport = {
      report: 'station',
      title: 'تقارير المحطة',
      range: { from: range.from, to: range.to },
      subject: stations.map((s) => ({ id: s.id, name: s.name })),
      tables: [],
    };
    if (stationIds.length === 0) return base;
    const where = this.fillupWhere({
      stationIds,
      range,
      fuelType: query.fuelType,
      employeeId: query.employeeId,
      identification: query.identification,
    });

    const [perDayFuel, byIdentification, perEmployee, perDayFlags, mismatches] = await Promise.all([
      this.prisma.$queryRaw<Array<{ day: Date; fuel: string; n: number; liters: number }>>`
        SELECT ${DAY_OF_FILLUP} AS day, f."fuelType"::text AS fuel, count(*)::int AS n,
               COALESCE(sum(f."quantityLiters"), 0)::float AS liters
        FROM "FillUpTransaction" f WHERE ${where} GROUP BY 1, 2`,
      this.prisma.$queryRaw<Array<{ how: string; n: number; liters: number }>>`
        SELECT f."identifiedBy"::text AS how, count(*)::int AS n, COALESCE(sum(f."quantityLiters"), 0)::float AS liters
        FROM "FillUpTransaction" f WHERE ${where} GROUP BY 1`,
      this.prisma.$queryRaw<Array<{ id: string; name: string; n: number; liters: number }>>`
        SELECT u."id" AS id, u."fullName" AS name, count(*)::int AS n, COALESCE(sum(f."quantityLiters"), 0)::float AS liters
        FROM "FillUpTransaction" f JOIN "User" u ON u."id" = f."recordedById"
        WHERE ${where} GROUP BY 1, 2`,
      this.prisma.$queryRaw<Array<{ day: Date; exceptions: number; overrides: number; standing: number }>>`
        SELECT ${DAY_OF_FILLUP} AS day,
          count(*) FILTER (WHERE f."isException" AND f."identifiedBy" <> 'EMERGENCY_OVERRIDE')::int AS exceptions,
          count(*) FILTER (WHERE f."identifiedBy" = 'EMERGENCY_OVERRIDE')::int AS overrides,
          count(*) FILTER (WHERE f."standingExceptionId" IS NOT NULL)::int AS standing
        FROM "FillUpTransaction" f WHERE ${where} GROUP BY 1`,
      this.prisma.fillUpTransaction.findMany({
        where: {
          stationId: { in: stationIds },
          fuelMismatch: true,
          occurredAt: { gte: range.start, lt: range.endExclusive },
          ...(query.fuelType ? { fuelType: query.fuelType } : {}),
          ...(query.employeeId ? { recordedById: query.employeeId } : {}),
        },
        select: {
          occurredAt: true,
          fuelType: true,
          quantityLiters: true,
          station: { select: { name: true } },
          vehicle: { select: { currentPlate: true, fuelType: true } },
          recordedBy: { select: { fullName: true } },
        },
        orderBy: { occurredAt: 'desc' },
        take: 300,
      }),
    ]);

    const days = eachDay(range.from, range.to);
    const fuels = [...new Set(perDayFuel.map((r) => r.fuel))].sort();
    const dayFuelRows: Array<Record<string, Cell>> = [];
    for (const day of days) {
      for (const fuel of fuels) {
        const hit = perDayFuel.find((r) => dayString(r.day) === day && r.fuel === fuel);
        if (hit) {
          dayFuelRows.push({ day, fuel: FUEL_LABELS_AR[fuel as FuelType], count: hit.n, liters: Math.round(hit.liters * 10) / 10 });
        }
      }
    }

    const tables: ReportTable[] = [
      {
        id: 'days',
        title: 'التعبئات حسب اليوم ونوع الوقود',
        columns: [col('day', 'اليوم', 'date'), col('fuel', 'الوقود'), col('count', 'العدد', 'number'), col('liters', 'اللترات', 'liters')],
        rows: dayFuelRows,
      },
      {
        id: 'identification',
        title: 'حسب طريقة التعريف',
        columns: [col('how', 'الطريقة'), col('count', 'العدد', 'number'), col('liters', 'اللترات', 'liters')],
        rows: byIdentification.map((r) => ({
          how: IDENTIFICATION_LABELS_AR[r.how] ?? r.how,
          count: r.n,
          liters: Math.round(r.liters * 10) / 10,
        })),
      },
      {
        id: 'employees',
        title: 'حسب الموظف',
        columns: [col('employee', 'الموظف'), col('count', 'العدد', 'number'), col('liters', 'اللترات', 'liters')],
        rows: perEmployee.map((r) => ({ employeeId: r.id, employee: r.name, count: r.n, liters: Math.round(r.liters * 10) / 10 })),
      },
      {
        id: 'exceptions',
        title: 'الاستثناءات والتجاوزات',
        note: 'تعبئات سُجّلت باستثناء، أو بتجاوز طارئ بعد الموعد، أو غطّاها استثناء دائم.',
        columns: [
          col('day', 'اليوم', 'date'),
          col('exceptions', 'استثناءات', 'number'),
          col('overrides', 'تجاوزات طارئة', 'number'),
          col('standing', 'بغطاء استثناء دائم', 'number'),
        ],
        rows: days
          .map((day) => {
            const hit = perDayFlags.find((r) => dayString(r.day) === day);
            return { day, exceptions: hit?.exceptions ?? 0, overrides: hit?.overrides ?? 0, standing: hit?.standing ?? 0 };
          })
          .filter((r) => r.exceptions + r.overrides + r.standing > 0),
      },
      {
        id: 'mismatches',
        title: 'تنبيهات اختلاف نوع الوقود',
        columns: [
          col('time', 'الوقت', 'datetime'),
          col('station', 'المحطة'),
          col('plate', 'اللوحة'),
          col('vehicleFuel', 'وقود المركبة'),
          col('poured', 'الوقود المعبّأ'),
          col('liters', 'اللترات', 'liters'),
          col('employee', 'الموظف'),
        ],
        rows: mismatches.map((m) => ({
          time: m.occurredAt.toISOString(),
          station: m.station.name,
          plate: m.vehicle?.currentPlate ?? '—',
          vehicleFuel: m.vehicle?.fuelType === 'DIESEL' ? 'ديزل' : m.vehicle?.fuelType === 'PETROL' ? 'بنزين' : '—',
          poured: FUEL_LABELS_AR[m.fuelType],
          liters: Number(m.quantityLiters),
          employee: m.recordedBy.fullName,
        })),
      },
      ...(await this.storageTables(stations, range, query.fuelType)),
    ];
    return { ...base, tables };
  }

  // Deliveries, dispensed, level over time, and the low-stock and reset
  // history, for the stations of a report.
  private async storageTables(
    stations: Array<{ id: string; name: string }>,
    range: TripoliRange,
    fuelType?: string,
  ): Promise<ReportTable[]> {
    const ids = stations.map((s) => s.id);
    const names = new Map(stations.map((s) => [s.id, s.name]));
    const threshold = await this.settings.getNumber('stock.low_threshold_liters');
    const storages = await this.prisma.stationFuelStorage.findMany({
      where: { stationId: { in: ids }, ...(fuelType ? { fuelType: fuelType as FuelType } : {}) },
    });

    const summaryRows: Array<Record<string, Cell>> = [];
    const seriesRows: Array<Record<string, Cell>> = [];
    const days = eachDay(range.from, range.to).slice(-MAX_SERIES_DAYS);
    const now = Date.now();
    for (const storage of storages) {
      const current = await this.fuelStock.currentLevel(storage.stationId, storage.fuelType);
      if (!current) continue;
      const recon = await this.fuelStock.reconcile(
        storage.stationId,
        storage.fuelType,
        range.start,
        new Date(range.endExclusive.getTime() - 1),
      );
      summaryRows.push({
        station: names.get(storage.stationId) ?? '',
        fuel: FUEL_LABELS_AR[storage.fuelType],
        capacity: Number(storage.capacityLiters),
        start: recon?.startLevel ?? null,
        delivered: recon?.delivered ?? 0,
        dispensed: recon?.dispensed ?? 0,
        level: current.level.dataWarning ? null : current.level.level,
        status: (STOCK_STATUS_AR[statusOf(current.level.level, threshold)] ?? ''),
      });
      for (const day of days) {
        const end = Math.min(tripoliMidnight(addDays(day, 1)).getTime() - 1, now);
        if (end < current.setup.openedAt.getTime()) continue;
        const at = levelAt(current.setup, current.entries, current.dispenses, new Date(end));
        seriesRows.push({
          day,
          station: names.get(storage.stationId) ?? '',
          fuel: FUEL_LABELS_AR[storage.fuelType],
          level: at.dataWarning ? null : at.level,
          status: (STOCK_STATUS_AR[statusOf(at.level, threshold)] ?? ''),
        });
      }
    }

    const deliveries = await this.prisma.fuelStockEntry.findMany({
      where: {
        stationId: { in: ids },
        kind: 'DELIVERY',
        occurredAt: { gte: range.start, lt: range.endExclusive },
        ...(fuelType ? { fuelType: fuelType as FuelType } : {}),
      },
      select: {
        id: true,
        stationId: true,
        fuelType: true,
        liters: true,
        occurredAt: true,
        truckPlate: true,
        waybillNumber: true,
        driverName: true,
        corrections: { select: { liters: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { occurredAt: 'desc' },
      take: 300,
    });
    const resets = await this.prisma.fuelStockEntry.findMany({
      where: {
        stationId: { in: ids },
        kind: 'RESET',
        occurredAt: { gte: range.start, lt: range.endExclusive },
        ...(fuelType ? { fuelType: fuelType as FuelType } : {}),
      },
      select: {
        stationId: true,
        fuelType: true,
        liters: true,
        occurredAt: true,
        reason: true,
        createdBy: { select: { fullName: true } },
      },
      orderBy: { occurredAt: 'desc' },
      take: 100,
    });
    const alerts = await this.prisma.notification.findMany({
      where: {
        kind: { in: ['LOW_STOCK', 'NEGATIVE_STOCK'] },
        entityType: 'Station',
        entityId: { in: ids },
        createdAt: { gte: range.start, lt: range.endExclusive },
      },
      distinct: ['kind', 'entityId', 'createdAt'],
      select: { kind: true, entityId: true, title: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return [
      {
        id: 'storage',
        title: 'المخزون: التوريد والمصروف والمستوى',
        note: 'المستوى = الافتتاحي + التوريد − المصروف بالتعبئات. يُحسب تلقائيًا ولا يُكتب يدويًا.',
        columns: [
          col('station', 'المحطة'),
          col('fuel', 'الوقود'),
          col('capacity', 'السعة', 'liters'),
          col('start', 'أول الفترة', 'liters'),
          col('delivered', 'التوريد', 'liters'),
          col('dispensed', 'المصروف', 'liters'),
          col('level', 'المستوى الآن', 'liters'),
          col('status', 'الحالة', 'status'),
        ],
        rows: summaryRows,
      },
      {
        id: 'deliveries',
        title: 'سجل التوريد',
        columns: [
          col('time', 'الوقت', 'datetime'),
          col('station', 'المحطة'),
          col('fuel', 'الوقود'),
          col('liters', 'اللترات', 'liters'),
          col('truck', 'لوحة الشاحنة'),
          col('waybill', 'رقم البوليصة'),
          col('driver', 'السائق'),
          col('corrected', 'مصحَّح'),
        ],
        rows: deliveries.map((d) => ({
          time: d.occurredAt.toISOString(),
          station: names.get(d.stationId) ?? '',
          fuel: FUEL_LABELS_AR[d.fuelType],
          liters: Number(d.corrections[0]?.liters ?? d.liters),
          truck: d.truckPlate,
          waybill: d.waybillNumber,
          driver: d.driverName,
          corrected: d.corrections.length > 0 ? 'نعم' : 'لا',
        })),
      },
      {
        id: 'level-series',
        title: 'المستوى في نهاية كل يوم',
        columns: [
          col('day', 'اليوم', 'date'),
          col('station', 'المحطة'),
          col('fuel', 'الوقود'),
          col('level', 'المستوى', 'liters'),
          col('status', 'الحالة', 'status'),
        ],
        rows: seriesRows,
      },
      {
        id: 'stock-events',
        title: 'تنبيهات الانخفاض وسجل التصفير',
        columns: [col('time', 'الوقت', 'datetime'), col('station', 'المحطة'), col('event', 'الحدث'), col('detail', 'التفصيل')],
        rows: [
          ...alerts.map((a) => ({
            time: a.createdAt.toISOString(),
            station: names.get(a.entityId ?? '') ?? '',
            event: a.kind === 'LOW_STOCK' ? 'انخفاض مخزون' : 'بيانات مخزون سالبة',
            detail: a.title,
          })),
          ...resets.map((r) => ({
            time: r.occurredAt.toISOString(),
            station: names.get(r.stationId) ?? '',
            event: 'تصفير مستوى',
            detail: `${FUEL_LABELS_AR[r.fuelType]}: كان ${Math.round(Number(r.liters))} لتر — ${r.reason ?? ''} (${r.createdBy.fullName})`,
          })),
        ].sort((a, b) => String(b.time).localeCompare(String(a.time))),
      },
    ];
  }

  // ── municipality manager (and the super admin, one municipality at a time)

  async municipality(query: OpsReportQueryDto, actorId: string): Promise<OpsReport> {
    const range = resolveReportRange(query, 7);
    const { chosen, visible } = await this.chooseMunicipality(actorId, query.municipalityId);
    const stations = await this.stationsInScope(actorId, {
      municipalityId: chosen.id,
      stationId: query.stationId,
      companyId: query.companyId,
    });
    const offices = await this.officesInScope(actorId, { municipalityId: chosen.id, officeId: query.officeId });
    const stationIds = stations.map((s) => s.id);
    const officeIds = offices.map((o) => o.id);
    const names = new Map(stations.map((s) => [s.id, s]));

    const where = this.fillupWhere({ stationIds, range, fuelType: query.fuelType });
    const [perStationFuel, perStationDay, perStationFlags, topVehicles, institutions] = await Promise.all([
      stationIds.length === 0
        ? []
        : this.prisma.$queryRaw<Array<{ station: string; fuel: string; n: number; liters: number }>>`
            SELECT f."stationId" AS station, f."fuelType"::text AS fuel, count(*)::int AS n,
                   COALESCE(sum(f."quantityLiters"), 0)::float AS liters
            FROM "FillUpTransaction" f WHERE ${where} GROUP BY 1, 2`,
      stationIds.length === 0
        ? []
        : this.prisma.$queryRaw<Array<{ day: Date; fuel: string; n: number; liters: number }>>`
            SELECT ${DAY_OF_FILLUP} AS day, f."fuelType"::text AS fuel, count(*)::int AS n,
                   COALESCE(sum(f."quantityLiters"), 0)::float AS liters
            FROM "FillUpTransaction" f WHERE ${where} GROUP BY 1, 2`,
      stationIds.length === 0
        ? []
        : this.prisma.$queryRaw<Array<{ station: string; exceptions: number; overrides: number; mismatches: number }>>`
            SELECT f."stationId" AS station,
              count(*) FILTER (WHERE f."isException" AND f."identifiedBy" <> 'EMERGENCY_OVERRIDE')::int AS exceptions,
              count(*) FILTER (WHERE f."identifiedBy" = 'EMERGENCY_OVERRIDE')::int AS overrides,
              count(*) FILTER (WHERE f."fuelMismatch")::int AS mismatches
            FROM "FillUpTransaction" f WHERE ${where} GROUP BY 1`,
      stationIds.length === 0
        ? []
        : this.prisma.$queryRaw<Array<{ plate: string; make: string | null; model: string | null; n: number; liters: number }>>`
            SELECT v."currentPlate" AS plate, v."make" AS make, v."model" AS model, count(*)::int AS n,
                   COALESCE(sum(f."quantityLiters"), 0)::float AS liters
            FROM "FillUpTransaction" f JOIN "Vehicle" v ON v."id" = f."vehicleId"
            WHERE ${where} GROUP BY 1, 2, 3 ORDER BY liters DESC LIMIT 10`,
      stationIds.length === 0
        ? []
        : this.prisma.$queryRaw<Array<{ owner: string; vehicles: number; n: number; liters: number }>>`
            SELECT o."fullName" AS owner, count(DISTINCT v."id")::int AS vehicles, count(*)::int AS n,
                   COALESCE(sum(f."quantityLiters"), 0)::float AS liters
            FROM "FillUpTransaction" f
            JOIN "Vehicle" v ON v."id" = f."vehicleId"
            JOIN "VehicleOwner" o ON o."id" = v."ownerId"
            WHERE ${where} AND o."ownerKind" = 'INSTITUTION'
            GROUP BY 1 ORDER BY liters DESC LIMIT 50`,
    ]);

    // Per station: totals and a column per fuel type.
    const fuelsPresent = [...new Set(perStationFuel.map((r) => r.fuel))].sort();
    const stationRows = stations.map((s) => {
      const own = perStationFuel.filter((r) => r.station === s.id);
      const row: Record<string, Cell> = {
        station: s.name,
        company: s.company.name,
        count: own.reduce((t, r) => t + r.n, 0),
        liters: Math.round(own.reduce((t, r) => t + r.liters, 0) * 10) / 10,
      };
      for (const fuel of fuelsPresent) {
        row[`liters_${fuel}`] = Math.round((own.find((r) => r.fuel === fuel)?.liters ?? 0) * 10) / 10;
      }
      return row;
    });

    // Fuel reconciliation per station and fuel type.
    const threshold = await this.settings.getNumber('stock.low_threshold_liters');
    const storages = stationIds.length
      ? await this.prisma.stationFuelStorage.findMany({
          where: { stationId: { in: stationIds }, ...(query.fuelType ? { fuelType: query.fuelType } : {}) },
        })
      : [];
    const reconRows: Array<Record<string, Cell>> = [];
    const lowRows: Array<Record<string, Cell>> = [];
    for (const storage of storages) {
      const station = names.get(storage.stationId);
      const recon = await this.fuelStock.reconcile(
        storage.stationId,
        storage.fuelType,
        range.start,
        new Date(range.endExclusive.getTime() - 1),
      );
      if (!recon) continue;
      const status = statusOf(recon.endLevel, threshold);
      reconRows.push({
        station: station?.name ?? '',
        fuel: FUEL_LABELS_AR[storage.fuelType],
        start: recon.startLevel,
        delivered: recon.delivered,
        dispensed: recon.dispensed,
        resetWrittenOff: recon.resetWrittenOff,
        level: recon.endLevel < 0 ? null : recon.endLevel,
        unaccounted: recon.unaccounted,
        status: recon.unaccounted > 0 ? 'وقود غير مبرَّر' : 'سليم',
      });
      if (status !== 'OK') {
        lowRows.push({
          station: station?.name ?? '',
          fuel: FUEL_LABELS_AR[storage.fuelType],
          level: recon.endLevel < 0 ? null : recon.endLevel,
          capacity: Number(storage.capacityLiters),
          status: (STOCK_STATUS_AR[status] ?? ''),
        });
      }
    }

    // Registration progress per office.
    const inRange = { gte: range.start, lt: range.endExclusive };
    const [officeCards, officeFirst, officeVehicles, officeWasted] = officeIds.length
      ? await Promise.all([
          this.prisma.vehicleCard.groupBy({
            by: ['registrationStationId'],
            where: { registrationStationId: { in: officeIds }, issuedAt: inRange },
            _count: { _all: true },
          }),
          this.prisma.vehicleCard.groupBy({
            by: ['registrationStationId'],
            where: { registrationStationId: { in: officeIds }, issuedAt: inRange, reason: 'FIRST_ISSUE' },
            _count: { _all: true },
          }),
          this.prisma.vehicle.groupBy({
            by: ['registeredAtRegistrationStationId'],
            where: { registeredAtRegistrationStationId: { in: officeIds }, createdAt: inRange },
            _count: { _all: true },
          }),
          this.prisma.vehicleCard.groupBy({
            by: ['registrationStationId'],
            where: { registrationStationId: { in: officeIds }, cancelReason: 'FAILED_PRINT', cancelledAt: inRange },
            _count: { _all: true },
          }),
        ])
      : [[], [], [], []];
    const countFor = <T extends { _count: { _all: number } }>(rows: T[], test: (r: T) => boolean) =>
      rows.find(test)?._count._all ?? 0;
    const officeRows = offices.map((o) => ({
      office: o.name,
      vehicles: countFor(officeVehicles, (r) => r.registeredAtRegistrationStationId === o.id),
      cards: countFor(officeCards, (r) => r.registrationStationId === o.id),
      first: countFor(officeFirst, (r) => r.registrationStationId === o.id),
      wasted: countFor(officeWasted, (r) => r.registrationStationId === o.id),
    }));

    // Deadline readiness (the estimate the municipality manager reads).
    let readinessRows: Array<Record<string, Cell>> = [];
    try {
      const report = await this.readiness.report({ municipalityId: chosen.id, days: 14 }, actorId);
      const h = report.headline;
      if (h) {
        readinessRows = [
          {
            cardless: h.cardlessPlates,
            perDay: h.averagePerDay,
            needed: h.daysNeeded,
            left: h.daysLeft,
            shortfall: h.shortfall,
            verdict: VERDICT_AR[h.verdict] ?? h.verdict,
          },
        ];
      }
    } catch {
      readinessRows = [];
    }

    const days = eachDay(range.from, range.to);
    const dayRows: Array<Record<string, Cell>> = [];
    for (const day of days) {
      for (const fuel of fuelsPresent) {
        const hit = perStationDay.find((r) => dayString(r.day) === day && r.fuel === fuel);
        if (hit) dayRows.push({ day, fuel: FUEL_LABELS_AR[fuel as FuelType], count: hit.n, liters: Math.round(hit.liters * 10) / 10 });
      }
    }

    return {
      report: 'municipality',
      title: `تقارير بلدية ${chosen.name}`,
      range: { from: range.from, to: range.to },
      subject: [{ id: chosen.id, name: chosen.name }],
      municipalities: visible.map((m) => ({ id: m.id, name: m.name })),
      tables: [
        {
          id: 'stations',
          title: 'التعبئات واللترات لكل محطة',
          columns: [
            col('station', 'المحطة'),
            col('company', 'الشركة'),
            col('count', 'عدد التعبئات', 'number'),
            col('liters', 'اللترات', 'liters'),
            ...fuelsPresent.map((f) => col(`liters_${f}`, `لترات ${FUEL_LABELS_AR[f as FuelType]}`, 'liters')),
          ],
          rows: stationRows,
        },
        {
          id: 'days',
          title: 'حسب اليوم ونوع الوقود',
          columns: [col('day', 'اليوم', 'date'), col('fuel', 'الوقود'), col('count', 'العدد', 'number'), col('liters', 'اللترات', 'liters')],
          rows: dayRows,
        },
        {
          id: 'fuel-reconciliation',
          title: 'مطابقة الوقود لكل محطة',
          note: 'أول الفترة + التوريد − المصروف − ما صفّره المشرف = المستوى الآن. «غير المبرَّر» هو ما صُرف أكثر مما وُرّد أو ما أُسقط بالتصفير.',
          columns: [
            col('station', 'المحطة'),
            col('fuel', 'الوقود'),
            col('start', 'أول الفترة', 'liters'),
            col('delivered', 'التوريد', 'liters'),
            col('dispensed', 'المصروف', 'liters'),
            col('resetWrittenOff', 'أُسقط بالتصفير', 'liters'),
            col('level', 'المستوى الآن', 'liters'),
            col('unaccounted', 'وقود غير مبرَّر', 'liters'),
            col('status', 'الحالة', 'status'),
          ],
          rows: reconRows,
          flagKey: 'unaccounted',
        },
        {
          id: 'low-stock',
          title: 'محطات مخزونها منخفض',
          columns: [
            col('station', 'المحطة'),
            col('fuel', 'الوقود'),
            col('level', 'المستوى', 'liters'),
            col('capacity', 'السعة', 'liters'),
            col('status', 'الحالة', 'status'),
          ],
          rows: lowRows,
          flagKey: 'level',
        },
        {
          id: 'offices',
          title: 'تقدّم التسجيل لكل مكتب',
          columns: [
            col('office', 'المكتب'),
            col('vehicles', 'مركبات مسجّلة', 'number'),
            col('cards', 'بطاقات صادرة', 'number'),
            col('first', 'بطاقات أولى', 'number'),
            col('wasted', 'بطاقات تالفة', 'number'),
          ],
          rows: officeRows,
        },
        {
          id: 'readiness',
          title: 'الجاهزية للموعد النهائي',
          columns: [
            col('cardless', 'مركبات بلا بطاقة', 'number'),
            col('perDay', 'بطاقات أولى في اليوم', 'number'),
            col('needed', 'أيام يحتاجها التسجيل', 'number'),
            col('left', 'أيام باقية', 'number'),
            col('shortfall', 'لن تُغطّى', 'number'),
            col('verdict', 'التقدير', 'status'),
          ],
          rows: readinessRows,
        },
        {
          id: 'flags',
          title: 'المخالفات والاستثناءات والتجاوزات',
          columns: [
            col('station', 'المحطة'),
            col('exceptions', 'استثناءات', 'number'),
            col('overrides', 'تجاوزات طارئة', 'number'),
            col('mismatches', 'اختلاف نوع الوقود', 'number'),
          ],
          rows: perStationFlags.map((r) => ({
            station: names.get(r.station)?.name ?? '',
            exceptions: r.exceptions,
            overrides: r.overrides,
            mismatches: r.mismatches,
          })),
        },
        {
          id: 'top-vehicles',
          title: 'أكثر المركبات استهلاكًا',
          columns: [
            col('plate', 'اللوحة'),
            col('vehicle', 'المركبة'),
            col('count', 'عدد التعبئات', 'number'),
            col('liters', 'اللترات', 'liters'),
          ],
          rows: topVehicles.map((v) => ({
            plate: v.plate,
            vehicle: [v.make, v.model].filter(Boolean).join(' ') || '—',
            count: v.n,
            liters: Math.round(v.liters * 10) / 10,
          })),
        },
        {
          id: 'institutions',
          title: 'استهلاك مركبات الجهات والمؤسسات',
          columns: [
            col('owner', 'الجهة'),
            col('vehicles', 'مركبات', 'number'),
            col('count', 'عدد التعبئات', 'number'),
            col('liters', 'اللترات', 'liters'),
          ],
          rows: institutions.map((i) => ({
            owner: i.owner,
            vehicles: i.vehicles,
            count: i.n,
            liters: Math.round(i.liters * 10) / 10,
          })),
        },
      ],
    };
  }

  // ── the short row at the top of a municipality's page ────────────────

  // Registration: cards issued today, offices working, blank cards that are
  // unaccounted for. Fuel: stations low on stock, fuel unaccounted for (last 30
  // days). Counted over what the caller may see inside the municipality.
  async municipalitySummary(query: OpsReportQueryDto, actorId: string) {
    const { chosen, visible } = await this.chooseMunicipality(actorId, query.municipalityId);
    const today = tripoliDay(new Date());
    const todayRange = resolveReportRange({ from: today, to: today }, 1);
    const monthRange = resolveReportRange({ from: addDays(today, -29), to: today }, 30);

    const stations = await this.stationsInScope(actorId, { municipalityId: chosen.id });
    const offices = await this.officesInScope(actorId, { municipalityId: chosen.id });
    const activeStations = stations.length;
    const officeIds = offices.map((o) => o.id);

    const cardsToday = officeIds.length
      ? await this.prisma.vehicleCard.count({
          where: {
            registrationStationId: { in: officeIds },
            issuedAt: { gte: todayRange.start, lt: todayRange.endExclusive },
          },
        })
      : 0;
    const activeOffices = officeIds.length
      ? await this.prisma.registrationStation.count({
          where: { id: { in: officeIds }, status: 'ACTIVE', archivedAt: null },
        })
      : 0;

    let unaccountedCards = 0;
    for (const id of officeIds) {
      const result = await this.cardStock.reconciliation({ registrationStationId: id }, actorId);
      unaccountedCards += result.pools.reduce((t, p) => t + p.totals.unaccountedCards, 0);
    }

    const threshold = await this.settings.getNumber('stock.low_threshold_liters');
    const storages = stations.length
      ? await this.prisma.stationFuelStorage.findMany({ where: { stationId: { in: stations.map((s) => s.id) } } })
      : [];
    const lowStations = new Set<string>();
    let unaccountedFuel = 0;
    for (const storage of storages) {
      const recon = await this.fuelStock.reconcile(
        storage.stationId,
        storage.fuelType,
        monthRange.start,
        new Date(monthRange.endExclusive.getTime() - 1),
      );
      if (!recon) continue;
      unaccountedFuel += recon.unaccounted;
      if (statusOf(recon.endLevel, threshold) !== 'OK') lowStations.add(storage.stationId);
    }

    return {
      municipality: { id: chosen.id, name: chosen.name },
      municipalities: visible.map((m) => ({ id: m.id, name: m.name })),
      registration: { cardsToday, activeOffices, offices: officeIds.length, unaccountedCards },
      fuel: {
        stations: activeStations,
        lowStockStations: lowStations.size,
        unaccountedFuel: Math.round(unaccountedFuel),
        windowDays: 30,
      },
    };
  }

  // ── super admin: across municipalities ───────────────────────────────

  async summary(query: OpsReportQueryDto): Promise<OpsReport> {
    const range = resolveReportRange(query, 7);
    const municipalities = await this.prisma.municipality.findMany({
      where: { archivedAt: null },
      select: { id: true, name: true, status: true },
      orderBy: { name: 'asc' },
    });
    const inRange = { gte: range.start, lt: range.endExclusive };
    const threshold = await this.settings.getNumber('stock.low_threshold_liters');
    const [fillups, cards, vehicles] = await Promise.all([
      this.prisma.fillUpTransaction.groupBy({
        by: ['municipalityId'],
        where: { occurredAt: inRange },
        _count: { _all: true },
        _sum: { quantityLiters: true },
      }),
      this.prisma.$queryRaw<Array<{ municipality: string; n: number }>>`
        SELECT r."municipalityId" AS municipality, count(*)::int AS n
        FROM "VehicleCard" c JOIN "RegistrationStation" r ON r."id" = c."registrationStationId"
        WHERE c."issuedAt" >= ${range.start} AND c."issuedAt" < ${range.endExclusive} GROUP BY 1`,
      this.prisma.$queryRaw<Array<{ municipality: string; n: number }>>`
        SELECT r."municipalityId" AS municipality, count(*)::int AS n
        FROM "Vehicle" v JOIN "RegistrationStation" r ON r."id" = v."registeredAtRegistrationStationId"
        WHERE v."createdAt" >= ${range.start} AND v."createdAt" < ${range.endExclusive} GROUP BY 1`,
    ]);
    const rows: Array<Record<string, Cell>> = [];
    for (const m of municipalities) {
      const stationIds = (
        await this.prisma.station.findMany({ where: { municipalityId: m.id, archivedAt: null }, select: { id: true } })
      ).map((s) => s.id);
      const levels = stationIds.length ? await this.fuelStock.levelsForStations(stationIds) : { rows: [] as Array<{ status: string }> };
      const f = fillups.find((x) => x.municipalityId === m.id);
      const offices = await this.prisma.registrationStation.count({ where: { municipalityId: m.id, archivedAt: null } });
      rows.push({
        municipality: m.name,
        status: m.status === 'LIVE' ? 'مفعّلة' : 'قيد الإعداد',
        stations: stationIds.length,
        offices,
        fillups: f?._count._all ?? 0,
        liters: Math.round(Number(f?._sum.quantityLiters ?? 0) * 10) / 10,
        lowStock: levels.rows.filter((r) => r.status !== 'OK').length,
        cards: cards.find((c) => c.municipality === m.id)?.n ?? 0,
        vehicles: vehicles.find((v) => v.municipality === m.id)?.n ?? 0,
      });
    }
    void threshold;
    return {
      report: 'summary',
      title: 'ملخص البلديات',
      range: { from: range.from, to: range.to },
      subject: municipalities.map((m) => ({ id: m.id, name: m.name })),
      tables: [
        {
          id: 'municipalities',
          title: 'مقارنة البلديات',
          columns: [
            col('municipality', 'البلدية'),
            col('status', 'الحالة', 'status'),
            col('stations', 'محطات', 'number'),
            col('offices', 'مكاتب', 'number'),
            col('fillups', 'تعبئات', 'number'),
            col('liters', 'لترات', 'liters'),
            col('lowStock', 'مخزون منخفض', 'number'),
            col('cards', 'بطاقات صادرة', 'number'),
            col('vehicles', 'مركبات مسجّلة', 'number'),
          ],
          rows,
          flagKey: 'lowStock',
        },
      ],
    };
  }
}
