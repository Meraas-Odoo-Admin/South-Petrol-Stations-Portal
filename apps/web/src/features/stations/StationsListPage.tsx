import { Fragment, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { useAuth } from '../auth/AuthProvider';
import { useStations } from './useStations';
import { PageHeader } from '../../components/design/PageHeader';
import { Card } from '../../components/design/Card';
import { PillButton } from '../../components/design/PillButton';
import { StatusPill } from '../../components/design/StatusPill';
import { CodeText } from '../../components/design/CodeText';
import { KpiCard } from '../../components/design/KpiCard';
import { Icon, ICONS } from '../../components/icons';
import { STATION_STATUS_VARIANT, stationStatusLabel, ownershipTypeLabel, fuelTypeLabel } from '../../lib/labels';
import {
  StationFormFields,
  EMPTY_STATION_FORM,
  stationToFormValues,
  stationFormToPayload,
  type StationFormValues,
} from './StationFormFields';
import type { LookupRef, StationBasicInfo } from './types';

const STATUS_FILTER_OPTIONS = ['ACTIVE', 'NOT_YET_SUPPLIED', 'SUSPENDED_LEGAL', 'SUSPENDED_COMMITTEE', 'SUSPENDED_OWNER', 'UNVERIFIED'];

interface CompanyRow {
  id: string;
  name: string;
}

function matches(station: StationBasicInfo, term: string): boolean {
  if (!term) return true;
  const haystack = `${station.name} ${station.internalCode} ${station.stationNumber} ${station.municipality?.name ?? ''}`.toLowerCase();
  return haystack.includes(term.toLowerCase());
}

// Round 16 (UX pass): the previous version of this screen was, in its own
// comment's words, a "minimal browse screen" — no search, no status filter,
// and none of the real card data this app already fetches (ownershipType,
// route, fuel availability) ever shown, even though StationBasicInfo has
// carried all of it since the station-card-field-spec round. GET /stations
// has no company relation included server-side (confirmed via
// StationsService.findAll's own `cardInclude`), so a company column isn't
// added here without a backend change this pass didn't scope — everything
// else below is data this screen already had in hand and simply never
// displayed. Search/status filtering are client-side: GET /stations
// already returns the caller's FULL scoped list in one call (no pagination
// exists for it), so there's a real, complete dataset to filter in the
// browser rather than a false "showing 20 of many" page.
//
// Round 19: "system admin and admin should be able to open every station
// to see its details and edit its information from the stations page,
// add/edit/delete all the stations from here instead of the settings — I
// think that's much more logical." Create/edit (stations:manage-gated,
// same permission the old /admin/stations page required) is now built
// directly into this screen — StationFormFields/the mutations below are
// the same ones that page used, just relocated; there's no separate admin
// surface for this anymore (see AdminLayout.tsx/App.tsx, the "المحطات"
// admin tab and /admin/stations route were removed in the same round).
// "Delete" is NOT a literal delete — this app has no DELETE endpoint for
// stations (or anything else) by design, matching the insert-only audit
// log and the no-hard-delete pattern everywhere else (plate history,
// retired exception types, etc. all stay visible instead of vanishing).
// The equivalent here is setting status to one of the SUSPENDED_* values,
// which the existing status field already does — a station a user meant
// to "remove" becomes a status change, not a row that quietly disappears
// from data other screens (fill-up history, reports) still reference.
export function StationsListPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canManage = hasPermission('stations:manage');
  const { data: stations, isLoading, isError } = useStations();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [createValues, setCreateValues] = useState<StationFormValues>(EMPTY_STATION_FORM);
  const [editValues, setEditValues] = useState<StationFormValues>(EMPTY_STATION_FORM);
  const [error, setError] = useState<string | null>(null);

  const companiesQuery = useQuery({
    queryKey: ['admin', 'companies'],
    queryFn: async () => (await apiClient.get<CompanyRow[]>('/companies')).data,
    enabled: canManage,
  });
  const municipalitiesQuery = useQuery({
    queryKey: ['admin', 'municipalities'],
    queryFn: async () => (await apiClient.get<LookupRef[]>('/municipalities')).data,
    enabled: canManage,
  });
  const routesQuery = useQuery({
    queryKey: ['admin', 'routes'],
    queryFn: async () => (await apiClient.get<LookupRef[]>('/routes')).data,
    enabled: canManage,
  });
  const securityAuthoritiesQuery = useQuery({
    queryKey: ['admin', 'security-authorities'],
    queryFn: async () => (await apiClient.get<LookupRef[]>('/security-authorities')).data,
    enabled: canManage,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['stations'] });

  const createMutation = useMutation({
    mutationFn: () => apiClient.post('/stations', stationFormToPayload(createValues)),
    onSuccess: () => {
      setError(null);
      setShowCreate(false);
      setCreateValues(EMPTY_STATION_FORM);
      invalidate();
    },
    // The backend's own exception messages are English technical strings
    // ("internalCode is already in use.") — never shown to the user
    // directly, since this is an Arabic UI.
    onError: () => setError('تعذر إضافة المحطة — تحقّق من عدم تكرار رقم المحطة لدى هذه الشركة.'),
  });

  const updateMutation = useMutation({
    mutationFn: (id: string) => apiClient.patch(`/stations/${id}`, stationFormToPayload(editValues)),
    onSuccess: () => {
      setError(null);
      setEditingId(null);
      invalidate();
    },
    onError: () => setError('تعذر تحديث المحطة.'),
  });

  const filtered = useMemo(() => {
    if (!stations) return undefined;
    return stations.filter((s) => matches(s, query) && (!statusFilter || s.status === statusFilter));
  }, [stations, query, statusFilter]);

  const counts = useMemo(() => {
    if (!stations) return null;
    return {
      total: stations.length,
      active: stations.filter((s) => s.status === 'ACTIVE').length,
      notYetSupplied: stations.filter((s) => s.status === 'NOT_YET_SUPPLIED').length,
      suspended: stations.filter((s) => s.status.startsWith('SUSPENDED')).length,
    };
  }, [stations]);

  const selectClass =
    'h-9 rounded-sm bg-surface-alt px-3 text-[12.5px] font-bold text-ink transition-shadow focus:outline-none focus:ring-2 focus:ring-accent';

  function startEdit(station: StationBasicInfo) {
    if (editingId === station.id) {
      setEditingId(null);
      return;
    }
    setEditingId(station.id);
    setEditValues(stationToFormValues(station));
    setError(null);
  }

  return (
    <div>
      <PageHeader
        title="المحطات"
        subtitle={stations ? `${stations.length} محطة ضمن صلاحياتك` : undefined}
        actions={
          canManage ? (
            <PillButton
              size="sm"
              onClick={() => {
                setShowCreate((s) => !s);
                setCreateValues(EMPTY_STATION_FORM);
                setEditingId(null);
                setError(null);
              }}
            >
              {showCreate ? 'إلغاء' : 'محطة جديدة +'}
            </PillButton>
          ) : undefined
        }
      />

      {isLoading && <p className="text-[13px] text-ink-soft">...جارٍ التحميل</p>}
      {isError && <p className="text-[13px] text-danger">تعذر تحميل قائمة المحطات.</p>}
      {error && <p className="mb-3 text-[13px] text-danger">{error}</p>}

      {showCreate && canManage && (
        <Card className="mb-4 animate-scale-in p-4">
          <p className="mb-3 text-[12.5px] font-bold text-primary-dark">محطة جديدة</p>
          <StationFormFields
            values={createValues}
            onChange={setCreateValues}
            companies={companiesQuery.data}
            municipalities={municipalitiesQuery.data}
            routes={routesQuery.data}
            securityAuthorities={securityAuthoritiesQuery.data}
          />
          <PillButton
            className="mt-4"
            disabled={!createValues.stationNumber || !createValues.name || !createValues.companyId || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            حفظ
          </PillButton>
        </Card>
      )}

      {counts && (
        <div className="mb-4 grid animate-fade-in-up grid-cols-2 gap-2.5 sm:grid-cols-4">
          <KpiCard label="إجمالي المحطات" value={counts.total} />
          <KpiCard label="نشطة" value={counts.active} />
          <KpiCard label="لم تُزوَّد بعد" value={counts.notYetSupplied} variant={counts.notYetSupplied > 0 ? 'accent' : 'neutral'} />
          <KpiCard label="موقوفة" value={counts.suspended} variant={counts.suspended > 0 ? 'danger' : 'neutral'} />
        </div>
      )}

      {stations && (
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <div className="relative w-full sm:w-72">
            {/* Same dir="ltr"-on-an-rtl-page mismatch DateField/VehiclesListPage
                already ran into — explicit physical placement, not logical. */}
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-ink-faint">
              <Icon d={ICONS.search} size={15} />
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث بالاسم أو الرمز الداخلي أو رقم المحطة أو البلدية"
              dir="ltr"
              className="h-9 w-full rounded-sm bg-surface pl-3 pr-9 text-end text-[12.5px] text-ink shadow-sm transition-shadow focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectClass}>
            <option value="">كل الحالات</option>
            {STATUS_FILTER_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {stationStatusLabel(status)}
              </option>
            ))}
          </select>
        </div>
      )}

      {filtered && (
        <>
          {/* Mobile: card list — tapping the edit action expands the same
              StationFormFields inline, right below that card. */}
          <div className="space-y-2.5 sm:hidden">
            {filtered.map((station, i) => (
              <Card
                key={station.id}
                className="animate-fade-in-up p-3.5"
                style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary">
                    <Icon d={ICONS.stations} size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-[13.5px] font-bold text-ink">{station.name}</p>
                      <StatusPill variant={STATION_STATUS_VARIANT[station.status] ?? 'neutral'}>
                        {stationStatusLabel(station.status)}
                      </StatusPill>
                    </div>
                    <p className="mt-0.5 text-[11px] text-ink-faint">
                      {station.municipality?.name ?? '—'}
                      {station.ownershipType && ` · ملكية ${ownershipTypeLabel(station.ownershipType)}`}
                    </p>
                  </div>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-soft">
                  <span>
                    الرمز الداخلي: <CodeText>{station.internalCode}</CodeText>
                  </span>
                  <span>
                    رقم المحطة: <CodeText>{station.stationNumber}</CodeText>
                  </span>
                </div>
                {station.fuelAvailability.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {station.fuelAvailability
                      .filter((f) => f.isAvailable)
                      .map((f) => (
                        <StatusPill key={f.fuelType} variant="ok">
                          {fuelTypeLabel(f.fuelType)}
                        </StatusPill>
                      ))}
                  </div>
                )}
                {station.supervisorName && (
                  <p className="mt-2 text-[11px] text-ink-soft">
                    المشرف: {station.supervisorName}
                    {station.supervisorPhone && (
                      <span dir="ltr" className="ms-1">
                        · {station.supervisorPhone}
                      </span>
                    )}
                  </p>
                )}
                {canManage && (
                  <PillButton variant="secondary" size="sm" className="mt-3 w-full justify-center" onClick={() => startEdit(station)}>
                    {editingId === station.id ? 'إغلاق' : 'عرض التفاصيل وتعديل'}
                  </PillButton>
                )}
                {editingId === station.id && (
                  <div className="mt-3 border-t border-surface-alt pt-3">
                    <StationFormFields
                      values={editValues}
                      onChange={setEditValues}
                      companies={companiesQuery.data}
                      municipalities={municipalitiesQuery.data}
                      routes={routesQuery.data}
                      securityAuthorities={securityAuthoritiesQuery.data}
                      disableCompany
                      existingInternalCode={station.internalCode}
                    />
                    <PillButton
                      className="mt-4 w-full justify-center"
                      disabled={!editValues.name || updateMutation.isPending}
                      onClick={() => updateMutation.mutate(station.id)}
                    >
                      حفظ
                    </PillButton>
                  </div>
                )}
              </Card>
            ))}
            {filtered.length === 0 && (
              <Card className="p-4 text-center text-[13px] text-ink-soft">لا توجد محطات مطابقة</Card>
            )}
          </div>

          {/* Desktop: table — a row expands an inline edit panel beneath it,
              same pattern the old /admin/stations page used. */}
          <Card className="hidden sm:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-[12.5px]">
                <thead>
                  <tr className="bg-surface-alt text-[11px] font-bold text-ink-soft">
                    <th className="px-[18px] py-2.5 text-start">الاسم</th>
                    <th className="px-[18px] py-2.5 text-start">الرمز الداخلي</th>
                    <th className="px-[18px] py-2.5 text-start">البلدية</th>
                    <th className="px-[18px] py-2.5 text-start">الملكية</th>
                    <th className="px-[18px] py-2.5 text-start">الوقود المتوفر</th>
                    <th className="px-[18px] py-2.5 text-start">الحالة</th>
                    {canManage && <th className="px-[18px] py-2.5 text-start"></th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((station, i) => (
                    <Fragment key={station.id}>
                      <tr
                        className="animate-fade-in-up border-b border-surface-alt transition-colors last:border-0 hover:bg-surface-alt/60"
                        style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                      >
                        <td className="px-[18px] py-3">
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary">
                              <Icon d={ICONS.stations} size={15} />
                            </span>
                            <span className="font-bold text-ink">{station.name}</span>
                          </div>
                        </td>
                        <td className="px-[18px] py-3">
                          <CodeText>{station.internalCode}</CodeText>
                          <span className="ms-1.5 text-[11px] text-ink-faint">#{station.stationNumber}</span>
                        </td>
                        <td className="px-[18px] py-3 text-ink">{station.municipality?.name ?? '—'}</td>
                        <td className="px-[18px] py-3 text-ink">{ownershipTypeLabel(station.ownershipType)}</td>
                        <td className="px-[18px] py-3">
                          {station.fuelAvailability.filter((f) => f.isAvailable).length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {station.fuelAvailability
                                .filter((f) => f.isAvailable)
                                .map((f) => (
                                  <StatusPill key={f.fuelType} variant="ok">
                                    {fuelTypeLabel(f.fuelType)}
                                  </StatusPill>
                                ))}
                            </div>
                          ) : (
                            <span className="text-ink-faint">—</span>
                          )}
                        </td>
                        <td className="px-[18px] py-3">
                          <StatusPill variant={STATION_STATUS_VARIANT[station.status] ?? 'neutral'}>
                            {stationStatusLabel(station.status)}
                          </StatusPill>
                        </td>
                        {canManage && (
                          <td className="px-[18px] py-3">
                            <PillButton variant="ghost" size="sm" onClick={() => startEdit(station)}>
                              {editingId === station.id ? 'إغلاق' : 'التفاصيل والتعديل'}
                            </PillButton>
                          </td>
                        )}
                      </tr>
                      {editingId === station.id && (
                        <tr className="border-b border-surface-alt bg-paper last:border-0">
                          <td colSpan={7} className="px-[18px] py-4">
                            <StationFormFields
                              values={editValues}
                              onChange={setEditValues}
                              companies={companiesQuery.data}
                              municipalities={municipalitiesQuery.data}
                              routes={routesQuery.data}
                              securityAuthorities={securityAuthoritiesQuery.data}
                              disableCompany
                              existingInternalCode={station.internalCode}
                            />
                            <PillButton
                              className="mt-4"
                              disabled={!editValues.name || updateMutation.isPending}
                              onClick={() => updateMutation.mutate(station.id)}
                            >
                              حفظ
                            </PillButton>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-4 text-center text-[13px] text-ink-soft">
                        لا توجد محطات مطابقة
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
