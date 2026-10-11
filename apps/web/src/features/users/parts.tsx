import type { ReactNode } from 'react';
import { Card } from '../../components/design/Card';
import { Icon, ICONS } from '../../components/icons';

// A titled block on the person and create pages. 17px title on a phone, 15px
// on a desktop; the optional line under it says what the block is for.
export function SectionCard({
  title,
  description,
  step,
  children,
}: {
  title: string;
  description?: string;
  /** Step number on the create page ("1", "2", "3"). */
  step?: number;
  children: ReactNode;
}) {
  return (
    <Card>
      <section aria-label={title} className="p-4 lg:p-5">
        <div className="mb-4 flex items-start gap-3">
          {step !== undefined && (
            <span
              aria-hidden="true"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-[15px] font-extrabold text-white"
            >
              {step}
            </span>
          )}
          <div>
            <h2 className="text-[18px] font-extrabold text-ink lg:text-[15px]">{title}</h2>
            {description && <p className="mt-0.5 text-[15px] text-ink-soft lg:text-[13px]">{description}</p>}
          </div>
        </div>
        {children}
      </section>
    </Card>
  );
}

// An inline message tied to what was just done. Success is read out politely
// (role="status"); a problem interrupts (role="alert"). Always icon + words.
export function Notice({
  kind,
  children,
}: {
  kind: 'success' | 'error' | 'info' | 'pending';
  children: ReactNode;
}) {
  const style =
    kind === 'success'
      ? 'bg-ok-100 text-ok'
      : kind === 'error'
        ? 'bg-danger-100 text-danger-dark'
        : kind === 'pending'
          ? 'bg-accent-100 text-ink'
          : 'bg-surface-alt text-ink-soft';
  const icon = kind === 'success' ? ICONS.check : kind === 'info' ? ICONS.lock : ICONS.violations;
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-2.5 rounded-md p-3.5 text-[15px] font-medium leading-[1.7] lg:text-[13px] ${style}`}
    >
      <span className="mt-1 shrink-0">
        <Icon d={icon} size={18} />
      </span>
      <div>{children}</div>
    </div>
  );
}
