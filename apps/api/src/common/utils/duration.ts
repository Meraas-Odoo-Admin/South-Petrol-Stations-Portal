const UNIT_MS = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
} as const;

type DurationUnit = keyof typeof UNIT_MS;

// Parses simple durations like "15m", "7d", "10s" into milliseconds.
// Deliberately minimal — only the suffixes we actually use in env vars.
export function parseDurationToMs(duration: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(duration.trim());
  if (!match) {
    throw new Error(`Invalid duration: "${duration}". Expected e.g. "15m", "7d".`);
  }
  const amount = Number(match[1]);
  const unit = match[2] as DurationUnit;
  return amount * UNIT_MS[unit];
}
