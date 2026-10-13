import type { ButtonHTMLAttributes } from 'react';

// design-system-notes.md: "Primary buttons: pill shape, amber gradient
// fill, soft amber glow shadow. Secondary/ghost buttons: pill, no fill,
// ink-soft text." Phase 5C: the label on an amber button is Ink (#132524), never
// white (white on amber is about 2:1). The gradient ends at accent-mid, not
// accent-dark, so Ink stays at 4.5:1 or better across the whole button.
// size="sm" matches the compact in-card action buttons
// (2i's "حساب جديد +", table row actions); default matches full CTAs.
const VARIANTS = {
  primary: 'bg-gradient-to-l from-accent to-accent-mid text-ink shadow-glow',
  secondary: 'bg-surface-alt text-ink-soft',
  ghost: 'text-ink-soft hover:bg-surface-alt',
  danger: 'text-danger border border-danger hover:bg-danger-100',
} as const;

const SIZES = {
  sm: 'h-8 px-3.5 text-[13px] lg:text-[12px]',
  md: 'h-9 px-4 text-[13px] lg:text-[12.5px]',
  // Phase 4b screens: 48px and 16px text on a phone (thumb and sunlight),
  // 40px and 14px on a desktop.
  field: 'h-12 px-5 text-[16px] lg:h-10 lg:px-4 lg:text-[14px]',
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
