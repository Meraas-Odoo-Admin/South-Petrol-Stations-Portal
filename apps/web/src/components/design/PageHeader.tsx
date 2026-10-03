import type { ReactNode } from 'react';

// Matches 2d/2h/2i's content header: white bg, shadow-sm, title+subtitle on
// one side, actions (filters, export buttons, primary CTA) on the other —
// the same header-row pattern AdminLayout uses, extracted so every screen
// in the design-conformance pass shares it instead of re-inventing a bare
// <h1> each time.
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="-mx-4 -mt-4 mb-6 flex flex-wrap items-end justify-between gap-3 bg-surface px-6 py-5 shadow-sm">
      <div>
        <h1 className="text-xl font-extrabold text-ink">{title}</h1>
        {subtitle && <div className="mt-1 text-[11px] text-ink-faint">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-end gap-2">{actions}</div>}
    </div>
  );
}
