// docs/IMPLEMENTATION_PLAN.md §8: national ID / administrative ID masking
// is UI-only — the API never masks it (see the comment on
// FillUpDriverSummary in @fuel-tracking/shared-types). This is the one
// place that rule is actually implemented, now that driver identity data
// reaches a UI for the first time.
//
// "Full value only to supervisor+" (§8) is operationalized here as
// reports:view_all_stations specifically, per the M4 instructions — a
// station-scoped viewer (station_supervisor without broader access) sees
// only the last 4 digits; anyone with directorate-wide report access sees
// the full value.
const UNMASKED_PERMISSION = 'reports:view_all_stations';

export function maskIdentityNumber(value: string, permissions: string[]): string {
  if (permissions.includes(UNMASKED_PERMISSION)) {
    return value;
  }
  if (value.length <= 4) {
    return value;
  }
  return `${'*'.repeat(value.length - 4)}${value.slice(-4)}`;
}
