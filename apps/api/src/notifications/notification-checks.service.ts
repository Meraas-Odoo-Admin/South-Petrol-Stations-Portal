import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { CardStockService } from '../card-stock/card-stock.service';
import { ReadinessService } from '../readiness/readiness.service';
import { tripoliDay } from '../common/utils/grace-stage';
import { daysBetween } from '../common/utils/tripoli';
import { NotificationsService } from './notifications.service';

// Notifications that come from STATE rather than from an event: there is no
// moment to hook (a deadline getting close, a municipality that has no manager,
// a blank-card box running low). They are evaluated when the person opens the
// bell, at most every few minutes per user, and each writes under a dedupeKey
// so the same condition is told once.
const REFRESH_EVERY_MS = 5 * 60_000;
const READINESS_WARNING_DAYS = 7;

@Injectable()
export class NotificationChecksService {
  private readonly logger = new Logger(NotificationChecksService.name);
  private readonly lastRun = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly settings: SystemSettingsService,
    private readonly notifications: NotificationsService,
    private readonly cardStock: CardStockService,
    private readonly readiness: ReadinessService,
  ) {}

  async refreshFor(userId: string): Promise<void> {
    const now = Date.now();
    const last = this.lastRun.get(userId) ?? 0;
    if (now - last < REFRESH_EVERY_MS) return;
    this.lastRun.set(userId, now);
    try {
      const permissions = await this.rbac.getPermissionsForUser(userId);
      if (permissions.has('notifications:municipality_events')) await this.municipalityChecks(userId);
      if (permissions.has('notifications:office_events')) await this.officeChecks(userId);
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

  private async municipalityChecks(userId: string) {
    const scope = await this.rbac.getMunicipalityScope(userId);
    const municipalities = await this.prisma.municipality.findMany({
      where: { archivedAt: null, ...(scope ? { id: { in: scope } } : {}) },
      select: { id: true, name: true, cardRequiredFromDate: true },
    });
    const today = tripoliDay(new Date());

    for (const municipality of municipalities) {
      // The deadline is 7 days away (or closer) and registration will not
      // finish at the recent pace.
      const deadline = municipality.cardRequiredFromDate ? tripoliDay(municipality.cardRequiredFromDate) : null;
      if (deadline) {
        const remaining = daysBetween(today, deadline);
        if (remaining >= 0 && remaining <= READINESS_WARNING_DAYS) {
          const report = await this.readiness.report({ municipalityId: municipality.id, days: 14 }, userId);
          const headline = report.headline;
          const wontFinish = headline && (headline.verdict === 'AT_RISK' || headline.verdict === 'NO_ISSUANCE');
          if (headline && wontFinish) {
            await this.notifications.notifyUsers([userId], {
              kind: 'DEADLINE_AT_RISK',
              title: `الموعد النهائي في ${municipality.name} بعد ${remaining} أيام والتسجيل لن يكتمل`,
              body:
                headline.daysNeeded !== null
                  ? `يحتاج التسجيل نحو ${headline.daysNeeded} يومًا بالوتيرة الحالية، والباقي ${remaining} أيام.`
                  : 'لم تُصدر البطاقات في الأيام الأخيرة، فلا يمكن تقدير المدة.',
              link: '/manage',
              entityType: 'Municipality',
              entityId: municipality.id,
              dedupeKey: `readiness:${municipality.id}:${deadline}`,
            });
          }
        }
      }

      const offices = await this.prisma.registrationStation.findMany({
        where: { municipalityId: municipality.id, archivedAt: null },
        select: { id: true },
      });
      for (const office of offices) {
        await this.shortfallFor(userId, office.id, `/manage/offices/${office.id}?tab=cards`);
      }
    }
  }

  private async officeChecks(userId: string) {
    const scope = await this.rbac.getRegistrationStationScope(userId);
    if (!scope) return;
    const threshold = await this.settings.getNumber('cards.low_blank_threshold');
    for (const officeId of scope) {
      await this.shortfallFor(userId, officeId, '/my-office?tab=cards');
      await this.lowBlankFor(userId, officeId, threshold);
    }
  }

  // More blanks left the box than the system printed: unaccounted cards.
  private async shortfallFor(userId: string, officeId: string, link: string) {
    const result = await this.cardStock.reconciliation({ registrationStationId: officeId }, userId);
    const unaccounted = result.pools.reduce((sum, p) => sum + p.totals.unaccountedCards, 0);
    if (unaccounted <= 0) return;
    const office = result.pools[0]?.registrationStation.name ?? '';
    await this.notifications.notifyUsers([userId], {
      kind: 'CARD_SHORTFALL',
      title: `نقص في بطاقات ${office}`,
      body: `${unaccounted} بطاقة خرجت من الصندوق دون طباعة مسجّلة في المنظومة.`,
      link,
      entityType: 'RegistrationStation',
      entityId: officeId,
      dedupeKey: `shortfall:${officeId}:${unaccounted}`,
    });
  }

  private async lowBlankFor(userId: string, officeId: string, threshold: number) {
    const result = await this.cardStock.reconciliation({ registrationStationId: officeId }, userId);
    const pool = result.pools.find((p) => p.desk === null);
    const position = pool?.sinceLastCount;
    if (!pool || !position) return;
    if (position.expectedRemaining >= threshold) return;
    await this.notifications.notifyUsers([userId], {
      kind: 'LOW_BLANK_CARDS',
      title: `بطاقات فارغة قليلة في ${pool.registrationStation.name}`,
      body: `المتبقي المتوقع ${Math.max(0, position.expectedRemaining)} بطاقة، أقل من الحد ${threshold}.`,
      link: '/my-office?tab=cards',
      entityType: 'RegistrationStation',
      entityId: officeId,
      // Once per count period: a new count re-arms it.
      dedupeKey: `lowblank:${officeId}:${position.lastCount.id}`,
    });
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
