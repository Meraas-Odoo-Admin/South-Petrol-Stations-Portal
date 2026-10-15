import { useEffect, useRef, type ReactNode } from 'react';
import { Icon, ICONS } from '../icons';

// A sheet over the page: slides up from the bottom edge on a phone (thumb
// reach), a centred 24px-radius panel on a desktop (DESIGN.md "Shapes").
// Escape and the backdrop close it; focus moves into it and returns to what
// opened it. `busy` blocks closing while a request is in flight, so a
// half-finished action is never abandoned by a stray tap.
export function Dialog({
  open,
  title,
  onClose,
  busy = false,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  busy?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Phase 7 (audit P0): the callers pass a new onClose on every render, so
  // with onClose/busy in the effect's dependencies, every keystroke in the
  // reason field re-ran it: focus jumped back to the opener and then to the
  // panel, one character at a time. They are read through refs instead, and
  // focus moves only when the sheet opens and closes.
  const onCloseRef = useRef(onClose);
  const busyRef = useRef(busy);
  onCloseRef.current = onClose;
  busyRef.current = busy;

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busyRef.current) {
        onCloseRef.current();
        return;
      }
      // Keep Tab inside the sheet: from the last control it wraps to the first,
      // and Shift+Tab from the first wraps to the last.
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0] as HTMLElement;
      const last = focusable[focusable.length - 1] as HTMLElement;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === panelRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center lg:p-6">
      <button
        type="button"
        aria-label="إغلاق"
        tabIndex={-1}
        disabled={busy}
        onClick={onClose}
        className="absolute inset-0 animate-fade-in bg-ink/40 motion-reduce:animate-none"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="relative flex max-h-[90vh] w-full animate-fade-in-up flex-col motion-reduce:animate-none rounded-t-lg bg-surface shadow-lg focus:outline-none lg:max-w-lg lg:rounded-lg"
      >
        <div className="flex items-center justify-between gap-3 px-5 pt-5 lg:px-6">
          <h2 className="text-[18px] font-extrabold text-ink lg:text-[15px]">{title}</h2>
          <button
            type="button"
            aria-label="إغلاق"
            disabled={busy}
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-surface-alt disabled:opacity-40"
          >
            <Icon d={ICONS.close} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4 text-[16px] text-ink lg:px-6 lg:text-[14px]">{children}</div>
        {footer && <div className="flex flex-col-reverse gap-2 px-5 pb-5 pt-1 lg:flex-row lg:justify-end lg:px-6">{footer}</div>}
      </div>
    </div>
  );
}
