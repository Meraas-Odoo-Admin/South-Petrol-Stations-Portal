import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { NotificationsService } from './notifications.service';

// Notifications that come from STATE rather than from an event: there is no
// moment to hook (a municipality that has no manager, an exception waiting).
// They are evaluated when the person opens the
// bell, at most every few minutes per user, and each writes under a dedupeKey
// so the same condition is told once.
const REFRESH_EVERY_MS = 5 * 60_000;

@Injectable()
export class NotificationChecksService {
  private readonly logger = new Logger(NotificationChecksService.name);
  private readonly lastRun = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly notifications: NotificationsService,
  ) {}

  async refreshFor(userId: string): Promise<void> {
    const now = Date.now();
    const last = this.lastRun.get(userId) ?? 0;
    if (now - last < REFRESH_EVERY_MS) return;
    this.lastRun.set(userId, now);
    try {
      const permissions = await this.rbac.getPermissionsForUser(userId);
      if (permissions.has('notifications:station_events')) await this.stationChecks(userId);
      if (permissions.has('notifications:system_events')) await this.systemChecks(userId);
      if (permissions.has('cards:issue')) await this.printChecks(userId);
    } catch (error) {
      this.logger.warn(`derived notification checks failed: ${(error as Error).message}`);
    }
  }

  // Used by tests to run the checks again without waiting out the interval.
  forget(userId: string) {
    this.lastRun.delete(userId);
  }

  // Exceptions waiting for approval at the supervisor's stations.
  private async stationChecks(userId: string) {
    const scope = await this.rbac.getStationScope(userId);
    if (!scope || scope.length === 0) return;
    const pending = await this.prisma.exception.findMany({
      where: { approvedById: null, fillUpTransaction: { stationId: { in: scope } } },
      select: { id: true, fillUpTransaction: { select: { stationId: true, station: { select: { name: true } } } } },
      take: 50,
    });
    for (const exception of pending) {
      await this.notifications.notifyUsers([userId], {
        kind: 'EXCEPTION_PENDING',
        title: `استثناء بانتظار الموافقة في ${exception.fillUpTransaction.station.name}`,
        body: 'تعبئة سُجّلت باستثناء وتحتاج موافقتك.',
        link: '/exceptions',
        entityType: 'Exception',
        entityId: exception.id,
        dedupeKey: `exception-pending:${exception.id}`,
      });
    }
  }

  // Only what needs the super admin: a municipality that nobody manages.
  private async systemChecks(userId: string) {
    const municipalities = await this.prisma.municipality.findMany({
      where: { archivedAt: null },
      select: { id: true, name: true },
    });
    for (const municipality of municipalities) {
      const managers = await this.prisma.userMunicipalityScope.count({
        where: { municipalityId: municipality.id, user: { isActive: true, archivedAt: null } },
      });
      if (managers > 0) continue;
      await this.notifications.notifyUsers([userId], {
        kind: 'NO_MANAGER',
        title: `بلدية ${municipality.name} بلا مدير`,
        body: 'لا يوجد حساب مدير بلدية فعّال لهذه البلدية.',
        link: `/admin/municipalities/${municipality.id}`,
        entityType: 'Municipality',
        entityId: municipality.id,
        dedupeKey: `no-manager:${municipality.id}`,
      });
    }
  }

  // A replacement card issued after a failed print that nobody has printed.
  private async printChecks(userId: string) {
    const cutoff = new Date(Date.now() - 10 * 60_000);
    const cards = await this.prisma.vehicleCard.findMany({
      where: {
        issuedById: userId,
        reason: 'FAILED_PRINT',
        status: 'ACTIVE',
        issuedAt: { lt: cutoff },
      },
      select: { id: true, cardNumber: true },
      take: 20,
    });
    for (const card of cards) {
      const prints = await this.prisma.cardPrint.count({ where: { cardId: card.id } });
      if (prints > 0) continue;
      await this.notifications.notifyUsers([userId], {
        kind: 'UNPRINTED_REPLACEMENT',
        title: 'بطاقة بديلة لم تُطبع بعد',
        body: `البطاقة ${card.cardNumber} أُصدرت بعد فشل طباعة ولم تُسجَّل لها طباعة.`,
        link: `/cards/${card.id}`,
        entityType: 'VehicleCard',
        entityId: card.id,
        dedupeKey: `unprinted:${card.id}`,
      });
    }
  }
}
