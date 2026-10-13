import type { ReactNode } from 'react';

// Mockup rule (design-system-notes.md): "Approve = teal/green solid pill;
// reject/destructive = outlined danger pill, never solid red as a default
// state" — solid red is reserved for the moment a rule is actually broken,
// not for routine "this row is inactive" status. Neutral/accent added here
// for statuses the mockup doesn't enumerate (pending, inactive).
const VARIANTS = {
  ok: 'bg-ok-100 text-ok',
  danger: 'text-danger border border-danger',
  accent: 'bg-accent-100 text-accent-ink',
  // Same amber tint, Ink text: 13.8:1 where Amber Deep is only 3.1:1. Used by the
  // phase 4b screens for pending and attention states.
  warn: 'bg-accent-100 text-ink',
  neutral: 'bg-surface-alt text-ink-soft',
} as const;

// size="md" is for the phase 4b screens: 13px on a phone, 12px on a desktop.
const SIZES = {
  sm: 'px-2.5 py-0.5 text-[13px] lg:text-[12px]',
  md: 'px-3 py-1 text-[13px] lg:px-2.5 lg:py-0.5 lg:text-[12px]',
} as const;

export function StatusPill({
  children,
  variant,
  size = 'sm',
}: {
  children: ReactNode;
  variant: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
}) {
  return (
    <span className={`inline-block w-fit rounded-full font-bold ${SIZES[size]} ${VARIANTS[variant]}`}>
      {children}
    </span>
  );
}
