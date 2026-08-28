import type { ReactNode } from 'react';

// This is an RTL app (dir="rtl" on <html>). A plain "number - number"
// string like a formatted plate ("5 - 1658968") gets visually bidi-
// reordered by the browser when rendered as ordinary text inside RTL flow
// (confirmed: it rendered as "1658968 - 5"). dir="ltr" pins its visual
// order regardless of surrounding context — the standard fix for
// numeric/code-like content in an RTL UI. This is a rendering concern,
// not something a pure string formatter like formatLicensePlate can fix.
export function LtrText({ children }: { children: ReactNode }) {
  return (
    <span dir="ltr" className="inline-block">
      {children}
    </span>
  );
}
