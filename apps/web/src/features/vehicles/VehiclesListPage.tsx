import { useEffect, useMemo, useState, useRef } from 'react';
import { LookupSearch, useLookup } from '../../lib/useLookup';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiClient } from '../../lib/apiClient';
import { formatLicensePlate, normalizePlateSearchTerm } from '../../lib/libyanFormats';
import { Pagination } from '../../components/Pagination';
import { usePageParam } from '../../lib/usePageParam';
import { LtrText } from '../../components/LtrText';
import { PageHeader } from '../../components/design/PageHeader';
import { Card } from '../../components/design/Card';
import { PillButton } from '../../components/design/PillButton';
import { StatusPill } from '../../components/design/StatusPill';
import { KpiCard } from '../../components/design/KpiCard';
import { VehicleBrandLogo } from '../../components/VehicleBrandLogo';
import { Icon, ICONS } from '../../components/icons';
import { useAuth } from '../auth/AuthProvider';
import {
  identityTypeLabel,
  CHANGE_NOT_YET_EFFECTIVE,
} from '../../lib/labels';
import { VEHICLE_BRANDS } from '../../lib/vehicleBrands';
import type { VehicleBasicInfo } from './types';
import { SkeletonRows } from '../../components/design/Skeleton';
import { LIST_PAGE_SIZE } from '../../lib/pageSize';
import { DateField } from '../../components/DateField';
import { downloadBlob } from '../../lib/download';

const TAKE = LIST_PAGE_SIZE;

interface PendingChangeSummary {
  vehicleId: string;
  reason: string;
}

// Round 11 item 2: verified vs. provisional vs. no owner at all — ties
// directly to item 1's mandatory-owner change ("which vehicles still need
// their owner's real ID"). Mirrors OwnerIdentityStatusFilter in
// apps/api/src/vehicles/dto/find-vehicles-query.dto.ts.
type OwnerIdentityStatusFilter = 'VERIFIED' | 'MISSING';
const OWNER_IDENTITY_STATUS_LABELS: Record<OwnerIdentityStatusFilter, string> = {
  VERIFIED: 'هوية موثّقة',
  MISSING: 'بلا مالك',
};

type VehicleSortField = 'CREATED_AT' | 'INTERNAL_CODE' | 'CURRENT_PLATE';
const SORT_LABELS: Record<VehicleSortField, string> = {
  CREATED_AT: 'الأحدث أولًا',
  INTERNAL_CODE: 'الرمز الداخلي',
  CURRENT_PLATE: 'رقم اللوحة',
};

// Matches design 5a (desktop table) + 5b (mobile card list). GET /vehicles
// isn't station-scoped (vehicles are a directorate-wide registry), so this
// lists every vehicle vehicles:read allows — same as before this rebuild.
// Round 11 item 2: usage-type/brand/owner-identity-status filters and
// sorting all moved server-side now that this is a real filters/sorting
// pass — usageType used to be client-side-only over one loaded page, an
// explicit prior scope cut (see FindVehiclesQueryDto/VehiclesService.
// findAll), reconsidered deliberately per the round's own instruction
// rather than just inherited. A station filter was asked for too, but
// Vehicle has no direct station relation (vehicles are a directorate-wide
// registry, not station-scoped) — what "this vehicle's station" would
// even mean (e.g. derived from its fill-up history?) isn't something this
// round picked unilaterally; flagged in docs/OPEN_ITEMS.md instead of a
// filter that quietly does the wrong thing.
export function VehiclesListPage() {
  const { hasPermission } = useAuth();
  const canSeeChangeRequests = hasPermission('vehicles:approve_change');
  // Registration pivot, phase 2: creating vehicles moved to its own page
  // (/registration), used at registration stations only — this list just
  // links there for those who can register.
  const canRegisterVehicles = hasPermission('vehicles:manage') && hasPermission('registration_stations:read');
  // The page is in the address (?page=2): refresh and back keep your place.
  const { skip, setSkip } = usePageParam(TAKE);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState('');
  const [ownerStatusFilter, setOwnerStatusFilter] = useState<OwnerIdentityStatusFilter | ''>('');
  // After review (19 Oct 2026): only vehicles that share their plate number.
  const [duplicatePlateOnly, setDuplicatePlateOnly] = useState(false);
  const [sort, setSort] = useState<VehicleSortField>('CREATED_AT');
  // After review (28 Oct 2026): registered between these days, at this office.
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [officeFilter, setOfficeFilter] = useState('');
  const canFilterOffice = hasPermission('registration_stations:read');
  const canExport = hasPermission('registration_reports:view');
  const offices = useQuery({
    queryKey: ['registration-stations'],
    enabled: canFilterOffice,
    queryFn: async () => (await apiClient.get<Array<{ id: string; name: string }>>('/registration-stations')).data,
  });
  const fullDay = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
  const [exporting, setExporting] = useState(false);
  const [exportNote, setExportNote] = useState<string | null>(null);

  const typeLookup = useLookup<{ id: string; name: string; isActive: boolean }>('/vehicle-types', 'vehicle-types');
  const vehicleTypes = typeLookup.items;

  // The search settles 300 ms after typing. The page goes back to the first
  // only when the search text really changed - not when the list is merely
  // opened (that reset used to navigate, on a timer, after the person had left).
  const lastSearch = useRef('');
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = normalizePlateSearchTerm(query);
      setDebounced(next);
      if (next !== lastSearch.current) {
        lastSearch.current = next;
        setSkip(0);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // The filters, as the list and its export both send them.
  const filterParams = {
    search: debounced || undefined,
    brand: brandFilter || undefined,
    vehicleTypeId: vehicleTypeFilter || undefined,
    ownerIdentityStatus: ownerStatusFilter || undefined,
    duplicatePlate: duplicatePlateOnly || undefined,
    from: fullDay(from) ? from : undefined,
    to: fullDay(to) ? to : undefined,
    registrationStationId: officeFilter || undefined,
  };

  async function exportList() {
    setExporting(true);
    setExportNote(null);
    try {
      const res = await apiClient.get<Blob>('/vehicles/export', { params: filterParams, responseType: 'blob' });
      const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Tripoli' }).format(new Date());
      downloadBlob(res.data, `vehicles-${day}.csv`);
      if (res.headers['x-truncated'] === 'true') setExportNote('الكشف يضم أحدث 10,000 مركبة فقط. ضيّق التصفية لتصدير الباقي.');
    } catch {
      setExportNote('تعذّر سحب الكشف. أعد المحاولة.');
    } finally {
      setExporting(false);
    }
  }

  const { data: pageData, isLoading, isError } = useQuery({
    queryKey: ['vehicles', 'list', skip, debounced, brandFilter, vehicleTypeFilter, ownerStatusFilter, sort, duplicatePlateOnly, from, to, officeFilter],
    queryFn: async () =>
      (
        await apiClient.get<{ total: number; items: VehicleBasicInfo[] }>('/vehicles', {
          params: { paged: true, skip, take: TAKE, ...filterParams, sort },
        })
      ).data,
  });

  // Pending-identity-change highlighting (5a's amber row / 5b's amber card)
  // — only fetched for holders of vehicles:approve_change, since that's
  // what GET /vehicles/change-requests requires; other roles simply won't
  // see the highlight, same as they can't reach the change-requests queue.
  const pendingChangesQuery = useQuery({
    queryKey: ['vehicles', 'pending-changes-for-list'],
    queryFn: async () =>
      (
        await apiClient.get<Array<{ vehicleId: string; reason: string }>>('/vehicles/change-requests', {
          params: { status: 'PENDING', take: 200 },
        })
      ).data,
    enabled: canSeeChangeRequests,
    staleTime: 30_000,
  });

  const pendingByVehicleId = useMemo(() => {
    const map = new Map<string, PendingChangeSummary>();
    for (const request of pendingChangesQuery.data ?? []) {
      if (!map.has(request.vehicleId)) map.set(request.vehicleId, request);
    }
    return map;
  }, [pendingChangesQuery.data]);

  // Round 11 item 2: filtering moved server-side (see the useQuery above) —
  // `filtered` is now just `data` itself, kept as the JSX's own local name
  // rather than renaming every usage below.
  const data = pageData?.items;
  const totalVehicles = pageData?.total ?? 0;
  const filtered = data;

  const selectClass =
    'h-9 rounded-sm bg-surface-alt px-3 text-[13px] lg:text-[12.5px] font-bold text-ink focus:outline-none focus:ring-2 focus:ring-primary-dark';

  return (
    <div>
      <PageHeader
        title="المركبات"
        subtitle={pageData ? `${totalVehicles.toLocaleString('en-US')} مركبة` : undefined}
        actions={
          canRegisterVehicles || canExport ? (
            <>
              {canExport && (
                <PillButton size="sm" variant="secondary" onClick={() => void exportList()} disabled={exporting || !totalVehicles} data-testid="vehicles-export">
                  {exporting ? 'جارٍ السحب…' : 'سحب كشف (CSV)'}
                </PillButton>
              )}
              {canRegisterVehicles && (
                <Link to="/registration">
                  <PillButton size="sm">تسجيل مركبة +</PillButton>
                </Link>
              )}
            </>
          ) : undefined
        }
      />

      {/* Round 16: a quick-glance KPI strip — the page felt flat with
          nothing but a bare table under the header. Every figure here is
          real, not fabricated: the fleet has no single "total" endpoint
          today (GET /vehicles returns a page, not a count), so this
          deliberately labels itself "في هذه الصفحة" rather than implying a
          directorate-wide total it can't actually back up; the pending
          change-request count IS a real global figure (its own query
          already fetches every pending request, not just this page's). */}
      {data && (
        <div className="mb-4 grid animate-fade-in-up grid-cols-2 gap-2.5 sm:grid-cols-4">
          <KpiCard label="في هذه الصفحة" value={data.length} />
          <KpiCard label="بلا مالك" value={data.filter((v) => !v.owner).length} />
          {canSeeChangeRequests && (
            <KpiCard
              label="طلبات تعديل بانتظار الاعتماد"
              value={pendingChangesQuery.data?.length ?? 0}
              variant={(pendingChangesQuery.data?.length ?? 0) > 0 ? 'accent' : 'neutral'}
            />
          )}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <div className="relative w-full sm:w-72">
          {/* This input carries dir="ltr" (typed plate/ID digits read
              left-to-right) inside an otherwise-rtl page — CSS logical
              padding/inset utilities resolve against an element's OWN
              direction, not the page's, so an icon positioned that way on
              this non-dir'd sibling span would land on the wrong physical
              side (the exact bug already fixed once on DateField's calendar
              icon). Explicit physical right/pr utilities sidestep it. */}
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-ink-faint">
            <Icon d={ICONS.search} size={15} />
          </span>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
            placeholder="ابحث برقم اللوحة أو الرمز الداخلي أو الشاسيه أو اسم/رقم هوية المالك"
            dir="ltr"
            className="h-9 w-full rounded-sm bg-surface pl-3 pr-9 text-end text-[13px] lg:text-[12.5px] text-ink shadow-sm transition-shadow focus:outline-none focus:ring-2 focus:ring-primary-dark"
          />
        </div>
        {/* Round 14: the "usage type" filter was removed alongside the
            field itself — see the vehicle-type filter below, which is now
            the only "type" concept the app collects. */}
        <select
          value={brandFilter}
          onChange={(e) => {
            setBrandFilter(e.target.value);
            setSkip(0);
          }}
          className={selectClass}
        >
          <option value="">كل الماركات</option>
          {/* A-Z, same reasoning as VehicleBrandPicker's own sort — the
              source array stays organized by category, sorted only here
              for display. */}
          {[...VEHICLE_BRANDS]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((brand) => (
              <option key={brand.name} value={brand.name}>
                {brand.name}
              </option>
            ))}
        </select>
        <select
          value={vehicleTypeFilter}
          onChange={(e) => {
            setVehicleTypeFilter(e.target.value);
            setSkip(0);
          }}
          className={selectClass}
        >
          <option value="">كل أنواع المركبات</option>
          {vehicleTypes
            ?.filter((t) => t.isActive)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
        </select>
        <LookupSearch id="vl-type-search" q={typeLookup.q} onChange={typeLookup.setQ} capped={typeLookup.capped} />
        <select
          value={ownerStatusFilter}
          onChange={(e) => {
            setOwnerStatusFilter(e.target.value as OwnerIdentityStatusFilter | '');
            setSkip(0);
          }}
          className={selectClass}
        >
          <option value="">كل حالات هوية المالك</option>
          {(Object.entries(OWNER_IDENTITY_STATUS_LABELS) as [OwnerIdentityStatusFilter, string][]).map(
            ([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ),
          )}
        </select>
        <label
          className={`inline-flex min-h-[44px] items-center gap-2 rounded-sm border px-3 text-[15px] font-bold lg:min-h-0 lg:py-2 lg:text-[13px] ${
            duplicatePlateOnly ? 'border-accent bg-accent-100 text-ink' : 'border-line bg-surface-alt text-ink'
          }`}
          data-testid="vehicles-duplicate-plate-filter"
        >
          <input
            type="checkbox"
            className="h-5 w-5 accent-primary"
            checked={duplicatePlateOnly}
            onChange={(e) => {
              setDuplicatePlateOnly(e.target.checked);
              setSkip(0);
            }}
          />
          لوحات مكررة فقط
        </label>
        {canFilterOffice && (offices.data?.length ?? 0) > 0 && (
          <select
            value={officeFilter}
            onChange={(e) => {
              setOfficeFilter(e.target.value);
              setSkip(0);
            }}
            className={selectClass}
            aria-label="مكتب التسجيل"
            data-testid="vehicles-office-filter"
          >
            <option value="">كل المكاتب</option>
            {offices.data!.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        )}
        <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-ink-soft lg:text-[12px]">
          سُجّلت من
          <DateField
            id="vl-from"
            value={from}
            onChange={(v) => {
              setFrom(v);
              setSkip(0);
            }}
            inputClassName={`w-40 pe-9 ${selectClass}`}
          />
          إلى
          <DateField
            id="vl-to"
            value={to}
            onChange={(v) => {
              setTo(v);
              setSkip(0);
            }}
            inputClassName={`w-40 pe-9 ${selectClass}`}
          />
        </span>
        {(from || to || officeFilter) && (
          <button
            type="button"
            className="text-[13px] font-bold text-primary-dark hover:underline lg:text-[12px]"
            onClick={() => {
              setFrom('');
              setTo('');
              setOfficeFilter('');
              setSkip(0);
            }}
          >
            مسح الفترة والمكتب
          </button>
        )}
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as VehicleSortField)}
          className={selectClass}
          aria-label="الترتيب"
        >
          {(Object.entries(SORT_LABELS) as [VehicleSortField, string][]).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {exportNote && <p className="mb-3 text-[14px] font-bold text-danger-dark lg:text-[13px]">{exportNote}</p>}
      {isLoading && <SkeletonRows rows={6} />}
      {isError && <p className="text-[15px] lg:text-[13px] text-danger">تعذر تحميل قائمة المركبات.</p>}

      {filtered && (
        <>
          {/* Desktop table (5a) */}
          <Card className="hidden sm:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-[13px] lg:text-[12.5px]">
                <thead>
                  <tr className="bg-surface-alt text-[13px] lg:text-[12px] font-bold text-ink-soft">
                    <th className="px-[18px] py-2.5 text-start">المركبة</th>
                    <th className="px-[18px] py-2.5 text-start">رقم اللوحة</th>
                    <th className="px-[18px] py-2.5 text-start">نوع المركبة</th>
                    <th className="px-[18px] py-2.5 text-start">المالك</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((vehicle, i) => {
                    const pending = pendingByVehicleId.get(vehicle.id);
                    return (
                      <tr
                        key={vehicle.id}
                        className={`animate-fade-in-up border-b border-line-soft transition-colors last:border-0 hover:bg-surface-alt/60 ${pending ? 'bg-accent-100' : ''}`}
                        style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                      >
                        <td className="px-[18px] py-3">
                          <Link to={`/vehicles/${vehicle.id}`} className="group flex items-center gap-2.5">
                            <VehicleBrandLogo model={vehicle.make} size={34} />
                            <span className="min-w-0">
                              <span className="block font-bold text-primary group-hover:underline">
                                {vehicle.internalCode}
                              </span>
                              <span className="block text-[13px] lg:text-[12px] text-ink-faint">{[vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'طراز غير محدَّد'}</span>
                            </span>
                          </Link>
                        </td>
                        <td className="px-[18px] py-3">
                          <LtrText>{formatLicensePlate(vehicle.currentPlate)}</LtrText>
                          {pending && (
                            <div className="mt-1 flex flex-col gap-0.5">
                              <StatusPill variant="accent">{CHANGE_NOT_YET_EFFECTIVE}</StatusPill>
                              <span className="text-[13px] lg:text-[12px] text-ink-soft">{pending.reason}</span>
                            </div>
                          )}
                        </td>
                        <td className="px-[18px] py-3 text-ink">{vehicle.vehicleType?.name ?? '—'}</td>
                        <td className="px-[18px] py-3 text-ink">
                          {vehicle.owner ? (
                            <>
                              {vehicle.owner.fullName}
                              <span className="ms-1.5 text-[13px] lg:text-[12px] text-ink-faint">
                                ({identityTypeLabel(vehicle.owner.identityType)})
                              </span>
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-[15px] lg:text-[13px] text-ink-soft">
                        لا توجد مركبات مطابقة
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Mobile card list (5b) */}
          <div className="flex flex-col gap-2.5 sm:hidden">
            {filtered.map((vehicle, i) => {
              const pending = pendingByVehicleId.get(vehicle.id);
              return (
                <Link
                  key={vehicle.id}
                  to={`/vehicles/${vehicle.id}`}
                  className="animate-fade-in-up block"
                  style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                >
                  <Card
                    className={`p-4 transition-transform active:scale-[0.98] ${pending ? 'bg-accent-100 ring-2 ring-inset ring-accent' : ''}`}
                  >
                    <div className="flex items-center gap-2.5">
                      <VehicleBrandLogo model={vehicle.make} size={36} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-[16px] lg:text-[14px] font-extrabold text-ink">{vehicle.internalCode}</span>
                          {pending && <StatusPill variant="accent">{CHANGE_NOT_YET_EFFECTIVE}</StatusPill>}
                        </div>
                        <div className="text-[15px] lg:text-[13px] font-bold text-ink-soft">
                          <LtrText>{formatLicensePlate(vehicle.currentPlate)}</LtrText>
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-[13px] lg:text-[12px] text-ink-faint">
                      <span>{vehicle.vehicleType?.name ?? '—'}</span>
                      <span>·</span>
                      <span>{[vehicle.make, vehicle.model].filter(Boolean).join(' ') || '—'}</span>
                    </div>
                    <div className="mt-1.5 text-[13px] lg:text-[12px] text-ink-soft">
                      المالك: {vehicle.owner ? vehicle.owner.fullName : '—'}
                    </div>
                    {pending && <p className="mt-2 text-[13px] lg:text-[12px] text-ink-soft">{pending.reason}</p>}
                  </Card>
                </Link>
              );
            })}
            {filtered.length === 0 && (
              <Card className="p-6 text-center text-[15px] lg:text-[13px] text-ink-soft">لا توجد مركبات مطابقة</Card>
            )}
          </div>

          <Pagination skip={skip} take={TAKE} total={totalVehicles} onSkipChange={setSkip} alwaysShow={totalVehicles > 0} testId="vehicles-pager" />
        </>
      )}
    </div>
  );
}
