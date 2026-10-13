import { useEffect, useMemo, useRef, useState } from 'react';
import { PortalDropdown } from './PortalDropdown';

interface DateFieldProps {
  value: string; // ISO yyyy-mm-dd, or '' for empty
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  // Overrides the inner text input's own sizing (default h-11/text-[13px])
  // — round 5 feedback: filter rows elsewhere in the app use h-9 controls,
  // and a native `<input type="date">` doesn't reliably match a `h-*`
  // class's actual rendered height across browsers the way a plain text
  // input does, which is exactly what caused the inconsistent-height bug
  // this component now also fixes for every filter row, not just the
  // standing-exceptions form it was originally built for.
  inputClassName?: string;
}

// Round 19: "the date fields should be date picker format, not like they
// are now" — the previous version WAS technically wired to a real picker
// (a hidden native <input type="date"> behind the calendar-icon button,
// opened via showPicker()), but that's not what a date picker reads as: a
// tiny icon trigger for browser chrome the client never actually saw look
// like a calendar. This is now a genuine in-app calendar dropdown — no
// native picker involved at all, which also permanently closes the
// earlier documented gap (native <input type="date"> follows the
// BROWSER's UI locale, not this page's lang="ar", so it could render
// mm/dd/yyyy in Latin numerals on an English-locale browser regardless of
// the rest of the page). Typing dd/mm/yyyy directly still works — this
// stays the fast path for someone who already knows the exact date — but
// the calendar is now the primary, visible interaction the field itself
// opens on focus/click, not a secondary icon-only affordance.
function isoToDisplay(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return '';
  return `${d}/${m}/${y}`;
}

function displayToIso(display: string): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(display.trim());
  if (!match) return null;
  const [, d, m, y] = match;
  const day = Number(d);
  const month = Number(m);
  const year = Number(y);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

function formatAsTyped(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);
  return [day, month, year].filter(Boolean).join('/');
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

function toIso(y: number, m: number, d: number): string {
  return `${y.toString().padStart(4, '0')}-${pad2(m)}-${pad2(d)}`;
}

const MONTH_NAMES_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];
// Saturday-first — same week-start convention already established
// elsewhere in this app (SystemSetting `fillup.week_start_day` defaults
// to 6=Saturday, the Libyan work-week convention), not an arbitrary pick.
const WEEKDAY_NAMES_AR = ['سبت', 'أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة'];

const DEFAULT_INPUT_CLASS =
  'h-11 w-full rounded-sm border border-line bg-surface-alt px-3.5 text-[15px] lg:text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50';

// Round 11 item 3 / round 14 fix, both still relevant to the input's own
// padding even though the trigger behind it changed — see the file's
// original comment history for why this is a physical (not logical)
// property: the input carries its own dir="ltr" (typed dd/mm/yyyy digits
// read left-to-right) inside an otherwise-rtl page, and CSS logical
// properties resolve against an element's OWN direction, not the page's.
const ICON_SAFE_END_PADDING = '!pl-9';

export function DateField({ value, onChange, disabled, className = '', inputClassName }: DateFieldProps) {
  const [text, setText] = useState(isoToDisplay(value));
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setText(isoToDisplay(value));
  }, [value]);

  // Closes on an outside click — the calendar renders through
  // PortalDropdown (a document.body portal, not a DOM descendant of
  // anchorRef), so a plain onBlur on the input would fire as soon as focus
  // moves to a button inside the calendar. The calendar's own onMouseDown
  // preventDefault (below) keeps the input focused while interacting with
  // it; this listener only fires for a genuine click elsewhere on the page.
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target)) return;
      const calendarEl = document.querySelector('[data-testid="date-field-calendar"]');
      if (calendarEl?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const today = useMemo(() => new Date(), []);
  const selected = useMemo(() => {
    if (!value) return null;
    const [y, m, d] = value.split('-').map(Number);
    if (!y || !m || !d) return null;
    return { y, m, d };
  }, [value]);

  const [viewYear, setViewYear] = useState(() => selected?.y ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(() => (selected?.m ?? today.getMonth() + 1) - 1); // 0-11

  // Re-sync the visible month whenever the field opens with a real value,
  // so re-opening always lands on the selected date's month rather than
  // wherever the user last scrolled to.
  function openCalendar() {
    if (disabled) return;
    if (selected) {
      setViewYear(selected.y);
      setViewMonth(selected.m - 1);
    } else {
      setViewYear(today.getFullYear());
      setViewMonth(today.getMonth());
    }
    setOpen(true);
  }

  function handleTextChange(raw: string) {
    const formatted = formatAsTyped(raw);
    setText(formatted);
    const iso = displayToIso(formatted);
    if (iso) onChange(iso);
    else if (formatted === '') onChange('');
  }

  const weeks = useMemo(() => {
    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    // JS getDay(): 0=Sun..6=Sat. Convert to Saturday-first index (0=Sat).
    const jsDay = firstOfMonth.getDay();
    const leadingBlanks = (jsDay + 1) % 7;
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    const cells: (number | null)[] = [
      ...Array(leadingBlanks).fill(null),
      ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
    while (cells.length % 7 !== 0) cells.push(null);

    const rows: (number | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [viewYear, viewMonth]);

  function changeMonth(delta: number) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setViewMonth(m);
    setViewYear(y);
  }

  function pickDay(day: number) {
    onChange(toIso(viewYear, viewMonth + 1, day));
    setOpen(false);
  }

  const isTodayCell = (day: number) =>
    day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
  const isSelectedCell = (day: number) => !!selected && selected.y === viewYear && selected.m === viewMonth + 1 && selected.d === day;

  return (
    <div ref={anchorRef} className={`relative flex items-center ${className}`}>
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        dir="ltr"
        placeholder="يوم/شهر/سنة"
        value={text}
        disabled={disabled}
        onChange={(e) => handleTextChange(e.target.value)}
        onFocus={openCalendar}
        data-testid="date-field-input"
        className={`${inputClassName ?? DEFAULT_INPUT_CLASS} ${ICON_SAFE_END_PADDING}`}
      />
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openCalendar())}
        disabled={disabled}
        aria-label="اختيار التاريخ من التقويم"
        data-testid="date-field-calendar-toggle"
        className="absolute end-2.5 flex h-6 w-6 items-center justify-center text-ink-soft disabled:opacity-50"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
      </button>

      <PortalDropdown anchorRef={anchorRef} open={open}>
        <div
          data-testid="date-field-calendar"
          className="w-72 animate-scale-in rounded-md border border-line bg-surface p-3 shadow-lg"
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              aria-label="الشهر السابق"
              className="flex h-7 w-7 items-center justify-center rounded-full text-ink-soft hover:bg-surface-alt"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </button>
            <p className="text-[15px] lg:text-[13px] font-extrabold text-ink">
              {MONTH_NAMES_AR[viewMonth]} <span dir="ltr">{viewYear}</span>
            </p>
            <button
              type="button"
              onClick={() => changeMonth(1)}
              aria-label="الشهر التالي"
              className="flex h-7 w-7 items-center justify-center rounded-full text-ink-soft hover:bg-surface-alt"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          </div>

          <div className="mt-2 grid grid-cols-7 gap-1">
            {WEEKDAY_NAMES_AR.map((w) => (
              <div key={w} className="py-1 text-center text-[13px] lg:text-[12px] font-bold text-ink-faint">
                {w}
              </div>
            ))}
            {weeks.map((row, ri) =>
              row.map((day, ci) => (
                <button
                  key={`${ri}-${ci}`}
                  type="button"
                  disabled={day === null}
                  onClick={() => day && pickDay(day)}
                  data-testid={day ? 'date-field-day' : undefined}
                  className={`flex h-8 items-center justify-center rounded-full text-[13px] lg:text-[12px] font-bold transition ${
                    day === null
                      ? 'invisible'
                      : isSelectedCell(day)
                        ? 'bg-primary text-white'
                        : isTodayCell(day)
                          ? 'bg-accent-100 text-accent-ink'
                          : 'text-ink hover:bg-surface-alt'
                  }`}
                >
                  {day ?? ''}
                </button>
              )),
            )}
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-surface-alt pt-2">
            <button
              type="button"
              onClick={() => {
                const t = new Date();
                onChange(toIso(t.getFullYear(), t.getMonth() + 1, t.getDate()));
                setOpen(false);
              }}
              className="text-[13px] lg:text-[12px] font-bold text-primary hover:underline"
            >
              اليوم
            </button>
            {value && (
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setOpen(false);
                }}
                className="text-[13px] lg:text-[12px] font-bold text-ink-soft hover:underline"
              >
                مسح
              </button>
            )}
          </div>
        </div>
      </PortalDropdown>
    </div>
  );
}
