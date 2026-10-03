import { VEHICLE_BRANDS } from '../lib/vehicleBrands';

// Round 14: "the car logo is an indicator of the car... when I enter the
// vehicle profile the vehicle logo should appear as the profile photo."
// Same import.meta.glob lookup VehicleBrandPicker already uses for its own
// option rows — extracted here so the vehicle DETAIL page (a "profile"
// view, not a picker) can show the same real logo as a circular avatar,
// without duplicating the glob wiring.
const LOGO_URLS = import.meta.glob('../assets/brandLogos/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<
  string,
  string
>;

function logoUrlFor(slug: string | undefined): string | undefined {
  if (!slug) return undefined;
  return LOGO_URLS[`../assets/brandLogos/${slug}.svg`];
}

// `model` is free text (VehicleCreateForm lets a user type a brand not in
// VEHICLE_BRANDS too) — match case-insensitively against the known list,
// same as how VehicleBrandPicker's own search does, and fall back to a
// generic vehicle glyph for anything unmatched rather than showing nothing.
function findBrand(model: string | null | undefined) {
  if (!model) return undefined;
  const normalized = model.trim().toLowerCase();
  return VEHICLE_BRANDS.find((b) => b.name.toLowerCase() === normalized);
}

function GenericVehicleGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-ink-faint">
      <path d="M3 13l1.6-5A2 2 0 0 1 6.5 6.5h11a2 2 0 0 1 1.9 1.5L21 13v6a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H6v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6Z" />
    </svg>
  );
}

interface VehicleBrandLogoProps {
  model: string | null | undefined;
  size?: number;
  className?: string;
}

export function VehicleBrandLogo({ model, size = 56, className = '' }: VehicleBrandLogoProps) {
  const brand = findBrand(model);
  const url = logoUrlFor(brand?.logoSlug);

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-surface-alt ${className}`}
      style={{ width: size, height: size }}
      title={model ?? undefined}
    >
      {url ? (
        <img src={url} alt={model ?? ''} className="h-[62%] w-[62%] object-contain" />
      ) : (
        <GenericVehicleGlyph />
      )}
    </div>
  );
}
