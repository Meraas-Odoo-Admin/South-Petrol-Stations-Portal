import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DailyReportResponse, FuelType, ReportExportFormat } from '@fuel-tracking/shared-types';
import { apiClient } from '../../lib/apiClient';
import { downloadBlob } from '../../lib/download';
import { useAuth } from '../auth/AuthProvider';
import { StationSelect } from '../../components/StationSelect';
import { DriverSearchSelect } from '../fillups/DriverSearchSelect';
import { PageHeader } from '../../components/design/PageHeader';
import { Card } from '../../components/design/Card';
import { PillButton } from '../../components/design/PillButton';
import { KpiCard } from '../../components/design/KpiCard';
import { FUEL_TYPE_LABELS } from '../../lib/labels';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const selectClass =
  'h-9 rounded-sm bg-surface-alt px-3 text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-60';

export function DailyReportPage() {
  const { user, hasPermission } = useAuth();
  const canViewAllStations = hasPermission('reports:view_all_stations');
  const ownStation = user?.stationScope[0] ?? null;

  const [stationId, setStationId] = useState(canViewAllStations ? '' : (ownStation?.stationId ?? ''));
  const [date, setDate] = useState(todayIso());
  const [driverId, setDriverId] = useState('');
  const [driverLabel, setDriverLabel] = useState('');
  const [fuelType, setFuelType] = useState<FuelType | ''>('');
  const [exporting, setExporting] = useState<ReportExportFormat | null>(null);

  const exportParams = {
    stationId: stationId || undefined,
    date,
    driverId: driverId || undefined,
    fuelType: fuelType || undefined,
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ['reports', 'daily', stationId, date, driverId, fuelType],
    queryFn: async () => (await apiClient.get<DailyReportResponse>('/reports/daily', { params: exportParams })).data,
  });

  async function handleExport(format: ReportExportFormat) {
    setExporting(format);
    try {
      const res = await apiClient.get('/reports/daily/export', {
        params: { ...exportParams, format },
        responseType: 'blob',
      });
      downloadBlob(res.data, `daily-report-${date}.${format}`);
    } finally {
      setExporting(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="التقرير اليومي"
        actions={
          <>
            <PillButton variant="secondary" size="sm" onClick={() => handleExport('xlsx')} disabled={exporting !== null}>
              {exporting === 'xlsx' ? '...' : 'تصدير Excel'}
            </PillButton>
            <PillButton size="sm" onClick={() => handleExport('pdf')} disabled={exporting !== null}>
              {exporting === 'pdf' ? '...' : 'تصدير PDF'}
            </PillButton>
          </>
        }
      />

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-[11px] font-bold text-ink-soft">المحطة</label>
            {canViewAllStations ? (
              <StationSelect value={stationId} onChange={setStationId} allowAllOption className={`w-56 ${selectClass}`} />
            ) : (
              <StationSelect value={stationId} onChange={setStationId} disabled className={`w-56 ${selectClass}`} />
            )}
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold text-ink-soft">التاريخ</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={selectClass} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold text-ink-soft">السائق (اختياري)</label>
            {driverId ? (
              <div className="flex h-9 items-center gap-2 rounded-sm bg-surface-alt px-3 text-[12.5px] text-ink">
                <span>{driverLabel}</span>
                <button
                  type="button"
                  onClick={() => {
                    setDriverId('');
                    setDriverLabel('');
                  }}
                  className="text-ink-faint hover:text-ink"
                >
                  ✕
                </button>
              </div>
            ) : (
              <DriverSearchSelect
                value={driverId}
                onChange={(id, label) => {
                  setDriverId(id);
                  setDriverLabel(label);
                }}
              />
            )}
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold text-ink-soft">نوع الوقود (اختياري)</label>
            <select value={fuelType} onChange={(e) => setFuelType(e.target.value as FuelType | '')} className={selectClass}>
              <option value="">الكل</option>
              {Object.entries(FUEL_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {isLoading && <p className="text-[13px] text-ink-soft">...جارٍ التحميل</p>}
      {isError && (
        <p className="text-[13px] text-danger">
          تعذر تحميل التقرير — تأكد من اختيار محطة إن لم تملك صلاحية عرض جميع المحطات.
        </p>
      )}

      {data && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <KpiCard label="إجمالي التعبئات" value={data.totalFillUps} />
          <KpiCard label="إجمالي اللترات" value={data.totalLiters} />
          <KpiCard label="مخالفات قيد الانتظار" value={data.exceptionsPending} variant="accent" />
          <KpiCard label="مخالفات معتمدة" value={data.exceptionsApproved} />
        </div>
      )}
    </div>
  );
}
