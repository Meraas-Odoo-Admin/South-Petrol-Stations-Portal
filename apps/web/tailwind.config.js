/** @type {import('tailwindcss').Config} */
// Design tokens from design/design-system-notes.md — applied to new/touched
// screens per the priority order (functional completeness first, a full
// conformance pass over already-working screens comes later).
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#0D5C52', dark: '#0A4841', 100: '#E3EFEC' },
        // mid: the far end of the amber button gradient (Phase 5C) - Ink text on it
        // is 5.4:1; on accent-dark it was 4.4:1.
        // ink: amber-family TEXT on white or on the tint (6.2:1 on the tint); dark stays
        // for fills and borders, where it is below 4.5:1 as text.
        accent: { DEFAULT: '#E8A53D', mid: '#C98A22', dark: '#B97A1A', ink: '#7A4F0B', 100: '#FBEDD4' },
        danger: { DEFAULT: '#C1462D', dark: '#8F3120', 100: '#FBE6E0' },
        ok: { DEFAULT: '#1F7A5C', 100: '#E2F2EA' },
        // Phase 6 (B1): the page is a cool grey-teal, no longer beige, so a white card
        // reads as a different surface; line is a 3:1 boundary colour (inputs, cards,
        // tabs); line-soft is for decorative row hairlines only.
        paper: '#E4EBE9',
        surface: '#FFFFFF',
        'surface-alt': '#F1F5F4',
        ink: { DEFAULT: '#132524', soft: '#475957', faint: '#566866' },
        line: '#6A7C79',
        'line-soft': '#CBD5D2',
      },
      fontFamily: {
        sans: ['Cairo', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      borderRadius: {
        sm: '10px',
        md: '16px',
        lg: '24px',
      },
      boxShadow: {
        sm: '0 1px 2px rgba(19,37,36,.06), 0 1px 1px rgba(19,37,36,.04)',
        md: '0 8px 24px -8px rgba(19,37,36,.18)',
        lg: '0 20px 48px -12px rgba(19,37,36,.28)',
        glow: '0 4px 16px -2px rgba(232,165,61,.45)',
      },
      // Round 16 (UX/motion pass): a small, shared vocabulary of entrance/
      // feedback animations — used for card grids and table rows so the
      // app reads as responsive rather than static, without reaching for
      // an animation library. Kept subtle (150-420ms, small offsets) per
      // the existing design system's restrained tone.
      keyframes: {
        fadeInUp: { '0%': { opacity: '0', transform: 'translateY(6px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        scaleIn: { '0%': { opacity: '0', transform: 'scale(.97)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
        pulseSoft: { '0%,100%': { opacity: '1' }, '50%': { opacity: '.55' } },
      },
      animation: {
        'fade-in-up': 'fadeInUp .38s ease-out both',
        'fade-in': 'fadeIn .3s ease-out both',
        'scale-in': 'scaleIn .2s ease-out both',
        'pulse-soft': 'pulseSoft 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
