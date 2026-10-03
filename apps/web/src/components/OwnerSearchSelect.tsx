import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';
import { restrictToIdentityNumber } from '../lib/libyanFormats';
import { LtrText } from './LtrText';
import { PortalDropdown } from './PortalDropdown';

interface OwnerOption {
  id: string;
  fullName: string;
  identityNumber: string;
}

interface OwnerSearchSelectProps {
  value: string;
  onChange: (ownerId: string, label: string) => void;
  initialLabel?: string;
  className?: string;
  placeholderClassName?: string;
}

// Round 7 item 3: owner-search filter for the daily report — same
// search-by-ID-not-name precedent established for the old driver field
// (round 5), ported to GET /owners?search= (matches fullName OR
// identityNumber, see FindOwnersQueryDto). Shows the matched owner's name
// alongside their ID in results for visual confirmation before selecting,
// same reasoning as VehicleSearchSelect.
export function OwnerSearchSelect({ value, onChange, initialLabel, className, placeholderClassName }: OwnerSearchSelectProps) {
  const [query, setQuery] = useState(initialLabel ?? '');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!value) {
      setQuery('');
    } else if (initialLabel) {
      setQuery(initialLabel);
    }
  }, [value, initialLabel]);

  const { data: results, isFetching } = useQuery({
    queryKey: ['owners', 'search', debounced],
    queryFn: async () =>
      (await apiClient.get<OwnerOption[]>('/owners', { params: { search: debounced, take: 10 } })).data,
    enabled: debounced.length > 0,
  });

  return (
    <div className="relative">
      <input
        ref={inputRef}
        data-testid="owner-search-input"
        value={query}
        onChange={(e) => {
          // Digits pass through restricted to the identity-number shape,
          // but the field also accepts a name — only pre-clean if the
          // input looks like it's meant to be a pure ID (all digits so
          // far), otherwise leave free text alone.
          const raw = e.target.value;
          setQuery(/^\d*$/.test(raw) ? restrictToIdentityNumber(raw) : raw);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="اسم المالك أو رقم الهوية"
        className={className ?? placeholderClassName}
      />
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
          {results?.map((owner) => (
            <li key={owner.id}>
              <button
                type="button"
                data-testid="owner-search-option"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(owner.id, owner.fullName);
                  setQuery(owner.fullName);
                  setOpen(false);
                }}
                className="block w-full px-3 py-2 text-start text-[12.5px] hover:bg-surface-alt"
              >
                {owner.fullName} — <LtrText>{owner.identityNumber}</LtrText>
              </button>
            </li>
          ))}
        </ul>
      </PortalDropdown>
    </div>
  );
}
