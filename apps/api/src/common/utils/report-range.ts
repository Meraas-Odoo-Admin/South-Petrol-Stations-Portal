import { BadRequestException } from '@nestjs/common';
import { tripoliDay } from './grace-stage';
import { addDays, daysBetween, isCalendarDay, tripoliRange, type TripoliRange } from './tripoli';

const MAX_RANGE_DAYS = 400;

// Turns the optional from/to of a report into a validated Tripoli range.
// Defaults to the last `defaultDays` days ending today (Tripoli).
export function resolveReportRange(
  query: { from?: string; to?: string },
  defaultDays: number,
  now: Date = new Date(),
): TripoliRange {
  const today = tripoliDay(now);
  const to = query.to ?? today;
  const from = query.from ?? addDays(to, -(defaultDays - 1));
  if (!isCalendarDay(from) || !isCalendarDay(to)) {
    throw new BadRequestException('INVALID_DATE');
  }
  if (from > to) {
    throw new BadRequestException('RANGE_REVERSED');
  }
  if (daysBetween(from, to) + 1 > MAX_RANGE_DAYS) {
    throw new BadRequestException('RANGE_TOO_LONG');
  }
  return tripoliRange(from, to);
}
