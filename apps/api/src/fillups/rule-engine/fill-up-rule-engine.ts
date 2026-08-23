import { resolveWeekWindowStrategy } from './week-window.strategy';
import type { FillUpHistoryReader, FillUpHistoryRecord, RuleResult, SettingsReader } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
const LOOKBACK_DAYS = 14;

function daysBetween(earlier: Date, later: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / DAY_MS);
}

function countInWindow(records: FillUpHistoryRecord[], windowStart: Date): number {
  return records.filter((record) => record.occurredAt >= windowStart).length;
}

// Pure, independently unit-tested logic (CLAUDE.md working style) — no
// Prisma, no NestJS decorators. SettingsReader/FillUpHistoryReader are
// injected as plain interfaces so this class can be constructed directly in
// tests with fakes; the real controller wiring passes SystemSettingsService
// and FillUpRepository, which implement those interfaces against Prisma.
//
// PROVISIONAL, pending the client's final answer on the aggregate
// per-vehicle/per-driver cap question (docs/OPEN_ITEMS.md, "Multi-vehicle
// drivers need both a per-vehicle cap and an aggregate per-driver cap"):
// the check order below (vehicle gap -> vehicle weekly cap -> driver gap ->
// driver weekly cap, first failure wins) and the fact that the two caps are
// evaluated as fully INDEPENDENT checks are both placeholders. The client
// may eventually want the two caps combined into one number, a different
// precedence, or a single combined failure reason — none of that is
// confirmed yet, so don't treat this order as final design.
export class FillUpRuleEngine {
  constructor(
    private readonly settings: SettingsReader,
    private readonly history: FillUpHistoryReader,
  ) {}

  async evaluate(vehicleId: string, driverId: string, occurredAt: Date): Promise<RuleResult> {
    const maxPerWeekVehicle = await this.settings.getNumber('fillup.max_per_week');
    const minGapDaysVehicle = await this.settings.getNumber('fillup.min_gap_days');
    const maxPerWeekDriver = await this.settings.getNumber('fillup.max_per_week_per_driver');
    const minGapDaysDriver = await this.settings.getNumber('fillup.min_gap_days_per_driver');
    const weekWindowMode = await this.settings.getString('fillup.week_window_mode');
    const weekStartDay = await this.settings.getNumber('fillup.week_start_day');

    const windowStrategy = resolveWeekWindowStrategy(weekWindowMode);
    const windowStart = windowStrategy.windowStart(occurredAt, weekStartDay);

    const recentForVehicle = await this.history.getRecentForVehicle(vehicleId, occurredAt, LOOKBACK_DAYS);
    const lastVehicleFillUp = recentForVehicle[0];
    if (lastVehicleFillUp && daysBetween(lastVehicleFillUp.occurredAt, occurredAt) < minGapDaysVehicle) {
      return { allowed: false, reason: 'VEHICLE_GAP_TOO_SHORT' };
    }
    if (countInWindow(recentForVehicle, windowStart) >= maxPerWeekVehicle) {
      return { allowed: false, reason: 'VEHICLE_WEEKLY_CAP_REACHED' };
    }

    const recentForDriver = await this.history.getRecentForDriver(driverId, occurredAt, LOOKBACK_DAYS);
    const lastDriverFillUp = recentForDriver[0];
    if (lastDriverFillUp && daysBetween(lastDriverFillUp.occurredAt, occurredAt) < minGapDaysDriver) {
      return { allowed: false, reason: 'DRIVER_GAP_TOO_SHORT' };
    }
    if (countInWindow(recentForDriver, windowStart) >= maxPerWeekDriver) {
      return { allowed: false, reason: 'DRIVER_WEEKLY_CAP_REACHED' };
    }

    return { allowed: true };
  }
}
