import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from './apiClient';

// A lookup list (companies, routes, vehicle types, ...) is capped at 200 rows by
// the API. Almost always the whole list is shown; when the cap is reached the
// screen says «اكتب للبحث» and the typed text goes to the server as `q`.
export const LOOKUP_CAP = 200;

export function useLookup<T extends { id: string; name: string }>(path: string, key: string, enabled = true) {
  const [q, setQ] = useState('');
  const query = useQuery({
    queryKey: [key, 'lookup', q.trim()],
    enabled,
    placeholderData: (prev) => prev,
    queryFn: async () => (await apiClient.get<T[]>(path, { params: q.trim() ? { q: q.trim() } : undefined })).data,
  });
  const items = query.data ?? [];
  // Capped: the list stopped at the cap (or a search is already narrowing it).
  const capped = items.length >= LOOKUP_CAP || q.trim() !== '';
  return { items, q, setQ, capped, isLoading: query.isLoading, query };
}

export function LookupSearch({
  q,
  onChange,
  capped,
  id,
}: {
  q: string;
  onChange: (value: string) => void;
  capped: boolean;
  id: string;
}) {
  if (!capped) return null;
  return (
    <div className="mt-2">
      <label htmlFor={id} className="mb-1 block text-[14px] font-bold text-ink-soft lg:text-[12px]">
        اكتب للبحث
      </label>
      <input
        id={id}
        type="search"
        value={q}
        onChange={(e) => onChange(e.target.value)}
        className="h-[44px] w-full rounded-sm border border-line bg-surface-alt px-3 text-[16px] text-ink focus:outline-none focus:ring-2 focus:ring-primary-dark lg:text-[14px]"
      />
    </div>
  );
}
