// Extracted from Layout.tsx (round 16) so other screens — HomePage's quick-
// link cards, list-page KPI strips — can reuse the exact same icon set
// instead of duplicating SVG path data or inventing a second, inconsistent
// icon language.
export function Icon({ d, size = 19 }: { d: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

export const ICONS = {
  home: 'M4 21V10.5L12 4l8 6.5V21h-5v-7H9v7H4Z',
  dashboard: 'M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6V11h-6v9Zm0-16v5h6V4h-6Z',
  fillup:
    'M4 21V8a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v13M2 21h14m3-13 2.5 2.5a1.5 1.5 0 0 1 .5 1.1V18a1.5 1.5 0 0 1-3 0v-3.5M8 8V4M4 12h8',
  vehicles:
    'M3 13l1.6-5A2 2 0 0 1 6.5 6.5h11a2 2 0 0 1 1.9 1.5L21 13v6a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H6v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6Z',
  violations:
    'M12 9v4m0 4h.01M10.3 3.9 2.4 18a1.8 1.8 0 0 0 1.6 2.7h16a1.8 1.8 0 0 0 1.6-2.7L13.7 3.9a1.8 1.8 0 0 0-3.4 0Z',
  changeRequests: 'M9 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3M9 15h3l8-8a2 2 0 0 0-3-3l-8 8v3Z',
  reports: 'M8 7h8M8 12h8M8 17h5M4 4h16v16H4V4Z',
  stations: 'M4 21V8l8-5 8 5v13M9 21v-6h6v6M4 21h16',
  admin:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 1-.1 1.3l2 1.6-2 3.4-2.4-1a7 7 0 0 1-2.2 1.3l-.4 2.5H9.7l-.4-2.5a7 7 0 0 1-2.2-1.3l-2.4 1-2-3.4 2-1.6a7.4 7.4 0 0 1 0-2.6l-2-1.6 2-3.4 2.4 1a7 7 0 0 1 2.2-1.3L9.7 2h4.6l.4 2.5a7 7 0 0 1 2.2 1.3l2.4-1 2 3.4-2 1.6c.07.4.1.9.1 1.2Z',
  // Registration pivot, phase 2 — an ID card, for vehicle registration.
  register: 'M3 6h18v12H3V6Zm4 4h5M7 14h7M16.5 10.5a1.5 1.5 0 1 1 0 .01',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6 6 18',
  lock: 'M6 11V8a6 6 0 0 1 12 0v3M5 11h14v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-9Zm7 5v2',
  logout: 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3',
  fuel: 'M4 21V8a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v13M2 21h14m3-13 2.5 2.5a1.5 1.5 0 0 1 .5 1.1V18a1.5 1.5 0 0 1-3 0v-3.5M8 8V4M4 12h8',
  building: 'M4 21V8l8-5 8 5v13M9 21v-6h6v6M4 21h16',
  // Phase 4b — accounts screens.
  check: 'M5 12.5l4.5 4.5L19 7.5',
  copy: 'M9 9h10v11H9V9Zm-4 6V4h10',
  plus: 'M12 5v14M5 12h14',
  people:
    'M16 19v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm9 8v-1a4 4 0 0 0-3-3.9M15 4.3a3.5 3.5 0 0 1 0 6.4',
  // Points to the reading-start side (right in RTL): "back".
  arrowBack: 'M5 12h14M13 6l6 6-6 6',
  // Points left: «next» in a right-to-left layout.
  arrowNext: 'M19 12H5M11 6l-6 6 6 6',
  chevronDown: 'M6 9l6 6 6-6',
  filter: 'M4 5h16l-6 8v6l-4-2v-4L4 5Z',
  bell: 'M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9Zm4 9.5a2 2 0 0 0 4 0',
} as const;
