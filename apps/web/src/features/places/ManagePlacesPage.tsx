import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { STATION_STATUS_LABELS, STATION_STATUS_VARIANT } from '../../lib/labels';
import { Card } from '../../components/design/Card';
import { PageHeader } from '../../components/design/PageHeader';
import { PlaceSummaryRow, ReadinessPanel } from './MunicipalitySummary';
import { PillButton } from '../../components/design/PillButton';
import { StatusPill } from '../../components/design/StatusPill';
import { CodeText } from '../../components/design/CodeText';
import { Icon, ICONS } from '../../components/icons';
import { useAuth } from '../auth/AuthProvider';
import { Notice } from '../users/parts';
import {
  OFFICE_STATUS_LABELS,
  OFFICE_STATUS_VARIANT,
  useMunicipalityList,
  useOfficeList,
  useStationList,
  type OfficeRow,
  type StationRow,
} from './placesShared';
import { StageCard } from './StageCard';

type PlaceType = '' | 'STATION' | 'OFFICE';
type Archived = '' | 'only' | 'include';

interface Row {
  key: string;
  type: 'STATION' | 'OFFICE';
  id: string;
  name: string;
  code: string;
  municipality: string;
  detail: string;
  status: string;
  statusLabel: string;
  statusVariant: 'ok' | 'neutral' | 'danger' | 'accent';
  archived: boolean;
  locality: string;
}

const SELECT_CLASS =
  'h-[52px] w-full rounded-sm border border-line bg-surface-alt px-3 text-[16px] text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface lg:h-11 lg:text-[14px]';

const STATUS_CHOICES = [
  ...Object.entries(STATION_STATUS_LABELS).map(([value, label]) => ({ value, label: `${label} (محطة)` })),
  ...Object.entries(OFFICE_STATUS_LABELS)
    .filter(([value]) => value !== 'ACTIVE')
    .map(([value, label]) => ({ value, label: `${label} (مكتب)` })),
];

const SORTS = [
  { value: 'code', label: 'الرمز' },
  { value: 'name', label: 'الاسم' },
  { value: 'status', label: 'الحالة' },
];

function toRows(stations: StationRow[], offices: OfficeRow[]): Row[] {
  return [
    ...stations.map<Row>((s) => ({
      key: `s-${s.id}`,
      type: 'STATION',
      id: s.id,
      name: s.name,
      code: s.internalCode,
      municipality: s.municipality?.name ?? '—',
      detail: `${s.company?.name ?? ''}${s.stationNumber ? ` · رقم ${s.stationNumber}` : ''}`.replace(/^ · /, ''),
      status: s.status,
      statusLabel: STATION_STATUS_LABELS[s.status] ?? s.status,
      statusVariant: STATION_STATUS_VARIANT[s.status] ?? 'neutral',
      archived: Boolean(s.archivedAt),
      locality: s.locality ?? '',
    })),
    ...offices.map<Row>((o) => ({
      key: `o-${o.id}`,
      type: 'OFFICE',
      id: o.id,
      name: o.name,
      code: o.internalCode,
      municipality: o.municipality.name,
      detail: o.address,
      status: o.status,
      statusLabel: OFFICE_STATUS_LABELS[o.status],
      statusVariant: OFFICE_STATUS_VARIANT[o.status],
      archived: Boolean(o.archivedAt),
      locality: o.locality ?? '',
    })),
  ];
}

// «إدارة المحطات» — every petrol station and registration office of the
// municipality in one place, with search, filters and sortable columns. Rows
// open the station or office, where its people, controls and activity are.
export function ManagePlacesPage() {
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const canCreateStation = hasPermission('stations:create');
  const canCreateOffice = hasPermission('registration_stations:manage');

  const [q, setQ] = useState('');
  const [type, setType] = useState<PlaceType>('');
  const [municipalityId, setMunicipalityId] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [status, setStatus] = useState('');
  const [locality, setLocality] = useState('');
  const [archived, setArchived] = useState<Archived>('');
  const [sort, setSort] = useState('code');
  const [dir, setDir] = useState<'asc' | 'desc'>('asc');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const municipalities = useMunicipalityList();
  const companies = useQuery({
    queryKey: ['companies'],
    queryFn: async () => (await apiClient.get<{ id: string; name: string }[]>('/companies')).data,
  });

  const stationFilters = { q, municipalityId, companyId, locality, archived, sort, dir, status: status && STATION_STATUS_LABELS[status] ? status : '' };
  const officeFilters = {
    q,
    municipalityId,
    locality,
    archived,
    sort,
    dir,
    status: status && OFFICE_STATUS_LABELS[status as keyof typeof OFFICE_STATUS_LABELS] ? status : '',
  };
  // A status that only one kind has hides the other kind, and so does a company.
  const wantStations = type !== 'OFFICE' && !(status && !STATION_STATUS_LABELS[status]);
  const wantOffices = type !== 'STATION' && !companyId && !(status && !OFFICE_STATUS_LABELS[status as keyof typeof OFFICE_STATUS_LABELS]);
  const stations = useStationList(stationFilters, wantStations);
  const offices = useOfficeList(officeFilters, wantOffices);

  const rows = useMemo(() => {
    const merged = toRows(wantStations ? (stations.data ?? []) : [], wantOffices ? (offices.data ?? []) : []);
    const factor = dir === 'desc' ? -1 : 1;
    const key = (r: Row) => (sort === 'name' ? r.name : sort === 'status' ? r.statusLabel : r.code);
    return merged.sort((a, b) => key(a).localeCompare(key(b), 'ar') * factor);
  }, [stations.data, offices.data, wantStations, wantOffices, sort, dir]);

  const loading = (wantStations && stations.isLoading) || (wantOffices && offices.isLoading);
  const failed = (wantStations && stations.isError) || (wantOffices && offices.isError);
  const activeFilters = [type, municipalityId, companyId, status, locality.trim(), archived].filter(Boolean).length;
  const ownMunicipality = (municipalities.data ?? []).length === 1 ? municipalities.data![0] : null;

  function clearAll() {
    setQ('');
    setType('');
    setMunicipalityId('');
    setCompanyId('');
    setStatus('');
    setLocality('');
    setArchived('');
  }

  const openPath = (r: Row) => (r.type === 'STATION' ? `/manage/stations/${r.id}` : `/manage/offices/${r.id}`);

  return (
    <div className="space-y-4">
      <PageHeader
        title="إدارة المحطات"
        subtitle={ownMunicipality ? `محطات الوقود ومكاتب التسجيل في ${ownMunicipality.name}` : 'محطات الوقود ومكاتب التسجيل'}
        actions={
          <>
            {canCreateStation && (
              <PillButton size="field" onClick={() => navigate('/manage/stations/new')}>
                <span className="inline-flex items-center gap-2">
                  <Icon d={ICONS.plus} size={18} />
                  محطة وقود جديدة
                </span>
              </PillButton>
            )}
            {canCreateOffice && (
              <PillButton size="field" variant="secondary" onClick={() => navigate('/manage/offices/new')}>
                <span className="inline-flex items-center gap-2">
                  <Icon d={ICONS.plus} size={18} />
                  مكتب تسجيل جديد
                </span>
              </PillButton>
            )}
          </>
        }
      />
      <PlaceSummaryRow />
      <ReadinessPanel />

      {ownMunicipality && <StageCard municipality={ownMunicipality} />}

      <Card>
        <div className="space-y-3 p-4 lg:p-[18px]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="relative flex-1">
              <label htmlFor="mp-search" className="mb-1.5 block text-[14px] font-bold text-ink lg:text-[12px]">
                بحث بالاسم أو الرمز أو الرقم أو العنوان
              </label>
              <span className="pointer-events-none absolute bottom-0 start-3.5 flex h-[52px] items-center text-ink-faint lg:h-11">
                <Icon d={ICONS.search} size={18} />
              </span>
              <input
                id="mp-search"
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="h-[52px] w-full rounded-sm border border-line bg-surface-alt ps-11 pe-3.5 text-[16px] text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface lg:h-11 lg:text-[14px]"
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
              <label htmlFor="mp-type" className="mb-1.5 block text-[14px] font-bold text-ink lg:text-[12px]">النوع</label>
              <select id="mp-type" value={type} onChange={(e) => setType(e.target.value as PlaceType)} className={SELECT_CLASS}>
                <option value="">الكل</option>
                <option value="STATION">محطات وقود</option>
                <option value="OFFICE">مكاتب تسجيل</option>
              </select>
            </div>
            {(municipalities.data?.length ?? 0) > 1 && (
              <div>
                <label htmlFor="mp-muni" className="mb-1.5 block text-[14px] font-bold text-ink lg:text-[12px]">البلدية</label>
                <select id="mp-muni" value={municipalityId} onChange={(e) => setMunicipalityId(e.target.value)} className={SELECT_CLASS}>
                  <option value="">كل البلديات</option>
                  {municipalities.data?.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label htmlFor="mp-company" className="mb-1.5 block text-[14px] font-bold text-ink lg:text-[12px]">الشركة</label>
              <select id="mp-company" value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={SELECT_CLASS}>
                <option value="">كل الشركات</option>
                {companies.data?.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="mp-status" className="mb-1.5 block text-[14px] font-bold text-ink lg:text-[12px]">الحالة</label>
              <select id="mp-status" value={status} onChange={(e) => setStatus(e.target.value)} className={SELECT_CLASS}>
                <option value="">كل الحالات</option>
                {STATUS_CHOICES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="mp-locality" className="mb-1.5 block text-[14px] font-bold text-ink lg:text-[12px]">المنطقة أو الحي</label>
              <input
                id="mp-locality"
                value={locality}
                onChange={(e) => setLocality(e.target.value)}
                className={SELECT_CLASS}
              />
            </div>
            <div>
              <label htmlFor="mp-archived" className="mb-1.5 block text-[14px] font-bold text-ink lg:text-[12px]">الأرشيف</label>
              <select id="mp-archived" value={archived} onChange={(e) => setArchived(e.target.value as Archived)} className={SELECT_CLASS}>
                <option value="">العاملة فقط</option>
                <option value="only">المؤرشفة فقط</option>
                <option value="include">العاملة والمؤرشفة</option>
              </select>
            </div>
            <div>
              <label htmlFor="mp-sort" className="mb-1.5 block text-[14px] font-bold text-ink lg:text-[12px]">الترتيب</label>
              <div className="flex gap-2">
                <select id="mp-sort" value={sort} onChange={(e) => setSort(e.target.value)} className={SELECT_CLASS}>
                  {SORTS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  aria-label={dir === 'asc' ? 'الترتيب تصاعدي — اضغط لجعله تنازليًا' : 'الترتيب تنازلي — اضغط لجعله تصاعديًا'}
                  onClick={() => setDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                  className="h-[52px] w-14 shrink-0 rounded-sm border border-line bg-surface-alt text-[18px] font-bold text-ink-soft hover:text-primary lg:h-11"
                >
                  {dir === 'asc' ? '▲' : '▼'}
                </button>
              </div>
            </div>
          </div>

          {(activeFilters > 0 || q) && (
            <div className="flex items-center justify-between gap-3">
              <p role="status" className="text-[14px] text-ink-soft lg:text-[12px]">
                {rows.length === 0 ? 'لا نتائج' : `${rows.length} نتيجة`}
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

        {failed && (
          <div className="m-4">
            <Notice kind="error">تعذّر تحميل القائمة. تأكد من الاتصال ثم أعد المحاولة.</Notice>
          </div>
        )}
        {loading && <p className="p-4 text-[15px] text-ink-soft lg:text-[13px]">جارٍ التحميل…</p>}
        {!loading && !failed && rows.length === 0 && (
          <div className="px-4 py-10 text-center">
            <p className="text-[18px] font-extrabold text-ink lg:text-[15px]">
              {activeFilters > 0 || q ? 'لا توجد محطات أو مكاتب تطابق بحثك' : 'لا توجد محطات أو مكاتب بعد'}
            </p>
            <p className="mt-1 text-[15px] text-ink-soft lg:text-[13px]">
              {activeFilters > 0 || q ? 'غيّر كلمات البحث أو امسح التصفية.' : 'أضف أول محطة وقود أو مكتب تسجيل من الأزرار أعلاه.'}
            </p>
          </div>
        )}

        {rows.length > 0 && (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-[14px]">
                <caption className="sr-only">محطات الوقود ومكاتب التسجيل</caption>
                <thead>
                  <tr className="bg-surface-alt text-[12px] font-bold text-ink-soft">
                    <th scope="col" className="px-[18px] py-2.5 text-start">الاسم</th>
                    <th scope="col" className="px-[18px] py-2.5 text-start">النوع</th>
                    <th scope="col" className="px-[18px] py-2.5 text-start">الشركة / العنوان</th>
                    <th scope="col" className="px-[18px] py-2.5 text-start">المنطقة</th>
                    <th scope="col" className="px-[18px] py-2.5 text-start">الحالة</th>
                    <th scope="col" className="px-[18px] py-2.5 text-start">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key} className="border-b border-surface-alt last:border-0 hover:bg-surface-alt/60">
                      <td className="px-[18px] py-3">
                        <Link to={openPath(r)} className="font-bold text-ink hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                          {r.name}
                        </Link>
                        <div><CodeText size="md">{r.code}</CodeText></div>
                      </td>
                      <td className="px-[18px] py-3 text-ink">{r.type === 'STATION' ? 'محطة وقود' : 'مكتب تسجيل'}</td>
                      <td className="max-w-[260px] px-[18px] py-3 text-ink">{r.detail || '—'}</td>
                      <td className="px-[18px] py-3 text-ink">{r.locality || '—'}</td>
                      <td className="px-[18px] py-3">
                        {r.archived ? (
                          <StatusPill variant="neutral" size="md">مؤرشف</StatusPill>
                        ) : (
                          <StatusPill variant={r.statusVariant} size="md">{r.statusLabel}</StatusPill>
                        )}
                      </td>
                      <td className="px-[18px] py-3">
                        <Link
                          to={openPath(r)}
                          className="rounded-full bg-surface-alt px-3 py-1.5 text-[13px] font-bold text-ink-soft hover:text-primary"
                        >
                          {r.archived ? 'فتح واستعادة' : 'فتح وإدارة'}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="divide-y divide-surface-alt lg:hidden">
              {rows.map((r) => (
                <li key={r.key}>
                  <Link
                    to={openPath(r)}
                    className="block min-h-[88px] px-4 py-4 hover:bg-surface-alt/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
                  >
                    <p className="break-words text-[18px] font-extrabold leading-snug text-ink">{r.name}</p>
                    <CodeText size="md">{r.code}</CodeText>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <p className="text-[16px] font-bold text-primary-dark">{r.type === 'STATION' ? 'محطة وقود' : 'مكتب تسجيل'}</p>
                      {r.archived ? (
                        <StatusPill variant="neutral" size="md">مؤرشف</StatusPill>
                      ) : (
                        <StatusPill variant={r.statusVariant} size="md">{r.statusLabel}</StatusPill>
                      )}
                    </div>
                    {r.detail && <p className="mt-1 text-[15px] text-ink">{r.detail}</p>}
                    {r.locality && <p className="text-[14px] text-ink-soft">{r.locality}</p>}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}
