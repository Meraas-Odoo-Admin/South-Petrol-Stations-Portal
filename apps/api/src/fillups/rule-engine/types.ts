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
  // Null when the prior fill-up was for an unregistered plate.
  vehicleId: string | null;
  occurredAt: Date;
}

// Who the fill-up is for — what the allowance is counted against.
//  - vehicle: a registered vehicle (and its owner, when it has one).
//  - plate: a plate with no registered vehicle (grace / awareness stages),
//    counted by its normalized plate within the municipality. There's no
//    owner, so the three owner-level rules cannot apply, and no standing
//    exception can cover anything (those are granted to a vehicle/owner).
export type RuleSubject =
  | {
      kind: 'vehicle';
      vehicleId: string;
      ownerId: string | null;
      // Phase 5A: an INSTITUTION owner's vehicles are never lumped together
      // by the owner-level rules (a bank with 20 cars would hit the owner
      // weekly limit at once) - only the vehicle-level rules apply to them.
      ownerKind?: 'INDIVIDUAL' | 'INSTITUTION';
    }
  | { kind: 'plate'; normalizedPlate: string };

// Why the owner-level rules were left out of an evaluation, so the screen
// says so instead of silently skipping them.
export type SkippedBecause = 'UNREGISTERED_PLATE' | 'INSTITUTION_OWNER';

// Phase 5A: every rule can be switched on or off by the super admin. The
// switch lives in SystemSetting (never a constant), keyed per rule.
export const RULE_SWITCH_KEYS: Record<RuleFailureReason, string> = {
  VEHICLE_GAP_TOO_SHORT: 'fillup.rule.vehicle_gap.enabled',
  VEHICLE_WEEKLY_CAP_REACHED: 'fillup.rule.vehicle_weekly.enabled',
  OWNER_GAP_TOO_SHORT: 'fillup.rule.owner_gap.enabled',
  OWNER_WEEKLY_CAP_REACHED: 'fillup.rule.owner_weekly.enabled',
  LITERS_PER_PERSON_CAP_REACHED: 'fillup.rule.owner_liters.enabled',
};

// What a switch means when its row is missing (a database that has not had
// the phase 5A migration yet): all on, except owner liters. The seed and the
// migration insert the same defaults; an admin's value is never overwritten.
export const RULE_SWITCH_DEFAULTS: Record<RuleFailureReason, boolean> = {
  VEHICLE_GAP_TOO_SHORT: true,
  VEHICLE_WEEKLY_CAP_REACHED: true,
  OWNER_GAP_TOO_SHORT: true,
  OWNER_WEEKLY_CAP_REACHED: true,
  LITERS_PER_PERSON_CAP_REACHED: false,
};

// The rules that can't be evaluated for a plate-only subject. Surfaced in
// the rule result so the screen says so instead of silently skipping them.
export const OWNER_LEVEL_RULES: RuleFailureReason[] = [
  'OWNER_GAP_TOO_SHORT',
  'OWNER_WEEKLY_CAP_REACHED',
  'LITERS_PER_PERSON_CAP_REACHED',
];

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
  vehicleId: string | null;
  occurredAt: Date;
  quantityLiters: number;
}

// Read-only slice of fill-up history the engine needs. FillUpRepository
// (Prisma-backed) implements this for the real controller wiring; unit
// tests pass an in-memory fake instead.
//
// Registration pivot, phase 1: every lookup is scoped to ONE municipality
// — the one the fill-up being evaluated is happening in. Allowances are
// counted per vehicle/owner per municipality, keyed on the municipality
// stamped on each FillUpTransaction when it was recorded (never a live
// lookup through its station).
export interface FillUpHistoryReader {
  // Most recent fill-ups for the vehicle in `municipalityId`, strictly
  // before `before`, within `lookbackDays`, ordered newest-first.
  getRecentForVehicle(
    vehicleId: string,
    municipalityId: string,
    before: Date,
    lookbackDays: number,
  ): Promise<FillUpHistoryRecord[]>;

  // Same, for an unregistered plate: fill-ups recorded against that
  // normalized plate (no vehicle yet) in `municipalityId`. Once the vehicle
  // registers those rows are linked to it and are found through
  // getRecentForVehicle instead.
  getRecentForPlate(
    normalizedPlate: string,
    municipalityId: string,
    before: Date,
    lookbackDays: number,
  ): Promise<FillUpHistoryRecord[]>;

  // Same, scoped to the vehicle's owner instead — the aggregate per-owner
  // cap looks across all vehicles that owner has, not just one (still
  // within the one municipality).
  getRecentForOwner(
    ownerId: string,
    municipalityId: string,
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
