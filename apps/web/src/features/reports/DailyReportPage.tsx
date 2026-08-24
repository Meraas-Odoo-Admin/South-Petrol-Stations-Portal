import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DailyReportResponse, ReportExportFormat } from '@fuel-tracking/shared-types';
import { apiClient } from '../../lib/apiClient';
import { downloadBlob } from '../../lib/download';
import { useAuth } from '../auth/AuthProvider';
import { SummaryCard } from './SummaryCard';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// Station picker deliberately isn't a fetched dropdown here: a
// reports:view_all_stations holder gets a free-text stationId input
// (leave blank for all stations combined into one summary) rather than a
// GET /stations-backed <select> — pulling that endpoint/type in was judged
// more than this minimal pass needs (M2's DTOs are deliberately not
// mirrored into shared-types yet). A scoped caller's own station is shown
// read-only from their own /auth/me stationScope instead.
export function DailyReportPage() {
  const { user, hasPermission } = useAuth();
  const canViewAllStations = hasPermission('reports:view_all_stations');
  const ownStation = user?.stationScope[0] ?? null;

  const [stationId, setStationId] = useState(canViewAllStations ? '' : (ownStation?.stationId ?? ''));
  const [date, setDate] = useState(todayIso());
  const [exporting, setExporting] = useState<ReportExportFormat | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['reports', 'daily', stationId, date],
    queryFn: async () =>
      (
        await apiClient.get<DailyReportResponse>('/reports/daily', {
          params: { stationId: stationId || undefined, date },
        })
      ).data,
  });

  async function handleExport(format: ReportExportFormat) {
    setExporting(format);
    try {
      const res = await apiClient.get('/reports/daily/export', {
        params: { stationId: stationId || undefined, date, format },
        responseType: 'blob',
      });
      downloadBlob(res.data, `daily-report-${date}.${format}`);
    } finally {
      setExporting(null);
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-lg font-bold text-slate-900">التقرير اليومي</h1>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-sm text-slate-600">المحطة</label>
          {canViewAllStations ? (
            <input
              value={stationId}
              onChange={(e) => setStationId(e.target.value)}
              placeholder="معرف المحطة (اتركه فارغًا لجميع المحطات)"
              className="w-72 rounded border border-slate-300 px-2 py-1"
            />
          ) : (
            <input
              value={ownStation ? `${ownStation.internalCode} — ${ownStation.name}` : 'لا توجد محطة معينة'}
              disabled
              className="w-72 rounded border border-slate-300 bg-slate-100 px-2 py-1 text-slate-500"
            />
          )}
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-600">التاريخ</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1"
          />
        </div>
        <button
          type="button"
          onClick={() => handleExport('xlsx')}
          disabled={exporting !== null}
          className="rounded bg-emerald-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {exporting === 'xlsx' ? '...' : 'تصدير Excel'}
        </button>
        <button
          type="button"
          onClick={() => handleExport('pdf')}
          disabled={exporting !== null}
          className="rounded bg-rose-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {exporting === 'pdf' ? '...' : 'تصدير PDF'}
        </button>
      </div>

      {isLoading && <p className="text-slate-500">...جارٍ التحميل</p>}
      {isError && (
        <p className="text-red-600">
          تعذر تحميل التقرير — تأكد من اختيار محطة إن لم تملك صلاحية عرض جميع المحطات.
        </p>
      )}

      {data && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <SummaryCard label="إجمالي التعبئات" value={data.totalFillUps} />
          <SummaryCard label="إجمالي اللترات" value={data.totalLiters} />
          <SummaryCard label="مخالفات قيد الانتظار" value={data.exceptionsPending} />
          <SummaryCard label="مخالفات معتمدة" value={data.exceptionsApproved} />
        </div>
      )}
    </div>
  );
}
