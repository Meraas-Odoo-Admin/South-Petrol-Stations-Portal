import { useEffect, useState } from 'react';
import { LookupSearch, useLookup } from '../../lib/useLookup';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { STATION_STATUS_LABELS, STATION_STATUS_VARIANT } from '../../lib/labels';
import { usePageParam } from '../../lib/usePageParam';
import { Card } from '../../components/design/Card';
import { CodeText } from '../../components/design/CodeText';
import { PillButton } from '../../components/design/PillButton';
import { SkeletonRows } from '../../components/design/Skeleton';
import { StatusPill } from '../../components/design/StatusPill';
import { TabPanel, Tabs, useTab, type TabDef } from '../../components/design/Tabs';
import { Icon, ICONS } from '../../components/icons';
import { Pagination } from '../../components/Pagination';
import { useAuth } from '../auth/AuthProvider';
import { Notice } from '../users/parts';
import { OFFICE_STATUS_LABELS, OFFICE_STATUS_VARIANT, type OfficeStatus } from './placesShared';
import { LIST_PAGE_SIZE } from '../../lib/pageSize';

// The petrol stations and the registration offices of ONE municipality.
// Phase 7 (5): two clearly named tabs, «محطات الوقود» and «مكاتب التسجيل» —
// they were one mixed list, which confused people. Each tab has its own
// columns, filters and «إضافة» button. The server does the searching,
// filtering, sorting and paging (GET /municipalities/:id/places?kind=); the
// tab (?kind=) and the page (?page=) are in the address.

export const PLACES_PAGE_SIZE = LIST_PAGE_SIZE;

export type PlaceKind = 'STATION' | 'OFFICE';

export interface PlaceListRow {
  kind: PlaceKind;
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

type SortKey = 'name' | 'code' | 'status' | 'company' | 'locality';

const FIELD =
  'h-[52px] w-full rounded-sm border border-line bg-surface-alt px-3 text-[16px] text-ink focus:outline-none focus:ring-2 focus:ring-primary-dark focus:ring-offset-2 focus:ring-offset-surface lg:h-11 lg:text-[14px]';

const STATUS_CHOICES: Record<PlaceKind, Array<{ value: string; label: string }>> = {
  STATION: [
    ...Object.entries(STATION_STATUS_LABELS).map(([value, label]) => ({ value, label })),
    { value: 'ARCHIVED', label: 'مؤرشفة' },
  ],
  OFFICE: [
    ...Object.entries(OFFICE_STATUS_LABELS).map(([value, label]) => ({ value, label })),
    { value: 'ARCHIVED', label: 'مؤرشف' },
  ],
};

const WORDS: Record<PlaceKind, { tab: string; one: string; add: string; none: string; noMatch: string; search: string; caption: string; testId: string }> = {
  STATION: {
    tab: 'محطات الوقود',
    one: 'محطة وقود',
    add: 'إضافة محطة وقود',
    none: 'لا توجد محطات وقود بعد',
    noMatch: 'لا توجد محطات تطابق بحثك',
    search: 'بحث باسم المحطة أو رمزها أو رقمها',
    caption: 'محطات الوقود',
    testId: 'stations-list',
  },
  OFFICE: {
    tab: 'مكاتب التسجيل',
    one: 'مكتب تسجيل',
    add: 'إضافة مكتب تسجيل',
    none: 'لا توجد مكاتب تسجيل بعد',
    noMatch: 'لا توجد مكاتب تطابق بحثك',
    search: 'بحث باسم المكتب أو رمزه',
    caption: 'مكاتب التسجيل',
    testId: 'offices-list',
  },
};

export function placeStatus(row: PlaceListRow): { label: string; variant: 'ok' | 'neutral' | 'danger' | 'accent' } {
  if (row.archivedAt) return { label: row.kind === 'STATION' ? 'مؤرشفة' : 'مؤرشف', variant: 'neutral' };
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

// The two tabs. `emptyHints` says what to do when a tab has nothing yet.
export function PlacesTabs({ municipalityId, emptyHints }: { municipalityId: string; emptyHints?: Partial<Record<PlaceKind, string>> }) {
  const tabs: TabDef[] = [
    { key: 'stations', label: WORDS.STATION.tab },
    { key: 'offices', label: WORDS.OFFICE.tab },
  ];
  const [tab, setTab] = useTab(tabs, 'kind');
  return (
    <div data-testid="places-tabs">
      <Tabs tabs={tabs} value={tab} onChange={setTab} label="محطات الوقود ومكاتب التسجيل" />
      <TabPanel tab="stations" value={tab}>
        <PlacesList key={`${municipalityId}-STATION`} municipalityId={municipalityId} kind="STATION" emptyHint={emptyHints?.STATION} />
      </TabPanel>
      <TabPanel tab="offices" value={tab}>
        <PlacesList key={`${municipalityId}-OFFICE`} municipalityId={municipalityId} kind="OFFICE" emptyHint={emptyHints?.OFFICE} />
      </TabPanel>
    </div>
  );
}

export function PlacesList({ municipalityId, kind, emptyHint }: { municipalityId: string; kind: PlaceKind; emptyHint?: string }) {
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const words = WORDS[kind];
  const isStation = kind === 'STATION';
  const canAdd = isStation ? hasPermission('stations:create') : hasPermission('registration_stations:manage');

  const { skip, setSkip, reset } = usePageParam(PLACES_PAGE_SIZE);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [locality, setLocality] = useState('');
  const [sort, setSort] = useState<SortKey>('code');
  const [dir, setDir] = useState<'asc' | 'desc'>('asc');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const dq = useDebounced(q);
  const dlocality = useDebounced(locality);

  // Any change of what is asked starts again from the first page.
  const asked = JSON.stringify({ dq, status, companyId, dlocality, sort, dir });
  const [lastAsked, setLastAsked] = useState(asked);
  useEffect(() => {
    if (asked !== lastAsked) {
      setLastAsked(asked);
      reset();
    }
  }, [asked, lastAsked, reset]);

  const companyLookup = useLookup<{ id: string; name: string }>('/companies', 'companies', isStation);

  const params = {
    skip,
    take: PLACES_PAGE_SIZE,
    kind,
    q: dq.trim() || undefined,
    status: status || undefined,
    companyId: isStation ? companyId || undefined : undefined,
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
  const activeFilters = [status, isStation ? companyId : '', locality.trim()].filter(Boolean).length;

  function sortBy(key: SortKey) {
    if (sort === key) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSort(key);
      setDir('asc');
    }
  }
  function clearAll() {
    setQ('');
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
        className="inline-flex min-h-[32px] items-center gap-1 rounded font-bold hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-dark"
      >
        {children}
        <span aria-hidden="true" className="text-[12px]">
          {sort === k ? (dir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  );

  const idp = isStation ? 'pl-st' : 'pl-of';

  return (
    <Card data-testid={words.testId}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-primary/15 bg-primary-100 px-4 py-3 lg:px-[18px]">
        <h2 className="text-[16px] font-extrabold text-primary-dark lg:text-[14px]">
          {words.tab}
          {query.data && <span className="ms-2 text-[15px] font-bold text-ink-soft lg:text-[13px]">({total.toLocaleString('en-US')})</span>}
        </h2>
        {canAdd && (
          <PillButton
            size="sm"
            data-testid={`${words.testId}-add`}
            onClick={() => navigate(isStation ? '/manage/stations/new' : '/manage/offices/new')}
          >
            <span className="inline-flex items-center gap-1.5">
              <Icon d={ICONS.plus} size={16} />
              {words.add}
            </span>
          </PillButton>
        )}
      </div>

      <div className="space-y-3 p-4 lg:p-[18px]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="relative flex-1">
            <label htmlFor={`${idp}-search`} className="mb-1.5 block text-[14px] font-bold text-ink lg:text-[12px]">
              {words.search}
            </label>
            <span className="pointer-events-none absolute bottom-0 start-3.5 flex h-[52px] items-center text-ink-faint lg:h-11">
              <Icon d={ICONS.search} size={18} />
            </span>
            <input id={`${idp}-search`} type="search" value={q} onChange={(e) => setQ(e.target.value)} className={`${FIELD} ps-11`} />
          </div>
          <PillButton
            variant="secondary"
            size="field"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((o) => !o)}
            className="lg:hidden"
          >
            <span className="inline-flex items-center gap-2">
              <Icon d={ICONS.filter} size={18} />
              تصفية{activeFilters > 0 ? ` (${activeFilters})` : ''}
            </span>
          </PillButton>
        </div>

        <div className={`${filtersOpen ? 'grid' : 'hidden'} gap-3 sm:grid-cols-2 lg:grid ${isStation ? 'lg:grid-cols-3' : 'lg:grid-cols-2'}`}>
          <div>
            <label htmlFor={`${idp}-status`} className="mb-1.5 block text-[14px] font-bold text-ink lg:text-[12px]">الحالة</label>
            <select id={`${idp}-status`} value={status} onChange={(e) => setStatus(e.target.value)} className={FIELD}>
              <option value="">كل الحالات (غير المؤرشفة)</option>
              {STATUS_CHOICES[kind].map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          {isStation && (
            <div>
              <label htmlFor={`${idp}-company`} className="mb-1.5 block text-[14px] font-bold text-ink lg:text-[12px]">الشركة</label>
              <select id={`${idp}-company`} value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={FIELD}>
                <option value="">كل الشركات</option>
                {companyLookup.items?.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <LookupSearch id={`${idp}-company-search`} q={companyLookup.q} onChange={companyLookup.setQ} capped={companyLookup.capped} />
            </div>
          )}
          <div>
            <label htmlFor={`${idp}-locality`} className="mb-1.5 block text-[14px] font-bold text-ink lg:text-[12px]">المنطقة أو الحي</label>
            <input id={`${idp}-locality`} value={locality} onChange={(e) => setLocality(e.target.value)} className={FIELD} />
          </div>
        </div>

        {(activeFilters > 0 || q) && (
          <div className="flex items-center justify-between gap-3">
            <p role="status" className="text-[14px] text-ink-soft lg:text-[12px]">
              {total === 0 ? 'لا نتائج' : `${total.toLocaleString('en-US')} نتيجة`}
            </p>
            <PillButton variant="ghost" size="sm" onClick={clearAll}>
              مسح التصفية
            </PillButton>
          </div>
        )}
      </div>

      {query.isError && (
        <div className="m-4">
          <Notice kind="error">تعذّر تحميل القائمة. تأكد من الاتصال ثم أعد المحاولة.</Notice>
        </div>
      )}
      {query.isLoading && <SkeletonRows rows={6} label={`جارٍ تحميل ${words.caption}`} />}
      {query.data && rows.length === 0 && (
        <div className="px-4 py-10 text-center">
          <p className="text-[18px] font-extrabold text-ink lg:text-[15px]">{activeFilters > 0 || q ? words.noMatch : words.none}</p>
          <p className="mt-1 text-[15px] text-ink-soft lg:text-[13px]">
            {activeFilters > 0 || q ? 'غيّر كلمات البحث أو امسح التصفية.' : (emptyHint ?? (canAdd ? `أضف أول ${words.one} بزر «${words.add}».` : ''))}
          </p>
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full text-[16px] lg:text-[14px]">
              <caption className="sr-only">{words.caption}</caption>
              <thead>
                <tr className="bg-surface-alt text-[13px] font-bold text-ink-soft lg:text-[12px]">
                  <Header k="name">الاسم</Header>
                  {isStation ? (
                    <>
                      <Header k="company">الشركة</Header>
                      <th scope="col" className="px-[18px] py-2.5 text-start font-bold">رقم المحطة</th>
                    </>
                  ) : (
                    <th scope="col" className="px-[18px] py-2.5 text-start font-bold">العنوان</th>
                  )}
                  <Header k="locality">المنطقة</Header>
                  <Header k="status">الحالة</Header>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const st = placeStatus(r);
                  return (
                    <tr key={r.id} className="border-b border-line-soft last:border-0 hover:bg-surface-alt/60">
                      <td className="px-[18px] py-3">
                        <Link
                          to={placeLink(r)}
                          className="font-bold text-ink hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-dark"
                        >
                          {r.name}
                        </Link>
                        <div><CodeText size="md">{r.code}</CodeText></div>
                      </td>
                      {isStation ? (
                        <>
                          <td className="px-[18px] py-3 text-ink">{r.company ?? '—'}</td>
                          <td className="px-[18px] py-3 text-ink"><bdi dir="ltr">{r.number ?? '—'}</bdi></td>
                        </>
                      ) : (
                        <td className="max-w-[300px] px-[18px] py-3 text-ink">{r.address ?? '—'}</td>
                      )}
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
              const detail = isStation ? [r.company, r.number ? `رقم ${r.number}` : null].filter(Boolean).join(' · ') : r.address;
              return (
                <li key={r.id}>
                  <Link
                    to={placeLink(r)}
                    className="block min-h-[88px] px-4 py-4 hover:bg-surface-alt/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-dark"
                  >
                    <p className="break-words text-[18px] font-extrabold leading-snug text-ink">{r.name}</p>
                    <CodeText size="md">{r.code}</CodeText>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <StatusPill variant={st.variant} size="md">{st.label}</StatusPill>
                    </div>
                    {detail && <p className="mt-1 text-[15px] text-ink">{detail}</p>}
                    {r.locality && <p className="text-[16px] text-ink-soft">{r.locality}</p>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <Pagination skip={skip} take={PLACES_PAGE_SIZE} total={total} onSkipChange={setSkip} alwaysShow={total > 0} testId={`${words.testId}-pager`} />
    </Card>
  );
}
