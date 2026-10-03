import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import {
  formatLicensePlate,
  formatPlateAsTyped,
  formatPlateOnBlur,
  LICENSE_PLATE_DISPLAY_EXAMPLE,
  normalizePlateSearchTerm,
} from '../../lib/libyanFormats';
import { LtrText } from '../../components/LtrText';
import { PortalDropdown } from '../../components/PortalDropdown';
import { VehicleBrandLogo } from '../../components/VehicleBrandLogo';

interface VehicleOption {
  id: string;
  internalCode: string;
  currentPlate: string;
  model: string | null;
}

interface VehicleSearchSelectProps {
  value: string;
  onChange: (vehicleId: string, label: string) => void;
  // Set when `value` arrives already resolved from outside this component
  // (e.g. a vehicle already picked on another wizard step) — without
  // this the input shows the empty placeholder even though `value` is a
  // real vehicleId, since `query` is otherwise only ever set by this
  // component's own onClick handler below. Same gap DriverSearchSelect
  // already had a fix for.
  initialLabel?: string;
  // Exposes the raw typed text upward — the "مركبة جديدة" button needs to
  // know whether the user has typed anything yet before it's enabled
  // (round 4 feedback: it shouldn't be clickable against an empty field).
  onQueryChange?: (query: string) => void;
}

// GET /vehicles?search= ORs internalCode and currentPlate server-side — a
// debounced live query against it, since the vehicle registry can plausibly
// be large (unlike drivers, see DriverSearchSelect's different approach).
// The typed term is normalized the same way a plate is displayed elsewhere
// in the app (formatLicensePlate adds spaces around the dash) so pasting
// back exactly what's shown on, say, the vehicle detail page still matches
// the unspaced stored value.
export function VehicleSearchSelect({ value, onChange, initialLabel, onQueryChange }: VehicleSearchSelectProps) {
  const [query, setQuery] = useState(initialLabel ? formatLicensePlate(initialLabel) : '');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    onQueryChange?.(query);
    // The displayed value stays raw/unformatted while there's no dash yet
    // (so the user can still type a 2-digit city code) — but the SEARCH
    // term is always the best-guess formatted one (1-digit-code fallback
    // when no dash is typed), decoupled from what's shown in the box, so
    // live matching-as-you-type keeps working for the common case without
    // fighting the user's ability to type a longer code.
    const timer = setTimeout(() => setDebounced(normalizePlateSearchTerm(formatPlateOnBlur(query))), 300);
    return () => clearTimeout(timer);
  }, [query]); // eslint intentionally not asked for onQueryChange here — it's an unmemoized callback prop

  // Form reset (after a successful submit) clears value externally — mirror
  // that by clearing the picker's own text too. A vehicle resolved from
  // outside (inline creation) instead sets the display text to its plate.
  useEffect(() => {
    if (!value) {
      setQuery('');
    } else if (initialLabel) {
      setQuery(formatLicensePlate(initialLabel));
    }
    // Only re-run when `value` changes (a new vehicleId arriving) — not on
    // every initialLabel re-render, so subsequent typing/picking here
    // isn't stomped. Same reasoning as DriverSearchSelect's identical effect.
  }, [value]);

  const { data: results, isFetching } = useQuery({
    queryKey: ['vehicles', 'search', debounced],
    queryFn: async () =>
      (
        await apiClient.get<VehicleOption[]>('/vehicles', {
          params: { search: debounced, take: 10 },
        })
      ).data,
    enabled: debounced.length > 0,
  });

  return (
    <div className="relative">
      <input
        ref={inputRef}
        data-testid="vehicle-search-input"
        value={query}
        onChange={(e) => {
          setQuery(formatPlateAsTyped(e.target.value));
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setQuery((q) => formatPlateOnBlur(q));
          setTimeout(() => setOpen(false), 150);
        }}
        // Round 5 feedback: the placeholder previously repeated the
        // instructional label text ("ابحث برقم اللوحة أو الرمز الداخلي")
        // but rendered in the same large/bold plate-numeral styling as a
        // real typed plate — reading as a rendering mistake, not a hint.
        // Client's own recommended fix: make the placeholder look like an
        // example plate shape instead, which both fits the bold styling
        // naturally and doubles as an implicit format hint.
        placeholder="8-xxxxxxxx"
        dir="ltr"
        className="h-12 w-full rounded-sm border border-line bg-surface-alt px-3 text-end font-mono text-[20px] font-extrabold text-primary-dark placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent"
      />
      <p className="mt-1 text-[11px] text-ink-soft">
        مثال: <LtrText>{LICENSE_PLATE_DISPLAY_EXAMPLE}</LtrText>
      </p>
      <PortalDropdown
        anchorRef={inputRef}
        open={open && debounced.length > 0}
        className="max-h-48 overflow-auto rounded-sm border border-line bg-surface shadow-md"
      >
        <ul>
          {isFetching && <li className="px-3 py-2 text-[12.5px] text-ink-soft">...جارٍ البحث</li>}
          {/* Registration pivot, phase 2: no "add new vehicle" here any
              more — petrol stations never register vehicles. */}
          {!isFetching && results?.length === 0 && (
            <li className="px-3 py-2 text-[12.5px] text-ink-soft" data-testid="vehicle-search-not-registered">
              لا توجد مركبة مسجّلة بهذه البيانات — التسجيل في مكاتب التسجيل فقط
            </li>
          )}
          {results?.map((vehicle) => (
            <li key={vehicle.id}>
              <button
                type="button"
                data-testid="vehicle-search-option"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(vehicle.id, vehicle.currentPlate);
                  setQuery(formatLicensePlate(vehicle.currentPlate));
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-start text-[12.5px] hover:bg-surface-alt"
              >
                <VehicleBrandLogo model={vehicle.model} size={24} />
                <span>
                  <LtrText>{formatLicensePlate(vehicle.currentPlate)}</LtrText> — {vehicle.internalCode}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </PortalDropdown>
    </div>
  );
}
