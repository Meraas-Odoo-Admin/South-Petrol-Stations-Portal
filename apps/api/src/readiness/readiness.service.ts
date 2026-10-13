import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { resolveReportRange } from '../common/utils/report-range';
import { calendarDayString, tripoliDay } from '../common/utils/grace-stage';
import { addDays, eachDay, tripoliRange } from '../common/utils/tripoli';
import { estimateReadiness } from './readiness-estimate';
import type { ReadinessQueryDto } from './dto/readiness-query.dto';

// Registration pivot, phase 4c, section 3: is the deadline realistic?
//
// Built on FillUpTransaction.identifiedBy (phase 4a): how each fill-up found its
// vehicle. Per Tripoli day, per petrol station: fill-ups with a card scan, and
// those without (typed for a registered vehicle, typed for an unregistered
// one, supervisor emergency override), plus how many DIFFERENT plates filled up
// without a card. Per registration office: cards issued per day. The headline
// estimate compares them.
//
// Who sees what: admins see every station and office, and the headline
// estimate (it needs both sides); a station supervisor sees the card vs no-card
// figures for their own stations only; a registration supervisor sees their own
// offices' issuance only.

// identifiedBy was backfilled as TYPED_REGISTERED for every fill-up that existed
// when phase 4a's migration ran (test data only), so those rows are approximate.
const PLATE_KEY = Prisma.sql`COALESCE(f."normalizedPlate", v."normalizedPlate", v."currentPlate")`;
const TRIPOLI_DAY_OF_FILLUP = Prisma.sql`((f."occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Tripoli')::date`;
const TRIPOLI_DAY_OF_CARD = Prisma.sql`((c."issuedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Tripoli')::date`;

type Reach = 'all' | 'own' | 'none';

const reachOf = (scope: string[] | null): Reach => (scope === null ? 'all' : scope.length > 0 ? 'own' : 'none');
const dayOf = (value: Date | string): string => (typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10));

@Injectable()
export class ReadinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  private async approximateBefore(): Promise<Date | null> {
    const rows = await this.prisma.$queryRaw<Array<{ finished_at: Date | null }>>`
      SELECT finished_at FROM _prisma_migrations WHERE migration_name LIKE '%p4a_fillup_typed_plate' LIMIT 1`;
    return rows[0]?.finished_at ?? null;
  }

  async report(query: ReadinessQueryDto, actorId: string) {
    const stationScope = await this.rbac.getStationScope(actorId);
    const officeScope = await this.rbac.getRegistrationStationScope(actorId);
    const stationReach = reachOf(stationScope);
    const officeReach = reachOf(officeScope);

    // Municipalities this caller can look at: all for the admins, otherwise the
    // ones their own stations / offices belong to.
    const municipalities = await this.prisma.municipality.findMany({
      where:
        stationReach === 'all' || officeReach === 'all'
          ? {}
          : {
              OR: [
                { stations: { some: { id: { in: stationScope ?? [] } } } },
                { registrationStations: { some: { id: { in: officeScope ?? [] } } } },
              ],
            },
      select: { id: true, name: true, status: true, cardRequiredFromDate: true, awarenessStartDate: true },
      orderBy: { name: 'asc' },
    });
    if (municipalities.length === 0) {
      throw new ForbiddenException('No municipality is available to you.');
    }
    const chosen =
      municipalities.find((m) => m.id === query.municipalityId) ??
      (query.municipalityId ? null : (municipalities.find((m) => m.status === 'LIVE') ?? municipalities[0]!));
    if (!chosen) throw new NotFoundException('Municipality not found.');

    // The headline needs both halves of the picture: the super admin has them
    // everywhere, a municipality manager inside their own municipality.
    const municipalityScope = await this.rbac.getMunicipalityScope(actorId);
    const headlineAllowed =
      (stationReach === 'all' && officeReach === 'all') ||
      (municipalityScope !== null && municipalityScope.includes(chosen.id));

    const range = resolveReportRange(query, 21);
    const days = query.days ?? 14;
    const today = tripoliDay(new Date());
    const window = tripoliRange(addDays(today, -(days - 1)), today);

    const stationFilter =
      stationReach === 'own' ? Prisma.sql`AND f."stationId" IN (${Prisma.join(stationScope!)})` : Prisma.empty;
    const officeFilter =
      officeReach === 'own' ? Prisma.sql`AND c."registrationStationId" IN (${Prisma.join(officeScope!)})` : Prisma.empty;

    const stations =
      stationReach === 'none'
        ? []
        : await this.prisma.station.findMany({
            where: { municipalityId: chosen.id, ...(stationReach === 'own' ? { id: { in: stationScope! } } : {}) },
            select: { id: true, name: true, internalCode: true },
            orderBy: { name: 'asc' },
          });
    const offices =
      officeReach === 'none'
        ? []
        : await this.prisma.registrationStation.findMany({
            where: { municipalityId: chosen.id, ...(officeReach === 'own' ? { id: { in: officeScope! } } : {}) },
            select: { id: true, name: true, internalCode: true },
            orderBy: { name: 'asc' },
          });

    const [perStationDay, perDay, perStationPlates, perOfficeDay, backfilledBefore] = await Promise.all([
      stationReach === 'none'
        ? []
        : this.prisma.$queryRaw<
            Array<{ station: string; day: Date; scan: number; typed_registered: number; typed_unregistered: number; override: number; cardless_plates: number }>
          >`
            SELECT f."stationId" AS station, ${TRIPOLI_DAY_OF_FILLUP} AS day,
              count(*) FILTER (WHERE f."identifiedBy" = 'CARD_SCAN')::int AS scan,
              count(*) FILTER (WHERE f."identifiedBy" = 'TYPED_REGISTERED')::int AS typed_registered,
              count(*) FILTER (WHERE f."identifiedBy" = 'TYPED_UNREGISTERED')::int AS typed_unregistered,
              count(*) FILTER (WHERE f."identifiedBy" = 'EMERGENCY_OVERRIDE')::int AS override,
              count(DISTINCT ${PLATE_KEY}) FILTER (WHERE f."identifiedBy" <> 'CARD_SCAN')::int AS cardless_plates
            FROM "FillUpTransaction" f
            LEFT JOIN "Vehicle" v ON v."id" = f."vehicleId"
            WHERE f."municipalityId" = ${chosen.id}
              AND f."occurredAt" >= ${range.start} AND f."occurredAt" < ${range.endExclusive}
              ${stationFilter}
            GROUP BY 1, 2`,
      stationReach === 'none'
        ? []
        : this.prisma.$queryRaw<Array<{ day: Date; cardless_plates: number }>>`
            SELECT ${TRIPOLI_DAY_OF_FILLUP} AS day,
              count(DISTINCT ${PLATE_KEY}) FILTER (WHERE f."identifiedBy" <> 'CARD_SCAN')::int AS cardless_plates
            FROM "FillUpTransaction" f
            LEFT JOIN "Vehicle" v ON v."id" = f."vehicleId"
            WHERE f."municipalityId" = ${chosen.id}
              AND f."occurredAt" >= ${range.start} AND f."occurredAt" < ${range.endExclusive}
              ${stationFilter}
            GROUP BY 1`,
      stationReach === 'none'
        ? []
        : this.prisma.$queryRaw<Array<{ station: string; cardless_plates: number }>>`
            SELECT f."stationId" AS station,
              count(DISTINCT ${PLATE_KEY}) FILTER (WHERE f."identifiedBy" <> 'CARD_SCAN')::int AS cardless_plates
            FROM "FillUpTransaction" f
            LEFT JOIN "Vehicle" v ON v."id" = f."vehicleId"
            WHERE f."municipalityId" = ${chosen.id}
              AND f."occurredAt" >= ${range.start} AND f."occurredAt" < ${range.endExclusive}
              ${stationFilter}
            GROUP BY 1`,
      officeReach === 'none'
        ? []
        : this.prisma.$queryRaw<Array<{ office: string; day: Date; issued: number; first_cards: number }>>`
            SELECT c."registrationStationId" AS office, ${TRIPOLI_DAY_OF_CARD} AS day,
              count(*)::int AS issued,
              count(*) FILTER (WHERE c."reason" = 'FIRST_ISSUE')::int AS first_cards
            FROM "VehicleCard" c
            JOIN "RegistrationStation" r ON r."id" = c."registrationStationId"
            WHERE r."municipalityId" = ${chosen.id}
              AND c."issuedAt" >= ${range.start} AND c."issuedAt" < ${range.endExclusive}
              ${officeFilter}
            GROUP BY 1, 2`,
      this.approximateBefore(),
    ]);

    // Fill-ups in the range whose identification is only approximate: every row
    // that existed when phase 4a added the field was marked TYPED_REGISTERED.
    const approximate =
      stationReach === 'none' || !backfilledBefore
        ? 0
        : await this.prisma.fillUpTransaction.count({
            where: {
              municipalityId: chosen.id,
              identifiedBy: 'TYPED_REGISTERED',
              occurredAt: { gte: range.start, lt: new Date(Math.min(range.endExclusive.getTime(), backfilledBefore.getTime())) },
              ...(stationReach === 'own' ? { stationId: { in: stationScope! } } : {}),
            },
          });

    // ── shape the rows ────────────────────────────────────────────────
    const allDays = eachDay(range.from, range.to);
    const stationTotals = new Map<string, { scan: number; typedRegistered: number; typedUnregistered: number; override: number }>();
    for (const r of perStationDay) {
      const t = stationTotals.get(r.station) ?? { scan: 0, typedRegistered: 0, typedUnregistered: 0, override: 0 };
      t.scan += r.scan;
      t.typedRegistered += r.typed_registered;
      t.typedUnregistered += r.typed_unregistered;
      t.override += r.override;
      stationTotals.set(r.station, t);
    }
    const daily = allDays.map((day) => {
      const rows = perStationDay.filter((r) => dayOf(r.day) === day);
      const sum = (pick: (r: (typeof rows)[number]) => number) => rows.reduce((t, r) => t + pick(r), 0);
      const typedRegistered = sum((r) => r.typed_registered);
      const typedUnregistered = sum((r) => r.typed_unregistered);
      const override = sum((r) => r.override);
      const officeRows = perOfficeDay.filter((r) => dayOf(r.day) === day);
      return {
        day,
        withCard: sum((r) => r.scan),
        withoutCard: typedRegistered + typedUnregistered + override,
        typedRegistered,
        typedUnregistered,
        emergencyOverride: override,
        distinctCardlessPlates: perDay.find((r) => dayOf(r.day) === day)?.cardless_plates ?? 0,
        cardsIssued: officeRows.reduce((t, r) => t + r.issued, 0),
        firstCardsIssued: officeRows.reduce((t, r) => t + r.first_cards, 0),
      };
    });

    // ── the headline ─────────────────────────────────────────────────
    let headline = null;
    if (headlineAllowed) {
      const [cardless, firstCards] = await Promise.all([
        this.prisma.$queryRaw<Array<{ n: number }>>`
          SELECT count(DISTINCT p.plate)::int AS n FROM (
            SELECT ${PLATE_KEY} AS plate, f."vehicleId" AS vehicle_id
            FROM "FillUpTransaction" f
            LEFT JOIN "Vehicle" v ON v."id" = f."vehicleId"
            WHERE f."municipalityId" = ${chosen.id} AND f."identifiedBy" <> 'CARD_SCAN'
              AND f."occurredAt" >= ${window.start} AND f."occurredAt" < ${window.endExclusive}
          ) p
          WHERE p.plate IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM "VehicleCard" c WHERE c."vehicleId" = p.vehicle_id AND c."status" = 'ACTIVE')`,
        this.prisma.vehicleCard.count({
          where: {
            reason: 'FIRST_ISSUE',
            registrationStation: { municipalityId: chosen.id },
            issuedAt: { gte: window.start, lt: window.endExclusive },
          },
        }),
      ]);
      const deadline = calendarDayString(chosen.cardRequiredFromDate);
      headline = {
        windowFrom: window.from,
        windowTo: window.to,
        deadline,
        today,
        ...estimateReadiness({
          cardlessPlates: cardless[0]?.n ?? 0,
          firstCardsIssued: firstCards,
          windowDays: days,
          deadline,
          today,
        }),
      };
    }

    return {
      municipality: {
        id: chosen.id,
        name: chosen.name,
        status: chosen.status,
        awarenessStartDate: calendarDayString(chosen.awarenessStartDate),
        cardRequiredFromDate: calendarDayString(chosen.cardRequiredFromDate),
      },
      municipalities: municipalities.map((m) => ({ id: m.id, name: m.name })),
      range: { from: range.from, to: range.to },
      days,
      sees: { stations: stationReach, offices: officeReach, headline: headlineAllowed },
      headline,
      approximateRows: approximate,
      approximateBefore: backfilledBefore ? tripoliDay(backfilledBefore) : null,
      daily,
      stations: stations.map((s) => {
        const t = stationTotals.get(s.id) ?? { scan: 0, typedRegistered: 0, typedUnregistered: 0, override: 0 };
        return {
          id: s.id,
          name: s.name,
          internalCode: s.internalCode,
          withCard: t.scan,
          typedRegistered: t.typedRegistered,
          typedUnregistered: t.typedUnregistered,
          emergencyOverride: t.override,
          withoutCard: t.typedRegistered + t.typedUnregistered + t.override,
          distinctCardlessPlates: perStationPlates.find((p) => p.station === s.id)?.cardless_plates ?? 0,
        };
      }),
      offices: offices.map((o) => ({
        id: o.id,
        name: o.name,
        internalCode: o.internalCode,
        cardsIssued: perOfficeDay.filter((r) => r.office === o.id).reduce((t, r) => t + r.issued, 0),
        firstCardsIssued: perOfficeDay.filter((r) => r.office === o.id).reduce((t, r) => t + r.first_cards, 0),
        daily: allDays.map((day) => ({
          day,
          issued: perOfficeDay.find((r) => r.office === o.id && dayOf(r.day) === day)?.issued ?? 0,
        })),
      })),
    };
  }
}
