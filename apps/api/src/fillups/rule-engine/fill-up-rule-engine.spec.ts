import { FillUpRuleEngine } from './fill-up-rule-engine';
import type { FillUpHistoryReader, FillUpHistoryRecord, SettingsReader } from './types';

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
    private readonly byDriver: Record<string, FillUpHistoryRecord[]> = {},
  ) {}

  async getRecentForVehicle(vehicleId: string): Promise<FillUpHistoryRecord[]> {
    return this.byVehicle[vehicleId] ?? [];
  }

  async getRecentForDriver(driverId: string): Promise<FillUpHistoryRecord[]> {
    return this.byDriver[driverId] ?? [];
  }
}

// Placeholder defaults (fillup.max_per_week_per_driver/min_gap_days_per_driver
// are literally seeded as placeholders — see seed.ts) mirrored here so the
// tests exercise the same numbers the real engine will actually run with.
const DEFAULT_SETTINGS = {
  'fillup.max_per_week': '3',
  'fillup.min_gap_days': '2',
  'fillup.max_per_week_per_driver': '3',
  'fillup.min_gap_days_per_driver': '2',
  'fillup.week_window_mode': 'rolling',
  'fillup.week_start_day': '6',
};

function daysAgo(reference: Date, days: number): Date {
  return new Date(reference.getTime() - days * DAY_MS);
}

describe('FillUpRuleEngine', () => {
  const now = new Date('2026-08-23T12:00:00.000Z');
  const vehicleId = 'veh-1';
  const driverId = 'drv-1';

  it('allows a fill-up with no prior history at all', async () => {
    const engine = new FillUpRuleEngine(new FakeSettings(DEFAULT_SETTINGS), new FakeHistory());
    const result = await engine.evaluate(vehicleId, driverId, now);
    expect(result).toEqual({ allowed: true });
  });

  it('rejects with VEHICLE_GAP_TOO_SHORT when the vehicle\'s last fill-up is inside min_gap_days', async () => {
    const history = new FakeHistory({
      [vehicleId]: [{ occurredAt: daysAgo(now, 1) }], // 1 day < min_gap_days (2)
    });
    const engine = new FillUpRuleEngine(new FakeSettings(DEFAULT_SETTINGS), history);
    const result = await engine.evaluate(vehicleId, driverId, now);
    expect(result).toEqual({ allowed: false, reason: 'VEHICLE_GAP_TOO_SHORT' });
  });

  it('rejects with VEHICLE_WEEKLY_CAP_REACHED when the vehicle already has max_per_week fill-ups in the rolling window, even though the gap rule is satisfied', async () => {
    const history = new FakeHistory({
      [vehicleId]: [
        { occurredAt: daysAgo(now, 2) }, // satisfies the 2-day gap
        { occurredAt: daysAgo(now, 4) },
        { occurredAt: daysAgo(now, 6) },
      ],
    });
    const engine = new FillUpRuleEngine(new FakeSettings(DEFAULT_SETTINGS), history);
    const result = await engine.evaluate(vehicleId, driverId, now);
    expect(result).toEqual({ allowed: false, reason: 'VEHICLE_WEEKLY_CAP_REACHED' });
  });

  it('rejects with DRIVER_GAP_TOO_SHORT when the vehicle checks pass but the driver\'s last fill-up (on any vehicle) is inside min_gap_days_per_driver', async () => {
    const history = new FakeHistory(
      {}, // vehicle has no history at all
      { [driverId]: [{ occurredAt: daysAgo(now, 1) }] }, // on some other vehicle
    );
    const engine = new FillUpRuleEngine(new FakeSettings(DEFAULT_SETTINGS), history);
    const result = await engine.evaluate(vehicleId, driverId, now);
    expect(result).toEqual({ allowed: false, reason: 'DRIVER_GAP_TOO_SHORT' });
  });

  it('rejects with DRIVER_WEEKLY_CAP_REACHED when the driver already has max_per_week_per_driver fill-ups across their vehicles this week, even though the vehicle checks pass', async () => {
    const history = new FakeHistory(
      {},
      {
        [driverId]: [
          { occurredAt: daysAgo(now, 2) }, // satisfies the driver gap rule
          { occurredAt: daysAgo(now, 4) },
          { occurredAt: daysAgo(now, 6) },
        ],
      },
    );
    const engine = new FillUpRuleEngine(new FakeSettings(DEFAULT_SETTINGS), history);
    const result = await engine.evaluate(vehicleId, driverId, now);
    expect(result).toEqual({ allowed: false, reason: 'DRIVER_WEEKLY_CAP_REACHED' });
  });

  it('returns the VEHICLE reason when both vehicle and driver checks would independently fail, per the stated check order (vehicle before driver)', async () => {
    const history = new FakeHistory(
      { [vehicleId]: [{ occurredAt: daysAgo(now, 1) }] }, // vehicle gap fails
      { [driverId]: [{ occurredAt: daysAgo(now, 1) }] }, // driver gap would also fail
    );
    const engine = new FillUpRuleEngine(new FakeSettings(DEFAULT_SETTINGS), history);
    const result = await engine.evaluate(vehicleId, driverId, now);
    expect(result).toEqual({ allowed: false, reason: 'VEHICLE_GAP_TOO_SHORT' });
  });

  it('allows a fill-up when both gap rules are satisfied and both weekly counts are under their caps', async () => {
    const history = new FakeHistory(
      { [vehicleId]: [{ occurredAt: daysAgo(now, 3) }] },
      { [driverId]: [{ occurredAt: daysAgo(now, 3) }] },
    );
    const engine = new FillUpRuleEngine(new FakeSettings(DEFAULT_SETTINGS), history);
    const result = await engine.evaluate(vehicleId, driverId, now);
    expect(result).toEqual({ allowed: true });
  });
});
