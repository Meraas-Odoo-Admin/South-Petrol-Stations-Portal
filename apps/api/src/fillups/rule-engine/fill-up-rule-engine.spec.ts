import { FillUpRuleEngine } from './fill-up-rule-engine';
import type {
  FillUpHistoryReader,
  FillUpHistoryRecord,
  RuleFailureReason,
  SettingsReader,
  StandingExceptionReader,
} from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

// Deliberately not the real SystemSettingsService/FillUpRepository — this
// is what makes the engine "independently unit-tested": no Prisma, no DB,
// no NestJS TestingModule. Both fakes here implement the same interfaces
// the real Prisma-backed classes implement.
class FakeSettings implements SettingsReader {
  constructor(private readonly values: Record<string, string>) {}

  async getNumber(key: string): Promise<number> {
    const raw = this.values[key];
    if (raw === undefined) {
      throw new Error(`missing setting: ${key}`);
    }
    return Number(raw);
  }

  async getString(key: string): Promise<string> {
    const raw = this.values[key];
    if (raw === undefined) {
      throw new Error(`missing setting: ${key}`);
    }
    return raw;
  }
}

class FakeHistory implements FillUpHistoryReader {
  constructor(
    private readonly byVehicle: Record<string, FillUpHistoryRecord[]> = {},
    private readonly byOwner: Record<string, FillUpHistoryRecord[]> = {},
  ) {}

  async getRecentForVehicle(vehicleId: string): Promise<FillUpHistoryRecord[]> {
    return this.byVehicle[vehicleId] ?? [];
  }

  async getRecentForOwner(ownerId: string): Promise<FillUpHistoryRecord[]> {
    return this.byOwner[ownerId] ?? [];
  }
}

class FakeStandingExceptions implements StandingExceptionReader {
  constructor(private readonly covering: { id: string; rule: RuleFailureReason } | null = null) {}

  async findActiveCovering(params: { rule: RuleFailureReason }): Promise<{ id: string } | null> {
    if (this.covering && this.covering.rule === params.rule) {
      return { id: this.covering.id };
    }
    return null;
  }
}

// Placeholder defaults (fillup.max_per_week_per_owner/min_gap_days_per_owner
// are literally seeded as placeholders — see seed.ts) mirrored here so the
// tests exercise the same numbers the real engine will actually run with.
const DEFAULT_SETTINGS = {
  'fillup.max_per_week': '3',
  'fillup.min_gap_days': '2',
  'fillup.max_per_week_per_owner': '3',
  'fillup.min_gap_days_per_owner': '2',
  'fillup.max_liters_per_week_per_owner': '1000', // high enough to stay out of the way of unrelated tests
  'fillup.week_window_mode': 'rolling',
  'fillup.week_start_day': '6',
};

function daysAgo(reference: Date, days: number): Date {
  return new Date(reference.getTime() - days * DAY_MS);
}

function record(vehicleId: string, occurredAt: Date, quantityLiters = 30): FillUpHistoryRecord {
  return { vehicleId, occurredAt, quantityLiters };
}

describe('FillUpRuleEngine', () => {
  const now = new Date('2026-08-23T12:00:00.000Z');
  const vehicleId = 'veh-1';
  const otherVehicleId = 'veh-2';
  const ownerId = 'own-1';

  it('allows a fill-up with no prior history at all', async () => {
    const engine = new FillUpRuleEngine(new FakeSettings(DEFAULT_SETTINGS), new FakeHistory());
    const result = await engine.evaluate(vehicleId, ownerId, now);
    expect(result).toEqual({ allowed: true });
  });

  it('allows a fill-up when the vehicle has no owner set at all (ownerId null) — owner-scoped checks are skipped entirely', async () => {
    const history = new FakeHistory({}, { [ownerId]: [record(otherVehicleId, daysAgo(now, 1))] });
    const engine = new FillUpRuleEngine(new FakeSettings(DEFAULT_SETTINGS), history);
    const result = await engine.evaluate(vehicleId, null, now);
    expect(result).toEqual({ allowed: true });
  });

  it('rejects with VEHICLE_GAP_TOO_SHORT when the vehicle\'s last fill-up is inside min_gap_days, and names the triggering fill-up', async () => {
    const priorAt = daysAgo(now, 1); // 1 day < min_gap_days (2)
    const history = new FakeHistory({ [vehicleId]: [record(vehicleId, priorAt)] });
    const engine = new FillUpRuleEngine(new FakeSettings(DEFAULT_SETTINGS), history);
    const result = await engine.evaluate(vehicleId, ownerId, now);
    expect(result).toEqual({
      allowed: false,
      reason: 'VEHICLE_GAP_TOO_SHORT',
      trigger: { vehicleId, occurredAt: priorAt },
    });
  });

  it('rejects with VEHICLE_WEEKLY_CAP_REACHED when the vehicle already has max_per_week fill-ups in the rolling window, even though the gap rule is satisfied', async () => {
    const history = new FakeHistory({
      [vehicleId]: [
        record(vehicleId, daysAgo(now, 2)), // satisfies the 2-day gap
        record(vehicleId, daysAgo(now, 4)),
        record(vehicleId, daysAgo(now, 6)),
      ],
    });
    const engine = new FillUpRuleEngine(new FakeSettings(DEFAULT_SETTINGS), history);
    const result = await engine.evaluate(vehicleId, ownerId, now);
    expect(result).toEqual({ allowed: false, reason: 'VEHICLE_WEEKLY_CAP_REACHED' });
  });

  it('rejects with OWNER_GAP_TOO_SHORT when the vehicle checks pass but the owner\'s last fill-up (on any of their vehicles) is inside min_gap_days_per_owner, and names the OTHER vehicle it happened on', async () => {
    const priorAt = daysAgo(now, 1);
    const history = new FakeHistory(
      {}, // vehicle has no history at all
      { [ownerId]: [record(otherVehicleId, priorAt)] }, // on some other vehicle
    );
    const engine = new FillUpRuleEngine(new FakeSettings(DEFAULT_SETTINGS), history);
    const result = await engine.evaluate(vehicleId, ownerId, now);
    expect(result).toEqual({
      allowed: false,
      reason: 'OWNER_GAP_TOO_SHORT',
      trigger: { vehicleId: otherVehicleId, occurredAt: priorAt },
    });
  });

  it('rejects with OWNER_WEEKLY_CAP_REACHED when the owner already has max_per_week_per_owner fill-ups across their vehicles this week, even though the vehicle checks pass', async () => {
    const history = new FakeHistory(
      {},
      {
        [ownerId]: [
          record(otherVehicleId, daysAgo(now, 2)), // satisfies the owner gap rule
          record(otherVehicleId, daysAgo(now, 4)),
          record(otherVehicleId, daysAgo(now, 6)),
        ],
      },
    );
    const engine = new FillUpRuleEngine(new FakeSettings(DEFAULT_SETTINGS), history);
    const result = await engine.evaluate(vehicleId, ownerId, now);
    expect(result).toEqual({ allowed: false, reason: 'OWNER_WEEKLY_CAP_REACHED' });
  });

  it('rejects with LITERS_PER_PERSON_CAP_REACHED when the owner\'s liters in the rolling window already reach the cap', async () => {
    const settings = { ...DEFAULT_SETTINGS, 'fillup.max_liters_per_week_per_owner': '100' };
    const history = new FakeHistory(
      {},
      {
        [ownerId]: [
          record(otherVehicleId, daysAgo(now, 2), 60),
          record(otherVehicleId, daysAgo(now, 4), 40),
        ],
      },
    );
    const engine = new FillUpRuleEngine(new FakeSettings(settings), history);
    const result = await engine.evaluate(vehicleId, ownerId, now);
    expect(result).toEqual({ allowed: false, reason: 'LITERS_PER_PERSON_CAP_REACHED' });
  });

  it('LITERS_PER_PERSON_CAP_REACHED resets once the tripping fill-ups roll out of the 7-day rolling window', async () => {
    const settings = { ...DEFAULT_SETTINGS, 'fillup.max_liters_per_week_per_owner': '100' };
    // Same 60+40=100L that trips the cap in the test above, but now 8 days
    // old — outside the 7-day rolling window — so none of it should count
    // toward the owner's current total, and the fill-up should be allowed.
    const history = new FakeHistory(
      {},
      {
        [ownerId]: [
          record(otherVehicleId, daysAgo(now, 8), 60),
          record(otherVehicleId, daysAgo(now, 9), 40),
        ],
      },
    );
    const engine = new FillUpRuleEngine(new FakeSettings(settings), history);
    const result = await engine.evaluate(vehicleId, ownerId, now);
    expect(result).toEqual({ allowed: true });
  });

  it('returns the VEHICLE reason when both vehicle and owner checks would independently fail, per the stated check order (vehicle before owner)', async () => {
    const priorAt = daysAgo(now, 1);
    const history = new FakeHistory(
      { [vehicleId]: [record(vehicleId, priorAt)] }, // vehicle gap fails
      { [ownerId]: [record(vehicleId, priorAt)] }, // owner gap would also fail
    );
    const engine = new FillUpRuleEngine(new FakeSettings(DEFAULT_SETTINGS), history);
    const result = await engine.evaluate(vehicleId, ownerId, now);
    expect(result).toEqual({
      allowed: false,
      reason: 'VEHICLE_GAP_TOO_SHORT',
      trigger: { vehicleId, occurredAt: priorAt },
    });
  });

  it('allows a fill-up when both gap rules are satisfied and both weekly counts are under their caps', async () => {
    const history = new FakeHistory(
      { [vehicleId]: [record(vehicleId, daysAgo(now, 3))] },
      { [ownerId]: [record(vehicleId, daysAgo(now, 3))] },
    );
    const engine = new FillUpRuleEngine(new FakeSettings(DEFAULT_SETTINGS), history);
    const result = await engine.evaluate(vehicleId, ownerId, now);
    expect(result).toEqual({ allowed: true });
  });

  // Round 7 item 1: the fill-up form's pre-submit rule-review screen needs
  // every rule's actual numbers, not just the first failure — these tests
  // pin evaluateWithChecks() to the exact same verdicts evaluate() gives
  // above, so the two can never silently drift apart.
  describe('evaluateWithChecks', () => {
    it('returns actual: null for a vehicle/owner with no prior fill-up history at all, all checks passed', async () => {
      const engine = new FillUpRuleEngine(new FakeSettings(DEFAULT_SETTINGS), new FakeHistory());
      const { result, checks } = await engine.evaluateWithChecks(vehicleId, ownerId, now);
      expect(result).toEqual({ allowed: true });
      expect(checks).toHaveLength(5);
      for (const check of checks) {
        expect(check.passed).toBe(true);
      }
      const vehicleGapCheck = checks.find((c) => c.reason === 'VEHICLE_GAP_TOO_SHORT')!;
      expect(vehicleGapCheck.actual).toBeNull();
      expect(vehicleGapCheck.limit).toBe(2);
    });

    it('omits owner-scoped checks entirely when ownerId is null (vehicle has no owner set)', async () => {
      const engine = new FillUpRuleEngine(new FakeSettings(DEFAULT_SETTINGS), new FakeHistory());
      const { result, checks } = await engine.evaluateWithChecks(vehicleId, null, now);
      expect(result).toEqual({ allowed: true });
      expect(checks).toHaveLength(2);
      expect(checks.map((c) => c.reason)).toEqual(['VEHICLE_GAP_TOO_SHORT', 'VEHICLE_WEEKLY_CAP_REACHED']);
    });

    it('reports the failing check with its real actual/limit numbers, alongside every other still-passing check', async () => {
      const priorAt = daysAgo(now, 1); // 1 day < min_gap_days (2)
      const history = new FakeHistory({ [vehicleId]: [record(vehicleId, priorAt)] });
      const engine = new FillUpRuleEngine(new FakeSettings(DEFAULT_SETTINGS), history);
      const { result, checks } = await engine.evaluateWithChecks(vehicleId, ownerId, now);
      expect(result).toEqual({
        allowed: false,
        reason: 'VEHICLE_GAP_TOO_SHORT',
        trigger: { vehicleId, occurredAt: priorAt },
      });
      const failing = checks.find((c) => c.reason === 'VEHICLE_GAP_TOO_SHORT')!;
      expect(failing.passed).toBe(false);
      expect(failing.actual).toBe(1);
      expect(failing.limit).toBe(2);
      // The other 4 checks are still reported, not hidden by the failure.
      expect(checks.filter((c) => c.passed)).toHaveLength(4);
    });

    it('reports OWNER_WEEKLY_CAP_REACHED with the real count and cap when the owner is over their weekly limit', async () => {
      const history = new FakeHistory(
        {},
        {
          [ownerId]: [
            record(otherVehicleId, daysAgo(now, 2)),
            record(otherVehicleId, daysAgo(now, 4)),
            record(otherVehicleId, daysAgo(now, 6)),
          ],
        },
      );
      const engine = new FillUpRuleEngine(new FakeSettings(DEFAULT_SETTINGS), history);
      const { checks } = await engine.evaluateWithChecks(vehicleId, ownerId, now);
      const ownerWeekly = checks.find((c) => c.reason === 'OWNER_WEEKLY_CAP_REACHED')!;
      expect(ownerWeekly.passed).toBe(false);
      expect(ownerWeekly.actual).toBe(3);
      expect(ownerWeekly.limit).toBe(3);
    });
  });

  describe('standing exceptions', () => {
    it('auto-allows a fill-up that would otherwise trip VEHICLE_GAP_TOO_SHORT, and reports which grant covered it', async () => {
      const history = new FakeHistory({ [vehicleId]: [record(vehicleId, daysAgo(now, 1))] });
      const standingExceptions = new FakeStandingExceptions({
        id: 'grant-1',
        rule: 'VEHICLE_GAP_TOO_SHORT',
      });
      const engine = new FillUpRuleEngine(new FakeSettings(DEFAULT_SETTINGS), history, standingExceptions);
      const result = await engine.evaluate(vehicleId, ownerId, now);
      expect(result).toEqual({
        allowed: true,
        coveredBy: { standingExceptionId: 'grant-1', rule: 'VEHICLE_GAP_TOO_SHORT' },
      });
    });

    it('does not exempt a DIFFERENT rule than the one the grant covers', async () => {
      const history = new FakeHistory({ [vehicleId]: [record(vehicleId, daysAgo(now, 1))] });
      const standingExceptions = new FakeStandingExceptions({
        id: 'grant-1',
        rule: 'OWNER_GAP_TOO_SHORT', // covers a different rule
      });
      const engine = new FillUpRuleEngine(new FakeSettings(DEFAULT_SETTINGS), history, standingExceptions);
      const result = await engine.evaluate(vehicleId, ownerId, now);
      expect(result).toEqual({
        allowed: false,
        reason: 'VEHICLE_GAP_TOO_SHORT',
        trigger: { vehicleId, occurredAt: daysAgo(now, 1) },
      });
    });

    it('still rejects normally when no StandingExceptionReader is supplied at all (real controller wiring always supplies one, but the constructor param is optional for tests)', async () => {
      const history = new FakeHistory({ [vehicleId]: [record(vehicleId, daysAgo(now, 1))] });
      const engine = new FillUpRuleEngine(new FakeSettings(DEFAULT_SETTINGS), history);
      const result = await engine.evaluate(vehicleId, ownerId, now);
      expect(result.allowed).toBe(false);
    });
  });
});
