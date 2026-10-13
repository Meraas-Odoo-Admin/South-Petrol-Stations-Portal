// Dates and times as Arabic-order Western numerals in Tripoli time: day/month/
// year, then hours:minutes on a 24-hour clock - the same everywhere. Never
// `toLocaleString('ar')` (it gave «13p 3:32:21 ،2026/10/» inside Arabic text:
// the browser's own bidi reordering of an 'ar' date with a 12-hour clock).
// Show the result inside <LtrText> (a <bdi dir="ltr">) so it is an isolate.

const TZ = 'Africa/Tripoli';
const DATE = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
const TIME = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
const DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const DAY_MONTH_TIME = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

type When = string | number | Date | null | undefined;
const valid = (value: When): Date | null => {
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** 13/10/2026 15:32 */
export function formatDateTime(value: When): string {
  const d = valid(value);
  return d ? DATE_TIME.format(d).replace(',', '') : '—';
}
/** 13/10/2026 */
export function formatDate(value: When): string {
  const d = valid(value);
  return d ? DATE.format(d) : '—';
}
/** 15:32 */
export function formatTime(value: When): string {
  const d = valid(value);
  return d ? TIME.format(d) : '—';
}
/** 13/10 15:32 (a recent activity list) */
export function formatShortDateTime(value: When): string {
  const d = valid(value);
  return d ? DAY_MONTH_TIME.format(d).replace(',', '') : '—';
}
/** A calendar day «2026-10-13» (no time zone shift) → 13/10/2026 */
export function formatDay(day: string | null | undefined): string {
  if (!day) return '—';
  const [y, m, d] = day.slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : '—';
}
