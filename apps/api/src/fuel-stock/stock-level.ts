// Fuel stock arithmetic: pure, no database.
//
//   level = baseline + deliveries − liters dispensed since the baseline
//
// The baseline is the opening level at the moment the station started using the
// system, or ZERO at the moment of the latest reset (the level "continues from
// zero with the next delivery"). Only deliveries that happened after the
// baseline moment and fill-ups after it count: everything earlier is already
// inside the baseline.
//
// Entries are never edited. A CORRECTION points at the delivery it fixes and
// carries the right liters; the latest correction of a delivery wins.
//
// The level is computed here and never typed in. If it comes out below zero the
// data is wrong (an unrecorded delivery, or a wrong opening level): it is
// reported as a data warning, not as a physical negative amount.

export type FuelEntryKind = 'DELIVERY' | 'CORRECTION' | 'RESET';

export interface FuelEntryRaw {
  id: string;
  kind: FuelEntryKind;
  liters: number;
  occurredAt: Date;
  createdAt: Date;
  correctsEntryId: string | null;
}

export interface Dispense {
  occurredAt: Date;
  liters: number;
}

export interface StorageSetup {
  openingLevel: number;
  openedAt: Date;
}

export interface EffectiveDelivery {
  id: string;
  liters: number;
  originalLiters: number;
  corrected: boolean;
  at: Date;
}

export interface StockLevel {
  /** The computed level, possibly below zero (see `dataWarning`). */
  level: number;
  baselineAt: Date;
  baselineLevel: number;
  delivered: number;
  dispensed: number;
  lastResetAt: Date | null;
  /** True when the level is below zero: the records, not the tank, are wrong. */
  dataWarning: boolean;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

// Each original delivery takes the liters of its latest correction (by
// creation time, then id). Corrections and resets are not deliveries.
export function effectiveDeliveries(raw: FuelEntryRaw[]): EffectiveDelivery[] {
  const latestCorrection = new Map<string, FuelEntryRaw>();
  for (const entry of raw) {
    if (entry.kind !== 'CORRECTION' || !entry.correctsEntryId) continue;
    const current = latestCorrection.get(entry.correctsEntryId);
    const newer =
      !current ||
      entry.createdAt.getTime() > current.createdAt.getTime() ||
      (entry.createdAt.getTime() === current.createdAt.getTime() && entry.id > current.id);
    if (newer) latestCorrection.set(entry.correctsEntryId, entry);
  }
  return raw
    .filter((e) => e.kind === 'DELIVERY')
    .map((e) => {
      const fix = latestCorrection.get(e.id);
      return {
        id: e.id,
        liters: fix ? fix.liters : e.liters,
        originalLiters: e.liters,
        corrected: Boolean(fix),
        at: e.occurredAt,
      };
    })
    .sort((a, b) => a.at.getTime() - b.at.getTime() || a.id.localeCompare(b.id));
}

export function lastReset(raw: FuelEntryRaw[]): FuelEntryRaw | null {
  let latest: FuelEntryRaw | null = null;
  for (const e of raw) {
    if (e.kind !== 'RESET') continue;
    if (!latest || e.occurredAt.getTime() > latest.occurredAt.getTime()) latest = e;
  }
  return latest;
}

// The moment from which deliveries and fill-ups count.
export function baselineOf(setup: StorageSetup, raw: FuelEntryRaw[]): { at: Date; level: number; resetAt: Date | null } {
  const reset = lastReset(raw);
  if (reset && reset.occurredAt.getTime() >= setup.openedAt.getTime()) {
    return { at: reset.occurredAt, level: 0, resetAt: reset.occurredAt };
  }
  return { at: setup.openedAt, level: setup.openingLevel, resetAt: null };
}

export function computeLevel(setup: StorageSetup, raw: FuelEntryRaw[], dispenses: Dispense[]): StockLevel {
  const baseline = baselineOf(setup, raw);
  const after = baseline.at.getTime();
  const delivered = effectiveDeliveries(raw)
    .filter((d) => d.at.getTime() > after)
    .reduce((sum, d) => sum + d.liters, 0);
  const dispensed = dispenses.filter((d) => d.occurredAt.getTime() > after).reduce((sum, d) => sum + d.liters, 0);
  const level = round3(baseline.level + delivered - dispensed);
  return {
    level,
    baselineAt: baseline.at,
    baselineLevel: baseline.level,
    delivered: round3(delivered),
    dispensed: round3(dispensed),
    lastResetAt: baseline.resetAt,
    dataWarning: level < 0,
  };
}

export type AlertState = { lowStockAlerted: boolean; negativeAlerted: boolean };
export type AlertDecision = {
  /** Send the low-stock notification now. */
  alertLow: boolean;
  /** Send the negative-level (data warning) notification now. */
  alertNegative: boolean;
  next: AlertState;
};

// "Alert once when it crosses below, and again only after it has been refilled
// above the threshold and drops again." The state flags make a crossing alert
// exactly once however many fill-ups follow it.
export function decideAlerts(level: number, threshold: number, state: AlertState): AlertDecision {
  let { lowStockAlerted, negativeAlerted } = state;
  let alertLow = false;
  let alertNegative = false;

  if (level < threshold) {
    if (!lowStockAlerted) {
      alertLow = true;
      lowStockAlerted = true;
    }
  } else {
    lowStockAlerted = false; // refilled to the threshold or above: armed again
  }

  if (level < 0) {
    if (!negativeAlerted) {
      alertNegative = true;
      negativeAlerted = true;
    }
  } else {
    negativeAlerted = false;
  }

  return { alertLow, alertNegative, next: { lowStockAlerted, negativeAlerted } };
}

export type StockStatus = 'OK' | 'LOW' | 'EMPTY' | 'DATA_WARNING';

export function statusOf(level: number, threshold: number): StockStatus {
  if (level < 0) return 'DATA_WARNING';
  if (level === 0) return 'EMPTY';
  return level < threshold ? 'LOW' : 'OK';
}

// The level as it stood at a moment: only what had happened by then counts.
export function levelAt(setup: StorageSetup, raw: FuelEntryRaw[], dispenses: Dispense[], asOf: Date): StockLevel {
  const t = asOf.getTime();
  return computeLevel(
    setup,
    raw.filter((e) => e.occurredAt.getTime() <= t),
    dispenses.filter((d) => d.occurredAt.getTime() <= t),
  );
}

export interface PeriodReconciliation {
  startLevel: number;
  delivered: number;
  dispensed: number;
  /** What the books held when the level was reset to zero. */
  resetWrittenOff: number;
  endLevel: number;
}

// Fuel reconciliation of one fuel type at one station for a period.
//
//   start + delivered − dispensed − zeroed by resets = end
//
// (After review, 19 Oct 2026: no "unaccounted fuel" figure any more — it
// confused more than it told. A level below zero still shows as a data
// warning on the tank.)
export function reconcilePeriod(
  setup: StorageSetup,
  raw: FuelEntryRaw[],
  dispenses: Dispense[],
  from: Date,
  to: Date,
): PeriodReconciliation {
  const start = from.getTime() < setup.openedAt.getTime() ? setup.openedAt : from;
  const startLevel =
    from.getTime() < setup.openedAt.getTime() ? setup.openingLevel : levelAt(setup, raw, dispenses, from).level;
  const end = levelAt(setup, raw, dispenses, to);

  const s = start.getTime();
  const e = to.getTime();
  const delivered = effectiveDeliveries(raw)
    .filter((d) => d.at.getTime() > s && d.at.getTime() <= e)
    .reduce((sum, d) => sum + d.liters, 0);
  const dispensed = dispenses
    .filter((d) => d.occurredAt.getTime() > s && d.occurredAt.getTime() <= e)
    .reduce((sum, d) => sum + d.liters, 0);

  let resetWrittenOff = 0;
  for (const r of raw) {
    if (r.kind !== 'RESET') continue;
    const at = r.occurredAt.getTime();
    if (at <= s || at > e) continue;
    const before = levelAt(setup, raw, dispenses, new Date(at - 1)).level;
    if (before > 0) resetWrittenOff += before;
  }
  return {
    startLevel: round3(startLevel),
    delivered: round3(delivered),
    dispensed: round3(dispensed),
    resetWrittenOff: round3(resetWrittenOff),
    endLevel: end.level,
  };
}
