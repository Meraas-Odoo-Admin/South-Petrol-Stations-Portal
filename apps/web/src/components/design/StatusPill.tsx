import type { ReactNode } from 'react';

// Mockup rule (design-system-notes.md): "Approve = teal/green solid pill;
// reject/destructive = outlined danger pill, never solid red as a default
// state" — solid red is reserved for the moment a rule is actually broken,
// not for routine "this row is inactive" status. Neutral/accent added here
// for statuses the mockup doesn't enumerate (pending, inactive).
const VARIANTS = {
  ok: 'bg-ok-100 text-ok',
  danger: 'text-danger border border-danger',
  accent: 'bg-accent-100 text-accent-dark',
  neutral: 'bg-surface-alt text-ink-soft',
} as const;

export function StatusPill({
  children,
  variant,
}: {
  children: ReactNode;
  variant: keyof typeof VARIANTS;
}) {
  return (
    <span className={`inline-block w-fit rounded-full px-2.5 py-0.5 text-[11px] font-bold ${VARIANTS[variant]}`}>
      {children}
    </span>
  );
}
