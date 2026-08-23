// Kept separate from FillUpRuleEngine itself so the engine can be
// unit-tested with plain fakes — no Prisma, no NestJS DI module, no DB.

export type RuleFailureReason =
  | 'VEHICLE_GAP_TOO_SHORT'
  | 'VEHICLE_WEEKLY_CAP_REACHED'
  | 'DRIVER_GAP_TOO_SHORT'
  | 'DRIVER_WEEKLY_CAP_REACHED';

export type RuleResult = { allowed: true } | { allowed: false; reason: RuleFailureReason };

export interface FillUpHistoryRecord {
  occurredAt: Date;
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
