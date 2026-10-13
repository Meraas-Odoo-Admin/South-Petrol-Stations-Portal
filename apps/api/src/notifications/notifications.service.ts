import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';

// Phase 5B: ONE notification service that features call. An event is one line
// at its call site:
//
//   await this.notifications.notifyScope({ stationId }, ['fuel_stock:manage'], { kind, title, body, link });
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
  async recipientsFor(target: ScopeTarget, permissions: string[], exceptUserId?: string): Promise<string[]> {
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
          { roles: { some: { role: { permissions: { some: { permission: { key: permission } } } } } } },
          { directPermissions: { some: { permission: { key: permission } } } },
        ],
      },
      select: { id: true },
    });
    const recipients = users.map((u) => u.id);
    return this.notifyUsers(recipients, payload, client);
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
  async notifyUsers(userIds: string[], payload: NotificationPayload, client: Client = this.prisma): Promise<number> {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return 0;
    try {
      const result = await client.notification.createMany({
        data: unique.map((userId) => ({
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
      this.logger.warn(`notification ${payload.kind} could not be written: ${(error as Error).message}`);
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
  async notifyOfficesOf(userId: string, permissions: string[], payload: NotificationPayload): Promise<number> {
    const rows = await this.prisma.userRegistrationStationScope.findMany({
      where: { userId },
      select: { registrationStationId: true },
    });
    const recipients = new Set<string>();
    for (const row of rows) {
      for (const id of await this.recipientsFor({ registrationStationId: row.registrationStationId }, permissions, userId)) {
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
      (await this.recipientsFor({ stationId: s.stationId }, ['notifications:station_events'], user.id)).forEach((r) => recipients.add(r));
    }
    for (const o of user.registrationStationScope) {
      (await this.recipientsFor({ registrationStationId: o.registrationStationId }, ['notifications:office_events'], user.id)).forEach((r) => recipients.add(r));
    }
    await this.notifyUsers([...recipients], { ...payload, dedupeKey: undefined });
    if (user.municipalityScope.length > 0) {
      await this.notifyPermissionHolders('notifications:system_events', {
        ...payload,
        kind: 'MANAGER_LOCKED',
        title: `تكرر فشل الدخول على حساب المدير ${user.fullName}`,
      });
    }
  }

  // ── The inbox ────────────────────────────────────────────────────────

  async list(userId: string, limit = 30) {
    const [items, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
        select: { id: true, kind: true, title: true, body: true, link: true, readAt: true, createdAt: true },
      }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { unreadCount, items };
  }

  async markRead(userId: string, id: string) {
    await this.prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
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
