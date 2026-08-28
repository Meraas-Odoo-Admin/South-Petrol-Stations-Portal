import { LtrText } from '../LtrText';

// Matches 2d/2h's KPI row: individual rounded cards in a grid (design-
// system-notes.md: "KPI stats as individual rounded cards in a grid, not
// table rows"), big tabular-mono number end-aligned. variant="accent"
// marks the one that needs a decision (2d's "بانتظار اعتمادك"); "danger"
// for a rate that's actually a problem (2h's exception-rate card).
const VARIANTS = {
  neutral: { card: 'bg-surface', label: 'text-ink-soft', value: 'text-ink' },
  accent: { card: 'bg-accent-100', label: 'text-accent-dark', value: 'text-accent-dark' },
  danger: { card: 'bg-danger-100', label: 'text-danger-dark', value: 'text-danger-dark' },
} as const;

export function KpiCard({
  label,
  value,
  variant = 'neutral',
}: {
  label: string;
  value: string | number;
  variant?: keyof typeof VARIANTS;
}) {
  const v = VARIANTS[variant];
  return (
    <div className={`rounded-md p-4 shadow-sm ${v.card}`}>
      <div className={`text-[11px] font-medium ${v.label}`}>{label}</div>
      <div className={`mt-2 text-end font-mono text-[28px] font-extrabold leading-none ${v.value}`}>
        <LtrText>{value}</LtrText>
      </div>
    </div>
  );
}
