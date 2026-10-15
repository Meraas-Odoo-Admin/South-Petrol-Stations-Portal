import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { PANEL_GAP as GAP, placePanel } from '../lib/placePanel';

interface PortalDropdownProps {
  anchorRef: RefObject<HTMLElement>;
  open: boolean;
  children: ReactNode;
  className?: string;
  /** The panel is at least this wide (px), even under a narrower field. */
  minWidth?: number;
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
//
// Phase 7 (4.3): the panel used to take the anchor's left edge and width, so a
// calendar wider than its field ran off the left of the screen in RTL. It now
// starts at the anchor's start side, is as wide as its content needs
// (`minWidth`), stays inside the screen on desktop and at 390 px, and opens
// upward when there is no room below.
export function PortalDropdown({ anchorRef, open, children, className = '', minWidth = 0 }: PortalDropdownProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    if (!open) {
      setAnchor(null);
      setPosition(null);
      return;
    }

    function updateAnchor() {
      const el = anchorRef.current;
      if (el) setAnchor(el.getBoundingClientRect());
    }

    updateAnchor();
    window.addEventListener('scroll', updateAnchor, true);
    window.addEventListener('resize', updateAnchor);
    return () => {
      window.removeEventListener('scroll', updateAnchor, true);
      window.removeEventListener('resize', updateAnchor);
    };
  }, [open, anchorRef]);

  // Measured after the panel is in the page, before the browser paints it.
  useLayoutEffect(() => {
    if (!anchor) return;
    const height = panelRef.current?.offsetHeight ?? 0;
    const rtl = (document.documentElement.dir || getComputedStyle(document.documentElement).direction) === 'rtl';
    setPosition(
      placePanel(anchor, { width: minWidth, height }, { width: window.innerWidth, height: window.innerHeight }, rtl),
    );
  }, [anchor, minWidth]);

  if (!open || !anchor) return null;

  return createPortal(
    <div
      ref={panelRef}
      data-portal-dropdown=""
      style={{
        position: 'fixed',
        top: position?.top ?? anchor.bottom + GAP,
        left: position?.left ?? anchor.left,
        width: position?.width ?? Math.max(anchor.width, minWidth),
        zIndex: 9999,
        visibility: position ? 'visible' : 'hidden',
      }}
      className={className}
    >
      {children}
    </div>,
    document.body,
  );
}
