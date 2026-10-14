import { calendarDayString, calendarDayToDate, isValidCalendarDay, tripoliDay } from './grace-stage';

// Tripoli is UTC+2 all year (no daylight saving), so 00:00 Tripoli on a day
// is 22:00 UTC the evening before.
describe('Tripoli calendar days', () => {
  it('turns the day over at 00:00 Tripoli, not at 00:00 UTC', () => {
    expect(tripoliDay(new Date('2026-10-04T21:59:59.999Z'))).toBe('2026-10-04');
    expect(tripoliDay(new Date('2026-10-04T22:00:00.000Z'))).toBe('2026-10-05');
  });

  it('reads a stored day and writes one back', () => {
    expect(calendarDayString(new Date('2026-10-05T00:00:00Z'))).toBe('2026-10-05');
    expect(calendarDayString('2026-10-05')).toBe('2026-10-05');
    expect(calendarDayString(null)).toBeNull();
    expect(calendarDayToDate('2026-10-05').toISOString()).toBe('2026-10-05T00:00:00.000Z');
  });

  it('accepts only real calendar days', () => {
    expect(isValidCalendarDay('2026-02-28')).toBe(true);
    expect(isValidCalendarDay('2026-02-30')).toBe(false);
    expect(isValidCalendarDay('26-02-28')).toBe(false);
  });
});
