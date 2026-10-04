import { computeStage, isValidCalendarDay, tripoliDay } from './grace-stage';

// Tripoli is UTC+2 all year (no daylight saving), so 00:00 Tripoli on a day
// is 22:00 UTC the evening before.
describe('computeStage', () => {
  const dates = { awarenessStartDate: '2026-10-05', cardRequiredFromDate: '2026-10-10' };

  it('is GRACE with no dates at all, however late', () => {
    expect(computeStage(new Date('2030-01-01T00:00:00Z'), {})).toBe('GRACE');
    expect(computeStage(new Date('2030-01-01T00:00:00Z'), { awarenessStartDate: null, cardRequiredFromDate: null })).toBe('GRACE');
  });

  it('stays GRACE for an awareness start with no deadline', () => {
    expect(computeStage(new Date('2026-10-20T12:00:00Z'), { awarenessStartDate: '2026-10-05' })).toBe('GRACE');
  });

  it('switches to AWARENESS exactly at 00:00 Tripoli on the awareness start', () => {
    expect(computeStage(new Date('2026-10-04T21:59:59.999Z'), dates)).toBe('GRACE');
    expect(computeStage(new Date('2026-10-04T22:00:00.000Z'), dates)).toBe('AWARENESS');
  });

  it('switches to CARD_REQUIRED exactly at 00:00 Tripoli on the deadline', () => {
    expect(computeStage(new Date('2026-10-09T21:59:59.999Z'), dates)).toBe('AWARENESS');
    expect(computeStage(new Date('2026-10-09T22:00:00.000Z'), dates)).toBe('CARD_REQUIRED');
    expect(computeStage(new Date('2027-01-01T00:00:00Z'), dates)).toBe('CARD_REQUIRED');
  });

  it('goes straight from GRACE to CARD_REQUIRED with a deadline and no awareness start', () => {
    const only = { cardRequiredFromDate: '2026-10-10' };
    expect(computeStage(new Date('2026-10-09T21:59:59Z'), only)).toBe('GRACE');
    expect(computeStage(new Date('2026-10-09T22:00:00Z'), only)).toBe('CARD_REQUIRED');
  });

  it('accepts dates read back from a @db.Date column', () => {
    const fromDb = { awarenessStartDate: new Date('2026-10-05T00:00:00Z'), cardRequiredFromDate: new Date('2026-10-10T00:00:00Z') };
    expect(computeStage(new Date('2026-10-07T10:00:00Z'), fromDb)).toBe('AWARENESS');
  });

  it('uses the Tripoli day, not the UTC day', () => {
    expect(tripoliDay(new Date('2026-10-09T22:30:00Z'))).toBe('2026-10-10');
    expect(tripoliDay(new Date('2026-10-09T21:30:00Z'))).toBe('2026-10-09');
  });
});

describe('isValidCalendarDay', () => {
  it('rejects non-days', () => {
    expect(isValidCalendarDay('2026-10-10')).toBe(true);
    expect(isValidCalendarDay('2026-02-30')).toBe(false);
    expect(isValidCalendarDay('10/10/2026')).toBe(false);
    expect(isValidCalendarDay('')).toBe(false);
  });
});
