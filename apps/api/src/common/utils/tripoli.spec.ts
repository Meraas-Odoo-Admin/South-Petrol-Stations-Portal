import { addDays, daysBetween, eachDay, isCalendarDay, tripoliMidnight, tripoliRange } from './tripoli';
import { tripoliDay } from './grace-stage';

describe('Tripoli calendar days', () => {
  it('a day begins at Tripoli midnight, which is 22:00 UTC the evening before', () => {
    expect(tripoliMidnight('2026-10-08').toISOString()).toBe('2026-10-07T22:00:00.000Z');
  });

  it('a record just before midnight belongs to the earlier day, one just after to the later day', () => {
    const lastMomentOfOct7 = new Date('2026-10-07T21:59:59.999Z'); // 23:59:59.999 in Tripoli
    const firstMomentOfOct8 = new Date('2026-10-07T22:00:00.000Z'); // 00:00:00.000 in Tripoli
    expect(tripoliDay(lastMomentOfOct7)).toBe('2026-10-07');
    expect(tripoliDay(firstMomentOfOct8)).toBe('2026-10-08');
    const range = tripoliRange('2026-10-08', '2026-10-08');
    expect(lastMomentOfOct7 >= range.start && lastMomentOfOct7 < range.endExclusive).toBe(false);
    expect(firstMomentOfOct8 >= range.start && firstMomentOfOct8 < range.endExclusive).toBe(true);
  });

  it('a range is inclusive of both end days and half-open in time', () => {
    const range = tripoliRange('2026-10-01', '2026-10-03');
    expect(range.start.toISOString()).toBe('2026-09-30T22:00:00.000Z');
    expect(range.endExclusive.toISOString()).toBe('2026-10-03T22:00:00.000Z');
    // 22:00 UTC on 3 Oct is Tripoli midnight on 4 Oct: that instant is NOT in the range.
    expect(new Date('2026-10-03T22:00:00.000Z') < range.endExclusive).toBe(false);
    expect(new Date('2026-10-03T21:59:59.999Z') < range.endExclusive).toBe(true);
  });

  it('adds and counts calendar days across a month boundary', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-10-08', '2026-12-01')).toBe(54);
    expect(eachDay('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  });

  it('knows a real calendar day from a malformed one', () => {
    expect(isCalendarDay('2026-02-28')).toBe(true);
    expect(isCalendarDay('2026-02-30')).toBe(false);
    expect(isCalendarDay('2026-2-3')).toBe(false);
    expect(isCalendarDay('tomorrow')).toBe(false);
  });
});
