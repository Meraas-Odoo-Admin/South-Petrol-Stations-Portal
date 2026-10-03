import { randomInt } from 'crypto';

// Registration pivot, phase 3 (plan §6): card numbers are random, not
// sequential — nobody can guess a neighbour's number and fake a QR for it —
// and use an uppercase alphabet with no look-alike characters, since staff
// and auditors read them off the card: no 0/O, no 1/I/L.
export const CARD_NUMBER_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const CARD_NUMBER_BODY_LENGTH = 8;

// Municipality.code — 2 to 5 uppercase letters, e.g. SBH.
export const MUNICIPALITY_CODE_REGEX = /^[A-Z]{2,5}$/;

export const CARD_NUMBER_REGEX = new RegExp(
  `^[A-Z]{2,5}-[${CARD_NUMBER_ALPHABET}]{${CARD_NUMBER_BODY_LENGTH}}$`,
);

// `pick` is injectable so tests can make it deterministic; production uses
// crypto.randomInt (a CSPRNG), never Math.random.
export function generateCardNumber(
  municipalityCode: string,
  pick: (max: number) => number = randomInt,
): string {
  if (!MUNICIPALITY_CODE_REGEX.test(municipalityCode)) {
    throw new Error(`Invalid municipality code for a card number prefix: ${municipalityCode}`);
  }
  let body = '';
  for (let i = 0; i < CARD_NUMBER_BODY_LENGTH; i++) {
    body += CARD_NUMBER_ALPHABET[pick(CARD_NUMBER_ALPHABET.length)];
  }
  return `${municipalityCode}-${body}`;
}

// What a scanner or a typed search might hand us: trimmed, uppercased.
// Anything that doesn't then look like a card number is simply not one.
export function normalizeScannedCardNumber(raw: string): string | null {
  const value = raw.trim().toUpperCase();
  return CARD_NUMBER_REGEX.test(value) ? value : null;
}
