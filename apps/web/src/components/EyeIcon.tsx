// Round 14: extracted from LoginPage (previously duplicated there and in
// OwnerIdentityReveal with inconsistent size AND, in OwnerIdentityReveal's
// case, inverted meaning — this is the one true mapping now). `open=true`
// means "the real value is currently visible" and renders the plain open
// eye (the standard convention: open eye = can see it); `open=false`
// renders the slashed/closed eye = hidden. Every show/hide-password or
// show/hide-identity-number toggle in the app uses this.
export function EyeIcon({ open, size = 19 }: { open: boolean; size?: number }) {
  return open ? (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  ) : (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 3l18 18M10.6 10.6a2.6 2.6 0 0 0 3.6 3.6M9.4 5.5A10.6 10.6 0 0 1 12 5c6.5 0 10 6 10 6a13.6 13.6 0 0 1-3.1 3.7M6.6 6.6C4 8.3 2 11 2 11s3.5 6 10 6c1 0 1.9-.14 2.8-.4" />
    </svg>
  );
}
