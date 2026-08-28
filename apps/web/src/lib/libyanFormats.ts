import type { KeyboardEvent } from 'react';

// Real-world Libyan identity/vehicle document formats — mirrors
// apps/api/src/common/validators/libyan-formats.ts. Kept separate (not a
// shared package) because it also carries input-restriction *behavior*
// (masking/uppercasing/key-blocking), which is frontend-only concept; the
// regexes themselves must stay in sync with the backend by hand since
// there's no cross-package validation-rule sharing set up yet.
//
// NOTE: there is still no create/edit form for Driver, Owner, or Vehicle
// anywhere in the frontend (see docs/IMPLEMENTATION_PLAN.md — M2's backend
// CRUD was never given frontend forms). The restrictTo*/blockChassis*
// helpers below are ready to wire into such a form when one is built, but
// aren't attached to any UI yet. formatLicensePlate IS wired in — display
// formatting isn't gated on a create form the way input masking is.

export const NATIONAL_ID_REGEX = /^[12]\d{11}$/;
export const ADMINISTRATIVE_ID_REGEX = /^9\d{11}$/;
export const NATIONAL_OR_ADMINISTRATIVE_ID_REGEX = /^([12]\d{11}|9\d{11})$/;
export const LICENSE_PLATE_REGEX = /^\d{1,2}[-\s]?\d{1,7}$/;
export const CHASSIS_NUMBER_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/;

// Strips everything but digits and hard-caps at 12 — for a controlled
// <input>'s onChange, e.g. onChange={(e) => setValue(restrictToNationalId(e.target.value))}.
export function restrictToIdentityNumber(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 12);
}

// Allows digits plus a single optional hyphen/space separator between city
// code and sequence — doesn't force the separator, just doesn't block it.
export function restrictToLicensePlate(raw: string): string {
  return raw.replace(/[^\d\s-]/g, '');
}

// Auto-uppercases and strips I/O/Q (and any non-alphanumeric), hard-capped
// at 17 — for a controlled <input>'s onChange.
export function restrictToChassisNumber(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-HJ-NPR-Z0-9]/g, '')
    .slice(0, 17);
}

// Physical plates read as "city code - sequence" regardless of how the
// value happens to be stored (the regex allows a dash, a space, or
// nothing at all between the two parts, and existing rows use all three).
// Display-only — the stored value and LICENSE_PLATE_REGEX are unchanged;
// this just re-renders whatever's already valid in the canonical shown
// form. Falls back to the raw string for anything that doesn't match
// (shouldn't happen for a value that passed backend validation, but a
// display helper should never throw on unexpected input).
export const LICENSE_PLATE_DISPLAY_EXAMPLE = '5 - 1658968';

// The display format adds spaces around the dash ("5 - 1658968"), but
// stored plates don't have them ("5-1658968") — typing back exactly what's
// displayed elsewhere in the app must still match. Strips whitespace so
// "8 - 2000001", "8-2000001", and "8 2000001" all normalize the same way
// before being sent to the search endpoint.
export function normalizePlateSearchTerm(raw: string): string {
  return raw.replace(/\s+/g, '');
}

export function formatLicensePlate(raw: string): string {
  const match = /^(\d{1,2})[-\s]?(\d{1,7})$/.exec(raw);
  if (!match) {
    return raw;
  }
  const [, cityCode, sequence] = match;
  return `${cityCode} - ${sequence}`;
}

// For a controlled <input>'s onKeyDown — physically blocks I/O/Q keystrokes
// rather than only stripping them after the fact, per the frontend-specific
// rule ("physically block the keys I, O, and Q from being entered").
export function blockChassisForbiddenKeys(event: KeyboardEvent<HTMLInputElement>): void {
  if (['i', 'I', 'o', 'O', 'q', 'Q'].includes(event.key)) {
    event.preventDefault();
  }
}
