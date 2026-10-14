import { useEffect, useState } from 'react';
import { LookupSearch, useLookup } from '../../lib/useLookup';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { STATION_STATUS_LABELS, STATION_STATUS_VARIANT } from '../../lib/labels';
import { usePageParam } from '../../lib/usePageParam';
import { Card } from '../../components/design/Card';
import { CodeText } from '../../components/design/CodeText';
import { StatusPill } from '../../components/design/StatusPill';
import { Icon, ICONS } from '../../components/icons';
import { Pagination } from '../../components/Pagination';
import { Notice } from '../users/parts';
import { OFFICE_STATUS_LABELS, OFFICE_STATUS_VARIANT, type OfficeStatus } from './placesShared';

// One list of the petrol stations and registration offices of ONE
// municipality: a type filter, search, status / company / locality filters and
// sortable columns, 25 rows a page. The server does the searching, filtering,
// sorting and paging (GET /municipalities/:id/places); the page number is in
// the address.

export const PLACES_PAGE_SIZE = 25;

export interface PlaceListRow {
  kind: 'STATION' | 'OFFICE';
  id: string;
  code: string;
  name: string;
  number: string | null;
  company: string | null;
  locality: string | null;
  status: string;
  archivedAt: string | null;
  address: string | null;
}
interface PlacesPage {
  total: number;
  skip: number;
  take: number;
  items: PlaceListRow[];
}

type SortKey = 'name' | 'code' | 'type' | 'status' | 'company' | 'locality';

const FIELD =
  'h-[52px] w-full rounded-sm border border-line bg-surface-alt px-3 text-[16px] text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface lg:h-11 lg:text-[14px]';

const STATUS_CHOICES: Array<{ value: string; label: string }> = [
  ...Object.entries(STATION_STATUS_LABELS).map(([value, label]) => ({ value, label: `${label} (محطة)` })),
  ...Object.entries(OFFICE_STATUS_LABELS)
    .filter(([value]) => value !== 'ACTIVE')
    .map(([value, label]) => ({ value, label: `${label} (مكتب)` })),
  { value: 'ARCHIVED', label: 'مؤرشف' },
];

export function placeStatus(row: PlaceListRow): { label: string; variant: 'ok' | 'neutral' | 'danger' | 'accent' } {
  if (row.archivedAt) return { label: 'مؤرشف', variant: 'neutral' };
  if (row.kind === 'STATION') {
    return { label: STATION_STATUS_LABELS[row.status] ?? row.status, variant: STATION_STATUS_VARIANT[row.status] ?? 'neutral' };
  }
  const key = row.status as OfficeStatus;
  return { label: OFFICE_STATUS_LABELS[key] ?? row.status, variant: OFFICE_STATUS_VARIANT[key] ?? 'neutral' };
}

export function placeLink(row: PlaceListRow): string {
  return row.kind === 'STATION' ? `/manage/stations/${row.id}` : `/manage/offices/${row.id}`;
}

function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function PlacesList({ municipalityId, emptyHint }: { municipalityId: string; emptyHint?: string }) {
  const { skip, setSkip, reset } = usePageParam(PLACES_PAGE_SIZE);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'' | 'STATION' | 'OFFICE'>('');
  const [status, setStatus] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [locality, setLocality] = useState('');
  const [sort, setSort] = useState<SortKey>('code');
  const [dir, setDir] = useState<'asc' | 'desc'>('asc');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const dq = useDebounced(q);
  const dlocality = useDebounced(locality);

  // Any change of what is asked starts again from the first page.
  const asked = JSON.stringify({ dq, kind, status, companyId, dlocality, sort, dir });
  const [lastAsked, setLastAsked] = useState(asked);
  useEffect(() => {
    if (asked !== lastAsked) {
      setLastAsked(asked);
      reset();
    }
  }, [asked, lastAsked, reset]);

  const companyLookup = useLookup<{ id: string; name: string }>('/companies', 'companies');
  const companies = { data: companyLookup.items };

  const params = {
    skip,
    take: PLACES_PAGE_SIZE,
    kind: kind || undefined,
    q: dq.trim() || undefined,
    status: status || undefined,
    companyId: companyId || undefined,
    locality: dlocality.trim() || undefined,
    sort,
    dir,
  };
  const query = useQuery({
    queryKey: ['municipalities', 'places', municipalityId, params],
    queryFn: async () => (await apiClient.get<PlacesPage>(`/municipalities/${municipalityId}/places`, { params })).data,
    placeholderData: (prev) => prev,
  });
  const rows = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const activeFilters = [kind, status, companyId, locality.trim()].filter(Boolean).length;

  function sortBy(key: SortKey) {
    if (sort === key) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSort(key);
      setDir('asc');
    }
  }
  function clearAll() {
    setQ('');
    setKind('');
    setStatus('');
    setCompanyId('');
    setLocality('');
  }

  const Header = ({ k, children }: { k: SortKey; children: string }) => (
    <th
      scope="col"
      aria-sort={sort === k ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className="px-[18px] py-2.5 text-start"
    >
      <button
        type="button"
        onClick={() => sortBy(k)}
        className="inline-flex min-h-[32px] items-center gap-1 rounded font-bold hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {children}
        <span aria-hidden="true" className="text-[12px]">
          {sort === k ? (dir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  );

  return (
    <Card data-testid="places-list">
      <div className="space-y-3 p-4 lg:p-[18px]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="relative flex-1">
            <label htmlFor="pl-search" className="mb-1.5 block text-[14px] font-bold text-ink lg:text-[12px]">
              بحث بالاسم أو الرمز أو الرقم أو العنوان
            </label>
            <span className="pointer-events-none absolute bottom-0 start-3.5 flex h-[52px] items-center text-ink-faint lg:h-11">
              <Icon d={ICONS.search} size={18} />
            </span>
            <input
              id="pl-search"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className={`${FIELD} ps-11`}
            />
          </div>
          <button
            type="button"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((o) => !o)}
            className="flex h-12 items-center justify-center gap-2 rounded-full bg-surface-alt px-5 text-[16px] font-bold text-ink-soft hover:bg-primary-100 hover:text-primary lg:hidden"
          >
            <Icon d={ICONS.filter} size={18} />
            تصفية{activeFilters > 0 ? ` (${activeFilters})` : ''}
          </button>
        </div>

        <div className={`${filtersOpen ? 'grid' : 'hidden'} gap-3 sm:grid-cols-2 lg:grid lg:grid-cols-4`}>
          <div>
            <label htmlFor="pl-kind" className="mb-1.5 block text-[14px] font-bold text-ink lg:text-[12px]">النوع</label>
            <select id="pl-kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className={FIELD}>
              <option value="">الكل</option>
              <option value="STATION">محطات وقود</option>
              <option value="OFFICE">مكاتب تسجيل</option>
            </select>
          </div>
          <div>
            <label htmlFor="pl-status" className="mb-1.5 block text-[14px] font-bold text-ink lg:text-[12px]">الحالة</label>
            <select id="pl-status" value={status} onChange={(e) => setStatus(e.target.value)} className={FIELD}>
              <option value="">العاملة وغير العاملة</option>
              {STATUS_CHOICES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="pl-company" className="mb-1.5 block text-[14px] font-bold text-ink lg:text-[12px]">الشركة</label>
            <select id="pl-company" value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={FIELD}>
              <option value="">كل الشركات</option>
              {companies.data?.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <LookupSearch id="pl-company-search" q={companyLookup.q} onChange={companyLookup.setQ} capped={companyLookup.capped} />
          </div>
          <div>
            <label htmlFor="pl-locality" className="mb-1.5 block text-[14px] font-bold text-ink lg:text-[12px]">المنطقة أو الحي</label>
            <input id="pl-locality" value={locality} onChange={(e) => setLocality(e.target.value)} className={FIELD} />
          </div>
        </div>

        {(activeFilters > 0 || q) && (
          <div className="flex items-center justify-between gap-3">
            <p role="status" className="text-[14px] text-ink-soft lg:text-[12px]">
              {total === 0 ? 'لا نتائج' : `${total.toLocaleString('en-US')} نتيجة`}
            </p>
            <button
              type="button"
              onClick={clearAll}
              className="h-11 rounded-full px-4 text-[15px] font-bold text-primary hover:bg-primary-100 lg:h-9 lg:text-[13px]"
            >
              مسح التصفية
            </button>
          </div>
        )}
      </div>

      {query.isError && (
        <div className="m-4">
          <Notice kind="error">تعذّر تحميل القائمة. تأكد من الاتصال ثم أعد المحاولة.</Notice>
        </div>
      )}
      {query.isLoading && <p className="p-4 text-[15px] text-ink-soft lg:text-[13px]">جارٍ التحميل…</p>}
      {query.data && rows.length === 0 && (
        <div className="px-4 py-10 text-center">
          <p className="text-[18px] font-extrabold text-ink lg:text-[15px]">
            {activeFilters > 0 || q ? 'لا توجد محطات أو مكاتب تطابق بحثك' : 'لا توجد محطات أو مكاتب بعد'}
          </p>
          <p className="mt-1 text-[15px] text-ink-soft lg:text-[13px]">
            {activeFilters > 0 || q ? 'غيّر كلمات البحث أو امسح التصفية.' : (emptyHint ?? 'لا توجد محطات أو مكاتب في هذه البلدية بعد.')}
          </p>
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full text-[16px] lg:text-[14px]">
              <caption className="sr-only">محطات الوقود ومكاتب التسجيل</caption>
              <thead>
                <tr className="bg-surface-alt text-[13px] font-bold text-ink-soft lg:text-[12px]">
                  <Header k="name">الاسم</Header>
                  <Header k="type">النوع</Header>
                  <Header k="company">الشركة / العنوان</Header>
                  <Header k="locality">المنطقة</Header>
                  <Header k="status">الحالة</Header>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const st = placeStatus(r);
                  return (
                    <tr key={`${r.kind}-${r.id}`} className="border-b border-line-soft last:border-0 hover:bg-surface-alt/60">
                      <td className="px-[18px] py-3">
                        <Link
                          to={placeLink(r)}
                          className="font-bold text-ink hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                          {r.name}
                        </Link>
                        <div><CodeText size="md">{r.code}</CodeText></div>
                      </td>
                      <td className="px-[18px] py-3 text-ink">{r.kind === 'STATION' ? 'محطة وقود' : 'مكتب تسجيل'}</td>
                      <td className="max-w-[260px] px-[18px] py-3 text-ink">
                        {r.kind === 'STATION'
                          ? `${r.company ?? ''}${r.number ? ` · رقم ${r.number}` : ''}`.replace(/^ · /, '')
                          : (r.address ?? '—')}
                      </td>
                      <td className="px-[18px] py-3 text-ink">{r.locality || '—'}</td>
                      <td className="px-[18px] py-3">
                        <StatusPill variant={st.variant} size="md">{st.label}</StatusPill>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <ul className="divide-y divide-line-soft lg:hidden">
            {rows.map((r) => {
              const st = placeStatus(r);
              return (
                <li key={`${r.kind}-${r.id}`}>
                  <Link
                    to={placeLink(r)}
                    className="block min-h-[88px] px-4 py-4 hover:bg-surface-alt/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
                  >
                    <p className="break-words text-[18px] font-extrabold leading-snug text-ink">{r.name}</p>
                    <CodeText size="md">{r.code}</CodeText>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <p className="text-[16px] font-bold text-primary-dark">{r.kind === 'STATION' ? 'محطة وقود' : 'مكتب تسجيل'}</p>
                      <StatusPill variant={st.variant} size="md">{st.label}</StatusPill>
                    </div>
                    {(r.kind === 'STATION' ? r.company : r.address) && (
                      <p className="mt-1 text-[15px] text-ink">{r.kind === 'STATION' ? r.company : r.address}</p>
                    )}
                    {r.locality && <p className="text-[16px] text-ink-soft">{r.locality}</p>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <Pagination skip={skip} take={PLACES_PAGE_SIZE} total={total} onSkipChange={setSkip} alwaysShow={total > 0} testId="places-pager" />
    </Card>
  );
}
