import { randomInt } from 'crypto';

// Letters and digits that cannot be misread when copied by eye or read aloud
// (no 0/O, 1/l/I).
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const ALL = LOWER + UPPER + DIGITS;

const pick = (alphabet: string) => alphabet[randomInt(alphabet.length)];

// A one-time password for a new or reset account: 12 characters in three
// groups ("Hk7m-Zp3x-Qw9a"), at least one lower-case, one upper-case and one
// digit, from a cryptographic random source. The user must change it at
// first login, so it only has to be safe to hand over once.
export function generateTemporaryPassword(): string {
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS)];
  while (chars.length < 12) chars.push(pick(ALL));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  const text = chars.join('');
  return `${text.slice(0, 4)}-${text.slice(4, 8)}-${text.slice(8, 12)}`;
}
