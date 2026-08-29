import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiClient } from '../../lib/apiClient';
import { formatLicensePlate, normalizePlateSearchTerm } from '../../lib/libyanFormats';
import { PrevNext } from '../../components/PrevNext';
import { LtrText } from '../../components/LtrText';
import { PageHeader } from '../../components/design/PageHeader';
import { Card } from '../../components/design/Card';
import { StatusPill } from '../../components/design/StatusPill';
import { useAuth } from '../auth/AuthProvider';
import { USAGE_TYPE_LABELS, usageTypeLabel, CHANGE_NOT_YET_EFFECTIVE } from '../../lib/labels';
import type { VehicleBasicInfo } from './types';

const TAKE = 20;

interface PendingChangeSummary {
  vehicleId: string;
  reason: string;
}

// Matches design 5a (desktop table) + 5b (mobile card list). GET /vehicles
// isn't station-scoped (vehicles are a directorate-wide registry), so this
// lists every vehicle vehicles:read allows — same as before this rebuild.
// The usageType filter is applied client-side over the loaded page rather
// than as a new backend query param: FindVehiclesQueryDto doesn't support
// it, and adding a server-side filter is out of scope for a visual pass.
export function VehiclesListPage() {
  const { hasPermission } = useAuth();
  const canSeeChangeRequests = hasPermission('vehicles:approve_change');
  const [skip, setSkip] = useState(0);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [usageFilter, setUsageFilter] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(normalizePlateSearchTerm(query));
      setSkip(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['vehicles', 'list', skip, debounced],
    queryFn: async () =>
      (
        await apiClient.get<VehicleBasicInfo[]>('/vehicles', {
          params: { skip, take: TAKE, search: debounced || undefined },
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

  const filtered = useMemo(() => {
    if (!data) return data;
    if (!usageFilter) return data;
    return data.filter((v) => v.usageType === usageFilter);
  }, [data, usageFilter]);

  const selectClass =
    'h-9 rounded-sm bg-surface-alt px-3 text-[12.5px] font-bold text-ink focus:outline-none focus:ring-2 focus:ring-accent';

  return (
    <div>
      <PageHeader title="المركبات" subtitle={data ? `${data.length} مركبة في هذه الصفحة` : undefined} />

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ابحث برقم اللوحة أو الرمز الداخلي"
          dir="ltr"
          className="h-9 w-full rounded-sm bg-surface px-3 text-end text-[12.5px] text-ink shadow-sm focus:outline-none focus:ring-2 focus:ring-accent sm:w-72"
        />
        <select value={usageFilter} onChange={(e) => setUsageFilter(e.target.value)} className={selectClass}>
          <option value="">كل أنواع الاستخدام</option>
          {Object.entries(USAGE_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <p className="text-[13px] text-ink-soft">...جارٍ التحميل</p>}
      {isError && <p className="text-[13px] text-danger">تعذر تحميل قائمة المركبات.</p>}

      {filtered && (
        <>
          {/* Desktop table (5a) */}
          <Card className="hidden sm:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-[12.5px]">
                <thead>
                  <tr className="bg-surface-alt text-[11px] font-bold text-ink-soft">
                    <th className="px-[18px] py-2.5 text-start">الرمز الداخلي</th>
                    <th className="px-[18px] py-2.5 text-start">رقم اللوحة</th>
                    <th className="px-[18px] py-2.5 text-start">نوع الاستخدام</th>
                    <th className="px-[18px] py-2.5 text-start">الطراز</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((vehicle) => {
                    const pending = pendingByVehicleId.get(vehicle.id);
                    return (
                      <tr
                        key={vehicle.id}
                        className={`border-b border-surface-alt last:border-0 ${pending ? 'bg-accent-100' : ''}`}
                      >
                        <td className="px-[18px] py-3">
                          <Link to={`/vehicles/${vehicle.id}`} className="font-bold text-primary hover:underline">
                            {vehicle.internalCode}
                          </Link>
                        </td>
                        <td className="px-[18px] py-3">
                          <LtrText>{formatLicensePlate(vehicle.currentPlate)}</LtrText>
                          {pending && (
                            <div className="mt-1 flex flex-col gap-0.5">
                              <StatusPill variant="accent">{CHANGE_NOT_YET_EFFECTIVE}</StatusPill>
                              <span className="text-[11px] text-ink-soft">{pending.reason}</span>
                            </div>
                          )}
                        </td>
                        <td className="px-[18px] py-3 text-ink">{usageTypeLabel(vehicle.usageType)}</td>
                        <td className="px-[18px] py-3 text-ink">{vehicle.model ?? '—'}</td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-[13px] text-ink-soft">
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
            {filtered.map((vehicle) => {
              const pending = pendingByVehicleId.get(vehicle.id);
              return (
                <Link key={vehicle.id} to={`/vehicles/${vehicle.id}`}>
                  <Card className={`p-4 ${pending ? 'border-s-4 border-accent' : ''}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[14px] font-extrabold text-ink">{vehicle.internalCode}</span>
                      {pending && <StatusPill variant="accent">{CHANGE_NOT_YET_EFFECTIVE}</StatusPill>}
                    </div>
                    <div className="mt-1.5 text-[13px] font-bold text-ink-soft">
                      <LtrText>{formatLicensePlate(vehicle.currentPlate)}</LtrText>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-[11.5px] text-ink-faint">
                      <span>{usageTypeLabel(vehicle.usageType)}</span>
                      <span>·</span>
                      <span>{vehicle.model ?? '—'}</span>
                    </div>
                    {pending && <p className="mt-2 text-[11.5px] text-ink-soft">{pending.reason}</p>}
                  </Card>
                </Link>
              );
            })}
            {filtered.length === 0 && (
              <Card className="p-6 text-center text-[13px] text-ink-soft">لا توجد مركبات مطابقة</Card>
            )}
          </div>

          <PrevNext skip={skip} take={TAKE} rowCount={data?.length ?? 0} onSkipChange={setSkip} />
        </>
      )}
    </div>
  );
}
