import { FillUpRuleEngine } from './fill-up-rule-engine';
import type { FillUpHistoryReader, FillUpHistoryRecord, RuleFailureReason, SettingsReader } from './types';

// Phase 5A: every fill-up rule can be switched on or off by the super admin,
// and an institution's vehicles are never lumped together by the owner-level
// rules. Pure engine tests: no Prisma, no DB.
const DAY_MS = 24 * 60 * 60 * 1000;

class FakeSettings implements SettingsReader {
  constructor(private readonly values: Record<string, string>) {}
  async getNumber(key: string): Promise<number> {
    return Number(await this.getString(key));
  }
  async getString(key: string): Promise<string> {
    const raw = this.values[key];
    if (raw === undefined) throw new Error(`missing setting: ${key}`);
    return raw;
  }
}

class FakeHistory implements FillUpHistoryReader {
  constructor(
    private readonly byVehicle: Record<string, FillUpHistoryRecord[]> = {},
    private readonly byOwner: Record<string, FillUpHistoryRecord[]> = {},
  ) {}
  async getRecentForPlate(): Promise<FillUpHistoryRecord[]> {
    return [];
  }
  async getRecentForVehicle(vehicleId: string): Promise<FillUpHistoryRecord[]> {
    return this.byVehicle[vehicleId] ?? [];
  }
  async getRecentForOwner(ownerId: string): Promise<FillUpHistoryRecord[]> {
    return this.byOwner[ownerId] ?? [];
  }
}

const NUMBERS = {
  'fillup.max_per_week': '3',
  'fillup.min_gap_days': '2',
  'fillup.max_per_week_per_owner': '3',
  'fillup.min_gap_days_per_owner': '2',
  'fillup.max_liters_per_week_per_owner': '300',
  'fillup.week_window_mode': 'rolling',
  'fillup.week_start_day': '6',
};

const SWITCH_KEYS = [
  'fillup.rule.vehicle_gap.enabled',
  'fillup.rule.vehicle_weekly.enabled',
  'fillup.rule.owner_gap.enabled',
  'fillup.rule.owner_weekly.enabled',
  'fillup.rule.owner_liters.enabled',
] as const;

const ALL_ON = Object.fromEntries(SWITCH_KEYS.map((k) => [k, 'true'])) as Record<string, string>;

const now = new Date('2026-08-23T12:00:00.000Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * DAY_MS);
const record = (vehicleId: string, at: Date, liters = 40): FillUpHistoryRecord => ({
  vehicleId,
  occurredAt: at,
  quantityLiters: liters,
});

const vehicleId = 'veh-1';
const ownerId = 'own-1';
const municipalityId = 'mun-a';

// History that trips EVERY rule at once.
const tripsEverything = () =>
  new FakeHistory(
    {
      [vehicleId]: [record(vehicleId, daysAgo(1), 400), record(vehicleId, daysAgo(3), 400), record(vehicleId, daysAgo(4), 400)],
    },
    {
      [ownerId]: [
        record('veh-2', daysAgo(1), 400),
        record(vehicleId, daysAgo(3), 400),
        record(vehicleId, daysAgo(4), 400),
      ],
    },
  );

const engine = (switches: Record<string, string>, history: FillUpHistoryReader = tripsEverything()) =>
  new FillUpRuleEngine(new FakeSettings({ ...NUMBERS, ...switches }), history);

const ALL_REASONS: RuleFailureReason[] = [
  'VEHICLE_GAP_TOO_SHORT',
  'VEHICLE_WEEKLY_CAP_REACHED',
  'OWNER_GAP_TOO_SHORT',
  'OWNER_WEEKLY_CAP_REACHED',
  'LITERS_PER_PERSON_CAP_REACHED',
];

describe('FillUpRuleEngine — rule switches', () => {
  it('with every switch on, all five rules are applied', async () => {
    const { checks, disabled } = await engine(ALL_ON).evaluateSubjectWithChecks(
      { kind: 'vehicle', vehicleId, ownerId },
      municipalityId,
      now,
    );
    expect(checks.map((c) => c.reason)).toEqual(ALL_REASONS);
    expect(disabled).toEqual([]);
  });

  it.each([
    ['fillup.rule.vehicle_gap.enabled', 'VEHICLE_GAP_TOO_SHORT'],
    ['fillup.rule.vehicle_weekly.enabled', 'VEHICLE_WEEKLY_CAP_REACHED'],
    ['fillup.rule.owner_gap.enabled', 'OWNER_GAP_TOO_SHORT'],
    ['fillup.rule.owner_weekly.enabled', 'OWNER_WEEKLY_CAP_REACHED'],
    ['fillup.rule.owner_liters.enabled', 'LITERS_PER_PERSON_CAP_REACHED'],
  ] as const)('switching %s off skips that rule completely', async (key, reason) => {
    const { checks, disabled } = await engine({ ...ALL_ON, [key]: 'false' }).evaluateSubjectWithChecks(
      { kind: 'vehicle', vehicleId, ownerId },
      municipalityId,
      now,
    );
    expect(checks.map((c) => c.reason)).not.toContain(reason);
    expect(checks).toHaveLength(4);
    expect(disabled).toEqual([reason]);
  });

  it('a switched-off rule cannot reject: the next rule in order decides', async () => {
    const first = await engine(ALL_ON).evaluate(vehicleId, ownerId, municipalityId, now);
    expect(first).toMatchObject({ allowed: false, reason: 'VEHICLE_GAP_TOO_SHORT' });

    const second = await engine({ ...ALL_ON, 'fillup.rule.vehicle_gap.enabled': 'false' }).evaluate(
      vehicleId,
      ownerId,
      municipalityId,
      now,
    );
    expect(second).toMatchObject({ allowed: false, reason: 'VEHICLE_WEEKLY_CAP_REACHED' });
  });

  it('with every rule off, anything is allowed', async () => {
    const allOff = Object.fromEntries(SWITCH_KEYS.map((k) => [k, 'false']));
    expect(await engine(allOff).evaluate(vehicleId, ownerId, municipalityId, now)).toEqual({ allowed: true });
  });

  it('with no switch rows at all: owner liters is off (the default), the other four are on', async () => {
    const history = new FakeHistory({}, { [ownerId]: [record('veh-2', daysAgo(5), 900)] });
    const { checks, disabled } = await engine({}, history).evaluateSubjectWithChecks(
      { kind: 'vehicle', vehicleId, ownerId },
      municipalityId,
      now,
    );
    expect(disabled).toEqual(['LITERS_PER_PERSON_CAP_REACHED']);
    expect(checks).toHaveLength(4);
    // 900 L in the week would trip the liters cap if it were on.
    expect(await engine({}, history).evaluate(vehicleId, ownerId, municipalityId, now)).toEqual({ allowed: true });
  });

  it('preview and submit give the same verdict for every one of the 32 switch combinations', async () => {
    for (let mask = 0; mask < 32; mask++) {
      const switches = Object.fromEntries(SWITCH_KEYS.map((k, i) => [k, mask & (1 << i) ? 'true' : 'false']));
      const e = engine(switches);
      const submit = await e.evaluate(vehicleId, ownerId, municipalityId, now);
      const { result: preview } = await e.evaluateWithChecks(vehicleId, ownerId, municipalityId, now);
      expect(preview).toEqual(submit);
    }
  });
});

describe('FillUpRuleEngine — institution owners', () => {
  const bankOwner = 'bank-1';
  // Twenty cars of one institution, each filled up yesterday.
  const bankHistory = () => {
    const byVehicle: Record<string, FillUpHistoryRecord[]> = {};
    const owner: FillUpHistoryRecord[] = [];
    for (let i = 1; i <= 20; i++) {
      const r = record(`bank-car-${i}`, daysAgo(1));
      byVehicle[`bank-car-${i}`] = [r];
      owner.push(r);
    }
    return new FakeHistory(byVehicle, { [bankOwner]: owner });
  };

  it('an individual owner with that history is stopped by the owner-level rules', async () => {
    const result = await engine(ALL_ON, bankHistory()).evaluateSubject(
      { kind: 'vehicle', vehicleId: 'bank-car-21', ownerId: bankOwner, ownerKind: 'INDIVIDUAL' },
      municipalityId,
      now,
    );
    expect(result).toMatchObject({ allowed: false, reason: 'OWNER_GAP_TOO_SHORT' });
  });

  it("an institution's vehicle is judged by the vehicle-level rules only, and the result says why", async () => {
    const subject = { kind: 'vehicle', vehicleId: 'bank-car-21', ownerId: bankOwner, ownerKind: 'INSTITUTION' } as const;
    const e = engine(ALL_ON, bankHistory());
    expect(await e.evaluateSubject(subject, municipalityId, now)).toEqual({ allowed: true });

    const { checks, skipped, skippedBecause } = await e.evaluateSubjectWithChecks(subject, municipalityId, now);
    expect(checks.map((c) => c.reason)).toEqual(['VEHICLE_GAP_TOO_SHORT', 'VEHICLE_WEEKLY_CAP_REACHED']);
    expect(skipped).toEqual(['OWNER_GAP_TOO_SHORT', 'OWNER_WEEKLY_CAP_REACHED', 'LITERS_PER_PERSON_CAP_REACHED']);
    expect(skippedBecause).toBe('INSTITUTION_OWNER');
  });

  it('an institution vehicle is still held to the vehicle-level rules', async () => {
    const result = await engine(ALL_ON, bankHistory()).evaluateSubject(
      { kind: 'vehicle', vehicleId: 'bank-car-1', ownerId: bankOwner, ownerKind: 'INSTITUTION' },
      municipalityId,
      now,
    );
    expect(result).toMatchObject({ allowed: false, reason: 'VEHICLE_GAP_TOO_SHORT' });
  });
});
