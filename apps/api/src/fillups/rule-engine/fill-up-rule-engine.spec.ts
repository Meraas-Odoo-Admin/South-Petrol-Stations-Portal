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

// Municipality-blind: returns the same history whatever municipality is
// asked for — i.e. every record is treated as being in the municipality
// under evaluation. The original single-municipality tests below use it
// unchanged; StampedFakeHistory (further down) is the per-municipality one.
class FakeHistory implements FillUpHistoryReader {
  constructor(
    private readonly byVehicle: Record<string, FillUpHistoryRecord[]> = {},
    private readonly byOwner: Record<string, FillUpHistoryRecord[]> = {},
    private readonly byPlate: Record<string, FillUpHistoryRecord[]> = {},
  ) {}

  async getRecentForPlate(normalizedPlate: string): Promise<FillUpHistoryRecord[]> {
    return this.byPlate[normalizedPlate] ?? [];
  }

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
  // Phase 5A: every rule switched ON here (the real default for owner liters is
  // off - rule-switches.spec.ts covers that), so the tests in this file keep
  // exercising each rule.
  'fillup.rule.vehicle_gap.enabled': 'true',
  'fillup.rule.vehicle_weekly.enabled': 'true',
  'fillup.rule.owner_gap.enabled': 'true',
  'fillup.rule.owner_weekly.enabled': 'true',
  'fillup.rule.owner_liters.enabled': 'true',
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
  const municipalityId = 'mun-a';

  it('allows a fill-up with no prior history at all', async () => {
    const engine = new FillUpRuleEngine(new FakeSettings(DEFAULT_SETTINGS), new FakeHistory());
    const result = await engine.evaluate(vehicleId, ownerId, municipalityId, now);
    expect(result).toEqual({ allowed: true });
  });

  it('allows a fill-up when the vehicle has no owner set at all (ownerId null) — owner-scoped checks are skipped entirely', async () => {
    const history = new FakeHistory({}, { [ownerId]: [record(otherVehicleId, daysAgo(now, 1))] });
    const engine = new FillUpRuleEngine(new FakeSettings(DEFAULT_SETTINGS), history);
    const result = await engine.evaluate(vehicleId, null, municipalityId, now);
    expect(result).toEqual({ allowed: true });
  });

  it('rejects with VEHICLE_GAP_TOO_SHORT when the vehicle\'s last fill-up is inside min_gap_days, and names the triggering fill-up', async () => {
    const priorAt = daysAgo(now, 1); // 1 day < min_gap_days (2)
    const history = new FakeHistory({ [vehicleId]: [record(vehicleId, priorAt)] });
    const engine = new FillUpRuleEngine(new FakeSettings(DEFAULT_SETTINGS), history);
    const result = await engine.evaluate(vehicleId, ownerId, municipalityId, now);
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
    const result = await engine.evaluate(vehicleId, ownerId, municipalityId, now);
    expect(result).toEqual({ allowed: false, reason: 'VEHICLE_WEEKLY_CAP_REACHED' });
  });

  it('rejects with OWNER_GAP_TOO_SHORT when the vehicle checks pass but the owner\'s last fill-up (on any of their vehicles) is inside min_gap_days_per_owner, and names the OTHER vehicle it happened on', async () => {
    const priorAt = daysAgo(now, 1);
    const history = new FakeHistory(
      {}, // vehicle has no history at all
      { [ownerId]: [record(otherVehicleId, priorAt)] }, // on some other vehicle
    );
    const engine = new FillUpRuleEngine(new FakeSettings(DEFAULT_SETTINGS), history);
    const result = await engine.evaluate(vehicleId, ownerId, municipalityId, now);
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
    const result = await engine.evaluate(vehicleId, ownerId, municipalityId, now);
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
    const result = await engine.evaluate(vehicleId, ownerId, municipalityId, now);
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
    const result = await engine.evaluate(vehicleId, ownerId, municipalityId, now);
    expect(result).toEqual({ allowed: true });
  });

  it('returns the VEHICLE reason when both vehicle and owner checks would independently fail, per the stated check order (vehicle before owner)', async () => {
    const priorAt = daysAgo(now, 1);
    const history = new FakeHistory(
      { [vehicleId]: [record(vehicleId, priorAt)] }, // vehicle gap fails
      { [ownerId]: [record(vehicleId, priorAt)] }, // owner gap would also fail
    );
    const engine = new FillUpRuleEngine(new FakeSettings(DEFAULT_SETTINGS), history);
    const result = await engine.evaluate(vehicleId, ownerId, municipalityId, now);
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
    const result = await engine.evaluate(vehicleId, ownerId, municipalityId, now);
    expect(result).toEqual({ allowed: true });
  });

  // Round 7 item 1: the fill-up form's pre-submit rule-review screen needs
  // every rule's actual numbers, not just the first failure — these tests
  // pin evaluateWithChecks() to the exact same verdicts evaluate() gives
  // above, so the two can never silently drift apart.
  describe('evaluateWithChecks', () => {
    it('returns actual: null for a vehicle/owner with no prior fill-up history at all, all checks passed', async () => {
      const engine = new FillUpRuleEngine(new FakeSettings(DEFAULT_SETTINGS), new FakeHistory());
      const { result, checks } = await engine.evaluateWithChecks(vehicleId, ownerId, municipalityId, now);
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
      const { result, checks } = await engine.evaluateWithChecks(vehicleId, null, municipalityId, now);
      expect(result).toEqual({ allowed: true });
      expect(checks).toHaveLength(2);
      expect(checks.map((c) => c.reason)).toEqual(['VEHICLE_GAP_TOO_SHORT', 'VEHICLE_WEEKLY_CAP_REACHED']);
    });

    it('reports the failing check with its real actual/limit numbers, alongside every other still-passing check', async () => {
      const priorAt = daysAgo(now, 1); // 1 day < min_gap_days (2)
      const history = new FakeHistory({ [vehicleId]: [record(vehicleId, priorAt)] });
      const engine = new FillUpRuleEngine(new FakeSettings(DEFAULT_SETTINGS), history);
      const { result, checks } = await engine.evaluateWithChecks(vehicleId, ownerId, municipalityId, now);
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
      const { checks } = await engine.evaluateWithChecks(vehicleId, ownerId, municipalityId, now);
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
      const result = await engine.evaluate(vehicleId, ownerId, municipalityId, now);
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
      const result = await engine.evaluate(vehicleId, ownerId, municipalityId, now);
      expect(result).toEqual({
        allowed: false,
        reason: 'VEHICLE_GAP_TOO_SHORT',
        trigger: { vehicleId, occurredAt: daysAgo(now, 1) },
      });
    });

    it('still rejects normally when no StandingExceptionReader is supplied at all (real controller wiring always supplies one, but the constructor param is optional for tests)', async () => {
      const history = new FakeHistory({ [vehicleId]: [record(vehicleId, daysAgo(now, 1))] });
      const engine = new FillUpRuleEngine(new FakeSettings(DEFAULT_SETTINGS), history);
      const result = await engine.evaluate(vehicleId, ownerId, municipalityId, now);
      expect(result.allowed).toBe(false);
    });
  });
});

// ── Registration pivot, phase 1: allowances are per municipality ──────────
//
// A fill-up only counts against the allowance of the municipality it was
// stamped with (FillUpTransaction.municipalityId). This fake stores one flat
// list of stamped fill-ups and answers exactly the way FillUpsRepository's
// queries do — same vehicle (or same owner), same municipality, inside the
// lookback window, strictly before `before`, newest first — so these tests
// exercise the engine against realistic mixed-municipality history.
interface StampedFillUp extends FillUpHistoryRecord {
  ownerId: string | null;
  municipalityId: string;
  normalizedPlate?: string;
}

class StampedFakeHistory implements FillUpHistoryReader {
  constructor(private readonly fillUps: StampedFillUp[]) {}

  private select(
    matches: (f: StampedFillUp) => boolean,
    municipalityId: string,
    before: Date,
    lookbackDays: number,
  ): FillUpHistoryRecord[] {
    const from = before.getTime() - lookbackDays * DAY_MS;
    return this.fillUps
      .filter(
        (f) =>
          matches(f) &&
          f.municipalityId === municipalityId &&
          f.occurredAt.getTime() >= from &&
          f.occurredAt < before,
      )
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .map(({ vehicleId, occurredAt, quantityLiters }) => ({ vehicleId, occurredAt, quantityLiters }));
  }

  async getRecentForVehicle(vehicleId: string, municipalityId: string, before: Date, lookbackDays: number) {
    return this.select((f) => f.vehicleId === vehicleId, municipalityId, before, lookbackDays);
  }

  async getRecentForOwner(ownerId: string, municipalityId: string, before: Date, lookbackDays: number) {
    return this.select((f) => f.ownerId === ownerId, municipalityId, before, lookbackDays);
  }

  // Same as the repository: only rows with no vehicle yet, by normalized plate.
  async getRecentForPlate(normalizedPlate: string, municipalityId: string, before: Date, lookbackDays: number) {
    return this.select(
      (f) => f.vehicleId === null && f.normalizedPlate === normalizedPlate,
      municipalityId,
      before,
      lookbackDays,
    );
  }
}

describe('FillUpRuleEngine — per-municipality allowances', () => {
  const vehicleId = 'veh-1';
  const otherVehicleId = 'veh-2';
  const ownerId = 'own-1';
  const muniA = 'mun-a'; // e.g. سبها
  const muniB = 'mun-b'; // a second, later-launched municipality

  // A Saturday, matching the client's own example.
  const saturdayMorning = new Date('2026-08-22T07:00:00.000Z');
  const saturdayAfternoon = new Date('2026-08-22T13:00:00.000Z');
  const sunday = new Date('2026-08-23T09:00:00.000Z');

  function stamped(
    municipalityId: string,
    occurredAt: Date,
    opts: { vehicleId?: string; ownerId?: string | null; quantityLiters?: number } = {},
  ): StampedFillUp {
    return {
      vehicleId: opts.vehicleId ?? vehicleId,
      ownerId: opts.ownerId === undefined ? ownerId : opts.ownerId,
      municipalityId,
      occurredAt,
      quantityLiters: opts.quantityLiters ?? 30,
    };
  }

  function engineFor(fillUps: StampedFillUp[], settings: Record<string, string> = DEFAULT_SETTINGS) {
    return new FillUpRuleEngine(new FakeSettings(settings), new StampedFakeHistory(fillUps));
  }

  it('allows a fill-up in municipality B the same day as one in municipality A', async () => {
    const engine = engineFor([stamped(muniA, saturdayMorning)]);
    const result = await engine.evaluate(vehicleId, ownerId, muniB, saturdayAfternoon);
    expect(result).toEqual({ allowed: true });
  });

  it('blocks a second fill-up back in municipality A too soon (gap rule), citing the A fill-up — not the one in B', async () => {
    const engine = engineFor([stamped(muniA, saturdayMorning), stamped(muniB, saturdayAfternoon)]);
    const result = await engine.evaluate(vehicleId, ownerId, muniA, sunday);
    expect(result).toEqual({
      allowed: false,
      reason: 'VEHICLE_GAP_TOO_SHORT',
      trigger: { vehicleId, occurredAt: saturdayMorning },
    });
  });

  it('a fill-up in B does not reset or shorten the gap measured in A', async () => {
    // A three days ago (gap satisfied in A), B an hour ago (would fail the
    // gap if it counted). Back in A now: only the A fill-up is compared.
    const now = new Date('2026-08-25T12:00:00.000Z');
    const engine = engineFor([
      stamped(muniA, new Date('2026-08-22T12:00:00.000Z')),
      stamped(muniB, new Date('2026-08-25T11:00:00.000Z')),
    ]);
    const { result, checks } = await engine.evaluateWithChecks(vehicleId, ownerId, muniA, now);
    expect(result).toEqual({ allowed: true });
    expect(checks.find((c) => c.reason === 'VEHICLE_GAP_TOO_SHORT')!.actual).toBe(3);
  });

  describe('vehicle weekly cap is counted per municipality', () => {
    const now = new Date('2026-08-28T12:00:00.000Z');
    const threeInA = [
      stamped(muniA, new Date('2026-08-22T12:00:00.000Z')),
      stamped(muniA, new Date('2026-08-24T12:00:00.000Z')),
      stamped(muniA, new Date('2026-08-26T12:00:00.000Z')),
    ];

    it('A at its cap blocks A', async () => {
      const result = await engineFor(threeInA).evaluate(vehicleId, ownerId, muniA, now);
      expect(result).toEqual({ allowed: false, reason: 'VEHICLE_WEEKLY_CAP_REACHED' });
    });

    it('A at its cap does not block B, whose count is still zero', async () => {
      const { result, checks } = await engineFor(threeInA).evaluateWithChecks(vehicleId, ownerId, muniB, now);
      expect(result).toEqual({ allowed: true });
      expect(checks.find((c) => c.reason === 'VEHICLE_WEEKLY_CAP_REACHED')!.actual).toBe(0);
    });

    it('two in A plus two in B is two per municipality, not four — both still allowed', async () => {
      const fillUps = [
        stamped(muniA, new Date('2026-08-22T08:00:00.000Z')),
        stamped(muniB, new Date('2026-08-22T14:00:00.000Z')),
        stamped(muniA, new Date('2026-08-25T08:00:00.000Z')),
        stamped(muniB, new Date('2026-08-25T14:00:00.000Z')),
      ];
      for (const municipality of [muniA, muniB]) {
        const { result, checks } = await engineFor(fillUps).evaluateWithChecks(vehicleId, ownerId, municipality, now);
        expect(result).toEqual({ allowed: true });
        expect(checks.find((c) => c.reason === 'VEHICLE_WEEKLY_CAP_REACHED')!.actual).toBe(2);
      }
    });
  });

  describe('owner-level rules are split the same way', () => {
    it("owner gap: a fill-up on the owner's other vehicle in A blocks A, not B", async () => {
      const fillUps = [stamped(muniA, saturdayMorning, { vehicleId: otherVehicleId })];

      const inA = await engineFor(fillUps).evaluate(vehicleId, ownerId, muniA, saturdayAfternoon);
      expect(inA).toEqual({
        allowed: false,
        reason: 'OWNER_GAP_TOO_SHORT',
        trigger: { vehicleId: otherVehicleId, occurredAt: saturdayMorning },
      });

      const inB = await engineFor(fillUps).evaluate(vehicleId, ownerId, muniB, saturdayAfternoon);
      expect(inB).toEqual({ allowed: true });
    });

    it("owner weekly cap: three fill-ups across the owner's vehicles in A blocks A, not B", async () => {
      const now = new Date('2026-08-28T12:00:00.000Z');
      const fillUps = [
        stamped(muniA, new Date('2026-08-22T12:00:00.000Z'), { vehicleId: otherVehicleId }),
        stamped(muniA, new Date('2026-08-24T12:00:00.000Z'), { vehicleId: otherVehicleId }),
        stamped(muniA, new Date('2026-08-26T12:00:00.000Z'), { vehicleId: 'veh-3' }),
      ];

      const inA = await engineFor(fillUps).evaluate(vehicleId, ownerId, muniA, now);
      expect(inA).toEqual({ allowed: false, reason: 'OWNER_WEEKLY_CAP_REACHED' });

      const { result: inB, checks } = await engineFor(fillUps).evaluateWithChecks(vehicleId, ownerId, muniB, now);
      expect(inB).toEqual({ allowed: true });
      expect(checks.find((c) => c.reason === 'OWNER_WEEKLY_CAP_REACHED')!.actual).toBe(0);
    });

    it("owner liters: liters drawn in A count toward A's cap only", async () => {
      const settings = { ...DEFAULT_SETTINGS, 'fillup.max_liters_per_week_per_owner': '100' };
      const now = new Date('2026-08-28T12:00:00.000Z');
      const fillUps = [
        stamped(muniA, new Date('2026-08-24T12:00:00.000Z'), { vehicleId: otherVehicleId, quantityLiters: 60 }),
        stamped(muniA, new Date('2026-08-26T12:00:00.000Z'), { vehicleId: otherVehicleId, quantityLiters: 40 }),
        stamped(muniB, new Date('2026-08-24T12:00:00.000Z'), { vehicleId: otherVehicleId, quantityLiters: 25 }),
      ];

      const inA = await engineFor(fillUps, settings).evaluate(vehicleId, ownerId, muniA, now);
      expect(inA).toEqual({ allowed: false, reason: 'LITERS_PER_PERSON_CAP_REACHED' });

      const { result: inB, checks } = await engineFor(fillUps, settings).evaluateWithChecks(
        vehicleId,
        ownerId,
        muniB,
        now,
      );
      expect(inB).toEqual({ allowed: true });
      expect(checks.find((c) => c.reason === 'LITERS_PER_PERSON_CAP_REACHED')!.actual).toBe(25);
    });
  });

  // With every fill-up in one municipality, per-municipality counting must
  // be indistinguishable from the pre-pivot, municipality-blind engine.
  // Each scenario runs twice — against StampedFakeHistory with everything
  // stamped A, and against the municipality-blind FakeHistory fed the same
  // records — and the full per-rule breakdown and verdict must match.
  describe('with only one municipality, results are identical to the municipality-blind behavior', () => {
    const now = new Date('2026-08-28T12:00:00.000Z');
    const at = (iso: string) => new Date(iso);
    const scenarios: Array<{ name: string; fillUps: StampedFillUp[]; settings?: Record<string, string> }> = [
      { name: 'no history', fillUps: [] },
      { name: 'gap too short', fillUps: [stamped(muniA, at('2026-08-27T20:00:00.000Z'))] },
      {
        name: 'vehicle at weekly cap',
        fillUps: [
          stamped(muniA, at('2026-08-22T12:00:00.000Z')),
          stamped(muniA, at('2026-08-24T12:00:00.000Z')),
          stamped(muniA, at('2026-08-26T12:00:00.000Z')),
        ],
      },
      {
        name: 'owner gap via another vehicle',
        fillUps: [stamped(muniA, at('2026-08-28T08:00:00.000Z'), { vehicleId: otherVehicleId })],
      },
      {
        name: 'owner liters cap',
        settings: { ...DEFAULT_SETTINGS, 'fillup.max_liters_per_week_per_owner': '50' },
        fillUps: [stamped(muniA, at('2026-08-24T12:00:00.000Z'), { vehicleId: otherVehicleId, quantityLiters: 55 })],
      },
      { name: 'all passing, prior fill-up three days ago', fillUps: [stamped(muniA, at('2026-08-25T12:00:00.000Z'))] },
    ];

    function municipalityBlind(fillUps: StampedFillUp[]): FakeHistory {
      const newestFirst = [...fillUps].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
      const strip = ({ vehicleId: v, occurredAt, quantityLiters }: StampedFillUp) => ({
        vehicleId: v,
        occurredAt,
        quantityLiters,
      });
      return new FakeHistory(
        { [vehicleId]: newestFirst.filter((f) => f.vehicleId === vehicleId).map(strip) },
        { [ownerId]: newestFirst.filter((f) => f.ownerId === ownerId).map(strip) },
      );
    }

    it.each(scenarios)('$name', async ({ fillUps, settings = DEFAULT_SETTINGS }) => {
      for (const owner of [ownerId, null]) {
        const perMunicipality = await new FillUpRuleEngine(
          new FakeSettings(settings),
          new StampedFakeHistory(fillUps),
        ).evaluateWithChecks(vehicleId, owner, muniA, now);
        const blind = await new FillUpRuleEngine(
          new FakeSettings(settings),
          municipalityBlind(fillUps),
        ).evaluateWithChecks(vehicleId, owner, muniA, now);
        expect(perMunicipality).toEqual(blind);
      }
    });
  });
});

// ── Registration pivot, phase 4a: an unregistered plate ──────────────────
//
// A plate with no registered vehicle is counted by its normalized plate,
// per municipality, with the same settings and the same two vehicle-level
// rules. There is no owner, so the owner-level rules cannot apply — the
// result says so — and no standing exception can cover anything.
describe('FillUpRuleEngine — unregistered plate', () => {
  const muniA = 'mun-a';
  const muniB = 'mun-b';
  const plate = '81234567';
  const now = new Date('2026-08-23T12:00:00.000Z');

  function plateFillUp(municipalityId: string, occurredAt: Date, normalizedPlate = plate): StampedFillUp {
    return { vehicleId: null, ownerId: null, municipalityId, occurredAt, quantityLiters: 30, normalizedPlate };
  }

  function engineFor(fillUps: StampedFillUp[], covering: { id: string; rule: RuleFailureReason } | null = null) {
    return new FillUpRuleEngine(
      new FakeSettings(DEFAULT_SETTINGS),
      new StampedFakeHistory(fillUps),
      new FakeStandingExceptions(covering),
    );
  }

  const subject = { kind: 'plate', normalizedPlate: plate } as const;

  it('allows the first fill-up for a plate', async () => {
    const result = await engineFor([]).evaluateSubject(subject, muniA, now);
    expect(result).toEqual({ allowed: true });
  });

  it('blocks a second fill-up inside the minimum gap, citing the vehicle gap rule', async () => {
    const engine = engineFor([plateFillUp(muniA, daysAgo(now, 1))]);
    const result = await engine.evaluateSubject(subject, muniA, now);
    expect(result).toMatchObject({ allowed: false, reason: 'VEHICLE_GAP_TOO_SHORT' });
  });

  it('blocks the fourth fill-up in a week once the gap is respected', async () => {
    const engine = engineFor([
      plateFillUp(muniA, daysAgo(now, 2.5)),
      plateFillUp(muniA, daysAgo(now, 4.5)),
      plateFillUp(muniA, daysAgo(now, 6.5)),
    ]);
    const result = await engine.evaluateSubject(subject, muniA, now);
    expect(result).toMatchObject({ allowed: false, reason: 'VEHICLE_WEEKLY_CAP_REACHED' });
  });

  it('counts only the same municipality', async () => {
    const engine = engineFor([plateFillUp(muniB, daysAgo(now, 1))]);
    expect(await engine.evaluateSubject(subject, muniA, now)).toEqual({ allowed: true });
  });

  it('counts only the same normalized plate', async () => {
    const engine = engineFor([plateFillUp(muniA, daysAgo(now, 1), '81234568')]);
    expect(await engine.evaluateSubject(subject, muniA, now)).toEqual({ allowed: true });
  });

  it('does not count a row that has already been linked to a vehicle', async () => {
    const linked: StampedFillUp = { ...plateFillUp(muniA, daysAgo(now, 1)), vehicleId: 'veh-1' };
    expect(await engineFor([linked]).evaluateSubject(subject, muniA, now)).toEqual({ allowed: true });
  });

  it('reports the three owner-level rules as skipped, and returns only the vehicle-level checks', async () => {
    const { checks, skipped } = await engineFor([]).evaluateSubjectWithChecks(subject, muniA, now);
    expect(checks.map((c) => c.reason)).toEqual(['VEHICLE_GAP_TOO_SHORT', 'VEHICLE_WEEKLY_CAP_REACHED']);
    expect(skipped).toEqual(['OWNER_GAP_TOO_SHORT', 'OWNER_WEEKLY_CAP_REACHED', 'LITERS_PER_PERSON_CAP_REACHED']);
  });

  it('never lets a standing exception cover a plate with no vehicle', async () => {
    const engine = engineFor([plateFillUp(muniA, daysAgo(now, 1))], { id: 'se-1', rule: 'VEHICLE_GAP_TOO_SHORT' });
    expect(await engine.evaluateSubject(subject, muniA, now)).toMatchObject({
      allowed: false,
      reason: 'VEHICLE_GAP_TOO_SHORT',
    });
  });

  it('gives the same verdict through evaluateSubject and evaluateSubjectWithChecks', async () => {
    const engine = engineFor([plateFillUp(muniA, daysAgo(now, 1))]);
    const direct = await engine.evaluateSubject(subject, muniA, now);
    const { result } = await engine.evaluateSubjectWithChecks(subject, muniA, now);
    expect(result).toEqual(direct);
  });
});
