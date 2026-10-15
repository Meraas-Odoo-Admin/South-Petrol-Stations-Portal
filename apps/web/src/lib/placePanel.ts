// Where a popup panel (a calendar, a search list) goes for the field it opens
// from (Phase 7, 4.3): under the field, or above it when there is more room
// there; aligned with the field's start side (its right edge in RTL); at least
// as wide as the panel needs; and always EDGE px inside the screen, on a
// desktop and at 390 px alike. Pure, so the rules are tested in one place.

export const PANEL_EDGE = 12;
export const PANEL_GAP = 4;

export interface AnchorRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
}

export function placePanel(
  anchor: AnchorRect,
  panel: { width: number; height: number },
  viewport: { width: number; height: number },
  rtl: boolean,
): { top: number; left: number; width: number } {
  const width = Math.min(Math.max(anchor.width, panel.width), viewport.width - PANEL_EDGE * 2);
  let left = rtl ? anchor.right - width : anchor.left;
  left = Math.min(Math.max(left, PANEL_EDGE), viewport.width - PANEL_EDGE - width);
  let top = anchor.bottom + PANEL_GAP;
  const roomBelow = viewport.height - PANEL_EDGE - top;
  const roomAbove = anchor.top - PANEL_GAP - PANEL_EDGE;
  if (panel.height > roomBelow && roomAbove > roomBelow) {
    top = Math.max(PANEL_EDGE, anchor.top - PANEL_GAP - panel.height);
  }
  return { top, left, width };
}
