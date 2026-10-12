import { normalizeLibyanMobile } from '@fuel-tracking/shared-types';

// For a class-transformer @Transform on a phone field: a valid Libyan mobile
// number is stored in its one canonical local form (09XXXXXXXX), whatever the
// person typed (+218…, spaces, Arabic-Indic digits). Anything else is passed
// through so the validator reports it.
export function normalizePhoneValue({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (trimmed === '') return '';
  return normalizeLibyanMobile(trimmed) ?? trimmed;
}
