// Kept separate from FillUpRuleEngine itself so the engine can be
// unit-tested with plain fakes — no Prisma, no NestJS DI module, no DB.

export type RuleFailureReason =
  | 'VEHICLE_GAP_TOO_SHORT'
  | 'VEHICLE_WEEKLY_CAP_REACHED'
  | 'DRIVER_GAP_TOO_SHORT'
  | 'DRIVER_WEEKLY_CAP_REACHED'
  | 'LITERS_PER_PERSON_CAP_REACHED';

// The specific prior fill-up that tripped a DRIVER_*/LITERS_* check — a
// driver-level rule can fire because of a fill-up on a DIFFERENT vehicle
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

  // Same, scoped to the driver instead — the aggregate per-driver cap looks
  // across all of a driver's vehicles, not just one.
  getRecentForDriver(
    driverId: string,
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
    params: { vehicleId: string; driverId: string; rule: RuleFailureReason; at: Date },
  ): Promise<{ id: string } | null>;
}
