import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { resolveReportRange } from '../common/utils/report-range';
import { tripoliDay } from '../common/utils/grace-stage';
import type { DateRangeQueryDto } from '../common/dto/date-range-query.dto';
import type { ActivityQueryDto } from './dto/activity-query.dto';

// Registration pivot, phase 4c, section 1: is each registration office doing
// its job? Everything is an aggregate query (groupBy or parameterized SQL),
// never a whole table in memory, and every figure respects the caller's
// registration-station scope: a registration supervisor sees only their own
// offices, the admin roles see all of them.

const REPLACEMENT_REASONS = ['LOST', 'DAMAGED', 'DETAILS_CHANGED'] as const;

// Audit "new value" keys that are safe to show in an activity timeline. Never
// anything that could carry a national ID, an administrative ID or a phone
// number (CLAUDE.md rule 10).
const SAFE_DETAIL_KEYS = ['cardNumber', 'mode', 'cancelReason', 'reason', 'kind', 'quantity', 'fields', 'job'] as const;

function pickDetail(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const picked: Record<string, unknown> = {};
  for (const key of SAFE_DETAIL_KEYS) {
    if (source[key] !== undefined) picked[key] = source[key];
  }
  return Object.keys(picked).length > 0 ? picked : null;
}

@Injectable()
export class RegistrationReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  // The offices this caller may see, as ids; null means all.
  private scope(actorId: string): Promise<string[] | null> {
    return this.rbac.getRegistrationStationScope(actorId);
  }

  private async officeIds(actorId: string): Promise<string[]> {
    const scope = await this.scope(actorId);
    if (scope !== null) return scope;
    return (await this.prisma.registrationStation.findMany({ select: { id: true } })).map((s) => s.id);
  }

  // The date from which duplicate catches have been recorded: when the phase 4c
  // migration was applied (nothing earlier was kept, so nothing is invented).
  private async duplicateRecordingSince(): Promise<string | null> {
    const rows = await this.prisma.$queryRaw<Array<{ finished_at: Date | null }>>`
      SELECT finished_at FROM _prisma_migrations WHERE migration_name LIKE '%p4c_reports' LIMIT 1`;
    const at = rows[0]?.finished_at;
    return at ? tripoliDay(at) : null;
  }

  // ── offices side by side ─────────────────────────────────────────────

  async offices(query: DateRangeQueryDto & { officeId?: string }, actorId: string) {
    const range = resolveReportRange(query, 30);
    let ids = await this.officeIds(actorId);
    if (query.officeId) {
      // Only an office inside the caller's own scope can be asked for.
      if (!ids.includes(query.officeId)) {
        throw new ForbiddenException('You do not have access to this registration station.');
      }
      ids = [query.officeId];
    }
    if (ids.length === 0) {
      return { range: { from: range.from, to: range.to }, duplicatesRecordedSince: await this.duplicateRecordingSince(), offices: [] };
    }

    const offices = await this.prisma.registrationStation.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, internalCode: true, status: true, municipality: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });

    const issuedWhere = { registrationStationId: { in: ids }, issuedAt: { gte: range.start, lt: range.endExclusive } };
    const [cardGroups, wasted, registered, duplicates, corrections, people, since] = await Promise.all([
      this.prisma.vehicleCard.groupBy({ by: ['registrationStationId', 'reason', 'status'], where: issuedWhere, _count: { _all: true } }),
      this.prisma.vehicleCard.groupBy({
        by: ['registrationStationId'],
        where: {
          registrationStationId: { in: ids },
          cancelReason: 'FAILED_PRINT',
          cancelledAt: { gte: range.start, lt: range.endExclusive },
        },
        _count: { _all: true },
      }),
      this.prisma.vehicle.groupBy({
        by: ['registeredAtRegistrationStationId'],
        where: { registeredAtRegistrationStationId: { in: ids }, createdAt: { gte: range.start, lt: range.endExclusive } },
        _count: { _all: true },
      }),
      this.prisma.duplicateCatch.groupBy({
        by: ['registrationStationId'],
        where: { registrationStationId: { in: ids }, occurredAt: { gte: range.start, lt: range.endExclusive } },
        _count: { _all: true },
      }),
      // Corrections are attributed to the office of the person who requested them.
      this.prisma.$queryRaw<Array<{ station: string; status: string; n: number }>>`
        SELECT s."registrationStationId" AS station, r."status"::text AS status, count(*)::int AS n
        FROM (
          SELECT "requestedById", "status", "createdAt" FROM "VehicleChangeRequest"
          UNION ALL
          SELECT "requestedById", "status", "createdAt" FROM "OwnerChangeRequest"
        ) r
        JOIN "UserRegistrationStationScope" s ON s."userId" = r."requestedById"
        WHERE r."createdAt" >= ${range.start} AND r."createdAt" < ${range.endExclusive}
          AND s."registrationStationId" IN (${Prisma.join(ids)})
        GROUP BY 1, 2`,
      this.prisma.user.findMany({
        where: { registrationStationScope: { some: { registrationStationId: { in: ids } } } },
        select: {
          isActive: true,
          lastLoginAt: true,
          roles: { select: { role: { select: { name: true } } } },
          registrationStationScope: { select: { registrationStationId: true } },
        },
      }),
      this.duplicateRecordingSince(),
    ]);

    return {
      range: { from: range.from, to: range.to },
      duplicatesRecordedSince: since,
      offices: offices.map((office) => {
        const own = cardGroups.filter((g) => g.registrationStationId === office.id);
        const sum = (pick: (g: (typeof own)[number]) => boolean) =>
          own.filter(pick).reduce((total, g) => total + g._count._all, 0);
        const issued = sum(() => true);
        const reasonCount = (reason: string) => sum((g) => g.reason === reason);
        const replacements = {
          lost: reasonCount('LOST'),
          damaged: reasonCount('DAMAGED'),
          detailsChanged: reasonCount('DETAILS_CHANGED'),
          total: REPLACEMENT_REASONS.reduce((total, r) => total + reasonCount(r), 0),
        };
        const corrected = corrections.filter((c) => c.station === office.id);
        const correctionCount = (status: string) => corrected.filter((c) => c.status === status).reduce((t, c) => t + c.n, 0);

        const staff = people.filter((u) => u.registrationStationScope.some((s) => s.registrationStationId === office.id));
        const jobs = new Map<string, { active: number; deactivated: number }>();
        for (const u of staff) {
          for (const r of u.roles) {
            const row = jobs.get(r.role.name) ?? { active: 0, deactivated: 0 };
            if (u.isActive) row.active += 1;
            else row.deactivated += 1;
            jobs.set(r.role.name, row);
          }
        }
        const lastLogins = staff.map((u) => u.lastLoginAt).filter((d): d is Date => d !== null);

        return {
          id: office.id,
          name: office.name,
          internalCode: office.internalCode,
          status: office.status,
          municipality: office.municipality.name,
          cards: {
            issued,
            first: reasonCount('FIRST_ISSUE'),
            replacements,
            failedPrintReprints: reasonCount('FAILED_PRINT'),
            wastedCards: wasted.find((w) => w.registrationStationId === office.id)?._count._all ?? 0,
            // Of the cards issued in this range, how they stand now.
            active: sum((g) => g.status === 'ACTIVE'),
            cancelled: sum((g) => g.status === 'CANCELLED'),
            replaced: sum((g) => g.status === 'REPLACED'),
          },
          vehicles: {
            registered: registered.find((r) => r.registeredAtRegistrationStationId === office.id)?._count._all ?? 0,
            duplicatesCaught: duplicates.find((d) => d.registrationStationId === office.id)?._count._all ?? 0,
            corrections: {
              requested: correctionCount('PENDING') + correctionCount('APPROVED') + correctionCount('REJECTED'),
              pending: correctionCount('PENDING'),
              approved: correctionCount('APPROVED'),
              rejected: correctionCount('REJECTED'),
            },
          },
          people: {
            total: staff.length,
            active: staff.filter((u) => u.isActive).length,
            deactivated: staff.filter((u) => !u.isActive).length,
            byJob: [...jobs.entries()].map(([name, c]) => ({ name, ...c })),
            lastLoginAt: lastLogins.length ? new Date(Math.max(...lastLogins.map((d) => d.getTime()))) : null,
          },
        };
      }),
    };
  }

  // ── one office's employees ───────────────────────────────────────────

  async employees(officeId: string, query: DateRangeQueryDto, actorId: string) {
    const range = resolveReportRange(query, 30);
    const scope = await this.scope(actorId);
    if (scope !== null && !scope.includes(officeId)) {
      throw new ForbiddenException('You do not have access to this registration station.');
    }
    const office = await this.prisma.registrationStation.findUnique({ where: { id: officeId }, select: { id: true, name: true } });
    if (!office) throw new NotFoundException('Registration station not found.');

    const users = await this.prisma.user.findMany({
      where: { registrationStationScope: { some: { registrationStationId: officeId } } },
      select: {
        id: true,
        username: true,
        fullName: true,
        isActive: true,
        lastLoginAt: true,
        roles: { select: { role: { select: { name: true } } } },
      },
      orderBy: { fullName: 'asc' },
    });
    const userIds = users.map((u) => u.id);
    if (userIds.length === 0) return { range: { from: range.from, to: range.to }, office, employees: [] };

    const inRange = { gte: range.start, lt: range.endExclusive };
    const [vehicles, cards, failed, reprints, tests, corrections] = await Promise.all([
      this.prisma.vehicle.groupBy({
        by: ['registeredById'],
        where: { registeredById: { in: userIds }, registeredAtRegistrationStationId: officeId, createdAt: inRange },
        _count: { _all: true },
      }),
      this.prisma.vehicleCard.groupBy({
        by: ['issuedById'],
        where: { issuedById: { in: userIds }, registrationStationId: officeId, issuedAt: inRange },
        _count: { _all: true },
      }),
      this.prisma.vehicleCard.groupBy({
        by: ['cancelledById'],
        where: { cancelledById: { in: userIds }, registrationStationId: officeId, cancelReason: 'FAILED_PRINT', cancelledAt: inRange },
        _count: { _all: true },
      }),
      // A reprint is any print of a card after its first print.
      this.prisma.$queryRaw<Array<{ user: string; n: number }>>`
        SELECT p."printedById" AS "user", count(*)::int AS n
        FROM (
          SELECT "printedById", "printedAt",
                 row_number() OVER (PARTITION BY "cardId" ORDER BY "printedAt") AS rn
          FROM "CardPrint"
          WHERE "kind" = 'CARD' AND "registrationStationId" = ${officeId}
        ) p
        WHERE p.rn > 1 AND p."printedAt" >= ${range.start} AND p."printedAt" < ${range.endExclusive}
        GROUP BY 1`,
      this.prisma.cardPrint.groupBy({
        by: ['printedById'],
        where: { printedById: { in: userIds }, registrationStationId: officeId, kind: 'TEST', printedAt: inRange },
        _count: { _all: true },
      }),
      this.prisma.$queryRaw<Array<{ user: string; n: number }>>`
        SELECT r."requestedById" AS "user", count(*)::int AS n
        FROM (
          SELECT "requestedById", "createdAt" FROM "VehicleChangeRequest"
          UNION ALL
          SELECT "requestedById", "createdAt" FROM "OwnerChangeRequest"
        ) r
        WHERE r."requestedById" IN (${Prisma.join(userIds)})
          AND r."createdAt" >= ${range.start} AND r."createdAt" < ${range.endExclusive}
        GROUP BY 1`,
    ]);

    return {
      range: { from: range.from, to: range.to },
      office,
      employees: users.map((u) => ({
        id: u.id,
        username: u.username,
        fullName: u.fullName,
        job: u.roles[0]?.role.name ?? null,
        isActive: u.isActive,
        lastLoginAt: u.lastLoginAt,
        vehiclesRegistered: vehicles.find((v) => v.registeredById === u.id)?._count._all ?? 0,
        cardsIssued: cards.find((c) => c.issuedById === u.id)?._count._all ?? 0,
        reprints: reprints.find((r) => r.user === u.id)?.n ?? 0,
        failedPrints: failed.find((f) => f.cancelledById === u.id)?._count._all ?? 0,
        testPrints: tests.find((t) => t.printedById === u.id)?._count._all ?? 0,
        correctionsRequested: corrections.find((c) => c.user === u.id)?.n ?? 0,
      })),
    };
  }

  // ── one employee's timeline ──────────────────────────────────────────

  async activity(userId: string, query: ActivityQueryDto, actorId: string) {
    const range = resolveReportRange(query, 30);
    const scope = await this.scope(actorId);

    // Only people who work at a registration office, and (for a supervisor) at
    // one of the caller's own offices.
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        fullName: true,
        isActive: true,
        lastLoginAt: true,
        registrationStationScope: { select: { registrationStationId: true, registrationStation: { select: { name: true } } } },
      },
    });
    const offices = user?.registrationStationScope ?? [];
    const visible = scope === null ? offices : offices.filter((o) => scope.includes(o.registrationStationId));
    if (!user || offices.length === 0) throw new NotFoundException('Employee not found.');
    if (visible.length === 0) throw new ForbiddenException('You do not have access to this employee.');

    const where = { userId, createdAt: { gte: range.start, lt: range.endExclusive } };
    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: query.skip ?? 0,
        take: query.take ?? 50,
        select: { id: true, action: true, entityType: true, entityId: true, createdAt: true, newValue: true },
      }),
    ]);

    return {
      range: { from: range.from, to: range.to },
      employee: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        isActive: user.isActive,
        lastLoginAt: user.lastLoginAt,
        offices: visible.map((o) => ({ id: o.registrationStationId, name: o.registrationStation.name })),
      },
      total,
      rows: rows.map((r) => ({
        id: r.id,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        createdAt: r.createdAt,
        detail: pickDetail(r.newValue),
      })),
    };
  }
}
