import type { ReactNode } from 'react';
import { LtrText } from '../LtrText';

// design/.../dc.html `.code` class: mono, 11px, ink-faint, tracking. Used
// for every literal system code (plate, internal code, rule id, DB
// setting key) — design-system-notes.md: "Every code is paired with its
// Arabic meaning next to it — never shown alone," so this is meant to sit
// beside an Arabic label, not replace one.
export function CodeText({ children }: { children: ReactNode }) {
  return (
    <LtrText>
      <span className="font-mono text-[11px] tracking-wide text-ink-faint">{children}</span>
    </LtrText>
  );
}
