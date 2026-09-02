import { useEffect, useRef, useState } from 'react';

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

// Native `<input type="date">` looks foreign inside this app: its displayed
// digits/field-order follow the BROWSER's UI locale, not the page's
// `lang="ar"` attribute (confirmed — Chromium ignores page lang for this
// control), so on an English-locale browser it renders mm/dd/yyyy in Latin
// numerals even though everything else on the page is Arabic/RTL. This is a
// typed dd/mm/yyyy text field instead, matching the convention used
// everywhere else in Libya, with a calendar-icon button that still opens the
// real native picker (via a visually hidden date input) for mouse users.
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

const DEFAULT_INPUT_CLASS =
  'h-11 w-full rounded-sm border border-line bg-surface-alt px-3.5 pe-9 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50';

export function DateField({ value, onChange, disabled, className = '', inputClassName }: DateFieldProps) {
  const [text, setText] = useState(isoToDisplay(value));
  const nativeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setText(isoToDisplay(value));
  }, [value]);

  function handleTextChange(raw: string) {
    const formatted = formatAsTyped(raw);
    setText(formatted);
    const iso = displayToIso(formatted);
    if (iso) onChange(iso);
    else if (formatted === '') onChange('');
  }

  function openNativePicker() {
    const el = nativeRef.current;
    if (!el) return;
    if (typeof el.showPicker === 'function') el.showPicker();
    else el.focus();
  }

  return (
    <div className={`relative flex items-center ${className}`}>
      <input
        type="text"
        inputMode="numeric"
        dir="ltr"
        placeholder="يوم/شهر/سنة"
        value={text}
        disabled={disabled}
        onChange={(e) => handleTextChange(e.target.value)}
        className={inputClassName ?? DEFAULT_INPUT_CLASS}
      />
      <button
        type="button"
        onClick={openNativePicker}
        disabled={disabled}
        aria-label="اختيار التاريخ من التقويم"
        className="absolute end-2.5 flex h-6 w-6 items-center justify-center text-ink-soft disabled:opacity-50"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
      </button>
      <input
        ref={nativeRef}
        type="date"
        tabIndex={-1}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="pointer-events-none absolute end-2.5 h-6 w-6 opacity-0"
      />
    </div>
  );
}
