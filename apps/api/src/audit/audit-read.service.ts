import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { addDays, isCalendarDay, tripoliMidnight } from '../common/utils/tripoli';
import { AuditQueryDto } from './audit-query.dto';

// Reading the audit log for its screen (after review, 15 Oct 2026). Kept
// apart from AuditService, which only ever inserts.
@Injectable()
export class AuditReadService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AuditQueryDto) {
    const where = this.whereOf(query);
    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
        include: { user: { select: { id: true, username: true, fullName: true } } },
      }),
    ]);
    const labels = await this.entityLabels(rows);
    return {
      total,
      rows: rows.map((row) => ({ ...row, entityLabel: labels.get(`${row.entityType}:${row.entityId}`) ?? null })),
    };
  }

  private whereOf(query: AuditQueryDto): Prisma.AuditLogWhereInput {
    const and: Prisma.AuditLogWhereInput[] = [];
    if (query.entityType) and.push({ entityType: query.entityType });
    if (query.userId) and.push({ userId: query.userId });
    const actions = (query.action ?? '')
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean);
    if (actions.length) and.push({ action: { in: actions } });

    if (query.from || query.to) {
      for (const day of [query.from, query.to]) {
        if (day && !isCalendarDay(day)) throw new BadRequestException(`${day} is not a calendar day.`);
      }
      const createdAt: Prisma.DateTimeFilter = {};
      if (query.from) createdAt.gte = tripoliMidnight(query.from);
      if (query.to) createdAt.lt = tripoliMidnight(addDays(query.to, 1));
      and.push({ createdAt });
    }

    const q = query.q?.trim();
    if (q) {
      and.push({
        OR: [
          { user: { username: { contains: q, mode: 'insensitive' } } },
          { user: { fullName: { contains: q, mode: 'insensitive' } } },
          { ipAddress: { startsWith: q } },
          { entityId: q },
          // The name typed at a failed sign-in (no account behind it).
          { newValue: { path: ['username'], string_contains: q } },
        ],
      });
    }
    return and.length ? { AND: and } : {};
  }

  // What each entry is about, by name: the person, station, vehicle… as it is
  // named now. Looked up for the page being shown only, one query per kind.
  private async entityLabels(rows: Array<{ entityType: string; entityId: string }>): Promise<Map<string, string>> {
    const idsOf = (type: string) => [...new Set(rows.filter((r) => r.entityType === type && r.entityId !== '-').map((r) => r.entityId))];
    const labels = new Map<string, string>();
    const put = (type: string, items: Array<{ id: string; label: string | null | undefined }>) => {
      for (const item of items) if (item.label) labels.set(`${type}:${item.id}`, item.label);
    };
    const byName = { select: { id: true, name: true } } as const;
    const ask = <T>(type: string, run: (ids: string[]) => Promise<T[]>, label: (item: T) => { id: string; label: string | null }) => {
      const ids = idsOf(type);
      return ids.length ? run(ids).then((items) => put(type, items.map(label))) : Promise.resolve();
    };
    await Promise.all([
      ask('User', (ids) => this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, username: true } }), (u) => ({
        id: u.id,
        label: `${u.fullName} (${u.username})`,
      })),
      ask('Station', (ids) => this.prisma.station.findMany({ where: { id: { in: ids } }, ...byName }), (s) => ({ id: s.id, label: s.name })),
      ask('RegistrationStation', (ids) => this.prisma.registrationStation.findMany({ where: { id: { in: ids } }, ...byName }), (s) => ({
        id: s.id,
        label: s.name,
      })),
      ask('Municipality', (ids) => this.prisma.municipality.findMany({ where: { id: { in: ids } }, ...byName }), (m) => ({ id: m.id, label: m.name })),
      ask('Company', (ids) => this.prisma.company.findMany({ where: { id: { in: ids } }, ...byName }), (c) => ({ id: c.id, label: c.name })),
      ask('Route', (ids) => this.prisma.route.findMany({ where: { id: { in: ids } }, ...byName }), (r) => ({ id: r.id, label: r.name })),
      ask('VehicleType', (ids) => this.prisma.vehicleType.findMany({ where: { id: { in: ids } }, ...byName }), (t) => ({ id: t.id, label: t.name })),
      ask('ExceptionType', (ids) => this.prisma.exceptionType.findMany({ where: { id: { in: ids } }, ...byName }), (t) => ({ id: t.id, label: t.name })),
      ask('SecurityAuthority', (ids) => this.prisma.securityAuthority.findMany({ where: { id: { in: ids } }, ...byName }), (a) => ({
        id: a.id,
        label: a.name,
      })),
      ask('Vehicle', (ids) => this.prisma.vehicle.findMany({ where: { id: { in: ids } }, select: { id: true, currentPlate: true, internalCode: true } }), (v) => ({
        id: v.id,
        label: v.currentPlate ?? v.internalCode,
      })),
      ask('VehicleOwner', (ids) => this.prisma.vehicleOwner.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } }), (o) => ({
        id: o.id,
        label: o.fullName,
      })),
      ask('VehicleCard', (ids) => this.prisma.vehicleCard.findMany({ where: { id: { in: ids } }, select: { id: true, cardNumber: true } }), (c) => ({
        id: c.id,
        label: c.cardNumber,
      })),
    ]);
    return labels;
  }
}
