// The ONE plate normalizer, shared by the API and the web app (registration
// pivot, phase 4a). Every place that MATCHES a plate — registry search, the
// registration duplicate check, the fill-up plate lookup, and the
// by-plate allowance counts for unregistered vehicles — compares
// normalizePlate() values, never raw strings. The plate exactly as it was
// typed is always stored separately and never overwritten.
//
// A Libyan plate is a CITY CODE (1–2 digits) plus a SERIAL NUMBER (1–7
// digits). `8-1234567` (city 8) and `81-234567` (city 81) are different
// cars and never normalize to the same value.
//
// CANONICAL FORM: `<city>-<serial>` — city code, a single dash, serial
// number, Western digits, no leading zeros in either part.
//   "8-1234567"    → "8-1234567"
//   "8 1234567"    → "8-1234567"
//   "٨-١٢٣٤٥٦٧"   → "8-1234567"
//   "08-1234567"   → "8-1234567"
//   "8 / 1234567"  → "8-1234567"   (any run of separators is ONE separator)
//
// Phase 5A: a plate may carry an optional trailing letter N (12% of real
// plates, e.g. `5-1234567N`). The N is PART OF THE PLATE'S IDENTITY: `5-123456N`
// and `5-123456` are two different plates and never normalize to the same
// value. `5-1234567 N` and `5-1234567n` are the same plate as `5-1234567N`.
//
// A plate typed with no separator ("81234567") is ambiguous — nothing says
// where the city code ends — so it has NO canonical form: normalizePlate()
// returns null, and callers must refuse it (the API answers PLATE_INVALID;
// the screens use two separate boxes so the separator can't be missing).
//
// Dependency-free and pure on purpose: it ships in both a Node build and
// the browser bundle.

const ARABIC_INDIC_ZERO = 0x0660; // ٠ … ٩  U+0660–U+0669
const EXTENDED_ARABIC_INDIC_ZERO = 0x06f0; // ۰ … ۹  U+06F0–U+06F9

// Space, dash (and its Unicode cousins), slash, backslash, dot, middle dot,
// underscore, tatweel and bidi direction marks. Mirrored in the SQL
// backfill of migration 20261003100100_p4a_vehicle_normalized_plate — keep
// the two in step (test/plate-backfill.e2e-spec.ts compares them).
const SEPARATORS = /[\s\-./\\_·ـ‐-―−‎‏‪-‮⁦-⁩]+/u;

const CITY_CODE_MAX_DIGITS = 2;
const SERIAL_MAX_DIGITS = 7;

// Arabic-Indic (٠-٩) and Extended Arabic-Indic (۰-۹) digits to 0-9, plus
// the full-width forms through NFKC. Everything else is left alone.
export function toWesternDigits(raw: string): string {
  let out = '';
  for (const ch of raw.normalize('NFKC')) {
    const code = ch.codePointAt(0)!;
    if (code >= ARABIC_INDIC_ZERO && code <= ARABIC_INDIC_ZERO + 9) {
      out += String(code - ARABIC_INDIC_ZERO);
    } else if (code >= EXTENDED_ARABIC_INDIC_ZERO && code <= EXTENDED_ARABIC_INDIC_ZERO + 9) {
      out += String(code - EXTENDED_ARABIC_INDIC_ZERO);
    } else {
      out += ch;
    }
  }
  return out;
}

export interface PlateParts {
  city: string;
  serial: string;
  /** The optional trailing N; '' when the plate has none. */
  suffix: '' | 'N';
}

// Splits a typed plate into its parts, or null when it can't be split into a
// city code, a serial number and (optionally) the trailing N.
export function splitPlate(raw: string): PlateParts | null {
  let pieces = toWesternDigits(raw)
    .split(SEPARATORS)
    .filter((piece) => piece !== '');
  let suffix: '' | 'N' = '';
  // "5-1234567-N" / "5 1234567 N": the N typed as its own piece.
  if (pieces.length === 3 && /^[Nn]$/.test(pieces[2]!)) {
    suffix = 'N';
    pieces = pieces.slice(0, 2);
  } else if (pieces.length === 2 && /^[0-9]+[Nn]$/.test(pieces[1]!)) {
    // "5-1234567N": the N glued to the serial.
    suffix = 'N';
    pieces = [pieces[0]!, pieces[1]!.slice(0, -1)];
  }
  if (pieces.length !== 2) return null;
  const [city, serial] = pieces.map((piece) => (/^[0-9]+$/.test(piece) ? piece.replace(/^0+/, '') : null));
  if (!city || !serial) return null;
  if (city.length > CITY_CODE_MAX_DIGITS || serial.length > SERIAL_MAX_DIGITS) return null;
  return { city, serial, suffix };
}

// The canonical form, or null when the plate can't be split (see above).
export function normalizePlate(raw: string): string | null {
  const parts = splitPlate(raw);
  return parts ? `${parts.city}-${parts.serial}${parts.suffix}` : null;
}

// True when both plates are splittable and are the same plate.
export function platesMatch(a: string, b: string): boolean {
  const left = normalizePlate(a);
  return left !== null && left === normalizePlate(b);
}

// A partial plate typed into a SEARCH box ("8-12", "٨ 12", "5-12N"): the same
// digit and separator rules, but no validation and no zero-stripping, so a
// prefix still matches as the user types. A trailing N is kept (upper-cased).
// Returns '' when the text isn't plate-like at all (other letters etc.), so
// callers skip the plate clause.
export function plateSearchTerm(raw: string): string {
  const term = toWesternDigits(raw)
    .trim()
    .replace(new RegExp(SEPARATORS.source, 'gu'), '-')
    .replace(/-+n$/i, 'N')
    .replace(/n$/i, 'N');
  return /^[0-9-]+N?$/.test(term) && /[0-9]/.test(term) ? term : '';
}
