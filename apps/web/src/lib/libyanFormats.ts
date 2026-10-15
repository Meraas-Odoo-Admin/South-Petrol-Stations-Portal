import { toWesternDigits } from '@fuel-tracking/shared-types';

// Input helpers for identity / vehicle document fields: they shape what a
// person TYPES (digits only, upper case, …) and how a plate is
// DISPLAYED. They hold no validation rules.
//
// Phase 5A: every rule (national ID structure and age, administrative number,
// mobile prefixes, chassis and booklet formats, plate identity, year range)
// lives once in packages/shared-types (validation.ts, plate.ts) and is used by
// the API's DTOs and by these forms alike. The hand-kept regex copies that
// used to sit here are gone; import the checks from '@fuel-tracking/shared-types'.

// Digits and a leading +, capped to what a Libyan mobile can be (+218 + 9).
export function restrictToPhoneNumber(raw: string): string {
  const converted = toWesternDigits(raw);
  const plus = converted.trim().startsWith('+') ? '+' : '';
  return plus + converted.replace(/[^\d]/g, '').slice(0, 14 - plus.length);
}

// Digits only (Arabic-Indic converted), capped at the number's length: 12 for
// a national ID (the default), 10 for an administrative number (Phase 7).
export function restrictToIdentityNumber(raw: string, maxLength = 12): string {
  return toWesternDigits(raw).replace(/\D/g, '').slice(0, maxLength);
}

// A plate as typed: digits and the separator between the parts. Phase 7: no
// letters (the trailing N is gone).
export function restrictToLicensePlate(raw: string): string {
  return toWesternDigits(raw).replace(/[^\d\s-]/g, '');
}

// Letters and digits, upper-cased, up to 20 (the longest allowed with the
// non-standard tick). The live rule check says whether the length is right.
export function restrictToChassisNumber(raw: string): string {
  return toWesternDigits(raw)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 20);
}

// Digits only (Phase 7), 12 at most.
export function restrictToRegistrationBooklet(raw: string): string {
  return toWesternDigits(raw).replace(/\D/g, '').slice(0, 12);
}

export const LICENSE_PLATE_DISPLAY_EXAMPLE = '5 - 1658968';

// Typing back what is displayed ("8 - 2000001") must still match: strip
// whitespace before it goes to a search endpoint.
export function normalizePlateSearchTerm(raw: string): string {
  return raw.replace(/\s+/g, '');
}

// Live "as you type" formatting for a plate search/entry field. Real plates
// have a 1- or 2-digit city code, which cannot be told from the digits alone,
// so until a separator is typed the digits are shown as typed; the person
// types the dash to mark where the code ends.
export function formatPlateAsTyped(raw: string): string {
  const converted = toWesternDigits(raw);
  if (/[-\s]/.test(converted)) {
    return converted.replace(/[^\d\s-]/g, '');
  }
  return converted.replace(/\D/g, '').slice(0, 9);
}

// When the person leaves the field with no separator, assume the common
// 1-digit city code so a search can still find "5-1658968".
export function formatPlateOnBlur(raw: string): string {
  if (/[-\s]/.test(raw)) {
    return formatPlateAsTyped(raw);
  }
  const digits = toWesternDigits(raw).replace(/\D/g, '');
  if (digits.length <= 1) {
    return digits;
  }
  return `${digits.slice(0, 1)} - ${digits.slice(1, 8)}`;
}

// A stored plate shown the way it reads on the vehicle: "5 - 1658968". A plate
// stored with a trailing N before Phase 7 still shows it ("5 - 1658968N"): the
// data is kept, only typing an N is gone. Falls back to the raw text.
export function formatLicensePlate(raw: string): string {
  const match = /^(\d{1,2})[-\s]?(\d{1,7})\s*[-\s]?([nN])?$/.exec(raw.trim());
  if (!match) {
    return raw;
  }
  const [, cityCode, sequence, n] = match;
  return `${cityCode} - ${sequence}${n ? 'N' : ''}`;
}
