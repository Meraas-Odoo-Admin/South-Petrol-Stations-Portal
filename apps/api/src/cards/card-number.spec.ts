import {
  CARD_NUMBER_ALPHABET,
  CARD_NUMBER_REGEX,
  generateCardNumber,
  normalizeScannedCardNumber,
} from './card-number';

describe('card numbers', () => {
  it('is <municipality code>-<8 characters>, e.g. SBH-7K2M9Q4X', () => {
    const cardNumber = generateCardNumber('SBH');
    expect(cardNumber).toMatch(/^SBH-[A-Z0-9]{8}$/);
    expect(cardNumber).toMatch(CARD_NUMBER_REGEX);
  });

  it('never contains look-alike characters (0/O, 1/I/L)', () => {
    for (const c of ['0', 'O', '1', 'I', 'L']) {
      expect(CARD_NUMBER_ALPHABET).not.toContain(c);
    }
    for (let i = 0; i < 2000; i++) {
      expect(generateCardNumber('SBH').slice(4)).not.toMatch(/[01OIL]/);
    }
  });

  it('draws every character from the random source, so the body is not sequential or guessable', () => {
    const draws: number[] = [];
    const cardNumber = generateCardNumber('SBH', (max) => {
      draws.push(max);
      return draws.length - 1; // 0,1,2,... -> first 8 alphabet characters
    });
    expect(draws).toEqual(Array(8).fill(CARD_NUMBER_ALPHABET.length));
    expect(cardNumber).toBe(`SBH-${CARD_NUMBER_ALPHABET.slice(0, 8)}`);
  });

  it('produces no duplicates across a large sample (31^8 ≈ 8.5e11 possible bodies)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20000; i++) {
      seen.add(generateCardNumber('SBH'));
    }
    expect(seen.size).toBe(20000);
  });

  it('refuses a malformed municipality code rather than printing a bad prefix', () => {
    expect(() => generateCardNumber('sbh')).toThrow();
    expect(() => generateCardNumber('S')).toThrow();
    expect(() => generateCardNumber('SB-H')).toThrow();
  });

  describe('normalizeScannedCardNumber', () => {
    it('accepts a card number in any case, with stray whitespace', () => {
      expect(normalizeScannedCardNumber('  sbh-7k2m9q4x \n')).toBe('SBH-7K2M9Q4X');
    });

    it('rejects anything that is not a card number — including the old internalCode QR codes', () => {
      expect(normalizeScannedCardNumber('V-000123')).toBeNull();
      expect(normalizeScannedCardNumber('SBH-7K2M9Q40')).toBeNull(); // 0 isn't in the alphabet
      expect(normalizeScannedCardNumber('https://example.com/SBH-7K2M9Q4X')).toBeNull();
      expect(normalizeScannedCardNumber('')).toBeNull();
    });
  });
});
