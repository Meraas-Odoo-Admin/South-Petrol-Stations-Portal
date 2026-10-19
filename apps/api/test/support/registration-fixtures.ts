// Phase 5A: owners and vehicles are checked with the shared field rules
// (packages/shared-types/validation.ts), so e2e fixtures must be real-format
// values. Random, never derived from a clock: there are no DELETE endpoints,
// so old fixture rows never go away and a periodic value would collide.

export const randomDigits = (n: number): string =>
  Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');

const CHASSIS_ALPHABET = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789'; // no I, O, Q

export function randomChassis(length = 17): string {
  return Array.from({ length }, () => CHASSIS_ALPHABET[Math.floor(Math.random() * CHASSIS_ALPHABET.length)]).join('');
}

// Phase 7: a booklet number is digits only.
export function randomBooklet(length = 8): string {
  return randomDigits(length);
}

// The 11 digits that follow a national ID's first digit: a birth year in the
// 1900s (so the person is an adult and the year is real) and a random
// registry part - `1${nationalIdTail()}` is a valid, unique national ID.
export function nationalIdTail(): string {
  return `19${randomDigits(9)}`;
}

export function nationalId(prefix: '1' | '2' = '1'): string {
  return `${prefix}${nationalIdTail()}`;
}

// A complete, valid POST /vehicles body (everything phase 5A requires) with
// the caller's fields laid over it.
export function vehicleBody<T extends Record<string, unknown>>(overrides: T) {
  return {
    chassisNumber: randomChassis(),
    registrationBooklet: randomBooklet(),
    make: 'Toyota',
    model: 'Hilux',
    color: 'ابيض',
    manufactureYear: 2020,
    fuelType: 'PETROL',
    // Required (after review, 19 Oct 2026); made by test/global-setup.ts.
    vehicleTypeId: process.env.E2E_VEHICLE_TYPE_ID,
    ...overrides,
  };
}
