import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import {
  formatLicensePlate,
  LICENSE_PLATE_DISPLAY_EXAMPLE,
  normalizePlateSearchTerm,
} from '../../lib/libyanFormats';
import { LtrText } from '../../components/LtrText';

interface VehicleOption {
  id: string;
  internalCode: string;
  currentPlate: string;
}

interface VehicleSearchSelectProps {
  value: string;
  onChange: (vehicleId: string, label: string) => void;
}

// GET /vehicles?search= ORs internalCode and currentPlate server-side — a
// debounced live query against it, since the vehicle registry can plausibly
// be large (unlike drivers, see DriverSearchSelect's different approach).
// The typed term is normalized the same way a plate is displayed elsewhere
// in the app (formatLicensePlate adds spaces around the dash) so pasting
// back exactly what's shown on, say, the vehicle detail page still matches
// the unspaced stored value.
export function VehicleSearchSelect({ value, onChange }: VehicleSearchSelectProps) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(normalizePlateSearchTerm(query)), 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Form reset (after a successful submit) clears value externally — mirror
  // that by clearing the picker's own text too.
  useEffect(() => {
    if (!value) {
      setQuery('');
    }
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
        className="w-72 rounded border border-slate-300 px-2 py-1 text-end"
      />
      <p className="mt-1 text-xs text-slate-500">
        مثال: <LtrText>{LICENSE_PLATE_DISPLAY_EXAMPLE}</LtrText>
      </p>
      {open && debounced.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-48 w-72 overflow-auto rounded border border-slate-300 bg-white shadow">
          {isFetching && <li className="px-2 py-1 text-sm text-slate-500">...جارٍ البحث</li>}
          {!isFetching && results?.length === 0 && (
            <li className="px-2 py-1 text-sm text-slate-500">لا توجد نتائج</li>
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
                className="block w-full px-2 py-1 text-start text-sm hover:bg-slate-100"
              >
                <LtrText>{formatLicensePlate(vehicle.currentPlate)}</LtrText> — {vehicle.internalCode}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
