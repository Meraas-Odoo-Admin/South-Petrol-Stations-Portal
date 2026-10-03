import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { DailyReportQueryDto } from './dto/daily-report-query.dto';
import { ViolationsQueryDto } from './dto/violations-query.dto';
import { HistoryQueryDto } from './dto/history-query.dto';
import { DashboardQueryDto, DEFAULT_DASHBOARD_RANGE_DAYS } from './dto/dashboard-query.dto';

const VIEW_ALL_STATIONS_PERMISSION = 'reports:view_all_stations';

const FILL_UP_HISTORY_INCLUDE = {
  vehicle: {
    select: {
      id: true,
      internalCode: true,
      currentPlate: true,
      owner: { select: { id: true, identityType: true, identityNumber: true, fullName: true } },
    },
  },
  // Legacy-only (round 6): null on every fill-up recorded after fill-ups
  // stopped requiring driver identity — kept so historical rows still
  // render their driver attribution (see docs/DESIGN_owner_based_fillups.md).
  driver: { select: { id: true, identityType: true, identityNumber: true, fullName: true } },
  station: { select: { id: true, internalCode: true, name: true } },
  exception: { include: { exceptionType: true } },
} as const;

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  // Shared by GET /reports/daily and GET /reports/violations: resolves
  // what station(s) the caller is actually allowed to query, given an
  // OPTIONAL stationId from the request.
  //  - Caller holds reports:view_all_stations: stationId is optional;
  //    provided -> that station; omitted -> undefined (no filter, "all
  //    stations combined into one summary").
  //  - Caller does NOT hold it: stationId is REQUIRED (400 if omitted),
  //    and must be inside the caller's UserStationScope (403 otherwise) —
  //    same rbac.getStationScope check used by FillUpsService.create.
  private async resolveSingleStationFilter(
    actorId: string,
    requestedStationId: string | undefined,
  ): Promise<string | undefined> {
    const permissions = await this.rbac.getPermissionsForUser(actorId);
    const hasAllStations = permissions.has(VIEW_ALL_STATIONS_PERMISSION);

    if (!requestedStationId) {
      if (hasAllStations) {
        return undefined;
      }
      throw new BadRequestException(
        'stationId is required unless you hold reports:view_all_stations.',
      );
    }

    if (!hasAllStations) {
      const scope = await this.rbac.getStationScope(actorId);
      if (scope !== null && !scope.includes(requestedStationId)) {
        throw new ForbiddenException('You do not have access to this station.');
      }
    }

    return requestedStationId;
  }

  // Shared by the driver/vehicle history endpoints: unlike the two methods
  // above, an out-of-scope caller is NOT blocked outright — they just see
  // fewer rows (partial visibility, per the M4 instructions). Returns
  // undefined (no filter) for an unrestricted/all-stations caller, or the
  // exact (possibly empty) list of station IDs to filter to otherwise.
  private async resolveHistoryStationFilter(actorId: string): Promise<string[] | undefined> {
    const permissions = await this.rbac.getPermissionsForUser(actorId);
    if (permissions.has(VIEW_ALL_STATIONS_PERMISSION)) {
      return undefined;
    }
    const scope = await this.rbac.getStationScope(actorId);
    return scope ?? undefined;
  }

  private dayBoundsUtc(dateStr: string | undefined): { start: Date; end: Date } {
    const date = dateStr ?? new Date().toISOString().slice(0, 10);
    const start = new Date(`${date}T00:00:00.000Z`);
    if (Number.isNaN(start.getTime())) {
      throw new BadRequestException('date is not a valid calendar date.');
    }
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return { start, end };
  }

  // Shared by GET /reports/daily and its export — same underlying data,
  // just formatted differently by the caller.
  async getDailyReport(query: DailyReportQueryDto, actorId: string) {
    const stationId = await this.resolveSingleStationFilter(actorId, query.stationId);
    const { start, end } = this.dayBoundsUtc(query.date);

    const baseWhere = {
      occurredAt: { gte: start, lt: end },
      ...(stationId ? { stationId } : {}),
    };
    const where = {
      ...baseWhere,
      ...(query.ownerId ? { vehicle: { ownerId: query.ownerId } } : {}),
      ...(query.fuelType ? { fuelType: query.fuelType } : {}),
    };

    const [aggregate, exceptionsPending, exceptionsApproved, totalBeforeFilters, rows] = await Promise.all([
      this.prisma.fillUpTransaction.aggregate({
        where,
        _count: { _all: true },
        _sum: { quantityLiters: true },
      }),
      this.prisma.fillUpTransaction.count({
        where: { ...where, isException: true, exception: { approvedById: null } },
      }),
      this.prisma.fillUpTransaction.count({
        where: { ...where, isException: true, exception: { approvedById: { not: null } } },
      }),
      this.prisma.fillUpTransaction.count({ where: baseWhere }),
      this.prisma.fillUpTransaction.findMany({
        where,
        include: FILL_UP_HISTORY_INCLUDE,
        orderBy: { occurredAt: 'desc' },
        take: 200,
      }),
    ]);

    return {
      stationId: stationId ?? null,
      date: start.toISOString().slice(0, 10),
      ownerId: query.ownerId ?? null,
      fuelType: query.fuelType ?? null,
      totalFillUps: aggregate._count._all,
      totalLiters: aggregate._sum.quantityLiters?.toNumber() ?? 0,
      exceptionsPending,
      exceptionsApproved,
      totalBeforeFilters,
      rows,
    };
  }

  // Shared by GET /reports/violations and its export.
  async getViolations(query: ViolationsQueryDto, actorId: string) {
    const stationId = await this.resolveSingleStationFilter(actorId, query.stationId);
    const where = this.buildViolationsWhere(stationId, query.from, query.to, query.status);

    const [total, rows] = await Promise.all([
      this.prisma.exception.count({ where }),
      this.prisma.exception.findMany({
        where,
        include: { exceptionType: true, fillUpTransaction: { include: FILL_UP_HISTORY_INCLUDE } },
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
    ]);

    return { total, rows };
  }

  // Same filter logic as getViolations, minus pagination — used by export.
  // A report used to confirm "nothing was missed" must never silently drop
  // rows: if the filtered set exceeds `limit`, this REJECTS the request
  // (400) rather than shipping a truncated file that looks complete. The
  // caller has to narrow the filter (date range/station) and try again —
  // there is no frontend step downstream of an exported file to catch a
  // silently incomplete one.
  async getViolationsForExport(
    filters: { stationId?: string; from?: string; to?: string; status?: string },
    actorId: string,
    limit: number,
  ) {
    const stationId = await this.resolveSingleStationFilter(actorId, filters.stationId);
    const where = this.buildViolationsWhere(
      stationId,
      filters.from,
      filters.to,
      filters.status as 'pending' | 'approved' | 'all' | undefined,
    );

    const total = await this.prisma.exception.count({ where });
    if (total > limit) {
      throw new BadRequestException(
        `This filter matches ${total} rows, which exceeds the ${limit}-row export limit. Narrow the date range or station and try again.`,
      );
    }

    return this.prisma.exception.findMany({
      where,
      include: { exceptionType: true, fillUpTransaction: { include: FILL_UP_HISTORY_INCLUDE } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  private buildViolationsWhere(
    stationId: string | undefined,
    from: string | undefined,
    to: string | undefined,
    status: 'pending' | 'approved' | 'all' | undefined,
  ) {
    return {
      fillUpTransaction: {
        ...(stationId ? { stationId } : {}),
        ...(from || to
          ? {
              occurredAt: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
      },
      ...(status === 'pending' ? { approvedById: null } : {}),
      ...(status === 'approved' ? { approvedById: { not: null } } : {}),
    };
  }

  async getVehicleHistory(vehicleId: string, query: HistoryQueryDto, actorId: string) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found.');
    }

    const stationScope = await this.resolveHistoryStationFilter(actorId);
    const where = { vehicleId, ...(stationScope ? { stationId: { in: stationScope } } : {}) };

    const [total, rows] = await Promise.all([
      this.prisma.fillUpTransaction.count({ where }),
      this.prisma.fillUpTransaction.findMany({
        where,
        include: FILL_UP_HISTORY_INCLUDE,
        orderBy: { occurredAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
    ]);

    return { total, rows };
  }

  // The endpoint the M4 acceptance criterion is actually about: "a
  // directorate_admin can pull the daily report for all ~100 stations
  // without the query timing out." A single groupBy (by stationId AND
  // isException, in the same query) instead of one query per station is
  // what makes that true regardless of station count.
  async getDashboard(query: DashboardQueryDto) {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - DEFAULT_DASHBOARD_RANGE_DAYS * 24 * 60 * 60 * 1000);

    const grouped = await this.prisma.fillUpTransaction.groupBy({
      by: ['stationId', 'isException'],
      where: { occurredAt: { gte: from, lte: to } },
      _count: { _all: true },
      _sum: { quantityLiters: true },
    });

    const stationIds = [...new Set(grouped.map((g) => g.stationId))];
    const stations = await this.prisma.station.findMany({
      where: { id: { in: stationIds } },
      select: { id: true, internalCode: true, name: true },
    });
    const stationById = new Map(stations.map((s) => [s.id, s]));

    const perStationMap = new Map<
      string,
      { totalFillUps: number; totalLiters: number; exceptionCount: number }
    >();
    let totalFillUps = 0;
    let totalLiters = 0;
    let totalExceptions = 0;

    for (const row of grouped) {
      const entry = perStationMap.get(row.stationId) ?? {
        totalFillUps: 0,
        totalLiters: 0,
        exceptionCount: 0,
      };
      const liters = row._sum.quantityLiters?.toNumber() ?? 0;
      entry.totalFillUps += row._count._all;
      entry.totalLiters += liters;
      if (row.isException) {
        entry.exceptionCount += row._count._all;
      }
      perStationMap.set(row.stationId, entry);

      totalFillUps += row._count._all;
      totalLiters += liters;
      if (row.isException) {
        totalExceptions += row._count._all;
      }
    }

    const perStation = [...perStationMap.entries()].map(([stationId, stats]) => ({
      stationId,
      internalCode: stationById.get(stationId)?.internalCode ?? null,
      name: stationById.get(stationId)?.name ?? null,
      ...stats,
    }));

    // Round 4 feedback item 9: real charts, not just tables — fuel-type
    // breakdown (groupBy, no raw SQL needed) and a daily trend (needs
    // date-truncation, which Prisma's groupBy can't express — parameterized
    // $queryRaw per CLAUDE.md rule 8, template-literal args so Postgres
    // binds `from`/`to` rather than string-concatenating them).
    const fuelGrouped = await this.prisma.fillUpTransaction.groupBy({
      by: ['fuelType'],
      where: { occurredAt: { gte: from, lte: to } },
      _count: { _all: true },
      _sum: { quantityLiters: true },
    });
    const byFuelType = fuelGrouped.map((g) => ({
      fuelType: g.fuelType,
      totalFillUps: g._count._all,
      totalLiters: g._sum.quantityLiters?.toNumber() ?? 0,
    }));

    const dailyRows = await this.prisma.$queryRaw<
      { day: Date; totalFillUps: bigint; totalLiters: string | null; exceptionCount: bigint }[]
    >`
      SELECT date_trunc('day', "occurredAt") AS day,
             COUNT(*)::bigint AS "totalFillUps",
             SUM("quantityLiters")::numeric::text AS "totalLiters",
             COUNT(*) FILTER (WHERE "isException")::bigint AS "exceptionCount"
      FROM "FillUpTransaction"
      WHERE "occurredAt" >= ${from} AND "occurredAt" <= ${to}
      GROUP BY day
      ORDER BY day ASC
    `;
    const daily = dailyRows.map((row) => ({
      date: row.day.toISOString().slice(0, 10),
      totalFillUps: Number(row.totalFillUps),
      totalLiters: Number(row.totalLiters ?? 0),
      exceptionCount: Number(row.exceptionCount),
    }));

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      totalFillUps,
      totalLiters,
      exceptionRate: totalFillUps > 0 ? totalExceptions / totalFillUps : 0,
      perStation,
      byFuelType,
      daily,
    };
  }
}
