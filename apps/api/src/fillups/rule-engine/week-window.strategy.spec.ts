import {
  FixedWeekStartStrategy,
  RollingWindowStrategy,
  resolveWeekWindowStrategy,
} from './week-window.strategy';

describe('RollingWindowStrategy', () => {
  it('returns exactly 7 days before occurredAt, ignoring weekStartDay', () => {
    const occurredAt = new Date('2026-08-23T12:00:00.000Z');
    const strategy = new RollingWindowStrategy();
    expect(strategy.windowStart(occurredAt, 6).toISOString()).toBe('2026-08-16T12:00:00.000Z');
    expect(strategy.windowStart(occurredAt, 0).toISOString()).toBe('2026-08-16T12:00:00.000Z');
  });
});

describe('FixedWeekStartStrategy', () => {
  it('returns midnight UTC of the most recent occurrence of weekStartDay, inclusive of today', () => {
    // 2026-08-23 is a Sunday (getUTCDay() === 0).
    const sunday = new Date('2026-08-23T12:00:00.000Z');
    const strategy = new FixedWeekStartStrategy();

    // weekStartDay = 6 (Saturday): most recent Saturday before this Sunday is 2026-08-22.
    expect(strategy.windowStart(sunday, 6).toISOString()).toBe('2026-08-22T00:00:00.000Z');

    // weekStartDay = 0 (Sunday): today IS the week start.
    expect(strategy.windowStart(sunday, 0).toISOString()).toBe('2026-08-23T00:00:00.000Z');

    // weekStartDay = 1 (Monday): most recent Monday before this Sunday is 6 days back.
    expect(strategy.windowStart(sunday, 1).toISOString()).toBe('2026-08-17T00:00:00.000Z');
  });
});

describe('resolveWeekWindowStrategy', () => {
  it('resolves "fixed" to FixedWeekStartStrategy', () => {
    expect(resolveWeekWindowStrategy('fixed')).toBeInstanceOf(FixedWeekStartStrategy);
  });

  it('resolves "rolling" and any unrecognized value to RollingWindowStrategy', () => {
    expect(resolveWeekWindowStrategy('rolling')).toBeInstanceOf(RollingWindowStrategy);
    expect(resolveWeekWindowStrategy('bogus')).toBeInstanceOf(RollingWindowStrategy);
  });
});
