import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
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
}: DigitBoxInputProps) {
  const total = totalBoxes(groups);
  const groupValues = splitToGroups(value, groups, separator);
  const boxRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  // A TRUE flat array — length always === total boxes, index N always
  // corresponds to rendered box N, using '' for any box that isn't filled
  // (including a box PRECEDING a later filled one, e.g. box1 empty while
  // box2 already has a digit — the "1-digit city code, skip straight to
  // the sequence" case). Bug this fixed: the previous version only pushed
  // a group's ACTUALLY-FILLED characters (groupValue.length, not
  // group.boxes), so once a group had fewer digits than its box count,
  // every flat index after it was silently shifted — a keystroke reported
  // as flatIndex 2 (box 2) was landing in box 1's rendered position
  // instead, because index 2 in the compacted array didn't mean "box 2"
  // anymore.
  function flatDigits(): string[] {
    const flat: string[] = [];
    groups.forEach((group, groupIndex) => {
      const groupValue = groupValues[groupIndex] ?? '';
      for (let i = 0; i < group.boxes; i += 1) {
        flat.push(groupValue[i] ?? '');
      }
    });
    return flat;
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

  function handleBoxChange(flatIndex: number, raw: string) {
    const digit = raw.replace(/\D/g, '').slice(-1);
    if (!digit) return;
    setDigitAt(flatIndex, digit);
    focusBox(flatIndex + 1);
  }

  function handleKeyDown(flatIndex: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace') {
      // Standard box-input behavior: Backspace on a FILLED box clears
      // that box in place (focus stays put) — the browser's own native
      // backspace would visually clear it too, but since this is a
      // controlled input, an onChange with an empty value is a no-op in
      // handleBoxChange (it ignores blank digits), so without this the
      // box would silently snap back to its old value on the next
      // render. Backspace on an ALREADY-EMPTY box moves to the previous
      // box and clears that one instead — chaining backspace across
      // boxes, same as any OTP/PIN-style input.
      const currentValue = (event.target as HTMLInputElement).value;
      event.preventDefault();
      if (currentValue) {
        setDigitAt(flatIndex, '');
      } else {
        setDigitAt(flatIndex - 1, '');
        focusBox(flatIndex - 1);
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
    const digits = event.clipboardData.getData('text').replace(/\D/g, '');
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
    focusBox(target + 1);
  }

  function handleKeypadBackspace() {
    const target = focusedIndex ?? firstEmptyIndex() - 1;
    if (target < 0) return;
    setDigitAt(target, '');
    focusBox(target);
  }

  const complete = isAllComplete(groupValues, groups);

  let flatCursor = 0;
  return (
    <div data-testid={testId} data-complete={complete}>
      <div className="flex items-center justify-center gap-1.5" dir="ltr">
        {groups.map((group, groupIndex) => {
          const groupDigits = groupValues[groupIndex] ?? '';
          const boxes = Array.from({ length: group.boxes }, (_, i) => {
            const flatIndex = flatCursor + i;
            const digit = groupDigits[i] ?? '';
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
                onChange={(e) => handleBoxChange(flatIndex, e.target.value)}
                onKeyDown={(e) => handleKeyDown(flatIndex, e)}
                onPaste={(e) => handlePaste(flatIndex, e)}
                className={
                  className ??
                  'h-11 w-8 rounded-sm border border-line bg-surface-alt text-center text-[16px] font-bold text-ink focus:outline-none focus:ring-2 focus:ring-accent'
                }
              />
            );
          });
          flatCursor += group.boxes;
          return (
            <span key={groupIndex} className="flex items-center gap-1.5">
              {groupIndex > 0 && separator && <span className="text-[16px] font-bold text-ink-faint">{separator}</span>}
              {boxes}
            </span>
          );
        })}
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
            className="h-11 rounded-sm bg-surface-alt text-[13px] font-bold text-ink-soft hover:bg-primary-100"
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
