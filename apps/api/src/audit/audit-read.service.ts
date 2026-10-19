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
    if (query.entityId) and.push({ entityId: query.entityId });
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

  // The oversight summary for the same filters (after review, 19 Oct 2026):
  // how many entries, of which actions, and who did the most.
  async summary(query: AuditQueryDto) {
    const where = this.whereOf(query);
    const [total, byAction, byUser] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.groupBy({ by: ['action'], where, _count: { _all: true } }),
      this.prisma.auditLog.groupBy({
        by: ['userId'],
        where: { AND: [where, { userId: { not: null } }] },
        _count: { userId: true },
        orderBy: { _count: { userId: 'desc' } },
        take: 5,
      }),
    ]);
    const ids = byUser.map((u) => u.userId!).filter(Boolean);
    const people = ids.length
      ? await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, username: true } })
      : [];
    const byId = new Map(people.map((p) => [p.id, p]));
    return {
      total,
      byAction: byAction.map((a) => ({ action: a.action, count: a._count._all })).sort((a, b) => b.count - a.count),
      topActors: byUser.map((u) => ({
        userId: u.userId!,
        fullName: byId.get(u.userId!)?.fullName ?? '—',
        username: byId.get(u.userId!)?.username ?? '',
        count: u._count.userId,
      })),
    };
  }

  // The same entries as a CSV file (after review, 19 Oct 2026): newest first,
  // at most EXPORT_MAX rows (the file says when it was cut short). Times in
  // Libya's time. The export itself is in the audit log (@AuditedExport).
  async exportCsv(query: AuditQueryDto): Promise<{ csv: string; truncated: boolean }> {
    const EXPORT_MAX = 10_000;
    const where = this.whereOf(query);
    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: EXPORT_MAX + 1,
      include: { user: { select: { fullName: true, username: true } } },
    });
    const truncated = rows.length > EXPORT_MAX;
    const page = rows.slice(0, EXPORT_MAX);
    const labels = await this.entityLabels(page);
    const when = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Tripoli', dateStyle: 'short', timeStyle: 'medium' });
    const cell = (v: unknown) => {
      const s = v === null || v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v);
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ['الوقت (ليبيا)', 'الفاعل', 'اسم المستخدم', 'الإجراء', 'نوع السجل', 'السجل', 'المعرّف', 'العنوان', 'الجهاز', 'قبل', 'بعد'];
    const lines = page.map((r) =>
      [
        when.format(r.createdAt),
        r.user?.fullName ?? '',
        r.user?.username ?? '',
        r.action,
        r.entityType,
        labels.get(`${r.entityType}:${r.entityId}`) ?? '',
        r.entityId,
        r.ipAddress ?? '',
        r.userAgent ?? '',
        r.oldValue,
        r.newValue,
      ]
        .map(cell)
        .join(','),
    );
    if (truncated) lines.push(cell(`… قُطع الملف عند ${EXPORT_MAX} إدخال؛ ضيّق التصفية لرؤية الباقي.`));
    // BOM first, so Excel opens the Arabic correctly.
    return { csv: '﻿' + [header.map(cell).join(','), ...lines].join('\r\n') + '\r\n', truncated };
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
