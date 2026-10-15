// The one switch of the app (DESIGN.md, "Switch"): an iOS-style track and
// thumb, always with its state in WORDS beside it, so the state is never told
// by colour or position alone. Used for the fill-up rule switches, «إظهار
// المخزون للموظفين», and a person's active / inactive state.
//
// 44px minimum target (the whole button, words included). On = petrol teal
// track; off = line grey. The thumb moves with `start`, so it flips correctly
// in RTL.
export function Switch({
  checked,
  onChange,
  label,
  onLabel = 'مفعّل',
  offLabel = 'موقوف',
  disabled = false,
  busy = false,
  testId,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** What the switch controls, for screen readers: «<label>: مفعّل». */
  label: string;
  onLabel?: string;
  offLabel?: string;
  disabled?: boolean;
  busy?: boolean;
  testId?: string;
}) {
  const word = checked ? onLabel : offLabel;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={`${label}: ${word}`}
      aria-busy={busy || undefined}
      data-testid={testId}
      disabled={disabled || busy}
      onClick={() => onChange(!checked)}
      className="flex min-h-[44px] shrink-0 items-center gap-2.5 rounded-full px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-dark focus-visible:ring-offset-2 disabled:opacity-60"
    >
      <span className={`text-[15px] font-bold lg:text-[13px] ${checked ? 'text-ok' : 'text-ink-soft'}`}>{word}</span>
      <span
        aria-hidden="true"
        className={`relative h-8 w-14 rounded-full transition-colors duration-200 ${checked ? 'bg-primary' : 'bg-line'}`}
      >
        <span
          className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all duration-200 ${
            checked ? 'start-7' : 'start-1'
          }`}
        />
      </span>
    </button>
  );
}
