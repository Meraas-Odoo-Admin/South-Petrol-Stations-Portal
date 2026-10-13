import {
  computeLevel,
  decideAlerts,
  effectiveDeliveries,
  levelAt,
  reconcilePeriod,
  statusOf,
  type Dispense,
  type FuelEntryRaw,
  type StorageSetup,
} from './stock-level';

const d = (iso: string) => new Date(`${iso}Z`);
const setup: StorageSetup = { openingLevel: 5000, openedAt: d('2026-10-01T06:00:00') };

let seq = 0;
const delivery = (liters: number, at: string): FuelEntryRaw => ({
  id: `d${++seq}`,
  kind: 'DELIVERY',
  liters,
  occurredAt: d(at),
  createdAt: d(at),
  correctsEntryId: null,
});
const correction = (of: FuelEntryRaw, liters: number, createdAt: string): FuelEntryRaw => ({
  id: `c${++seq}`,
  kind: 'CORRECTION',
  liters,
  occurredAt: of.occurredAt,
  createdAt: d(createdAt),
  correctsEntryId: of.id,
});
const reset = (previous: number, at: string): FuelEntryRaw => ({
  id: `r${++seq}`,
  kind: 'RESET',
  liters: previous,
  occurredAt: d(at),
  createdAt: d(at),
  correctsEntryId: null,
});
const fill = (liters: number, at: string): Dispense => ({ liters, occurredAt: d(at) });

describe('computeLevel: opening + deliveries - dispensed', () => {
  it('is the opening level with nothing recorded', () => {
    const level = computeLevel(setup, [], []);
    expect(level.level).toBe(5000);
    expect(level.dataWarning).toBe(false);
  });

  it('adds deliveries and subtracts fill-ups since the opening', () => {
    const level = computeLevel(
      setup,
      [delivery(8000, '2026-10-03T09:00:00')],
      [fill(40, '2026-10-02T10:00:00'), fill(60, '2026-10-04T10:00:00')],
    );
    expect(level.delivered).toBe(8000);
    expect(level.dispensed).toBe(100);
    expect(level.level).toBe(12900);
  });

  it('ignores fill-ups and deliveries from before the opening moment (already inside the opening level)', () => {
    const level = computeLevel(
      setup,
      [delivery(9999, '2026-09-30T09:00:00')],
      [fill(500, '2026-09-30T10:00:00')],
    );
    expect(level.level).toBe(5000);
  });
});

describe('corrections', () => {
  it('the latest correction of a delivery replaces its liters; the original is kept', () => {
    const wrong = delivery(8000, '2026-10-03T09:00:00');
    const entries = [wrong, correction(wrong, 7500, '2026-10-03T10:00:00'), correction(wrong, 7400, '2026-10-03T11:00:00')];
    const [effective] = effectiveDeliveries(entries);
    expect(effective).toMatchObject({ liters: 7400, originalLiters: 8000, corrected: true });
    expect(computeLevel(setup, entries, []).level).toBe(12400);
  });

  it('a correction does not move the delivery in time', () => {
    const wrong = delivery(1000, '2026-09-30T09:00:00'); // before opening: not counted
    const entries = [wrong, correction(wrong, 3000, '2026-10-05T09:00:00')];
    expect(computeLevel(setup, entries, []).level).toBe(5000);
  });
});

describe('reset to zero', () => {
  it('the level continues from zero with the next delivery', () => {
    const entries = [delivery(8000, '2026-10-02T09:00:00'), reset(13000, '2026-10-05T08:00:00'), delivery(2000, '2026-10-06T08:00:00')];
    const fills = [fill(100, '2026-10-04T08:00:00'), fill(50, '2026-10-07T08:00:00')];
    const level = computeLevel(setup, entries, fills);
    expect(level.lastResetAt).toEqual(d('2026-10-05T08:00:00'));
    expect(level.level).toBe(1950); // 0 + 2000 - 50: nothing before the reset counts
  });

  it('right after the reset the level is zero', () => {
    const level = computeLevel(setup, [reset(5000, '2026-10-02T08:00:00')], []);
    expect(level.level).toBe(0);
    expect(statusOf(level.level, 1000)).toBe('EMPTY');
  });
});

describe('the negative case', () => {
  it('goes below zero and is flagged as a data warning, not as a physical amount', () => {
    const level = computeLevel(setup, [], [fill(6000, '2026-10-02T08:00:00')]);
    expect(level.level).toBe(-1000);
    expect(level.dataWarning).toBe(true);
    expect(statusOf(level.level, 1000)).toBe('DATA_WARNING');
  });

  it('an unrecorded delivery recorded late brings it back above zero', () => {
    const entries = [delivery(4000, '2026-10-02T07:00:00')];
    const fills = [fill(6000, '2026-10-02T08:00:00')];
    expect(computeLevel(setup, [], fills).dataWarning).toBe(true);
    expect(computeLevel(setup, entries, fills).level).toBe(3000);
  });
});

describe('status', () => {
  it('below the threshold is low, at it is fine', () => {
    expect(statusOf(999, 1000)).toBe('LOW');
    expect(statusOf(1000, 1000)).toBe('OK');
  });
});

describe('low-stock alert fires once per crossing', () => {
  const armed = { lowStockAlerted: false, negativeAlerted: false };

  it('alerts when the level first drops below the threshold, then stays quiet', () => {
    const first = decideAlerts(990, 1000, armed);
    expect(first.alertLow).toBe(true);
    const second = decideAlerts(950, 1000, first.next);
    expect(second.alertLow).toBe(false);
    const third = decideAlerts(100, 1000, second.next);
    expect(third.alertLow).toBe(false);
  });

  it('does not alert above the threshold', () => {
    expect(decideAlerts(1000, 1000, armed).alertLow).toBe(false);
    expect(decideAlerts(40000, 1000, armed).alertLow).toBe(false);
  });

  it('alerts again only after a refill above the threshold and a new drop', () => {
    let state = decideAlerts(900, 1000, armed).next; // alerted
    state = decideAlerts(500, 1000, state).next; // still low: nothing
    const refilled = decideAlerts(8000, 1000, state);
    expect(refilled.alertLow).toBe(false);
    expect(refilled.next.lowStockAlerted).toBe(false);
    const dropped = decideAlerts(999, 1000, refilled.next);
    expect(dropped.alertLow).toBe(true);
  });

  it('a negative level raises one data-warning alert per crossing', () => {
    const a = decideAlerts(-10, 1000, armed);
    expect(a.alertNegative).toBe(true);
    const b = decideAlerts(-500, 1000, a.next);
    expect(b.alertNegative).toBe(false);
    const c = decideAlerts(200, 1000, b.next);
    expect(c.next.negativeAlerted).toBe(false);
    expect(decideAlerts(-1, 1000, c.next).alertNegative).toBe(true);
  });
});

describe('fuel reconciliation of a period', () => {
  const from = d('2026-10-02T00:00:00');
  const to = d('2026-10-10T00:00:00');

  it('a clean period leaves nothing unaccounted', () => {
    const result = reconcilePeriod(
      setup,
      [delivery(8000, '2026-10-03T09:00:00')],
      [fill(300, '2026-10-04T09:00:00')],
      from,
      to,
    );
    expect(result).toMatchObject({ startLevel: 5000, delivered: 8000, dispensed: 300, endLevel: 12700, unaccounted: 0 });
    expect(result.startLevel + result.delivered - result.dispensed - result.resetWrittenOff).toBe(result.endLevel);
  });

  it('dispensing more than was ever delivered is unaccounted fuel (the shortfall)', () => {
    const result = reconcilePeriod(setup, [], [fill(5600, '2026-10-04T09:00:00')], from, to);
    expect(result.endLevel).toBe(-600);
    expect(result.shortfall).toBe(600);
    expect(result.unaccounted).toBe(600);
  });

  it('a reset writes off what the books held, and it is reported', () => {
    const result = reconcilePeriod(
      setup,
      [delivery(1000, '2026-10-03T09:00:00'), reset(5900, '2026-10-05T09:00:00')],
      [fill(100, '2026-10-04T09:00:00')],
      from,
      to,
    );
    expect(result.resetWrittenOff).toBe(5900);
    expect(result.endLevel).toBe(0);
    expect(result.unaccounted).toBe(5900);
    expect(result.startLevel + result.delivered - result.dispensed - result.resetWrittenOff).toBe(result.endLevel);
  });

  it('levelAt looks at one moment only', () => {
    const entries = [delivery(1000, '2026-10-05T09:00:00')];
    expect(levelAt(setup, entries, [], d('2026-10-04T09:00:00')).level).toBe(5000);
    expect(levelAt(setup, entries, [], d('2026-10-06T09:00:00')).level).toBe(6000);
  });
});
