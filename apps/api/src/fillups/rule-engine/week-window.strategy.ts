// §6 of docs/IMPLEMENTATION_PLAN.md: getWeekWindow() is "intentionally
// abstracted" because whether the client wants a rolling 7-day window or a
// fixed week-start-day is still open (docs/OPEN_ITEMS.md #17-adjacent —
// see the week-start-day question). Both implementations exist behind one
// interface now so switching is a SystemSetting change, not a deploy.
export interface WeekWindowStrategy {
  // Start of the counting window for a fill-up occurring at `occurredAt`.
  // Fill-ups with occurredAt >= windowStart (and < occurredAt) count toward
  // the weekly cap. `weekStartDay` is only meaningful to FixedWeekStartStrategy.
  windowStart(occurredAt: Date, weekStartDay: number): Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export class RollingWindowStrategy implements WeekWindowStrategy {
  windowStart(occurredAt: Date, _weekStartDay: number): Date {
    return new Date(occurredAt.getTime() - 7 * DAY_MS);
  }
}

// weekStartDay follows JS Date#getUTCDay() convention: 0 = Sunday ... 6 =
// Saturday. Unused today (fillup.week_window_mode defaults to 'rolling'),
// wired in ahead of time so flipping the mode needs no schema/code change
// once the client answers the week-start-day question (§13).
export class FixedWeekStartStrategy implements WeekWindowStrategy {
  windowStart(occurredAt: Date, weekStartDay: number): Date {
    const start = new Date(occurredAt);
    start.setUTCHours(0, 0, 0, 0);
    const currentDay = start.getUTCDay();
    const daysSinceWeekStart = (currentDay - weekStartDay + 7) % 7;
    start.setUTCDate(start.getUTCDate() - daysSinceWeekStart);
    return start;
  }
}

export function resolveWeekWindowStrategy(mode: string): WeekWindowStrategy {
  if (mode === 'fixed') {
    return new FixedWeekStartStrategy();
  }
  // Default to rolling for anything else (including 'rolling' itself) —
  // an unrecognized mode value should never hard-fail fill-up creation.
  return new RollingWindowStrategy();
}
