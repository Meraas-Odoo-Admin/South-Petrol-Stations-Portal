import { useMemo, useRef, useState } from 'react';
import { PortalDropdown } from './PortalDropdown';
import {
  VEHICLE_BRANDS,
  VEHICLE_BRAND_CATEGORY_LABELS,
  type VehicleBrandCategory,
  type VehicleBrandOption,
} from '../lib/vehicleBrands';

// Round 5 feedback item 2: round 4 shipped every row with a generic
// category glyph and NO real logos AT ALL (not a bug that broke a working
// feature — there was never an attempt to render one; see
// lib/vehicleBrands.ts's header comment for the full sourcing story).
// import.meta.glob eagerly bundles every SVG under assets/brandLogos as a
// URL at build time — Vite's standard pattern for "import N files matching
// a pattern without N import statements". Real logo where `logoSlug` maps
// to one of those files; the same category glyph as before otherwise —
// still not a broken image, an honest fallback for brands the source
// dataset doesn't cover (see vehicleBrands.ts for exactly which).
const LOGO_URLS = import.meta.glob('../assets/brandLogos/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<
  string,
  string
>;

function logoUrlFor(slug: string | undefined): string | undefined {
  if (!slug) return undefined;
  return LOGO_URLS[`../assets/brandLogos/${slug}.svg`];
}

const CATEGORY_GLYPHS: Record<VehicleBrandCategory, JSX.Element> = {
  car: (
    <path d="M3 13l1.5-4.5A2 2 0 0 1 6.4 7h11.2a2 2 0 0 1 1.9 1.5L21 13v5a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H6v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5z" />
  ),
  truck: (
    <path d="M2 8h11v8H2zM13 11h4l3 3v2h-7zM5.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM16.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" />
  ),
  heavy_equipment: <path d="M3 16h4V9l4-3 4 3v7h6v3H3z" />,
  motorcycle: (
    <path d="M5 19a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM19 19a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM7 16l2-6h3l4 4h2M9 10h5" />
  ),
};

function CategoryGlyph({ category }: { category: VehicleBrandCategory }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="shrink-0">
      {CATEGORY_GLYPHS[category]}
    </svg>
  );
}

function BrandGlyph({ brand }: { brand: VehicleBrandOption }) {
  const url = logoUrlFor(brand.logoSlug);
  if (url) {
    return <img src={url} alt="" className="h-4 w-4 shrink-0 object-contain" />;
  }
  return <CategoryGlyph category={brand.category} />;
}

interface VehicleBrandPickerProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function VehicleBrandPicker({ value, onChange, className = '' }: VehicleBrandPickerProps) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const term = value.trim().toLowerCase();
    if (!term) return VEHICLE_BRANDS.slice(0, 12);
    return VEHICLE_BRANDS.filter((b) => b.name.toLowerCase().includes(term)).slice(0, 12);
  }, [value]);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="ابحث عن الماركة، أو اكتب اسمًا آخر"
        data-testid="vehicle-brand-input"
        className={className}
      />
      <PortalDropdown
        anchorRef={inputRef}
        open={open}
        className="max-h-56 overflow-auto rounded-sm border border-line bg-surface shadow-md"
      >
        <ul>
          {results.map((brand) => (
            <li key={brand.name}>
              <button
                type="button"
                data-testid="vehicle-brand-option"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(brand.name);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-start text-[12.5px] text-ink hover:bg-surface-alt"
              >
                <BrandGlyph brand={brand} />
                {brand.name}
              </button>
            </li>
          ))}
          {results.length === 0 && (
            <li className="px-3 py-2 text-[12px] text-ink-soft">
              لا توجد نتائج مطابقة — سيُحفظ ما كتبته كما هو
            </li>
          )}
          {value.trim() && !VEHICLE_BRANDS.some((b) => b.name.toLowerCase() === value.trim().toLowerCase()) && (
            <li className="border-t border-surface-alt px-3 py-2 text-[11px] text-ink-faint">
              غير مدرجة في القائمة؟ يمكن حفظ "{value.trim()}" كما هو.
            </li>
          )}
        </ul>
      </PortalDropdown>
      <p className="mt-1 text-[10.5px] text-ink-faint">
        {VEHICLE_BRAND_CATEGORY_LABELS.car} · {VEHICLE_BRAND_CATEGORY_LABELS.truck} ·{' '}
        {VEHICLE_BRAND_CATEGORY_LABELS.heavy_equipment} · {VEHICLE_BRAND_CATEGORY_LABELS.motorcycle}
      </p>
    </div>
  );
}
