import { estimateReadiness } from './readiness-estimate';

const base = { windowDays: 14, today: '2026-10-20' };

describe('deadline readiness estimate', () => {
  describe('with a deadline', () => {
    it('6,000 plates still without a card and 400 first cards a day cannot finish in a week', () => {
      const e = estimateReadiness({ ...base, cardlessPlates: 6000, firstCardsIssued: 400 * 14, deadline: '2026-10-27' });
      expect(e).toMatchObject({ averagePerDay: 400, daysNeeded: 15, daysLeft: 7, verdict: 'AT_RISK' });
      // 400 a day for 7 days reaches 2,800; 3,200 plates would still be waiting.
      expect(e.shortfall).toBe(3200);
    });

    it('is on track when the days needed fit in the days left', () => {
      const e = estimateReadiness({ ...base, cardlessPlates: 2000, firstCardsIssued: 400 * 14, deadline: '2026-10-27' });
      expect(e).toMatchObject({ daysNeeded: 5, daysLeft: 7, verdict: 'ON_TRACK', shortfall: 0 });
    });

    it('exactly enough days is still on track', () => {
      const e = estimateReadiness({ ...base, cardlessPlates: 2800, firstCardsIssued: 400 * 14, deadline: '2026-10-27' });
      expect(e).toMatchObject({ daysNeeded: 7, daysLeft: 7, verdict: 'ON_TRACK' });
    });

    it('rounds the days needed up', () => {
      const e = estimateReadiness({ ...base, cardlessPlates: 401, firstCardsIssued: 400 * 14, deadline: '2026-10-27' });
      expect(e.daysNeeded).toBe(2);
    });

    it('a deadline today or earlier is passed, with every remaining plate short', () => {
      const e = estimateReadiness({ ...base, cardlessPlates: 500, firstCardsIssued: 1400, deadline: '2026-10-20' });
      expect(e).toMatchObject({ verdict: 'DEADLINE_PASSED', daysLeft: 0, shortfall: 500 });
    });
  });

  describe('without a deadline', () => {
    it('shows the days needed alone, with nothing to compare against', () => {
      const e = estimateReadiness({ ...base, cardlessPlates: 6000, firstCardsIssued: 400 * 14, deadline: null });
      expect(e).toMatchObject({ daysNeeded: 15, daysLeft: null, shortfall: null, verdict: 'NO_DEADLINE' });
    });
  });

  describe('edge cases', () => {
    it('nobody without a card means nothing is left to do', () => {
      const e = estimateReadiness({ ...base, cardlessPlates: 0, firstCardsIssued: 100, deadline: '2026-10-27' });
      expect(e).toMatchObject({ daysNeeded: 0, verdict: 'NONE_REMAINING', shortfall: 0 });
    });

    it('no cards issued lately gives no pace, so no estimate (never a division by zero)', () => {
      const e = estimateReadiness({ ...base, cardlessPlates: 300, firstCardsIssued: 0, deadline: '2026-10-27' });
      expect(e).toMatchObject({ averagePerDay: 0, daysNeeded: null, verdict: 'NO_ISSUANCE', daysLeft: 7 });
    });

    it('reports the average to one decimal', () => {
      const e = estimateReadiness({ ...base, cardlessPlates: 100, firstCardsIssued: 100, deadline: null });
      expect(e.averagePerDay).toBe(7.1);
    });

    it('a different window length changes the pace', () => {
      const e = estimateReadiness({ cardlessPlates: 100, firstCardsIssued: 70, windowDays: 7, today: '2026-10-20', deadline: null });
      expect(e).toMatchObject({ averagePerDay: 10, daysNeeded: 10 });
    });
  });
});
