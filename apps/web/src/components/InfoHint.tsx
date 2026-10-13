import { useState } from 'react';

// Round 19: "for the fields, dashboard data, reporting data I want you to
// put info or a hint so the user knows what to type or what this data
// means." A small (ⓘ) affordance next to a label/KPI/chart title — click
// (not just hover, so it works on the mobile widths this app is used at
// too) toggles a short explanatory bubble. Kept deliberately terse: one or
// two sentences, not a help article, matching this app's existing hint-line
// convention (e.g. DigitBoxInput's own format hints) rather than inventing
// a new heavier pattern.
export function InfoHint({ text, className = '' }: { text: string; className?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <span className={`relative inline-flex ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        aria-label="معلومات"
        title={text}
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-surface-alt text-[13px] lg:text-[12px] font-extrabold text-ink-faint transition-colors hover:bg-primary-100 hover:text-primary"
      >
        ؟
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute bottom-full start-0 z-20 mb-1.5 w-56 animate-scale-in rounded-md border border-line bg-surface p-2.5 text-[13px] lg:text-[12px] font-normal leading-[1.6] text-ink-soft shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  );
}
