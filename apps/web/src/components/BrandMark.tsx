// The «ضبط الوقود» symbol (design/design_handoff_fuel_control_system/logo,
// direction 1a). Registration pivot, phase 3: replaces the hand-drawn
// placeholder mark. Variants per logo/README.md — 'color' on white/light
// backgrounds, 'white' on teal. The drawn Arabic wordmark isn't designed
// yet, so the name beside the symbol stays in Cairo text.
// Minimum on-screen size is 16 px; the symbol keeps its own clear space.
export function BrandMark({ size = 34, variant = 'color' }: { size?: number; variant?: 'color' | 'white' }) {
  return (
    <img
      src={`/brand/dabt-alwaqud-symbol-${variant}.svg`}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      className="shrink-0"
      style={{ minWidth: 16, minHeight: 16 }}
    />
  );
}
