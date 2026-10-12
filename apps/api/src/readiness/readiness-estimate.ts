// The deadline-readiness estimate: pure arithmetic, no database.
//
//   cardless plates  = distinct plates that filled up WITHOUT a card scan in the
//                      last N days and still have no active card
//   average per day = first cards the municipality's offices issued in the same
//                      N days ÷ N
//   days needed      = cardless plates ÷ average per day, rounded up
//   days left        = days from today (Tripoli) to the deadline, if one is set
//
// It is an ESTIMATE: it assumes the offices keep issuing at the recent pace and
// that the plates seen lately are the ones still to come. Replacements and
// reprints are not counted as issuance, because they do not shrink the number
// of vehicles without a card.
import { daysBetween } from '../common/utils/tripoli';

export type ReadinessVerdict =
  | 'NONE_REMAINING' // nobody is still without a card
  | 'NO_ISSUANCE' // nothing issued lately, so no pace to project
  | 'NO_DEADLINE' // days needed only; nothing to compare with
  | 'DEADLINE_PASSED'
  | 'ON_TRACK'
  | 'AT_RISK';

export interface ReadinessInput {
  cardlessPlates: number;
  firstCardsIssued: number;
  windowDays: number;
  /** Deadline as a Tripoli calendar day, or null when none is set. */
  deadline: string | null;
  /** Today as a Tripoli calendar day. */
  today: string;
}

export interface ReadinessEstimate {
  cardlessPlates: number;
  windowDays: number;
  averagePerDay: number;
  daysNeeded: number | null;
  daysLeft: number | null;
  /** How many of the remaining plates the current pace would NOT reach by the deadline. */
  shortfall: number | null;
  verdict: ReadinessVerdict;
}

export function estimateReadiness(input: ReadinessInput): ReadinessEstimate {
  const { cardlessPlates, firstCardsIssued, windowDays, deadline, today } = input;
  const averagePerDay = windowDays > 0 ? firstCardsIssued / windowDays : 0;
  const rounded = Math.round(averagePerDay * 10) / 10;
  const base = { cardlessPlates, windowDays, averagePerDay: rounded };

  if (cardlessPlates <= 0) {
    return { ...base, daysNeeded: 0, daysLeft: deadline ? Math.max(0, daysBetween(today, deadline)) : null, shortfall: 0, verdict: 'NONE_REMAINING' };
  }
  if (averagePerDay <= 0) {
    return { ...base, daysNeeded: null, daysLeft: deadline ? Math.max(0, daysBetween(today, deadline)) : null, shortfall: null, verdict: 'NO_ISSUANCE' };
  }

  const daysNeeded = Math.ceil(cardlessPlates / averagePerDay);
  if (!deadline) {
    return { ...base, daysNeeded, daysLeft: null, shortfall: null, verdict: 'NO_DEADLINE' };
  }

  const remaining = daysBetween(today, deadline);
  if (remaining <= 0) {
    return { ...base, daysNeeded, daysLeft: 0, shortfall: cardlessPlates, verdict: 'DEADLINE_PASSED' };
  }
  const reachable = Math.floor(averagePerDay * remaining);
  const shortfall = Math.max(0, cardlessPlates - reachable);
  return { ...base, daysNeeded, daysLeft: remaining, shortfall, verdict: daysNeeded <= remaining ? 'ON_TRACK' : 'AT_RISK' };
}
