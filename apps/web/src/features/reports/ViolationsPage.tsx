import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type {
  ReportExportFormat,
  ViolationStatus,
  ViolationsResponse,
} from '@fuel-tracking/shared-types';
import { apiClient } from '../../lib/apiClient';
import { downloadBlob } from '../../lib/download';
import { useAuth } from '../auth/AuthProvider';
import { maskIdentityNumber } from '../../lib/masking';
import { Pagination } from '../../components/Pagination';

const TAKE = 20;

export function ViolationsPage() {
  const { user, hasPermission } = useAuth();
  const canViewAllStations = hasPermission('reports:view_all_stations');
  const ownStation = user?.stationScope[0] ?? null;
  const permissions = user?.permissions ?? [];

  const [stationId, setStationId] = useState(canViewAllStations ? '' : (ownStation?.stationId ?? ''));
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState<ViolationStatus>('all');
  const [skip, setSkip] = useState(0);
  const [exporting, setExporting] = useState<ReportExportFormat | null>(null);

  const exportParams = {
    stationId: stationId || undefined,
    from: from ? `${from}T00:00:00.000Z` : undefined,
    to: to ? `${to}T23:59:59.999Z` : undefined,
    status,
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ['reports', 'violations', stationId, from, to, status, skip],
    queryFn: async () =>
      (
        await apiClient.get<ViolationsResponse>('/reports/violations', {
          params: { ...exportParams, skip, take: TAKE },
        })
      ).data,
  });

  async function handleExport(format: ReportExportFormat) {
    setExporting(format);
    try {
      const res = await apiClient.get('/reports/violations/export', {
        params: { ...exportParams, format },
        responseType: 'blob',
      });
      downloadBlob(res.data, `violations.${format}`);
    } finally {
      setExporting(null);
    }
  }

  function resetPageAnd<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setSkip(0);
    };
  }

  return (
    <div>
      <h1 className="mb-4 text-lg font-bold text-slate-900">المخالفات / الاستثناءات</h1>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-sm text-slate-600">المحطة</label>
          {canViewAllStations ? (
            <input
              value={stationId}
              onChange={(e) => resetPageAnd(setStationId)(e.target.value)}
              placeholder="جميع المحطات"
              className="w-64 rounded border border-slate-300 px-2 py-1"
            />
          ) : (
            <input
              value={ownStation ? `${ownStation.internalCode} — ${ownStation.name}` : 'لا توجد محطة'}
              disabled
              className="w-64 rounded border border-slate-300 bg-slate-100 px-2 py-1 text-slate-500"
            />
          )}
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-600">من تاريخ</label>
          <input
            type="date"
            value={from}
            onChange={(e) => resetPageAnd(setFrom)(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-600">إلى تاريخ</label>
          <input
            type="date"
            value={to}
            onChange={(e) => resetPageAnd(setTo)(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-600">الحالة</label>
          <select
            value={status}
            onChange={(e) => resetPageAnd(setStatus)(e.target.value as ViolationStatus)}
            className="rounded border border-slate-300 px-2 py-1"
          >
            <option value="all">الكل</option>
            <option value="pending">قيد الانتظار</option>
            <option value="approved">معتمدة</option>
          </select>
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
      {isError && <p className="text-red-600">تعذر تحميل المخالفات.</p>}

      {data && (
        <>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-300">
                <th className="p-2 text-start">التاريخ</th>
                <th className="p-2 text-start">المحطة</th>
                <th className="p-2 text-start">المركبة</th>
                <th className="p-2 text-start">السائق</th>
                <th className="p-2 text-start">رقم الهوية</th>
                <th className="p-2 text-start">نوع الاستثناء</th>
                <th className="p-2 text-start">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="p-2">{new Date(row.fillUpTransaction.occurredAt).toLocaleString('ar')}</td>
                  <td className="p-2">{row.fillUpTransaction.station.internalCode}</td>
                  <td className="p-2">{row.fillUpTransaction.vehicle.currentPlate}</td>
                  <td className="p-2">{row.fillUpTransaction.driver.fullName}</td>
                  <td className="p-2">
                    {maskIdentityNumber(row.fillUpTransaction.driver.identityNumber, permissions)}
                  </td>
                  <td className="p-2">{row.exceptionType.name}</td>
                  <td className="p-2">{row.approvedById ? 'معتمدة' : 'قيد الانتظار'}</td>
                </tr>
              ))}
              {data.rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-slate-500">
                    لا توجد مخالفات مطابقة
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <Pagination skip={skip} take={TAKE} total={data.total} onSkipChange={setSkip} />
        </>
      )}
    </div>
  );
}
