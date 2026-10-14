import type { HTMLAttributes, ReactNode } from 'react';

// Matches design/Fuel Control System - Design Directions.dc.html turn 2i:
// every data block is a white card (rounded-md/16px, shadow-sm), never a
// bare bordered table — structure comes from radius + shadow, not divider
// lines. See design/design-system-notes.md "Shape & elevation".
//
// Spreads the rest of the div props through (data-testid in particular) —
// without this, `<Card data-testid="x">` silently drops the attribute
// since it's never forwarded to the underlying element, which would break
// any Playwright test targeting it. Caught while wiring this into
// RecordFillUpPage's rejection card.
export function Card({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`overflow-hidden rounded-md bg-surface shadow-sm ${className}`} {...rest} />;
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-line-soft px-[18px] py-3.5">
      <div>
        <span className="text-[15px] lg:text-[13px] font-bold text-ink">{title}</span>
        {subtitle && <span className="ms-2 text-[13px] lg:text-[12px] text-ink-faint">{subtitle}</span>}
      </div>
      {action}
    </div>
  );
}
