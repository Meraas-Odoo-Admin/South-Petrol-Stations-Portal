import {
  checkAdministrativeId,
  checkArabicPersonName,
  checkBooklet,
  checkChassis,
  checkLibyanMobile,
  checkLiters,
  checkManufactureYear,
  checkNationalId,
  normalizeLibyanMobile,
  tripoliYear,
} from '@fuel-tracking/shared-types';

// "Now" is fixed so every age edge is deterministic: 12 Oct 2026, Tripoli.
const NOW = new Date('2026-10-12T09:00:00Z');
const code = (c: ReturnType<typeof checkNationalId>) => (c.ok ? 'OK' : c.code);

describe('tripoliYear', () => {
  it('uses the Tripoli calendar, not UTC, around New Year', () => {
    expect(tripoliYear(new Date('2026-12-31T23:30:00Z'))).toBe(2027); // already 01:30 on 1 Jan in Tripoli (UTC+2)
    expect(tripoliYear(new Date('2026-12-31T21:30:00Z'))).toBe(2026);
  });
});

describe('checkNationalId (phase 5A)', () => {
  it('accepts a well-formed male and female number', () => {
    expect(code(checkNationalId('119900123456', { now: NOW }))).toBe('OK');
    expect(code(checkNationalId('219851234567', { now: NOW }))).toBe('OK');
  });

  it('converts Arabic-Indic digits and drops spaces', () => {
    const result = checkNationalId('١١٩٩٠٠١٢٣٤٥٦', { now: NOW });
    expect(result.ok && result.value).toBe('119900123456');
    expect(code(checkNationalId('1199 0012 3456', { now: NOW }))).toBe('OK');
  });

  it('digit 1 must be 1 or 2', () => {
    for (const bad of ['319900123456', '019900123456', '919900123456']) {
      const result = checkNationalId(bad, { now: NOW });
      expect(code(result)).toBe('PREFIX');
      expect(!result.ok && result.message).toBe('الرقم الوطني يجب أن يبدأ بالرقم 1 (ذكر) أو 2 (أنثى).');
    }
  });

  it('digits 2–5 must be a real year: not before 1900', () => {
    const result = checkNationalId('118990123456', { now: NOW });
    expect(code(result)).toBe('BIRTH_YEAR');
    expect(!result.ok && result.message).toBe('سنة الميلاد في الرقم الوطني (1899) غير صحيحة.');
    expect(code(checkNationalId('119000123456', { now: NOW }))).toBe('OK');
  });

  it('a birth year in the future is not a year', () => {
    const result = checkNationalId('120270123456', { now: NOW });
    expect(code(result)).toBe('BIRTH_YEAR');
    expect(!result.ok && result.message).toContain('2027');
  });

  it('is 18 or older: 17 is refused, 18 is accepted (only the year is known)', () => {
    // Tripoli year 2026: born 2009 is 17, born 2008 is 18.
    const under = checkNationalId('120090123456', { now: NOW });
    expect(code(under)).toBe('UNDER_AGE');
    expect(!under.ok && under.message).toBe(
      'صاحب هذا الرقم الوطني عمره أقل من 18 سنة، ولا يمكن تسجيله مالكًا لمركبة.',
    );
    expect(code(checkNationalId('120080123456', { now: NOW }))).toBe('OK');
  });

  it('the age rule follows the Tripoli year, not the machine year', () => {
    // 1 Jan 2027 in Tripoli: born 2009 is accepted by the year rule.
    const newYear = new Date('2026-12-31T22:30:00Z');
    expect(code(checkNationalId('120090123456', { now: newYear }))).toBe('OK');
    expect(code(checkNationalId('120090123456', { now: NOW }))).toBe('UNDER_AGE');
  });

  it('must be exactly 12 digits', () => {
    for (const bad of ['11990012345', '1199001234567', '1']) {
      const result = checkNationalId(bad, { now: NOW });
      expect(code(result)).toBe('LENGTH');
      expect(!result.ok && result.message).toBe('الرقم الوطني يجب أن يتكوّن من 12 رقمًا.');
    }
  });

  it('refuses letters, and an empty value when required', () => {
    expect(code(checkNationalId('11990012345A', { now: NOW }))).toBe('NOT_DIGITS');
    expect(code(checkNationalId('', { now: NOW }))).toBe('REQUIRED');
  });

  it('any final (check) digit is accepted for now', () => {
    for (const d of '0123456789') {
      expect(code(checkNationalId(`11990012345${d}`, { now: NOW }))).toBe('OK');
    }
  });

  it('live mode: a short value is not an error yet, but each rule shows the moment it applies', () => {
    const live = { now: NOW, partial: true };
    expect(code(checkNationalId('', live))).toBe('OK');
    expect(code(checkNationalId('1199', live))).toBe('OK');
    expect(code(checkNationalId('3', live))).toBe('PREFIX');
    expect(code(checkNationalId('11899', live))).toBe('BIRTH_YEAR');
    expect(code(checkNationalId('12009', live))).toBe('UNDER_AGE');
    expect(code(checkNationalId('1199001234567', live))).toBe('LENGTH');
    const incomplete = checkNationalId('11990', live);
    expect(incomplete.ok && incomplete.complete).toBe(false);
  });
});

describe('checkAdministrativeId', () => {
  it('is 12 digits starting with 9', () => {
    expect(checkAdministrativeId('912345678901').ok).toBe(true);
    expect(checkAdministrativeId('112345678901').ok).toBe(false);
    expect(checkAdministrativeId('91234567890').ok).toBe(false);
  });
});

describe('Libyan mobile numbers', () => {
  it('accepts 09[1-6] + 7 digits and normalizes +218', () => {
    expect(normalizeLibyanMobile('0912345678')).toBe('0912345678');
    expect(normalizeLibyanMobile('+218912345678')).toBe('0912345678');
    expect(normalizeLibyanMobile('00218 91 234 5678')).toBe('0912345678');
    expect(normalizeLibyanMobile('٠٩١٢٣٤٥٦٧٨')).toBe('0912345678');
    expect(normalizeLibyanMobile('0961234567')).toBe('0961234567');
  });

  it('refuses other prefixes and wrong lengths', () => {
    for (const bad of ['0971234567', '0901234567', '091234567', '09123456789', '0812345678', 'abc']) {
      expect(normalizeLibyanMobile(bad)).toBeNull();
    }
  });

  it('empty is fine unless required', () => {
    expect(checkLibyanMobile('').ok).toBe(true);
    expect(checkLibyanMobile('', { required: true }).ok).toBe(false);
  });
});

describe('vehicle document fields', () => {
  it('chassis: 17 characters, upper-cased, no I/O/Q', () => {
    const ok = checkChassis('jt2ae82e3p0123456');
    expect(ok.ok && ok.value).toBe('JT2AE82E3P0123456');
    expect(checkChassis('JT2AE82E3P012345').ok).toBe(false);
    expect(checkChassis('JT2AE82E3P01234IO').ok).toBe(false);
  });

  it('chassis: 6–20 characters only with the non-standard tick', () => {
    expect(checkChassis('AB12345', false).ok).toBe(false);
    expect(checkChassis('AB12345', true).ok).toBe(true);
    expect(checkChassis('AB123', true).ok).toBe(false);
    expect(checkChassis('A'.repeat(21), true).ok).toBe(false);
    expect(checkChassis('A'.repeat(20), true).ok).toBe(true);
  });

  it('booklet: 6–12 letters and digits', () => {
    expect(checkBooklet('ab123456').ok).toBe(true);
    expect(checkBooklet('123').ok).toBe(false);
  });

  it('manufacturing year: 1950 to next year', () => {
    expect(checkManufactureYear('1950', NOW).ok).toBe(true);
    expect(checkManufactureYear('1949', NOW).ok).toBe(false);
    expect(checkManufactureYear('2027', NOW).ok).toBe(true);
    expect(checkManufactureYear('2028', NOW).ok).toBe(false);
    expect(checkManufactureYear('٢٠٢٠', NOW).ok).toBe(true);
    expect(checkManufactureYear('20', NOW).ok).toBe(false);
  });

  it('liters: positive with a ceiling', () => {
    expect(checkLiters('40').ok).toBe(true);
    expect(checkLiters('0').ok).toBe(false);
    expect(checkLiters('-3').ok).toBe(false);
    expect(checkLiters('1000').ok).toBe(true);
    expect(checkLiters('1001').ok).toBe(false);
  });
});

describe('names', () => {
  it('a person name must be Arabic letters', () => {
    expect(checkArabicPersonName('محمد علي الفيتوري').ok).toBe(true);
    expect(checkArabicPersonName('Mohamed Ali').ok).toBe(false);
    expect(checkArabicPersonName('محمد 2').ok).toBe(false);
    expect(checkArabicPersonName('ab').ok).toBe(false);
  });
});
