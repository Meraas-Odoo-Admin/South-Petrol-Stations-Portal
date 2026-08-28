import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DashboardResponse } from '@fuel-tracking/shared-types';
import { apiClient } from '../../lib/apiClient';
import { useAuth } from '../auth/AuthProvider';
import { PageHeader } from '../../components/design/PageHeader';
import { Card, CardHeader } from '../../components/design/Card';
import { KpiCard } from '../../components/design/KpiCard';
import { CodeText } from '../../components/design/CodeText';

function isoDateDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// GET /reports/dashboard requires reports:view_all_stations specifically
// (route guard on the backend, not scope-filtering) — the nav link is
// already hidden without it, but this page also checks directly in case
// someone lands here by URL, rather than firing a query that will 403.
//
// Matches 2h (directorate dashboard — "same shell as 2d"): KPI card row +
// per-station table, worst-offender row danger-tinted, not a plain table.
export function DashboardPage() {
  const { hasPermission } = useAuth();
  const canView = hasPermission('reports:view_all_stations');
  const [fromDate, setFromDate] = useState(isoDateDaysAgo(30));
  const [toDate, setToDate] = useState(todayIso());

  const { data, isLoading, isError } = useQuery({
    queryKey: ['reports', 'dashboard', fromDate, toDate],
    queryFn: async () =>
      (
        await apiClient.get<DashboardResponse>('/reports/dashboard', {
          params: { from: `${fromDate}T00:00:00.000Z`, to: `${toDate}T23:59:59.999Z` },
        })
      ).data,
    enabled: canView,
  });

  if (!canView) {
    return <p className="text-[13px] text-ink-soft">ليس لديك صلاحية عرض هذه اللوحة.</p>;
  }

  const exceptionRate = (s: { totalFillUps: number; exceptionCount: number }) =>
    s.totalFillUps > 0 ? s.exceptionCount / s.totalFillUps : 0;
  const worstStationId =
    data && data.perStation.length > 0
      ? [...data.perStation].sort((a, b) => exceptionRate(b) - exceptionRate(a))[0]?.stationId
      : null;

  return (
    <div>
      <PageHeader
        title="لوحة المتابعة على مستوى المديرية"
        actions={
          <>
            <div>
              <label className="mb-1 block text-[11px] font-bold text-ink-soft">من</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-9 rounded-sm bg-surface-alt px-3 text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-bold text-ink-soft">إلى</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-9 rounded-sm bg-surface-alt px-3 text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
          </>
        }
      />

      {isLoading && <p className="text-[13px] text-ink-soft">...جارٍ التحميل</p>}
      {isError && <p className="text-[13px] text-danger">تعذر تحميل البيانات.</p>}

      {data && (
        <>
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <KpiCard label="إجمالي التعبئات" value={data.totalFillUps} />
            <KpiCard label="إجمالي اللترات" value={data.totalLiters} />
            <KpiCard label="نسبة المخالفات" value={`${(data.exceptionRate * 100).toFixed(1)}%`} variant="danger" />
          </div>

          <Card>
            <CardHeader title="حسب المحطة" subtitle="مرتبة بنسبة المخالفات" />
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="bg-surface-alt text-[11px] font-bold text-ink-soft">
                  <th className="px-[18px] py-2.5 text-start">المحطة</th>
                  <th className="px-[18px] py-2.5 text-start">إجمالي التعبئات</th>
                  <th className="px-[18px] py-2.5 text-start">إجمالي اللترات</th>
                  <th className="px-[18px] py-2.5 text-start">المخالفات</th>
                </tr>
              </thead>
              <tbody>
                {data.perStation.map((station) => (
                  <tr
                    key={station.stationId}
                    className={`border-b border-surface-alt last:border-0 ${
                      station.stationId === worstStationId && station.exceptionCount > 0 ? 'bg-danger-100' : ''
                    }`}
                  >
                    <td className="px-[18px] py-3">
                      <span className="font-bold text-ink">{station.name ?? ''}</span>
                      <br />
                      <CodeText>{station.internalCode ?? station.stationId}</CodeText>
                    </td>
                    <td className="px-[18px] py-3 text-ink">{station.totalFillUps}</td>
                    <td className="px-[18px] py-3 text-ink">{station.totalLiters}</td>
                    <td className="px-[18px] py-3 text-ink">{station.exceptionCount}</td>
                  </tr>
                ))}
                {data.perStation.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-[13px] text-ink-soft">
                      لا توجد بيانات لهذا النطاق الزمني
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
