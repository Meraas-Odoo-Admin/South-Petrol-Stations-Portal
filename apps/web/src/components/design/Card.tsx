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
  // Phase 7 (7): a card's title sits on a teal-tinted band (teal is
  // structure), so a page reads as named sections, not grey on grey.
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-primary/15 bg-primary-100 px-[18px] py-3">
      <div>
        <h2 className="inline text-[16px] font-extrabold text-primary-dark lg:text-[14px]">{title}</h2>
        {subtitle && <span className="ms-2 text-[14px] text-ink-soft lg:text-[12px]">{subtitle}</span>}
      </div>
      {action}
    </div>
  );
}
