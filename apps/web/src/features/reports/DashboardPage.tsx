import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DashboardResponse } from '@fuel-tracking/shared-types';
import { apiClient } from '../../lib/apiClient';
import { useAuth } from '../auth/AuthProvider';
import { SummaryCard } from './SummaryCard';

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
    return <p className="text-slate-600">ليس لديك صلاحية عرض هذه اللوحة.</p>;
  }

  return (
    <div>
      <h1 className="mb-4 text-lg font-bold text-slate-900">لوحة المتابعة على مستوى المديرية</h1>

      <div className="mb-4 flex items-end gap-3">
        <div>
          <label className="mb-1 block text-sm text-slate-600">من</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-600">إلى</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1"
          />
        </div>
      </div>

      {isLoading && <p className="text-slate-500">...جارٍ التحميل</p>}
      {isError && <p className="text-red-600">تعذر تحميل البيانات.</p>}

      {data && (
        <>
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <SummaryCard label="إجمالي التعبئات" value={data.totalFillUps} />
            <SummaryCard label="إجمالي اللترات" value={data.totalLiters} />
            <SummaryCard label="نسبة المخالفات" value={`${(data.exceptionRate * 100).toFixed(1)}%`} />
          </div>

          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-300">
                <th className="p-2 text-start">المحطة</th>
                <th className="p-2 text-start">إجمالي التعبئات</th>
                <th className="p-2 text-start">إجمالي اللترات</th>
                <th className="p-2 text-start">المخالفات</th>
              </tr>
            </thead>
            <tbody>
              {data.perStation.map((station) => (
                <tr key={station.stationId} className="border-b border-slate-100">
                  <td className="p-2">
                    {station.internalCode ?? station.stationId} — {station.name ?? ''}
                  </td>
                  <td className="p-2">{station.totalFillUps}</td>
                  <td className="p-2">{station.totalLiters}</td>
                  <td className="p-2">{station.exceptionCount}</td>
                </tr>
              ))}
              {data.perStation.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-4 text-center text-slate-500">
                    لا توجد بيانات لهذا النطاق الزمني
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
