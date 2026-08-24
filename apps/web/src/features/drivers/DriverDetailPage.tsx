import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { FillUpHistoryResponse } from '@fuel-tracking/shared-types';
import { apiClient } from '../../lib/apiClient';
import { useAuth } from '../auth/AuthProvider';
import { maskIdentityNumber } from '../../lib/masking';
import { Pagination } from '../../components/Pagination';
import type { DriverBasicInfo } from './types';

const TAKE = 20;

export function DriverDetailPage() {
  const { driverId } = useParams<{ driverId: string }>();
  const { user } = useAuth();
  const permissions = user?.permissions ?? [];
  const [skip, setSkip] = useState(0);

  const driverQuery = useQuery({
    queryKey: ['drivers', driverId],
    queryFn: async () => (await apiClient.get<DriverBasicInfo>(`/drivers/${driverId}`)).data,
    enabled: !!driverId,
  });

  const historyQuery = useQuery({
    queryKey: ['reports', 'drivers', driverId, 'history', skip],
    queryFn: async () =>
      (
        await apiClient.get<FillUpHistoryResponse>(`/reports/drivers/${driverId}/history`, {
          params: { skip, take: TAKE },
        })
      ).data,
    enabled: !!driverId,
  });

  if (driverQuery.isLoading) {
    return <p className="text-slate-500">...جارٍ التحميل</p>;
  }
  if (driverQuery.isError || !driverQuery.data) {
    return <p className="text-red-600">تعذر العثور على السائق.</p>;
  }

  const driver = driverQuery.data;

  return (
    <div>
      <h1 className="mb-4 text-lg font-bold text-slate-900">{driver.fullName}</h1>

      <div className="mb-6 grid grid-cols-2 gap-4 rounded-lg bg-white p-4 shadow sm:grid-cols-3">
        <Field label="نوع الهوية" value={driver.identityType === 'NATIONAL_ID' ? 'رقم وطني' : 'رقم إداري'} />
        <Field
          label="رقم الهوية"
          value={maskIdentityNumber(driver.identityNumber, permissions)}
          testId="driver-identity-number"
        />
        <Field label="الهاتف" value={driver.phone ?? '—'} />
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
                <th className="p-2 text-start">المركبة</th>
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
                  <td className="p-2">{row.vehicle.currentPlate}</td>
                  <td className="p-2">{row.fuelType}</td>
                  <td className="p-2">{row.quantityLiters}</td>
                  <td className="p-2">{row.isException ? 'نعم' : 'لا'}</td>
                </tr>
              ))}
              {historyQuery.data.rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-slate-500">
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

function Field({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-sm font-medium text-slate-900" data-testid={testId}>
        {value}
      </p>
    </div>
  );
}
