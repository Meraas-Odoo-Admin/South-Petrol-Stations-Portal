// The ONE set of field rules for identity numbers, phone numbers and vehicle
// document fields (registration pivot, phase 5A). The API's DTO validators and
// the web forms both call these functions, so a value the form accepts is
// exactly a value the API accepts — and the Arabic message a person reads next
// to the field is the same text on both sides.
//
// Dependency-free and pure on purpose (it ships in the Node build and the
// browser bundle). Anything that depends on "now" takes it as a parameter so
// every edge is unit-testable.
//
// These checks stop typing mistakes and obvious fakes. Only the civil registry
// can confirm that a national ID number is real.

import { toWesternDigits } from './plate';

export type FieldCheck =
  | { ok: true; value: string; /** false while a partially typed value is still plausible. */ complete: boolean }
  | { ok: false; code: string; message: string };

const ok = (value: string, complete = true): FieldCheck => ({ ok: true, value, complete });
const fail = (code: string, message: string): FieldCheck => ({ ok: false, code, message });

// ── time ─────────────────────────────────────────────────────────────

// The calendar year in Africa/Tripoli right now (the client's rule is "current
// Tripoli year", not the server's or the phone's local one).
export function tripoliYear(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Tripoli', year: 'numeric' }).formatToParts(now);
  return Number(parts.find((p) => p.type === 'year')?.value ?? now.getUTCFullYear());
}

// ── national ID (الرقم الوطني) ───────────────────────────────────────

export const NATIONAL_ID_LENGTH = 12;
export const NATIONAL_ID_MIN_BIRTH_YEAR = 1900;
export const OWNER_MIN_AGE = 18;

export const NATIONAL_ID_HELP =
  'يبدأ بـ 1 (ذكر) أو 2 (أنثى)، ثم سنة الميلاد من 4 أرقام، ثم 7 أرقام — المجموع 12 رقمًا.';

// Digits only: Arabic-Indic digits are converted, whitespace and dashes that
// people type between groups are dropped.
export function cleanDigits(raw: string): string {
  return toWesternDigits(raw).replace(/[\s\-‐-―−]+/gu, '');
}

export interface IdCheckOptions {
  now?: Date;
  /**
   * Live checking while someone is still typing: a value that is too SHORT is
   * not an error yet, but every rule that already applies to the digits typed
   * so far is reported the moment it applies.
   */
  partial?: boolean;
}

// Rules (client-confirmed):
//  - digit 1 is 1 (male) or 2 (female);
//  - digits 2–5 are the birth year: a real year, 1900 or later, not future;
//  - the owner is 18 or older: birth year <= (current Tripoli year − 18) — a
//    person born in (current year − 18) is accepted (only the year is known);
//  - digits 6–11 are the registry sequence — digits only, no further check;
//  - digit 12: ANY digit is accepted. The check digit is not the system's
//    responsibility (client decision, OPEN_ITEMS #62) - none is validated.
export function checkNationalId(raw: string, options: IdCheckOptions = {}): FieldCheck {
  const now = options.now ?? new Date();
  const digits = cleanDigits(raw);

  if (digits === '') {
    return options.partial ? ok('', false) : fail('REQUIRED', 'الرقم الوطني مطلوب.');
  }
  if (!/^[0-9]+$/.test(digits)) {
    return fail('NOT_DIGITS', 'الرقم الوطني يتكوّن من أرقام فقط.');
  }
  if (digits[0] !== '1' && digits[0] !== '2') {
    return fail('PREFIX', 'الرقم الوطني يجب أن يبدأ بالرقم 1 (ذكر) أو 2 (أنثى).');
  }
  if (digits.length >= 5) {
    const year = Number(digits.slice(1, 5));
    const thisYear = tripoliYear(now);
    if (year < NATIONAL_ID_MIN_BIRTH_YEAR || year > thisYear) {
      return fail('BIRTH_YEAR', `سنة الميلاد في الرقم الوطني (${year}) غير صحيحة.`);
    }
    if (year > thisYear - OWNER_MIN_AGE) {
      return fail(
        'UNDER_AGE',
        'صاحب هذا الرقم الوطني عمره أقل من 18 سنة، ولا يمكن تسجيله مالكًا لمركبة.',
      );
    }
  }
  if (digits.length > NATIONAL_ID_LENGTH) {
    return fail('LENGTH', 'الرقم الوطني يجب أن يتكوّن من 12 رقمًا.');
  }
  if (digits.length < NATIONAL_ID_LENGTH) {
    return options.partial ? ok(digits, false) : fail('LENGTH', 'الرقم الوطني يجب أن يتكوّن من 12 رقمًا.');
  }
  return ok(digits);
}

// ── administrative number (الرقم الإداري) ───────────────────────────

export const ADMINISTRATIVE_ID_HELP = 'يبدأ بالرقم 9 ويتكوّن من 12 رقمًا.';

export function checkAdministrativeId(raw: string, options: IdCheckOptions = {}): FieldCheck {
  const digits = cleanDigits(raw);
  if (digits === '') {
    return options.partial ? ok('', false) : fail('REQUIRED', 'الرقم الإداري مطلوب.');
  }
  if (!/^[0-9]+$/.test(digits)) {
    return fail('NOT_DIGITS', 'الرقم الإداري يتكوّن من أرقام فقط.');
  }
  if (digits[0] !== '9') {
    return fail('PREFIX', 'الرقم الإداري يجب أن يبدأ بالرقم 9.');
  }
  if (digits.length > 12) {
    return fail('LENGTH', 'الرقم الإداري يجب أن يتكوّن من 12 رقمًا.');
  }
  if (digits.length < 12) {
    return options.partial ? ok(digits, false) : fail('LENGTH', 'الرقم الإداري يجب أن يتكوّن من 12 رقمًا.');
  }
  return ok(digits);
}

export type OwnerIdentityKind = 'NATIONAL_ID' | 'ADMINISTRATIVE_ID';

export function checkOwnerIdentity(kind: OwnerIdentityKind, raw: string, options: IdCheckOptions = {}): FieldCheck {
  return kind === 'NATIONAL_ID' ? checkNationalId(raw, options) : checkAdministrativeId(raw, options);
}

// ── Libyan mobile number ─────────────────────────────────────────────

export const LIBYAN_MOBILE_HELP = 'رقم هاتف ليبي من 10 أرقام يبدأ بـ 091 إلى 096، ويُقبل أيضًا بصيغة +218.';
const LIBYAN_MOBILE_MESSAGE = 'رقم الهاتف غير صحيح: يجب أن يكون رقمًا ليبيًا من 10 أرقام يبدأ بـ 091 إلى 096 (أو +218 ثم 9 أرقام).';

// 09[1-6] + 7 digits, accepting +218 / 00218 / 218 in place of the leading 0.
// Returns the canonical local form (0912345678).
export function normalizeLibyanMobile(raw: string): string | null {
  let digits = toWesternDigits(raw).replace(/[\s\-().]+/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.startsWith('00218')) digits = digits.slice(5);
  else if (digits.startsWith('218')) digits = digits.slice(3);
  else if (digits.startsWith('0')) digits = digits.slice(1);
  return /^9[1-6][0-9]{7}$/.test(digits) ? `0${digits}` : null;
}

export function checkLibyanMobile(raw: string, options: { required?: boolean } = {}): FieldCheck {
  if (raw.trim() === '') {
    return options.required ? fail('REQUIRED', 'رقم الهاتف مطلوب.') : ok('', true);
  }
  const normalized = normalizeLibyanMobile(raw);
  return normalized ? ok(normalized) : fail('FORMAT', LIBYAN_MOBILE_MESSAGE);
}

// ── names ────────────────────────────────────────────────────────────

const ARABIC_NAME = /^[؀-ۿݐ-ݿ][؀-ۿݐ-ݿ\s.'’\-ـ]*$/;

// A person's name where an Arabic name is expected (an owner, a responsible
// driver). Arabic letters, spaces and a few punctuation marks only.
export function checkArabicPersonName(raw: string, label = 'الاسم'): FieldCheck {
  const value = raw.trim().replace(/\s+/g, ' ');
  if (value === '') return fail('REQUIRED', `${label} مطلوب.`);
  if (value.length < 3) return fail('TOO_SHORT', `${label} قصير جدًا — اكتب الاسم الكامل.`);
  if (value.length > 100) return fail('TOO_LONG', `${label} طويل جدًا (الحد الأقصى 100 حرف).`);
  if (!ARABIC_NAME.test(value)) {
    return fail('NOT_ARABIC', `${label} يُكتب بحروف عربية فقط، بلا أرقام أو رموز.`);
  }
  return ok(value);
}

// ── vehicle document fields ──────────────────────────────────────────

export const CHASSIS_STANDARD_LENGTH = 17;
export const CHASSIS_NONSTANDARD_MIN = 6;
export const CHASSIS_NONSTANDARD_MAX = 20;

export function normalizeChassis(raw: string): string {
  return toWesternDigits(raw).replace(/\s+/g, '').toUpperCase();
}

// 17 characters is the norm (ISO 3779: letters and digits, never I, O or Q).
// 6–20 characters only when the employee ticks «رقم هيكل غير قياسي».
export function checkChassis(raw: string, nonStandard = false): FieldCheck {
  const value = normalizeChassis(raw);
  if (value === '') return fail('REQUIRED', 'رقم الهيكل مطلوب.');
  if (!/^[A-Z0-9]+$/.test(value)) {
    return fail('CHARS', 'رقم الهيكل يتكوّن من أحرف إنجليزية وأرقام فقط.');
  }
  if (nonStandard) {
    if (value.length < CHASSIS_NONSTANDARD_MIN || value.length > CHASSIS_NONSTANDARD_MAX) {
      return fail('LENGTH', 'رقم الهيكل غير القياسي يتكوّن من 6 إلى 20 خانة.');
    }
    return ok(value);
  }
  if (value.length !== CHASSIS_STANDARD_LENGTH) {
    return fail(
      'LENGTH',
      'رقم الهيكل القياسي يتكوّن من 17 خانة. إن كان رقم هيكل المركبة في الدفتر بطول آخر، فعِّل «رقم هيكل غير قياسي».',
    );
  }
  if (/[IOQ]/.test(value)) {
    return fail('CHARS', 'رقم الهيكل القياسي لا يحتوي على الأحرف I أو O أو Q — راجع الدفتر.');
  }
  return ok(value);
}

export function normalizeBooklet(raw: string): string {
  return toWesternDigits(raw).replace(/\s+/g, '').toUpperCase();
}

export function checkBooklet(raw: string): FieldCheck {
  const value = normalizeBooklet(raw);
  if (value === '') return fail('REQUIRED', 'رقم الدفتر مطلوب.');
  if (!/^[A-Z0-9]{6,12}$/.test(value)) {
    return fail('FORMAT', 'رقم الدفتر يتكوّن من 6 إلى 12 خانة من الأحرف الإنجليزية والأرقام.');
  }
  return ok(value);
}

export const MANUFACTURE_YEAR_MIN = 1950;

export function checkManufactureYear(raw: string | number, now: Date = new Date()): FieldCheck {
  const text = toWesternDigits(String(raw)).trim();
  if (text === '') return fail('REQUIRED', 'سنة الصنع مطلوبة.');
  const max = tripoliYear(now) + 1;
  if (!/^[0-9]{4}$/.test(text) || Number(text) < MANUFACTURE_YEAR_MIN || Number(text) > max) {
    return fail('RANGE', `سنة الصنع يجب أن تكون من 4 أرقام بين ${MANUFACTURE_YEAR_MIN} و${max}.`);
  }
  return ok(text);
}

// Make and model are free text, typed exactly as written in the booklet.
export function checkMakeOrModel(raw: string, label: 'الصانع' | 'الطراز'): FieldCheck {
  const value = raw.trim().replace(/\s+/g, ' ');
  if (value === '') return fail('REQUIRED', `${label} مطلوب — اكتبه كما هو في الدفتر.`);
  if (value.length > 60) return fail('TOO_LONG', `${label} طويل جدًا (الحد الأقصى 60 حرفًا).`);
  return ok(value);
}

// The colours the registration screen offers; anything else is «أخرى» + text.
export const VEHICLE_COLORS = [
  'ابيض', 'رصاصي', 'اسود', 'ازرق', 'اخضر', 'ذهبي', 'احمر', 'سماوي',
  'رمادي', 'بني', 'سحابي', 'عنابي', 'بيج', 'فضي', 'اصفر', 'برتقالي',
] as const;
export const VEHICLE_COLOR_OTHER = 'أخرى';

export function checkColor(raw: string): FieldCheck {
  const value = raw.trim().replace(/\s+/g, ' ');
  if (value === '') return fail('REQUIRED', 'لون المركبة مطلوب.');
  if (value.length > 30) return fail('TOO_LONG', 'اللون طويل جدًا (الحد الأقصى 30 حرفًا).');
  return ok(value);
}

export const VEHICLE_FUEL_TYPES = ['PETROL', 'DIESEL'] as const;
export type VehicleFuelTypeKey = (typeof VEHICLE_FUEL_TYPES)[number];
export const VEHICLE_FUEL_TYPE_LABELS_AR: Record<VehicleFuelTypeKey, string> = {
  PETROL: 'بنزين',
  DIESEL: 'ديزل',
};

// ── amounts ──────────────────────────────────────────────────────────

// A fill-up quantity: positive, with a ceiling no real vehicle tank reaches.
export const MAX_FILLUP_LITERS = 1000;

export function checkLiters(raw: string | number): FieldCheck {
  const text = toWesternDigits(String(raw)).trim().replace('،', '.').replace(',', '.');
  if (text === '') return fail('REQUIRED', 'الكمية مطلوبة.');
  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0) return fail('POSITIVE', 'الكمية يجب أن تكون رقمًا أكبر من صفر.');
  if (value > MAX_FILLUP_LITERS) {
    return fail('MAX', `الكمية كبيرة جدًا — الحد الأقصى ${MAX_FILLUP_LITERS} لترًا في التعبئة الواحدة.`);
  }
  return ok(String(value));
}

// ── vehicle fuel type vs the fuel poured ─────────────────────────────

export type PumpFuelType = 'PETROL_95' | 'DIESEL' | 'KEROSENE';

// True when the fuel poured is not the fuel the vehicle runs on. A warning at
// the pump - never a block - recorded on the fill-up. A vehicle with no fuel
// type recorded (registered before phase 5A) never mismatches.
export function fuelTypeMismatch(vehicleFuel: VehicleFuelTypeKey | null | undefined, pumped: PumpFuelType): boolean {
  if (!vehicleFuel) return false;
  if (vehicleFuel === 'PETROL') return pumped !== 'PETROL_95';
  return pumped !== 'DIESEL';
}
