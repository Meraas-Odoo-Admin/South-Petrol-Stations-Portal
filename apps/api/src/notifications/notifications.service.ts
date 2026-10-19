import { Injectable, Logger } from '@nestjs/common';
import { settingChangeNotification } from './setting-sentence';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';

// Phase 5B: ONE notification service that features call. An event is one line
// at its call site:
//
//   await this.notifications.notifyScope({ stationId }, ['notifications:station_events'], { kind, title, body, link });
//
// Who receives it is decided here, never by the caller, from two facts: the
// recipient's SCOPE (explicit station / office / municipality rows) and the
// PERMISSION they hold. Role names are never read (CLAUDE.md rule 2). A user
// outside the scope of the thing is never notified: the super admin has no
// station or municipality rows, so station-level events do not reach them; they
// get only the events addressed with `notifyPermissionHolders`.

export interface NotificationPayload {
  kind: string;
  title: string;
  body: string;
  link?: string;
  entityType?: string;
  entityId?: string;
  // Same event, same user, once. Omit for events that may repeat.
  dedupeKey?: string;
}

export interface ScopeTarget {
  stationId?: string;
  registrationStationId?: string;
  municipalityId?: string;
}

export const NOTIFICATION_RETENTION_DAYS = 90;

// Events that are the same thing said again when repeated: a setting or a rule
// switch changed. These collapse into one row; every other event is its own.
export const COLLAPSIBLE_KINDS: ReadonlySet<string> = new Set([
  'SETTING_CHANGED',
  'RULE_SWITCH_CHANGED',
]);

interface PresentedRow {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
  entityId: string | null;
}

// A row as the bell shows it. Rows written before the plain-sentence wording
// carry `<setting key>: <before> ← <after>` and are rewritten to the sentence;
// one whose before and after are equal changed nothing and is dropped (null).
function presentRow(row: PresentedRow): PresentedRow | null {
  if (!COLLAPSIBLE_KINDS.has(row.kind)) return row;
  const legacy = /^(\S+): (.*) ← (.*)$/s.exec(row.body);
  if (!legacy) return row;
  const sentence = settingChangeNotification(row.entityId ?? legacy[1]!, legacy[2]!, legacy[3]!);
  if (!sentence) return null;
  return { ...row, title: sentence.title, body: sentence.body };
}
const PRUNE_EVERY_MS = 60 * 60_000;

type Client = PrismaService | Prisma.TransactionClient;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private lastPrune = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  // The active users whose scope covers the target and who hold at least one
  // of the permissions.
  async recipientsFor(
    target: ScopeTarget,
    permissions: string[],
    exceptUserId?: string,
  ): Promise<string[]> {
    const municipalityIds = new Set<string>();
    if (target.municipalityId) municipalityIds.add(target.municipalityId);
    const candidates = new Set<string>();

    if (target.stationId) {
      const station = await this.prisma.station.findUnique({
        where: { id: target.stationId },
        select: { municipalityId: true },
      });
      if (station?.municipalityId) municipalityIds.add(station.municipalityId);
      const rows = await this.prisma.userStationScope.findMany({
        where: { stationId: target.stationId },
        select: { userId: true },
      });
      rows.forEach((r) => candidates.add(r.userId));
    }
    if (target.registrationStationId) {
      const office = await this.prisma.registrationStation.findUnique({
        where: { id: target.registrationStationId },
        select: { municipalityId: true },
      });
      if (office?.municipalityId) municipalityIds.add(office.municipalityId);
      const rows = await this.prisma.userRegistrationStationScope.findMany({
        where: { registrationStationId: target.registrationStationId },
        select: { userId: true },
      });
      rows.forEach((r) => candidates.add(r.userId));
    }
    if (municipalityIds.size > 0) {
      const rows = await this.prisma.userMunicipalityScope.findMany({
        where: { municipalityId: { in: [...municipalityIds] } },
        select: { userId: true },
      });
      rows.forEach((r) => candidates.add(r.userId));
    }
    if (exceptUserId) candidates.delete(exceptUserId);
    if (candidates.size === 0) return [];

    const users = await this.prisma.user.findMany({
      where: { id: { in: [...candidates] }, isActive: true, archivedAt: null },
      select: { id: true },
    });
    const recipients: string[] = [];
    for (const user of users) {
      const held = await this.rbac.getPermissionsForUser(user.id);
      if (permissions.some((p) => held.has(p))) recipients.push(user.id);
    }
    return recipients;
  }

  // Everyone who holds the permission, wherever they are: for the few events
  // that belong to the whole system (nothing station-level uses this).
  async notifyPermissionHolders(
    permission: string,
    payload: NotificationPayload,
    exceptUserId?: string,
    client: Client = this.prisma,
  ): Promise<number> {
    // One query, not one permission lookup per user: the holders are the
    // people whose job carries the permission or who were granted it directly.
    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        archivedAt: null,
        ...(exceptUserId ? { id: { not: exceptUserId } } : {}),
        OR: [
          {
            roles: {
              some: { role: { permissions: { some: { permission: { key: permission } } } } },
            },
          },
          { directPermissions: { some: { permission: { key: permission } } } },
        ],
      },
      select: { id: true },
    });
    const recipients = users.map((u) => u.id);
    return this.notifyUsers(recipients, payload, client);
  }

  // One event, several tiers of recipients (each with its own link): a person in
  // more than one tier gets ONE row, with the link of the first tier they are in.
  async notifyScopeOnce(
    target: ScopeTarget,
    payload: Omit<NotificationPayload, 'link'>,
    tiers: Array<{ permissions: string[]; link: string }>,
    options: { exceptUserId?: string } = {},
  ): Promise<number> {
    const taken = new Set<string>();
    let created = 0;
    for (const tier of tiers) {
      const recipients = (
        await this.recipientsFor(target, tier.permissions, options.exceptUserId)
      ).filter((id) => !taken.has(id));
      recipients.forEach((id) => taken.add(id));
      created += await this.notifyUsers(recipients, { ...payload, link: tier.link });
    }
    return created;
  }

  async notifyScope(
    target: ScopeTarget,
    permissions: string[],
    payload: NotificationPayload,
    options: { exceptUserId?: string } = {},
  ): Promise<number> {
    const recipients = await this.recipientsFor(target, permissions, options.exceptUserId);
    return this.notifyUsers(recipients, payload);
  }

  // Direct to named users (a password reset, a decided request). A failure to
  // notify never fails the action that caused it.
  async notifyUsers(
    userIds: string[],
    payload: NotificationPayload,
    client: Client = this.prisma,
  ): Promise<number> {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return 0;
    try {
      // The same SETTING change twice while the first is still unread is ONE
      // row: its time moves to now, and nobody's bell fills with copies (a
      // test run that flips a setting five times must not read as five
      // events). Other events (a low-stock crossing) stay one row each.
      const collapses = COLLAPSIBLE_KINDS.has(payload.kind);
      const waiting = !collapses
        ? []
        : await client.notification.findMany({
            where: {
              userId: { in: unique },
              readAt: null,
              kind: payload.kind,
              title: payload.title,
              body: payload.body,
              link: payload.link ?? null,
              entityType: payload.entityType ?? null,
              entityId: payload.entityId ?? null,
            },
            select: { id: true, userId: true },
          });
      if (waiting.length > 0) {
        await client.notification.updateMany({
          where: { id: { in: waiting.map((w) => w.id) } },
          data: { createdAt: new Date() },
        });
      }
      const alreadyWaiting = new Set(waiting.map((w) => w.userId));
      const toCreate = unique.filter((userId) => !alreadyWaiting.has(userId));
      if (toCreate.length === 0) return 0;
      const result = await client.notification.createMany({
        data: toCreate.map((userId) => ({
          userId,
          kind: payload.kind,
          title: payload.title,
          body: payload.body,
          link: payload.link ?? null,
          entityType: payload.entityType ?? null,
          entityId: payload.entityId ?? null,
          dedupeKey: payload.dedupeKey ?? null,
        })),
        skipDuplicates: true,
      });
      void this.pruneOld();
      return result.count;
    } catch (error) {
      this.logger.warn(
        `notification ${payload.kind} could not be written: ${(error as Error).message}`,
      );
      return 0;
    }
  }

  // Kept 90 days. Run lazily, at most once an hour.
  private async pruneOld() {
    const now = Date.now();
    if (now - this.lastPrune < PRUNE_EVERY_MS) return;
    this.lastPrune = now;
    try {
      await this.prisma.notification.deleteMany({
        where: { createdAt: { lt: new Date(now - NOTIFICATION_RETENTION_DAYS * 86_400_000) } },
      });
    } catch (error) {
      this.logger.warn(`notification pruning failed: ${(error as Error).message}`);
    }
  }

  // Tell the people who manage the offices a user works at (for example the
  // office manager when an employee asks for a correction).
  async notifyOfficesOf(
    userId: string,
    permissions: string[],
    payload: NotificationPayload,
  ): Promise<number> {
    const rows = await this.prisma.userRegistrationStationScope.findMany({
      where: { userId },
      select: { registrationStationId: true },
    });
    const recipients = new Set<string>();
    for (const row of rows) {
      for (const id of await this.recipientsFor(
        { registrationStationId: row.registrationStationId },
        permissions,
        userId,
      )) {
        recipients.add(id);
      }
    }
    return this.notifyUsers([...recipients], payload);
  }

  // A person was locked out after repeated wrong passwords. Their supervisors
  // are told; if it is a manager account the super admin is told as well.
  async lockedOut(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        stationScope: { select: { stationId: true } },
        registrationStationScope: { select: { registrationStationId: true } },
        municipalityScope: { select: { municipalityId: true } },
      },
    });
    if (!user) return;
    const payload = {
      kind: 'ACCOUNT_LOCKED',
      title: `حساب ${user.fullName} مقفل مؤقتًا`,
      body: 'تكررت محاولات الدخول بكلمة مرور خاطئة. يمكن فتح الحساب من صفحة الشخص.',
      link: `/people/${user.id}`,
      entityType: 'User',
      entityId: user.id,
    };
    const recipients = new Set<string>();
    for (const s of user.stationScope) {
      (
        await this.recipientsFor(
          { stationId: s.stationId },
          ['notifications:station_events'],
          user.id,
        )
      ).forEach((r) => recipients.add(r));
    }
    for (const o of user.registrationStationScope) {
      (
        await this.recipientsFor(
          { registrationStationId: o.registrationStationId },
          ['notifications:office_events'],
          user.id,
        )
      ).forEach((r) => recipients.add(r));
    }
    await this.notifyUsers([...recipients], { ...payload, dedupeKey: undefined });
    if (user.municipalityScope.length > 0) {
      await this.notifyPermissionHolders('notifications:system_events', {
        ...payload,
        kind: 'MANAGER_LOCKED',
        title: `تكرر فشل الدخول على حساب المدير ${user.fullName}`,
      });
    } else if (user.stationScope.length === 0 && user.registrationStationScope.length === 0) {
      // After review (19 Oct 2026): an account tied to no place — a super
      // admin — had nobody to tell. The other super admins are told now.
      await this.notifyPermissionHolders(
        'notifications:system_events',
        { ...payload, kind: 'MANAGER_LOCKED', title: `تكرر فشل الدخول على حساب مدير النظام ${user.fullName}` },
        user.id,
      );
    }
  }

  // ── The inbox ────────────────────────────────────────────────────────

  // The bell. Setting and rule-switch events that repeat are shown ONCE, newest,
  // with how many there were, and the badge counts each distinct unread event
  // once. Rows written before the plain-sentence wording (`key: a ← b`) are
  // shown as a sentence too, and a "change" that changed nothing is not shown.
  async list(userId: string, limit = 30) {
    const select = {
      id: true,
      kind: true,
      title: true,
      body: true,
      link: true,
      readAt: true,
      createdAt: true,
      entityId: true,
    } as const;
    const [recent, unreadCollapsible, unreadOther] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: Math.max(limit * 4, 200),
        select,
      }),
      this.prisma.notification.findMany({
        where: { userId, readAt: null, kind: { in: [...COLLAPSIBLE_KINDS] } },
        select,
        take: 2000,
      }),
      this.prisma.notification.count({
        where: { userId, readAt: null, kind: { notIn: [...COLLAPSIBLE_KINDS] } },
      }),
    ]);

    const at = new Map<string, number>();
    const items: Array<PresentedRow & { count: number }> = [];
    for (const raw of recent) {
      const row = presentRow(raw);
      if (!row) continue; // a legacy "change" that changed nothing
      if (!COLLAPSIBLE_KINDS.has(row.kind)) {
        items.push({ ...row, count: 1 });
        continue;
      }
      const key = [row.kind, row.title, row.body, row.link ?? '', row.readAt ? 'r' : 'u'].join('|');
      const index = at.get(key);
      if (index !== undefined) {
        items[index]!.count += 1;
      } else {
        at.set(key, items.length);
        items.push({ ...row, count: 1 });
      }
    }

    const distinctUnread = new Set<string>();
    for (const raw of unreadCollapsible) {
      const row = presentRow(raw);
      if (row) distinctUnread.add([row.kind, row.title, row.body, row.link ?? ''].join('|'));
    }
    return {
      unreadCount: distinctUnread.size + unreadOther,
      items: items.slice(0, limit).map(({ entityId: _entityId, ...rest }) => rest),
    };
  }

  // Reading one row reads its identical copies too (they are shown as one).
  async markRead(userId: string, id: string) {
    const row = await this.prisma.notification.findFirst({ where: { id, userId } });
    if (!row) return { ok: true };
    if (!COLLAPSIBLE_KINDS.has(row.kind)) {
      await this.prisma.notification.updateMany({
        where: { id, userId, readAt: null },
        data: { readAt: new Date() },
      });
      return { ok: true };
    }
    const shown = presentRow(row);
    const waiting = await this.prisma.notification.findMany({
      where: { userId, readAt: null, kind: row.kind },
      select: {
        id: true,
        kind: true,
        title: true,
        body: true,
        link: true,
        readAt: true,
        createdAt: true,
        entityId: true,
      },
    });
    const same = waiting.filter((w) => {
      const p = presentRow(w);
      return (
        (!p && !shown) ||
        (p && shown && p.title === shown.title && p.body === shown.body && p.link === shown.link)
      );
    });
    await this.prisma.notification.updateMany({
      where: { id: { in: [id, ...same.map((w) => w.id)] }, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { marked: result.count };
  }
}
