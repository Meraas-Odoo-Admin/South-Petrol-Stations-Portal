// Kept separate from FillUpRuleEngine itself so the engine can be
// unit-tested with plain fakes — no Prisma, no NestJS DI module, no DB.
//
// Round 6: driver-scoped checks re-scoped to the vehicle's owner instead —
// see docs/DESIGN_owner_based_fillups.md.

export type RuleFailureReason =
  | 'VEHICLE_GAP_TOO_SHORT'
  | 'VEHICLE_WEEKLY_CAP_REACHED'
  | 'OWNER_GAP_TOO_SHORT'
  | 'OWNER_WEEKLY_CAP_REACHED'
  | 'LITERS_PER_PERSON_CAP_REACHED';

// The specific prior fill-up that tripped an OWNER_*/LITERS_* check — an
// owner-level rule can fire because of a fill-up on a DIFFERENT vehicle
// than the one being submitted now, which looks like a false positive
// unless the UI can name which one. Vehicle-level checks don't need this
// (the triggering vehicle is already the one being submitted).
export interface RuleTrigger {
  vehicleId: string;
  occurredAt: Date;
}

export type RuleResult =
  | { allowed: true; coveredBy?: { standingExceptionId: string; rule: RuleFailureReason } }
  | { allowed: false; reason: RuleFailureReason; trigger?: RuleTrigger };

// One rule's actual numbers, for the pre-submit breakdown screen (round 7
// item 1) — "days since last fill" for a gap check, "count this week" for
// a weekly-cap check, "liters so far this week" for the liters check.
// `actual: null` means there's no prior history to compare against (the
// check trivially passes — e.g. a vehicle/owner with zero fill-ups yet).
// Never a client-side estimate: this is the exact same computation
// evaluate() itself uses to decide pass/fail, just captured for every rule
// instead of stopping at the first failure.
export interface RuleCheckDetail {
  reason: RuleFailureReason;
  passed: boolean;
  actual: number | null;
  limit: number;
}

export interface FillUpHistoryRecord {
  vehicleId: string;
  occurredAt: Date;
  quantityLiters: number;
}

// Read-only slice of fill-up history the engine needs. FillUpRepository
// (Prisma-backed) implements this for the real controller wiring; unit
// tests pass an in-memory fake instead.
export interface FillUpHistoryReader {
  // Most recent fill-ups for the vehicle, strictly before `before`, within
  // `lookbackDays`, ordered newest-first.
  getRecentForVehicle(
    vehicleId: string,
    before: Date,
    lookbackDays: number,
  ): Promise<FillUpHistoryRecord[]>;

  // Same, scoped to the vehicle's owner instead — the aggregate per-owner
  // cap looks across all vehicles that owner has, not just one.
  getRecentForOwner(
    ownerId: string,
    before: Date,
    lookbackDays: number,
  ): Promise<FillUpHistoryRecord[]>;
}

// Read-only slice of SystemSetting the engine needs. SystemSettingsService
// (Prisma-backed) implements this; unit tests pass an in-memory fake.
export interface SettingsReader {
  getNumber(key: string): Promise<number>;
  getString(key: string): Promise<string>;
}

// Read-only lookup for active StandingException grants. Prisma-backed in
// the real wiring; unit tests pass an in-memory fake. `at` is the fill-up's
// occurredAt, so a grant with an expiresAt in the past never applies.
export interface StandingExceptionReader {
  findActiveCovering(
    params: { vehicleId: string; ownerId: string | null; rule: RuleFailureReason; at: Date },
  ): Promise<{ id: string } | null>;
}
