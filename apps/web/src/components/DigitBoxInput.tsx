import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { toWesternDigits } from '@fuel-tracking/shared-types';
import { isAllComplete, joinGroups, splitToGroups, totalBoxes, type DigitGroup } from '../lib/digitBoxGroups';

// Round 7 item 2: ONE reusable component for every "boxed digit entry,
// auto-advance, custom keypad instead of the OS keyboard" screen — plate
// entry (2-digit city code, only the rightmost mandatory, dash, 7-digit
// sequence) and owner national/administrative ID entry (12 digits) are the
// same interaction with different box counts, not two components. This
// only handles the box UI/typing mechanics; the actual format rules
// (LICENSE_PLATE_REGEX, NATIONAL_OR_ADMINISTRATIVE_ID_REGEX, etc., all in
// lib/libyanFormats.ts) are unchanged and un-duplicated — the caller
// decides what `groups`/`separator` shape matches which format and still
// runs the real regex on the resulting value before submitting anything.
export interface DigitBoxInputProps {
  groups: DigitGroup[];
  value: string;
  onChange: (value: string) => void;
  separator?: string;
  // Renders an on-screen numeric keypad below the boxes (screenshots show
  // this replacing the OS keyboard entirely) — the boxes stay real
  // <input>s either way (still keyboard-typeable, e.g. for desktop/testing),
  // this just adds the tap targets the mobile designs call for.
  showKeypad?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
  className?: string;
  'data-testid'?: string;
  // Round 11 item 4: fires once focus leaves every box in this component
  // (a real blur, not just moving between two of its own boxes) WHILE the
  // group structure is at least minimally valid (isAllComplete). A group
  // with `minFilled < boxes` (the plate's sequence group — 1 to 7 digits
  // are all valid) is "minimally complete" the instant its first digit
  // lands, long before the user is necessarily done typing a longer
  // number — a caller that needs to know "the user has actually finished,
  // not just typed enough to be technically valid so far" (e.g. before
  // firing a lookup against a still-partial value) should gate on this
  // rather than on value/onChange alone, which fires on every keystroke.
  onFocusLeave?: () => void;
}

export function DigitBoxInput({
  groups,
  value,
  onChange,
  separator = '',
  showKeypad = false,
  autoFocus = false,
  disabled = false,
  className,
  'data-testid': testId,
  onFocusLeave,
}: DigitBoxInputProps) {
  const total = totalBoxes(groups);
  const groupValues = splitToGroups(value, groups, separator);
  const boxRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  // Fires onFocusLeave on a genuine transition from "some box focused" to
  // "no box focused" — not on mount (prevFocused starts at the sentinel
  // 'never', not null) and not on the transient null a blur/focus pair
  // between two of this component's OWN boxes could in principle produce,
  // since effects run once per committed render with the final settled
  // focusedIndex, not on every intermediate event.
  const prevFocusedIndexRef = useRef<number | null | 'never'>('never');
  useEffect(() => {
    const wasFocused = prevFocusedIndexRef.current !== null && prevFocusedIndexRef.current !== 'never';
    if (wasFocused && focusedIndex === null) {
      onFocusLeave?.();
    }
    prevFocusedIndexRef.current = focusedIndex;
  }, [focusedIndex]);

  // Round 10 bug fix, round 11 REVISED (round 10's version right-aligned a
  // right-anchored partial group's digit(s) on every keystroke — the
  // moment ANY digit landed, the client's regression report: typing "8"
  // correctly moved to the dash-adjacent box, but the group was then
  // treated as already finished, so a second digit typed immediately
  // after went straight into the NEXT group instead of filling this
  // group's remaining box. Client's own framing of the fix (verbatim):
  // "fill the group left-to-right as digits are typed while it still has
  // room ... and only right-align a single leftover digit toward the
  // separator when the group is finalized — focus leaving the group, or
  // the rest of the plate completing — rather than repositioning on every
  // keystroke." Round 11 implements exactly that: right-alignment now
  // additionally depends on whether the group is currently ACTIVE (focus
  // is somewhere inside its own box range) — see isGroupActive below. A
  // group where `minFilled < boxes` (the plate's city-code group — 1 or 2
  // digits, dash-adjacent box is the mandatory one) has a genuine
  // "optional far side," but only ever on the side AWAY from a separator
  // that follows it — a group with no group after it has nothing on its
  // right to be "adjacent to," so it keeps normal left-to-right filling
  // unconditionally (its own left edge already touches whatever separator
  // precedes it, if any, the moment typing starts there). This matters
  // because PLATE_DIGIT_GROUPS has TWO partial groups, not one: group 0
  // (city code, 1-2 digits) sits BEFORE the dash — right-align it once
  // finalized. Group 1 (sequence number, 1-7 digits) sits AFTER the dash —
  // its mandatory/first-typed digit is already adjacent to the dash on its
  // OWN left side under plain left-to-right filling, so right-aligning it
  // too would push a single typed digit to the far end of 7 boxes, away
  // from the dash — backwards, never right-anchored regardless of active
  // state. A group where every box is eventually mandatory
  // (`minFilled === boxes`, e.g. the identity-number group) has no
  // optional side at all — mid-typing it's just "not finished yet," so it
  // also keeps normal left-to-right filling throughout, unaffected by any
  // of this.
  function isRightAnchoredPartialGroup(group: DigitGroup, groupIndex: number): boolean {
    const isPartial = (group.minFilled ?? group.boxes) < group.boxes;
    const hasSeparatorToItsRight = groupIndex < groups.length - 1;
    return isPartial && hasSeparatorToItsRight;
  }

  // [start, end) flat-box range for a group, addressed by its own index
  // (not a flat box index) — used to test whether the CURRENTLY FOCUSED
  // box falls inside a given group, which is what "is this group still
  // being actively typed into" means here.
  function groupRange(groupIndex: number): { start: number; end: number } {
    let start = 0;
    for (let g = 0; g < groupIndex; g += 1) start += groups[g]!.boxes;
    return { start, end: start + groups[groupIndex]!.boxes };
  }

  // A group is "active" while focus sits on one of its own boxes — i.e.
  // the user is still in the middle of typing into it, hasn't tabbed/
  // clicked/arrowed away, and hasn't blurred the whole component (onBlur
  // below resets focusedIndex to null, which is "active" for no group at
  // all — the "rest of the plate completing" finalize trigger, alongside
  // "focus leaving the group" itself).
  function isGroupActive(groupIndex: number): boolean {
    if (focusedIndex === null) return false;
    const { start, end } = groupRange(groupIndex);
    return focusedIndex >= start && focusedIndex < end;
  }

  // How many box-positions a right-anchored partial group's digits are
  // pushed toward its separator boundary — 0 (no shift, normal left
  // alignment) for every other group, for a group that's already fully
  // typed (nothing to shift), AND — the round 11 fix — for a
  // right-anchored partial group that's still ACTIVE, so a second digit
  // typed immediately after the first lands in the group's own next box
  // rather than the offset having already moved that box's contents out
  // from under it.
  function groupOffset(group: DigitGroup, groupIndex: number, groupValueLength: number): number {
    if (!isRightAnchoredPartialGroup(group, groupIndex)) return 0;
    if (groupValueLength >= group.boxes) return 0;
    if (isGroupActive(groupIndex)) return 0;
    return group.boxes - groupValueLength;
  }

  // A TRUE flat array — length always === total boxes, index N always
  // corresponds to rendered box N. For a partial group with fewer digits
  // typed than it has boxes, the typed digits are right-aligned within
  // the group's box range (empty box(es) on the side away from the
  // separator) rather than left-aligned — this is the actual fix: typing
  // a single city-code digit now renders in the box touching the dash,
  // not the far box. A non-partial group (or a partial group that's now
  // fully typed) has offset 0, i.e. ordinary left-to-right filling,
  // unchanged from before.
  function flatDigits(): string[] {
    const flat: string[] = [];
    groups.forEach((group, groupIndex) => {
      const groupValue = groupValues[groupIndex] ?? '';
      const offset = groupOffset(group, groupIndex, groupValue.length);
      for (let i = 0; i < group.boxes; i += 1) {
        const stringIndex = i - offset;
        flat.push(stringIndex >= 0 && stringIndex < groupValue.length ? groupValue[stringIndex]! : '');
      }
    });
    return flat;
  }

  // Flat-index bounds [start, end) of the group flatIndex falls inside —
  // used to decide, after a digit lands, whether auto-advance should skip
  // straight past a partial group's remaining optional box(es) rather
  // than landing on the box that now visually holds the digit just typed
  // (which would leave focus sitting on an already-full box, unable to
  // accept another keystroke without the user backing up first).
  function groupBoundsFor(flatIndex: number): { groupIndex: number; start: number; end: number } {
    let cursor = 0;
    for (let g = 0; g < groups.length; g += 1) {
      const end = cursor + groups[g]!.boxes;
      if (flatIndex < end) return { groupIndex: g, start: cursor, end };
      cursor = end;
    }
    return { groupIndex: groups.length - 1, start: cursor - groups[groups.length - 1]!.boxes, end: cursor };
  }

  function setDigitAt(flatIndex: number, digit: string) {
    const digits = flatDigits(); // always length === total, so digits[flatIndex] IS box flatIndex
    digits[flatIndex] = digit;
    // Rebuild per-group strings from the flat digit array, capped at each
    // group's box count, then join and emit. Filtering out '' rather than
    // requiring a contiguous run keeps this simple and matches the only
    // shapes typing/backspace/paste actually produce (a group's filled
    // digits are always contiguous from one end).
    const rebuilt: string[] = [];
    let cursor = 0;
    for (const g of groups) {
      const slice = digits.slice(cursor, cursor + g.boxes).filter((d) => d !== '');
      rebuilt.push(slice.join(''));
      cursor += g.boxes;
    }
    onChange(joinGroups(rebuilt, separator));
  }

  function focusBox(flatIndex: number) {
    const clamped = Math.max(0, Math.min(total - 1, flatIndex));
    boxRefs.current[clamped]?.focus();
  }

  // Shared by real-keyboard typing (handleBoxChange) and the on-screen
  // keypad (handleKeypadDigit) — both need identical "where does focus go
  // after this digit" logic, not two copies of it. Round 10 had this skip
  // PAST a right-anchored partial group's remaining box once it reached
  // `minFilled`, straight to the next group — which is exactly what round
  // 11 came back to report as a regression: a second digit typed right
  // after the first could never land in the group anymore, since focus
  // had already jumped away from it. Round 11: while a group is active,
  // rendering keeps it left-aligned (see groupOffset/isGroupActive above),
  // so the box that just received a digit is NOT the same box the offset
  // would later move it to — advancing to the plain next box
  // (originIndex + 1) is always correct now, for every group, with no
  // special-casing. A single leftover digit only visually migrates to the
  // separator-adjacent box once focus actually leaves the group (a later
  // click/tab/arrow past it, or the whole component blurring) — at that
  // point nothing needs to "skip" anything; the render-side offset alone
  // handles it.
  function advanceFocusAfterDigit(originIndex: number) {
    focusBox(originIndex + 1);
  }

  // Shared by real-keyboard Backspace and the on-screen keypad's
  // backspace key. A PARTIAL group's digits are right-aligned, so its
  // rightmost-filled box can sit to the RIGHT of an empty box the user is
  // "on" (e.g. the city code's far/optional box, while its single digit
  // lives in the adjacent-to-dash box) — originIndex - 1 would be the
  // wrong direction entirely there. Clears that group's rightmost-filled
  // digit first, per round 10's spec; a non-partial group is unaffected
  // (its digits are always already left-aligned/contiguous from index 0,
  // so this search finds nothing and falls through to the plain
  // originIndex - 1 behavior).
  function backspaceTarget(originIndex: number): number {
    const { groupIndex, start, end } = groupBoundsFor(originIndex);
    const group = groups[groupIndex]!;
    if (isRightAnchoredPartialGroup(group, groupIndex)) {
      const digits = flatDigits();
      for (let i = end - 1; i >= start; i -= 1) {
        if (digits[i]) return i;
      }
    }
    return originIndex - 1;
  }

  function handleBoxChange(flatIndex: number, raw: string) {
    // Arabic-Indic digits typed on an Arabic keyboard count as digits.
    const digit = toWesternDigits(raw).replace(/\D/g, '').slice(-1);
    if (!digit) return;
    setDigitAt(flatIndex, digit);
    advanceFocusAfterDigit(flatIndex);
  } 

  function handleKeyDown(flatIndex: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace') {
      // Standard box-input behavior: Backspace on a FILLED box clears
      // that box in place (focus stays put) — the browser's own native
      // backspace would visually clear it too, but since this is a
      // controlled input, an onChange with an empty value is a no-op in
      // handleBoxChange (it ignores blank digits), so without this the
      // box would silently snap back to its old value on the next
      // render. Backspace on an ALREADY-EMPTY box clears the group's
      // rightmost-filled digit instead (see backspaceTarget) — chaining
      // backspace across boxes, same as any OTP/PIN-style input.
      const currentValue = (event.target as HTMLInputElement).value;
      event.preventDefault();
      if (currentValue) {
        setDigitAt(flatIndex, '');
      } else {
        const target = backspaceTarget(flatIndex);
        setDigitAt(target, '');
        focusBox(target);
      }
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      focusBox(flatIndex - 1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      focusBox(flatIndex + 1);
    }
  }

  function handlePaste(flatIndex: number, event: ClipboardEvent<HTMLInputElement>) {
    const digits = toWesternDigits(event.clipboardData.getData('text')).replace(/\D/g, '');
    if (!digits) return;
    event.preventDefault();
    let cursor = flatIndex;
    for (const d of digits) {
      if (cursor >= total) break;
      setDigitAt(cursor, d);
      cursor += 1;
    }
    focusBox(Math.min(cursor, total - 1));
  }

  // Fallback target for a keypad tap when no box has ever been focused yet
  // (normal usage always has one focused — clicking/tabbing into any box
  // sets it via onFocus) — the first empty box, or past the end if every
  // box is already filled. flatDigits() is now a true one-slot-per-box
  // array (see its comment above), so this is a plain linear search, not
  // a length/count trick.
  function firstEmptyIndex(): number {
    const idx = flatDigits().findIndex((d) => d === '');
    return idx === -1 ? total : idx;
  }

  function handleKeypadDigit(digit: string) {
    const target = focusedIndex ?? firstEmptyIndex();
    setDigitAt(target, digit);
    advanceFocusAfterDigit(target);
  }

  function handleKeypadBackspace() {
    const origin = focusedIndex ?? firstEmptyIndex();
    if (origin < 0) return;
    // Mirrors handleKeyDown's Backspace: if the "current" box (wherever
    // focus/the fallback points) is itself filled, clear it in place;
    // otherwise defer to backspaceTarget's same-group-rightmost-digit
    // search (the on-screen keypad has no per-box "current value" to
    // check directly, so ask flatDigits() instead).
    const digits = flatDigits();
    const target = digits[origin] ? origin : backspaceTarget(origin);
    if (target < 0) return;
    setDigitAt(target, '');
    focusBox(target);
  }

  const complete = isAllComplete(groupValues, groups);
  // Single source of truth for what each box displays — must be the SAME
  // right-aligned mapping setDigitAt/backspaceTarget read and write
  // against, not a second, independent (and un-fixed) left-aligned lookup
  // straight from groupValues.
  const renderDigits = flatDigits();

  let flatCursor = 0;
  return (
    <div data-testid={testId} data-complete={complete}>
      {/* Round 11 item 5: at real phone widths (~360-390px) the 9-box plate
          row (2+7 boxes, dash, gaps) is wider than the padded content area
          a `Card` (`overflow-hidden`) leaves for it — the row overflowed
          the card's own p-4, and overflow-hidden clipped that overflow
          right at the card's edge, cropping away the padding and leaving
          the first/last boxes flush against the card boundary. Two things
          fix this together: the boxes/gaps below are now smaller by
          default (fits the 9-box plate row inside a real phone card with
          room to spare, same default still used by the 12-box identity
          group, which was at the same latent risk even though it wasn't
          the one reported), and this row has its own horizontal padding
          plus overflow-x-auto — so if a still-wider case ever shows up,
          it scrolls inside its own edge margin instead of silently
          clipping into the card boundary again. */}
      <div className="overflow-x-auto px-1">
        {/* w-full (not w-max) — justify-center centers this row's OWN
            children within itself, so the row has to actually span the
            available width for that centering to do anything. w-max
            shrinks the row to exactly its content's size, leaving nothing
            for justify-center to center within — the row then just sits
            at its default start position instead of the middle of the
            card. Caught live: this is exactly what broke centering when
            w-max was added for the overflow-x-auto fallback.
            min-w-max is the other half of that fix, found live in turn:
            plain w-full lets the row SHRINK to its container's width when
            content is wider (flexbox's default flex-shrink on the boxes),
            which either squeezes the boxes narrower than their own
            w-7/w-8 or — once they hit their effective minimum — clips the
            trailing ones out of view entirely with no way to reach them,
            since the outer overflow-x-auto wrapper never sees any
            overflow to make scrollable (the row itself never exceeds ITS
            OWN w-full bound, only its shrunk children do). Reproduced
            with the 12-box identity field nested inside
            VehicleCreateForm's own padding at 374px, where the 9-box
            plate row (this fix was first verified against) still fit but
            12 boxes didn't. min-w-max means the row is never narrower
            than its content's natural size — short content still centers
            via w-full, long content grows past 100% and genuinely
            overflows the outer wrapper, which then scrolls instead of
            squeezing or clipping. */}
        <div className="flex w-full min-w-max items-center justify-center gap-1 sm:gap-1.5" dir="ltr">
          {groups.map((group, groupIndex) => {
            const boxes = Array.from({ length: group.boxes }, (_, i) => {
              const flatIndex = flatCursor + i;
              const digit = renderDigits[flatIndex] ?? '';
              return (
                <input
                  key={flatIndex}
                  ref={(el) => {
                    boxRefs.current[flatIndex] = el;
                  }}
                  data-testid={testId ? `${testId}-box-${flatIndex}` : undefined}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  value={digit}
                  disabled={disabled}
                  autoFocus={autoFocus && flatIndex === 0}
                  onFocus={() => setFocusedIndex(flatIndex)}
                  onBlur={() => setFocusedIndex((current) => (current === flatIndex ? null : current))}
                  onChange={(e) => handleBoxChange(flatIndex, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(flatIndex, e)}
                  onPaste={(e) => handlePaste(flatIndex, e)}
                  className={
                    className ??
                    'h-11 w-7 sm:w-8 rounded-sm border border-line bg-surface-alt text-center text-[16px] font-bold text-ink focus:outline-none focus:ring-2 focus:ring-accent'
                  }
                />
              );
            });
            flatCursor += group.boxes;
            return (
              <span key={groupIndex} className="flex items-center gap-1 sm:gap-1.5">
                {groupIndex > 0 && separator && <span className="text-[16px] font-bold text-ink-faint">{separator}</span>}
                {boxes}
              </span>
            );
          })}
        </div>
      </div>

      {showKeypad && (
        <div className="mt-3 grid grid-cols-3 gap-1.5" dir="ltr">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              disabled={disabled}
              onClick={() => handleKeypadDigit(digit)}
              className="h-11 rounded-sm bg-surface-alt text-[16px] font-bold text-ink hover:bg-primary-100"
            >
              {digit}
            </button>
          ))}
          <button
            type="button"
            disabled={disabled}
            onClick={handleKeypadBackspace}
            className="h-11 rounded-sm bg-surface-alt text-[15px] lg:text-[13px] font-bold text-ink-soft hover:bg-primary-100"
          >
            ⌫
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => handleKeypadDigit('0')}
            className="h-11 rounded-sm bg-surface-alt text-[16px] font-bold text-ink hover:bg-primary-100"
          >
            0
          </button>
        </div>
      )}
    </div>
  );
}
