import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { FillUpHistoryResponse } from '@fuel-tracking/shared-types';
import { apiClient } from '../../lib/apiClient';
import { useAuth } from '../auth/AuthProvider';
import { maskIdentityNumber } from '../../lib/masking';
import { Pagination } from '../../components/Pagination';
import type { VehicleBasicInfo } from './types';

const TAKE = 20;

export function VehicleDetailPage() {
  const { vehicleId } = useParams<{ vehicleId: string }>();
  const { user } = useAuth();
  const permissions = user?.permissions ?? [];
  const [skip, setSkip] = useState(0);

  const vehicleQuery = useQuery({
    queryKey: ['vehicles', vehicleId],
    queryFn: async () => (await apiClient.get<VehicleBasicInfo>(`/vehicles/${vehicleId}`)).data,
    enabled: !!vehicleId,
  });

  const historyQuery = useQuery({
    queryKey: ['reports', 'vehicles', vehicleId, 'history', skip],
    queryFn: async () =>
      (
        await apiClient.get<FillUpHistoryResponse>(`/reports/vehicles/${vehicleId}/history`, {
          params: { skip, take: TAKE },
        })
      ).data,
    enabled: !!vehicleId,
  });

  if (vehicleQuery.isLoading) {
    return <p className="text-slate-500">...جارٍ التحميل</p>;
  }
  if (vehicleQuery.isError || !vehicleQuery.data) {
    return <p className="text-red-600">تعذر العثور على المركبة.</p>;
  }

  const vehicle = vehicleQuery.data;

  return (
    <div>
      <h1 className="mb-4 text-lg font-bold text-slate-900">{vehicle.internalCode}</h1>

      <div className="mb-6 grid grid-cols-2 gap-4 rounded-lg bg-white p-4 shadow sm:grid-cols-4">
        <Field label="رقم اللوحة" value={vehicle.currentPlate} />
        <Field label="رقم الشاصي" value={vehicle.chassisNumber ?? '—'} />
        <Field label="النوع" value={vehicle.vehicleType ?? '—'} />
        <Field label="الطراز" value={vehicle.model ?? '—'} />
        <Field label="اللون" value={vehicle.color ?? '—'} />
        <Field label="سنة الصنع" value={vehicle.manufactureYear?.toString() ?? '—'} />
        <Field label="نوع الاستخدام" value={vehicle.usageType ?? '—'} />
      </div>

      <h2 className="mb-2 text-base font-semibold text-slate-900">سجل التعبئات</h2>
      {historyQuery.isLoading && <p className="text-slate-500">...جارٍ التحميل</p>}
      {historyQuery.isError && <p className="text-red-600">تعذر تحميل السجل.</p>}
      {historyQuery.data && (
        <>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-300">
                <th className="p-2 text-start">التاريخ</th>
                <th className="p-2 text-start">المحطة</th>
                <th className="p-2 text-start">السائق</th>
                <th className="p-2 text-start">رقم الهوية</th>
                <th className="p-2 text-start">نوع الوقود</th>
                <th className="p-2 text-start">الكمية (لتر)</th>
                <th className="p-2 text-start">استثناء</th>
              </tr>
            </thead>
            <tbody>
              {historyQuery.data.rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="p-2">{new Date(row.occurredAt).toLocaleString('ar')}</td>
                  <td className="p-2">{row.station.internalCode}</td>
                  <td className="p-2">{row.driver.fullName}</td>
                  <td className="p-2">{maskIdentityNumber(row.driver.identityNumber, permissions)}</td>
                  <td className="p-2">{row.fuelType}</td>
                  <td className="p-2">{row.quantityLiters}</td>
                  <td className="p-2">{row.isException ? 'نعم' : 'لا'}</td>
                </tr>
              ))}
              {historyQuery.data.rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-slate-500">
                    لا يوجد سجل
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <Pagination skip={skip} take={TAKE} total={historyQuery.data.total} onSkipChange={setSkip} />
        </>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}
