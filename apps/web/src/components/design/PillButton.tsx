import type { ButtonHTMLAttributes } from 'react';

// The ONE button system (Phase 7, section 7; DESIGN.md "Buttons"). Mohamed's
// review: buttons did not stand out, a secondary was a pale pill, and a
// disabled «حفظ» read as a weak primary. Every variant is now solid or
// clearly outlined, and every disabled button looks the same whatever it was.
//
//  - primary: solid amber with Ink text (7.5:1) — THE next action, one per
//    region. Never white on amber (about 2:1).
//  - brand:   solid petrol teal with white text (7.9:1) — a confirming action
//    that repeats down a page (the «حفظ» of each settings card), where a row of
//    amber buttons would leave no single needle.
//  - secondary: a 2px teal outline, teal text, on white — a real button, not a
//    pale fill.
//  - ghost: text only, for «إلغاء» / «تراجع» beside a stronger action.
//  - danger: a 2px red outline with deep red text — irreversible actions only.
//  - disabled (any variant): a dashed grey edge on a mist fill, faint text, no
//    shadow, a not-allowed cursor. It never looks like a faded primary; say
//    why it is disabled in a sentence nearby (DESIGN.md).
const VARIANTS = {
  primary:
    'border-2 border-accent-dark/70 bg-accent text-ink shadow-[0_2px_8px_-2px_rgba(185,122,26,.55)] hover:bg-[#DC9A30] active:bg-accent-mid',
  brand: 'border-2 border-primary bg-primary text-white shadow-[0_2px_8px_-2px_rgba(13,92,82,.45)] hover:bg-primary-dark active:bg-primary-dark',
  secondary: 'border-2 border-primary bg-surface text-primary-dark hover:bg-primary-100 active:bg-primary-100',
  ghost: 'border-2 border-transparent text-ink-soft hover:bg-surface-alt hover:text-ink',
  danger: 'border-2 border-danger bg-surface text-danger-dark hover:bg-danger-100 active:bg-danger-100',
} as const;

const DISABLED =
  'disabled:cursor-not-allowed disabled:border-dashed disabled:border-line disabled:bg-surface-alt disabled:text-ink-faint disabled:shadow-none disabled:hover:bg-surface-alt';

const SIZES = {
  sm: 'h-10 px-4 text-[14px] lg:h-8 lg:px-3.5 lg:text-[12.5px]',
  md: 'h-10 px-4 text-[14px] lg:h-9 lg:text-[13px]',
  // Phase 4b screens: 48px and 16px text on a phone (thumb and sunlight),
  // 40px and 14px on a desktop.
  field: 'h-12 px-5 text-[16px] lg:h-10 lg:px-4 lg:text-[14px]',
} as const;

export type PillButtonVariant = keyof typeof VARIANTS;

interface PillButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: PillButtonVariant;
  size?: keyof typeof SIZES;
}

export function PillButton({ variant = 'primary', size = 'md', className = '', ...props }: PillButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center rounded-full font-bold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-dark focus-visible:ring-offset-2 ${VARIANTS[variant]} ${DISABLED} ${SIZES[size]} ${className}`}
      {...props}
    />
  );
}
