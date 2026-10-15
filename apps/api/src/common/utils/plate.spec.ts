import { normalizePlate, platesMatch, plateSearchTerm, splitPlate, toWesternDigits } from '@fuel-tracking/shared-types';

describe('normalizePlate (shared by the API and the web app)', () => {
  it('keeps 8-1234567 (city 8) and 81-234567 (city 81) apart', () => {
    expect(normalizePlate('8-1234567')).toBe('8-1234567');
    expect(normalizePlate('81-234567')).toBe('81-234567');
    expect(platesMatch('8-1234567', '81-234567')).toBe(false);
  });

  it('reads every typing of the same plate as one value', () => {
    for (const typed of ['8 1234567', '8-1234567', '٨-١٢٣٤٥٦٧', '08-1234567', '۸-۱۲۳۴۵۶۷', '８－１２３４５６７']) {
      expect(normalizePlate(typed)).toBe('8-1234567');
    }
  });

  it('treats any separator, and any run of them, as one dash', () => {
    for (const typed of ['8/1234567', '8.1234567', '8 - 1234567', '8--1234567', ' 8 / - 1234567 ', '8_1234567', '8‏-‏1234567']) {
      expect(normalizePlate(typed)).toBe('8-1234567');
    }
  });

  it('drops leading zeros in each part', () => {
    expect(normalizePlate('08-0001234')).toBe('8-1234');
    expect(normalizePlate('٠٨-٠٠١٢٣٤')).toBe('8-1234');
  });

  it('has no canonical form for a plate with no separator', () => {
    expect(normalizePlate('81234567')).toBeNull();
    expect(normalizePlate('٨١٢٣٤٥٦٧')).toBeNull();
    expect(platesMatch('81234567', '81234567')).toBe(false);
  });

  it('rejects anything that is not exactly a city code and a serial number', () => {
    expect(normalizePlate('')).toBeNull();
    expect(normalizePlate(' - ')).toBeNull();
    expect(normalizePlate('8-')).toBeNull();
    expect(normalizePlate('-1234567')).toBeNull();
    expect(normalizePlate('8-12-34')).toBeNull();
    expect(normalizePlate('ab-12')).toBeNull();
    expect(normalizePlate('8-12a4')).toBeNull();
    expect(normalizePlate('0-1234')).toBeNull();
    expect(normalizePlate('8-0')).toBeNull();
  });

  it('enforces the city code (1-2 digits) and serial (1-7 digits) lengths', () => {
    expect(normalizePlate('123-4567')).toBeNull();
    expect(normalizePlate('8-12345678')).toBeNull();
    expect(normalizePlate('88-1234567')).toBe('88-1234567');
    expect(normalizePlate('8-1')).toBe('8-1');
  });

  it('is idempotent', () => {
    const once = normalizePlate('٨ - ١٢٣٤٥٦٧');
    expect(normalizePlate(once!)).toBe(once);
  });

  it('exposes the two parts', () => {
    expect(splitPlate('08 / ٠٠١٢٣')).toEqual({ city: '8', serial: '123' });
    expect(splitPlate('812')).toBeNull();
  });
});

describe('plateSearchTerm', () => {
  it('keeps a typed prefix searchable, with digits and separators unified', () => {
    expect(plateSearchTerm('٨ 12')).toBe('8-12');
    expect(plateSearchTerm('8-')).toBe('8-');
    expect(plateSearchTerm('81234')).toBe('81234');
  });
  it('ignores text that is not plate-like', () => {
    expect(plateSearchTerm('VH-001')).toBe('');
    expect(plateSearchTerm('')).toBe('');
    expect(plateSearchTerm(' - ')).toBe('');
  });
});

describe('toWesternDigits', () => {
  it('converts both Arabic digit blocks and leaves the rest', () => {
    expect(toWesternDigits('٠١٢٣٤٥٦٧٨٩ ۰۱۲۳۴۵۶۷۸۹ a-1')).toBe('0123456789 0123456789 a-1');
  });
});

describe('normalizePlate — digits only, no N (phase 7)', () => {
  it('refuses a plate typed with an N, in every typing', () => {
    for (const typed of ['5-1234567N', '5-1234567n', '5 1234567 N', '5-1234567-N', '٥-١٢٣٤٥٦٧N']) {
      expect(normalizePlate(typed)).toBeNull();
    }
  });

  it('refuses any letter', () => {
    expect(normalizePlate('5-1234567A')).toBeNull();
    expect(normalizePlate('N-1234567')).toBeNull();
  });

  it('a search term is digits and dashes only', () => {
    expect(plateSearchTerm('5-12N')).toBe('');
    expect(plateSearchTerm('5 12')).toBe('5-12');
    expect(plateSearchTerm('5-12')).toBe('5-12');
  });

  it('splits into city and serial', () => {
    expect(splitPlate('15-7')).toEqual({ city: '15', serial: '7' });
    expect(splitPlate('15-7N')).toBeNull();
  });
});
