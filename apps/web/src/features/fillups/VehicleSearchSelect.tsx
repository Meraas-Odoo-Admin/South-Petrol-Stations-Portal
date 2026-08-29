import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import {
  formatLicensePlate,
  LICENSE_PLATE_DISPLAY_EXAMPLE,
  normalizePlateSearchTerm,
} from '../../lib/libyanFormats';
import { LtrText } from '../../components/LtrText';
import { PortalDropdown } from '../../components/PortalDropdown';

interface VehicleOption {
  id: string;
  internalCode: string;
  currentPlate: string;
}

interface VehicleSearchSelectProps {
  value: string;
  onChange: (vehicleId: string, label: string) => void;
  // Set when `value` arrives already resolved from outside this component
  // (e.g. a vehicle just created inline via VehicleCreateForm) — without
  // this the input shows the empty placeholder even though `value` is a
  // real vehicleId, since `query` is otherwise only ever set by this
  // component's own onClick handler below. Same gap DriverSearchSelect
  // already had a fix for.
  initialLabel?: string;
}

// GET /vehicles?search= ORs internalCode and currentPlate server-side — a
// debounced live query against it, since the vehicle registry can plausibly
// be large (unlike drivers, see DriverSearchSelect's different approach).
// The typed term is normalized the same way a plate is displayed elsewhere
// in the app (formatLicensePlate adds spaces around the dash) so pasting
// back exactly what's shown on, say, the vehicle detail page still matches
// the unspaced stored value.
export function VehicleSearchSelect({ value, onChange, initialLabel }: VehicleSearchSelectProps) {
  const [query, setQuery] = useState(initialLabel ? formatLicensePlate(initialLabel) : '');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(normalizePlateSearchTerm(query)), 300);
    return () => clearTimeout(timer);
  }, [query]);

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
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="ابحث برقم اللوحة أو الرمز الداخلي"
        dir="ltr"
        className="h-11 w-full rounded-sm border border-line bg-surface-alt px-3 text-end text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent"
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
          {!isFetching && results?.length === 0 && (
            <li className="px-3 py-2 text-[12.5px] text-ink-soft">لا توجد نتائج</li>
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
                className="block w-full px-3 py-2 text-start text-[12.5px] hover:bg-surface-alt"
              >
                <LtrText>{formatLicensePlate(vehicle.currentPlate)}</LtrText> — {vehicle.internalCode}
              </button>
            </li>
          ))}
        </ul>
      </PortalDropdown>
    </div>
  );
}
