import type { ButtonHTMLAttributes } from 'react';

// design-system-notes.md: "Primary buttons: pill shape, amber gradient
// fill, soft amber glow shadow. Secondary/ghost buttons: pill, no fill,
// ink-soft text." size="sm" matches the compact in-card action buttons
// (2i's "حساب جديد +", table row actions); default matches full CTAs.
const VARIANTS = {
  primary: 'bg-gradient-to-l from-accent to-accent-dark text-white shadow-glow',
  secondary: 'bg-surface-alt text-ink-soft',
  ghost: 'text-ink-soft hover:bg-surface-alt',
  danger: 'text-danger border border-danger hover:bg-danger-100',
} as const;

const SIZES = {
  sm: 'h-8 px-3.5 text-[11.5px]',
  md: 'h-9 px-4 text-[12.5px]',
} as const;

interface PillButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
}

export function PillButton({ variant = 'primary', size = 'md', className = '', ...props }: PillButtonProps) {
  return (
    <button
      type="button"
      className={`rounded-full font-bold transition disabled:opacity-40 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    />
  );
}
