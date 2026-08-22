import { parseDurationToMs } from './duration';

describe('parseDurationToMs', () => {
  it('parses seconds, minutes, hours, and days', () => {
    expect(parseDurationToMs('10s')).toBe(10_000);
    expect(parseDurationToMs('15m')).toBe(900_000);
    expect(parseDurationToMs('2h')).toBe(7_200_000);
    expect(parseDurationToMs('7d')).toBe(604_800_000);
  });

  it('rejects unsupported formats', () => {
    expect(() => parseDurationToMs('7')).toThrow();
    expect(() => parseDurationToMs('7w')).toThrow();
    expect(() => parseDurationToMs('abc')).toThrow();
  });
});
