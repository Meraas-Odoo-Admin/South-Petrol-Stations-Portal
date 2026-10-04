import { resolveWeekWindowStrategy } from './week-window.strategy';
import { OWNER_LEVEL_RULES } from './types';
import type {
  FillUpHistoryReader,
  FillUpHistoryRecord,
  RuleCheckDetail,
  RuleFailureReason,
  RuleResult,
  RuleSubject,
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
// per-vehicle/per-owner cap question (docs/OPEN_ITEMS.md, "Multi-vehicle
// drivers need both a per-vehicle cap and an aggregate per-driver cap",
// re-confirmed round 6 as per-OWNER — see docs/DESIGN_owner_based_fillups.md):
// the check order below (vehicle gap -> vehicle weekly cap -> owner gap ->
// owner weekly cap -> owner liters-per-week cap, first failure wins) and
// the fact that the checks are evaluated as fully INDEPENDENT are both
// placeholders. The client may eventually want the caps combined into one
// number, a different precedence, or a single combined failure reason —
// none of that is confirmed yet, so don't treat this order as final design.
//
// Standing exceptions (interim design, not yet client-confirmed — see
// docs/OPEN_ITEMS.md): when a check WOULD fail, an active StandingException
// covering that specific rule for this vehicle or owner auto-allows it
// instead of rejecting — evaluation stops there either way (first
// violation wins, whether it ends in rejection or an exemption).
export class FillUpRuleEngine {
  constructor(
    private readonly settings: SettingsReader,
    private readonly history: FillUpHistoryReader,
    private readonly standingExceptions?: StandingExceptionReader,
  ) {}

  // The single source of truth every rule's pass/fail and actual numbers
  // come from — evaluate() and evaluateWithChecks() both call this rather
  // than each recomputing their own version, so the pre-submit breakdown
  // screen (round 7 item 1) can never drift from what a real submission
  // will do.
  //
  // ownerId is null when the vehicle has no VehicleOwner set yet — owner-
  // scoped checks are skipped entirely in that case (nothing to aggregate
  // against, not a failure), vehicle-scoped checks still run.
  //
  // municipalityId is the municipality this fill-up is happening in (the
  // station's). Every history count below is limited to it: a vehicle
  // draws on a separate allowance in each municipality. The limits
  // themselves stay system-wide SystemSetting values.
  private async computeChecks(
    subject: RuleSubject,
    municipalityId: string,
    occurredAt: Date,
  ): Promise<{ checks: (RuleCheckDetail & { record?: FillUpHistoryRecord })[] }> {
    // Phase 4a: for a plate with no registered vehicle the "vehicle-level"
    // rules count that plate's own history (same settings, same checks, same
    // reasons); there's no owner, so the owner-level rules are left out.
    const ownerId = subject.kind === 'vehicle' ? subject.ownerId : null;
    const maxPerWeekVehicle = await this.settings.getNumber('fillup.max_per_week');
    const minGapDaysVehicle = await this.settings.getNumber('fillup.min_gap_days');
    const maxPerWeekOwner = await this.settings.getNumber('fillup.max_per_week_per_owner');
    const minGapDaysOwner = await this.settings.getNumber('fillup.min_gap_days_per_owner');
    const maxLitersPerWeekOwner = await this.settings.getNumber(
      'fillup.max_liters_per_week_per_owner',
    );
    const weekWindowMode = await this.settings.getString('fillup.week_window_mode');
    const weekStartDay = await this.settings.getNumber('fillup.week_start_day');

    const windowStrategy = resolveWeekWindowStrategy(weekWindowMode);
    const windowStart = windowStrategy.windowStart(occurredAt, weekStartDay);

    const recentForVehicle =
      subject.kind === 'vehicle'
        ? await this.history.getRecentForVehicle(subject.vehicleId, municipalityId, occurredAt, LOOKBACK_DAYS)
        : await this.history.getRecentForPlate(subject.normalizedPlate, municipalityId, occurredAt, LOOKBACK_DAYS);
    const lastVehicleFillUp = recentForVehicle[0];
    const vehicleCountThisWeek = recordsInWindow(recentForVehicle, windowStart).length;

    const recentForOwner = ownerId
      ? await this.history.getRecentForOwner(ownerId, municipalityId, occurredAt, LOOKBACK_DAYS)
      : [];
    const lastOwnerFillUp = recentForOwner[0];
    const ownerCountThisWeek = recordsInWindow(recentForOwner, windowStart).length;
    const ownerLitersThisWeek = recordsInWindow(recentForOwner, windowStart).reduce(
      (sum, r) => sum + r.quantityLiters,
      0,
    );

    const vehicleGapDays = lastVehicleFillUp ? daysBetween(lastVehicleFillUp.occurredAt, occurredAt) : null;
    const ownerGapDays = lastOwnerFillUp ? daysBetween(lastOwnerFillUp.occurredAt, occurredAt) : null;

    const checks: (RuleCheckDetail & { record?: FillUpHistoryRecord })[] = [
      {
        reason: 'VEHICLE_GAP_TOO_SHORT',
        passed: vehicleGapDays === null || vehicleGapDays >= minGapDaysVehicle,
        actual: vehicleGapDays,
        limit: minGapDaysVehicle,
        record: lastVehicleFillUp,
      },
      {
        reason: 'VEHICLE_WEEKLY_CAP_REACHED',
        passed: vehicleCountThisWeek < maxPerWeekVehicle,
        actual: vehicleCountThisWeek,
        limit: maxPerWeekVehicle,
      },
    ];

    if (ownerId) {
      checks.push(
        {
          reason: 'OWNER_GAP_TOO_SHORT',
          passed: ownerGapDays === null || ownerGapDays >= minGapDaysOwner,
          actual: ownerGapDays,
          limit: minGapDaysOwner,
          record: lastOwnerFillUp,
        },
        {
          reason: 'OWNER_WEEKLY_CAP_REACHED',
          passed: ownerCountThisWeek < maxPerWeekOwner,
          actual: ownerCountThisWeek,
          limit: maxPerWeekOwner,
        },
        {
          reason: 'LITERS_PER_PERSON_CAP_REACHED',
          passed: ownerLitersThisWeek < maxLitersPerWeekOwner,
          actual: ownerLitersThisWeek,
          limit: maxLitersPerWeekOwner,
        },
      );
    }

    return { checks };
  }

  // Resolves a list of candidate violations against standing exceptions,
  // first-failure-wins — shared by evaluate() and evaluateWithChecks() so
  // the two never disagree on the final verdict.
  private async resolveViolations(
    subject: RuleSubject,
    occurredAt: Date,
    violations: Violation[],
  ): Promise<RuleResult> {
    for (const violation of violations) {
      // A standing exception is granted to a vehicle or an owner; a plate
      // with no registered vehicle has neither, so nothing can cover it.
      const covering =
        subject.kind === 'vehicle'
          ? await this.standingExceptions?.findActiveCovering({
              vehicleId: subject.vehicleId,
              ownerId: subject.ownerId,
              rule: violation.reason,
              at: occurredAt,
            })
          : null;
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

  async evaluate(
    vehicleId: string,
    ownerId: string | null,
    municipalityId: string,
    occurredAt: Date,
  ): Promise<RuleResult> {
    return this.evaluateSubject({ kind: 'vehicle', vehicleId, ownerId }, municipalityId, occurredAt);
  }

  async evaluateSubject(subject: RuleSubject, municipalityId: string, occurredAt: Date): Promise<RuleResult> {
    const { checks } = await this.computeChecks(subject, municipalityId, occurredAt);
    const violations: Violation[] = checks
      .filter((c) => !c.passed)
      .map((c) => ({ reason: c.reason, record: c.record }));
    return this.resolveViolations(subject, occurredAt, violations);
  }

  // Round 7 item 1: the fill-up form's pre-submit rule-review screen needs
  // every applicable rule's actual numbers, not just the first failure —
  // this runs the identical check computation evaluate() uses and returns
  // both the full per-rule breakdown and the same final verdict, so the UI
  // can never show numbers that disagree with what a real submission does.
  async evaluateWithChecks(
    vehicleId: string,
    ownerId: string | null,
    municipalityId: string,
    occurredAt: Date,
  ): Promise<{ result: RuleResult; checks: RuleCheckDetail[] }> {
    const { result, checks } = await this.evaluateSubjectWithChecks(
      { kind: 'vehicle', vehicleId, ownerId },
      municipalityId,
      occurredAt,
    );
    return { result, checks };
  }

  // `skipped` lists the rules that cannot apply to this subject (the three
  // owner-level rules for an unregistered plate) so the caller can say so.
  async evaluateSubjectWithChecks(
    subject: RuleSubject,
    municipalityId: string,
    occurredAt: Date,
  ): Promise<{ result: RuleResult; checks: RuleCheckDetail[]; skipped: RuleFailureReason[] }> {
    const { checks } = await this.computeChecks(subject, municipalityId, occurredAt);
    const violations: Violation[] = checks
      .filter((c) => !c.passed)
      .map((c) => ({ reason: c.reason, record: c.record }));
    const result = await this.resolveViolations(subject, occurredAt, violations);
    return {
      result,
      checks: checks.map(({ record: _record, ...rest }) => rest),
      skipped: subject.kind === 'plate' ? OWNER_LEVEL_RULES : [],
    };
  }
}
