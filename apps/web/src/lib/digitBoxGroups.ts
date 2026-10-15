// Pure, framework-independent logic behind components/DigitBoxInput.tsx —
// kept separate from the React component so it can be exercised directly
// (no DOM, no rendering) rather than only indirectly through a mounted
// component. This app has no component-test runner yet (see
// apps/web/package.json's "test" script) — Playwright e2e is the
// established coverage mechanism here, but these pure functions are cheap
// to pin down precisely regardless, since a bug here (wrong split/join
// across groups) would silently corrupt every screen that uses the
// component.

export interface DigitGroup {
  // How many boxes this group renders.
  boxes: number;
  // How many of those boxes must be filled for the group to count as
  // complete — filled left-to-right as the user types, so a group with
  // minFilled < boxes is "at least minFilled, up to boxes" digits
  // (matches e.g. LICENSE_PLATE_REGEX's `\d{1,2}` city-code group: typing
  // a single digit means a 1-digit code, not a zero-padded 2-digit one).
  // Defaults to `boxes` (every box mandatory) when omitted.
  minFilled?: number;
}

// Splits a joined value (e.g. "5-1658968") back into one digit-string per
// group, in declaration order. Any characters equal to `separator` are
// treated purely as group boundaries — digits are consumed into the
// current group until it hits its box limit, then the next separator (or
// end of string) advances to the next group. Tolerates a value that
// doesn't yet have separators typed (mid-typing state) by falling back to
// greedy left-to-right consumption per group's `boxes` capacity.
export function splitToGroups(value: string, groups: DigitGroup[], separator = ''): string[] {
  const segments = separator ? value.split(separator) : [value];
  const result: string[] = [];
  let overflow = '';
  for (let i = 0; i < groups.length; i += 1) {
    const raw = (segments[i] ?? '') + overflow;
    const digits = raw.replace(/\D/g, '');
    result.push(digits.slice(0, groups[i]!.boxes));
    overflow = digits.slice(groups[i]!.boxes);
  }
  return result;
}

// Inverse of splitToGroups — joins each group's digit string with the
// separator, omitting a trailing separator for groups that are still
// empty (so a value being typed left-to-right never has dangling "-"s at
// the end for groups not reached yet).
export function joinGroups(groupValues: string[], separator = ''): string {
  let lastNonEmpty = -1;
  for (let i = 0; i < groupValues.length; i += 1) {
    if (groupValues[i]) lastNonEmpty = i;
  }
  return groupValues.slice(0, lastNonEmpty + 1).join(separator);
}

// A group is complete once it has at least `minFilled` digits (defaulting
// to requiring every box filled).
export function isGroupComplete(groupValue: string, group: DigitGroup): boolean {
  const minFilled = group.minFilled ?? group.boxes;
  return groupValue.length >= minFilled;
}

export function isAllComplete(groupValues: string[], groups: DigitGroup[]): boolean {
  return groups.every((g, i) => isGroupComplete(groupValues[i] ?? '', g));
}

// Total number of focusable boxes across every group — used to build the
// flat ref array the component auto-advances through.
export function totalBoxes(groups: DigitGroup[]): number {
  return groups.reduce((sum, g) => sum + g.boxes, 0);
}

// Shared box shapes — every screen that takes a plate or an owner identity
// number uses these same group definitions (round 7 item 2: one reusable
// component, not per-screen copies of the shape too). They only describe box
// counts; the rules themselves are in packages/shared-types (a plate: a 1–2
// digit city code and a 1–7 digit serial; a national ID: 12 digits; an
// administrative number: 10 digits since Phase 7).
export const PLATE_DIGIT_GROUPS: DigitGroup[] = [
  { boxes: 2, minFilled: 1 },
  { boxes: 7, minFilled: 1 },
];
export const IDENTITY_DIGIT_GROUPS: DigitGroup[] = [{ boxes: 12 }];
export const ADMINISTRATIVE_ID_DIGIT_GROUPS: DigitGroup[] = [{ boxes: 10 }];

export function identityDigitGroups(kind: 'NATIONAL_ID' | 'ADMINISTRATIVE_ID'): DigitGroup[] {
  return kind === 'NATIONAL_ID' ? IDENTITY_DIGIT_GROUPS : ADMINISTRATIVE_ID_DIGIT_GROUPS;
}
