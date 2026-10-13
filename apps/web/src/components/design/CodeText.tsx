import type { ReactNode } from 'react';
import { LtrText } from '../LtrText';

// design/.../dc.html `.code` class: mono, 11px, ink-faint, tracking. Used
// for every literal system code (plate, internal code, rule id, DB
// setting key) — design-system-notes.md: "Every code is paired with its
// Arabic meaning next to it — never shown alone," so this is meant to sit
// beside an Arabic label, not replace one.
// size="md" is for the phase 4b screens: 13px on a phone, 12px on a desktop,
// in Ink Soft (5.5:1 on white) instead of Ink Faint (2.7:1), so a username or
// a station code can be read in sunlight.
export function CodeText({ children, size = "sm" }: { children: ReactNode; size?: "sm" | "md" }) {
  return (
    <LtrText>
      <span
        className={
          size === "md"
            ? "font-mono text-[13px] tracking-wide text-ink-soft lg:text-[12px]"
            : "font-mono text-[13px] lg:text-[12px] tracking-wide text-ink-faint"
        }
      >
        {children}
      </span>
    </LtrText>
  );
}
