// Calendar-day helpers in Libya time (Africa/Tripoli, UTC+2, no daylight
// saving). Phase 6 removed the grace / awareness / card-required stages that
// used to be computed here; what stays is the Tripoli calendar day.
//
// Dates are CALENDAR DAYS in Libya: "today" is computed in Tripoli, then
// compared as a plain YYYY-MM-DD string.

export const STAGE_TIME_ZONE = 'Africa/Tripoli';

const DAY_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: STAGE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// The calendar day (YYYY-MM-DD) it is in Tripoli at `at`.
export function tripoliDay(at: Date): string {
  return DAY_FORMAT.format(at);
}

// A stored calendar day (a @db.Date column read back as a Date at UTC
// midnight, or an already-formatted string) as YYYY-MM-DD.
export function calendarDayString(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

// A YYYY-MM-DD string → the Date Prisma wants for a @db.Date column.
export function calendarDayToDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

export function isValidCalendarDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const parsed = calendarDayToDate(day);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day;
}
