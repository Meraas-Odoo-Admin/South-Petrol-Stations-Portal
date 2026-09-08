// Round 14: extracted from LoginPage (it was defined there only, private
// to that file) so ChangePasswordPage can share the exact same identity
// mark instead of appearing as a plainer, unbranded page right after the
// polished login screen — same auth flow, same visual identity.
export function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none">
      <circle cx="28" cy="28" r="20" stroke="#0d5c52" strokeWidth="4" />
      <line x1="28" y1="9" x2="28" y2="17" stroke="#0d5c52" strokeWidth="4" strokeLinecap="round" />
      <line x1="28" y1="28" x2="39" y2="20" stroke="#e8a53d" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
