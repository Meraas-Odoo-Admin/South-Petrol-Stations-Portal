import { LtrText } from '../LtrText';
import { InfoHint } from '../InfoHint';

// Matches 2d/2h's KPI row: individual rounded cards in a grid (design-
// system-notes.md: "KPI stats as individual rounded cards in a grid, not
// table rows"), big tabular-mono number end-aligned. variant="accent"
// marks the one that needs a decision (2d's "بانتظار اعتمادك"); "danger"
// for a rate that's actually a problem (2h's exception-rate card).
const VARIANTS = {
  neutral: { card: 'bg-surface', label: 'text-ink-soft', value: 'text-ink' },
  accent: { card: 'bg-accent-100', label: 'text-accent-ink', value: 'text-accent-ink' },
  danger: { card: 'bg-danger-100', label: 'text-danger-dark', value: 'text-danger-dark' },
} as const;

export function KpiCard({
  label,
  value,
  variant = 'neutral',
  hint,
}: {
  label: string;
  value: string | number;
  variant?: keyof typeof VARIANTS;
  hint?: string;
}) {
  const v = VARIANTS[variant];
  return (
    <div className={`rounded-md p-4 shadow-sm ${v.card}`}>
      <div className={`flex items-center gap-1.5 text-[13px] lg:text-[12px] font-medium ${v.label}`}>
        {label}
        {hint && <InfoHint text={hint} />}
      </div>
      <div className={`mt-2 text-end font-mono text-[28px] font-extrabold leading-none ${v.value}`}>
        <LtrText>{value}</LtrText>
      </div>
    </div>
  );
}
