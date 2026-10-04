// Registration pivot, phase 4a: the stage a LIVE municipality is in at a
// given moment. The ONLY place the stage is computed — the API stamps it on
// every response that needs it and the UI just displays what it's told.
//
//   GRACE          before the awareness start, or no deadline set at all —
//                  a vehicle without a card is accepted by typed plate.
//   AWARENESS      awareness start ≤ today < deadline — still accepted, and
//                  the confirmation shows the deadline and where to register.
//   CARD_REQUIRED  today ≥ deadline — refused; supervisor override only.
//
// Dates are CALENDAR DAYS in Libya (Africa/Tripoli, UTC+2, no daylight
// saving): a stage begins at 00:00 Tripoli time on its date, whatever the
// server's own timezone is. "Today" is therefore computed in Tripoli, then
// compared as a plain YYYY-MM-DD string.

export type MunicipalityStage = 'GRACE' | 'AWARENESS' | 'CARD_REQUIRED';

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

export function computeStage(
  now: Date,
  dates: {
    awarenessStartDate?: Date | string | null;
    cardRequiredFromDate?: Date | string | null;
  },
): MunicipalityStage {
  const deadline = calendarDayString(dates.cardRequiredFromDate);
  // No deadline set: grace indefinitely. (An awareness start on its own has
  // no date to announce, so it doesn't change the stage either.)
  if (!deadline) return 'GRACE';
  const today = tripoliDay(now);
  if (today >= deadline) return 'CARD_REQUIRED';
  const awarenessStart = calendarDayString(dates.awarenessStartDate);
  if (awarenessStart && today >= awarenessStart) return 'AWARENESS';
  return 'GRACE';
}
