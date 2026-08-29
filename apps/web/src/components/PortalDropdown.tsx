import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

interface PortalDropdownProps {
  anchorRef: RefObject<HTMLElement>;
  open: boolean;
  children: ReactNode;
  className?: string;
}

// Fixes the round-2 verification finding: VehicleSearchSelect/
// DriverSearchSelect used to render their result <ul> as a normal
// absolutely-positioned child, which put it inside whatever ancestor
// happens to have overflow-hidden (every Card in the design system does,
// to clip its own rounded corners) — with more than ~1-2 results the list
// was silently clipped, with no scrollbar or visual cue. Confirmed via a
// DOM clip-boundary measurement, not just a screenshot.
//
// Rendering into a portal at document.body sidesteps every ancestor's
// overflow/stacking context entirely. Position is computed from the
// anchor's own bounding rect and kept in sync on scroll/resize while open
// — simpler than trying to make every Card usage overflow-visible, which
// would just move the clipping problem to whichever ancestor clips next.
export function PortalDropdown({ anchorRef, open, children, className = '' }: PortalDropdownProps) {
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    if (!open) return;

    function updatePosition() {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.bottom + 4, left: r.left, width: r.width });
    }

    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open, anchorRef]);

  if (!open || !rect) return null;

  return createPortal(
    <div
      style={{ position: 'fixed', top: rect.top, left: rect.left, width: rect.width, zIndex: 9999 }}
      className={className}
    >
      {children}
    </div>,
    document.body,
  );
}
