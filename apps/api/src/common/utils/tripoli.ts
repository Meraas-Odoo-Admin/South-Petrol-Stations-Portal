// Africa/Tripoli calendar days, for every daily figure in the reports.
//
// A "day" is a Tripoli calendar day (YYYY-MM-DD), so a fill-up or card printed
// at 23:30 Tripoli time belongs to that evening's day, and one at 00:10 to the
// next, whatever the server's own clock zone is. The offset is read from the
// time-zone database (Intl) rather than hard-coded, so a future change of
// Libya's offset needs no code change.

export const REPORT_TIME_ZONE = 'Africa/Tripoli';

const PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: REPORT_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

// Minutes Tripoli is ahead of UTC at the instant `at`.
function offsetMinutes(at: Date): number {
  const p = Object.fromEntries(PARTS.formatToParts(at).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000);
}

export function isCalendarDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const d = new Date(`${day}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === day;
}

// The instant a Tripoli calendar day begins (its local midnight).
export function tripoliMidnight(day: string): Date {
  const utcMidnight = Date.parse(`${day}T00:00:00.000Z`);
  // Local midnight = UTC midnight minus the offset in force at that moment;
  // look the offset up twice so a day on which it changes still lands right.
  let instant = utcMidnight - offsetMinutes(new Date(utcMidnight)) * 60_000;
  instant = utcMidnight - offsetMinutes(new Date(instant)) * 60_000;
  return new Date(instant);
}

// The calendar day `n` days after `day` (n may be negative).
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Whole calendar days from `from` to `to` (to - from).
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000);
}

export interface TripoliRange {
  from: string; // first calendar day, inclusive
  to: string; // last calendar day, inclusive
  start: Date; // instant `from` begins
  endExclusive: Date; // instant the day after `to` begins
}

// An inclusive range of Tripoli calendar days as a half-open instant range
// [start, endExclusive), so a record at exactly midnight sits in the later day.
export function tripoliRange(from: string, to: string): TripoliRange {
  return { from, to, start: tripoliMidnight(from), endExclusive: tripoliMidnight(addDays(to, 1)) };
}

// Every calendar day from `from` to `to`, inclusive.
export function eachDay(from: string, to: string): string[] {
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  return days;
}
