import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';

interface DriverOption {
  id: string;
  fullName: string;
  identityNumber: string;
}

interface DriverSearchSelectProps {
  value: string;
  onChange: (driverId: string, label: string) => void;
  // Set when `value` arrives already resolved from outside this component
  // (e.g. a driver just created inline via DriverCreateForm) — without
  // this, the input shows the empty placeholder even though `value` is a
  // real driverId, since `query` (the visible text) is only ever set by
  // this component's own onClick handler below. Found during item 5's
  // live click-through as station_employee: the driver was genuinely
  // selected (no validation error) but looked unselected on screen.
  initialLabel?: string;
}

// Unlike VehicleSearchSelect, GET /drivers has no server-side name filter
// (PaginationQueryDto only — skip/take), so this fetches one page (the
// pagination cap, 100) and filters client-side as the employee types. Fine
// for the current registry size; would need a real backend search param if
// the driver list grows well past that.
export function DriverSearchSelect({ value, onChange, initialLabel }: DriverSearchSelectProps) {
  const [query, setQuery] = useState(initialLabel ?? '');
  const [open, setOpen] = useState(false);

  const { data: drivers, isLoading } = useQuery({
    queryKey: ['drivers', 'search-pool'],
    queryFn: async () => (await apiClient.get<DriverOption[]>('/drivers', { params: { take: 100 } })).data,
  });

  const filtered = useMemo(() => {
    if (!drivers) return [];
    const needle = query.trim();
    if (!needle) return drivers.slice(0, 10);
    return drivers.filter((d) => d.fullName.includes(needle)).slice(0, 10);
  }, [drivers, query]);

  useEffect(() => {
    if (!value) {
      setQuery('');
    } else if (initialLabel) {
      setQuery(initialLabel);
    }
    // Only re-run when `value` changes (a new driverId arriving) — not on
    // every initialLabel re-render, so the user's own typing/picking here
    // afterward isn't stomped.
  }, [value]);

  return (
    <div className="relative">
      <input
        data-testid="driver-search-input"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="ابحث باسم السائق"
        className="w-72 rounded border border-slate-300 px-2 py-1"
      />
      {open && (
        <ul className="absolute z-10 mt-1 max-h-48 w-72 overflow-auto rounded border border-slate-300 bg-white shadow">
          {isLoading && <li className="px-2 py-1 text-sm text-slate-500">...جارٍ التحميل</li>}
          {!isLoading && filtered.length === 0 && (
            <li className="px-2 py-1 text-sm text-slate-500">لا توجد نتائج</li>
          )}
          {filtered.map((driver) => (
            <li key={driver.id}>
              <button
                type="button"
                data-testid="driver-search-option"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(driver.id, driver.fullName);
                  setQuery(driver.fullName);
                  setOpen(false);
                }}
                className="block w-full px-2 py-1 text-start text-sm hover:bg-slate-100"
              >
                {driver.fullName}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
