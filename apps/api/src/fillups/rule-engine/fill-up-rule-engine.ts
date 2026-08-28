import { resolveWeekWindowStrategy } from './week-window.strategy';
import type {
  FillUpHistoryReader,
  FillUpHistoryRecord,
  RuleFailureReason,
  RuleResult,
  SettingsReader,
  StandingExceptionReader,
} from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
const LOOKBACK_DAYS = 14;

function daysBetween(earlier: Date, later: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / DAY_MS);
}

function recordsInWindow(records: FillUpHistoryRecord[], windowStart: Date): FillUpHistoryRecord[] {
  return records.filter((record) => record.occurredAt >= windowStart);
}

// One potential violation this check found — not yet resolved against
// standing exceptions. `record` is the specific prior fill-up (for
// gap/liters checks) that would be cited as the trigger; weekly-cap
// checks have no single triggering record (it's the aggregate), so it's
// omitted there.
interface Violation {
  reason: RuleFailureReason;
  record?: FillUpHistoryRecord;
}

// Pure, independently unit-tested logic (CLAUDE.md working style) — no
// Prisma, no NestJS decorators. SettingsReader/FillUpHistoryReader/
// StandingExceptionReader are injected as plain interfaces so this class
// can be constructed directly in tests with fakes; the real controller
// wiring passes SystemSettingsService/FillUpsRepository/
// StandingExceptionsRepository, which implement those interfaces against
// Prisma.
//
// PROVISIONAL, pending the client's final answer on the aggregate
// per-vehicle/per-driver cap question (docs/OPEN_ITEMS.md, "Multi-vehicle
// drivers need both a per-vehicle cap and an aggregate per-driver cap"):
// the check order below (vehicle gap -> vehicle weekly cap -> driver gap ->
// driver weekly cap -> driver liters-per-week cap, first failure wins) and
// the fact that the checks are evaluated as fully INDEPENDENT are both
// placeholders. The client may eventually want the caps combined into one
// number, a different precedence, or a single combined failure reason —
// none of that is confirmed yet, so don't treat this order as final design.
//
// Standing exceptions (interim design, not yet client-confirmed — see
// docs/OPEN_ITEMS.md): when a check WOULD fail, an active StandingException
// covering that specific rule for this vehicle or driver auto-allows it
// instead of rejecting — evaluation stops there either way (first
// violation wins, whether it ends in rejection or an exemption).
export class FillUpRuleEngine {
  constructor(
    private readonly settings: SettingsReader,
    private readonly history: FillUpHistoryReader,
    private readonly standingExceptions?: StandingExceptionReader,
  ) {}

  async evaluate(vehicleId: string, driverId: string, occurredAt: Date): Promise<RuleResult> {
    const maxPerWeekVehicle = await this.settings.getNumber('fillup.max_per_week');
    const minGapDaysVehicle = await this.settings.getNumber('fillup.min_gap_days');
    const maxPerWeekDriver = await this.settings.getNumber('fillup.max_per_week_per_driver');
    const minGapDaysDriver = await this.settings.getNumber('fillup.min_gap_days_per_driver');
    const maxLitersPerWeekDriver = await this.settings.getNumber(
      'fillup.max_liters_per_week_per_driver',
    );
    const weekWindowMode = await this.settings.getString('fillup.week_window_mode');
    const weekStartDay = await this.settings.getNumber('fillup.week_start_day');

    const windowStrategy = resolveWeekWindowStrategy(weekWindowMode);
    const windowStart = windowStrategy.windowStart(occurredAt, weekStartDay);

    const recentForVehicle = await this.history.getRecentForVehicle(vehicleId, occurredAt, LOOKBACK_DAYS);
    const lastVehicleFillUp = recentForVehicle[0];

    const recentForDriver = await this.history.getRecentForDriver(driverId, occurredAt, LOOKBACK_DAYS);
    const lastDriverFillUp = recentForDriver[0];

    const violations: Violation[] = [];

    if (lastVehicleFillUp && daysBetween(lastVehicleFillUp.occurredAt, occurredAt) < minGapDaysVehicle) {
      violations.push({ reason: 'VEHICLE_GAP_TOO_SHORT', record: lastVehicleFillUp });
    }
    if (recordsInWindow(recentForVehicle, windowStart).length >= maxPerWeekVehicle) {
      violations.push({ reason: 'VEHICLE_WEEKLY_CAP_REACHED' });
    }
    if (lastDriverFillUp && daysBetween(lastDriverFillUp.occurredAt, occurredAt) < minGapDaysDriver) {
      violations.push({ reason: 'DRIVER_GAP_TOO_SHORT', record: lastDriverFillUp });
    }
    if (recordsInWindow(recentForDriver, windowStart).length >= maxPerWeekDriver) {
      violations.push({ reason: 'DRIVER_WEEKLY_CAP_REACHED' });
    }
    const litersInWindow = recordsInWindow(recentForDriver, windowStart).reduce(
      (sum, r) => sum + r.quantityLiters,
      0,
    );
    if (litersInWindow >= maxLitersPerWeekDriver) {
      violations.push({ reason: 'LITERS_PER_PERSON_CAP_REACHED' });
    }

    // First-failure-wins, same order as before the standing-exception
    // check was added — only now each candidate failure is resolved
    // against active grants before being treated as final.
    for (const violation of violations) {
      const covering = await this.standingExceptions?.findActiveCovering({
        vehicleId,
        driverId,
        rule: violation.reason,
        at: occurredAt,
      });
      if (covering) {
        return { allowed: true, coveredBy: { standingExceptionId: covering.id, rule: violation.reason } };
      }
      return {
        allowed: false,
        reason: violation.reason,
        trigger: violation.record
          ? { vehicleId: violation.record.vehicleId, occurredAt: violation.record.occurredAt }
          : undefined,
      };
    }

    return { allowed: true };
  }
}
