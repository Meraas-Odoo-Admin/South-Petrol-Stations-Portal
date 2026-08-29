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
        accent: { DEFAULT: '#E8A53D', dark: '#B97A1A', 100: '#FBEDD4' },
        danger: { DEFAULT: '#C1462D', dark: '#8F3120', 100: '#FBE6E0' },
        ok: { DEFAULT: '#1F7A5C', 100: '#E2F2EA' },
        paper: '#F7F5EF',
        surface: '#FFFFFF',
        'surface-alt': '#EEF2EE',
        ink: { DEFAULT: '#132524', soft: '#5B6D6A', faint: '#93A19E' },
        line: '#E3E7E2',
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
    },
  },
  plugins: [],
};
