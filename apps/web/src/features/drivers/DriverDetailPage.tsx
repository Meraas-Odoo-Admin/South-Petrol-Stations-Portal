import { useState, type ReactNode } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { FillUpHistoryResponse } from '@fuel-tracking/shared-types';
import { apiClient } from '../../lib/apiClient';
import { useAuth } from '../auth/AuthProvider';
import { maskIdentityNumber } from '../../lib/masking';
import { formatLicensePlate } from '../../lib/libyanFormats';
import { Pagination } from '../../components/Pagination';
import { LtrText } from '../../components/LtrText';
import { PageHeader } from '../../components/design/PageHeader';
import { Card, CardHeader } from '../../components/design/Card';
import { StatusPill } from '../../components/design/StatusPill';
import { CodeText } from '../../components/design/CodeText';
import { StandingExceptionsSection } from '../standing-exceptions/StandingExceptionsSection';
import type { DriverBasicInfo } from './types';

const TAKE = 20;

export function DriverDetailPage() {
  const { driverId } = useParams<{ driverId: string }>();
  const { user, hasPermission } = useAuth();
  const permissions = user?.permissions ?? [];
  const canReveal = hasPermission('drivers:reveal_identity');
  const [skip, setSkip] = useState(0);
  const [revealed, setRevealed] = useState<string | null>(null);

  const driverQuery = useQuery({
    queryKey: ['drivers', driverId],
    queryFn: async () => (await apiClient.get<DriverBasicInfo>(`/drivers/${driverId}`)).data,
    enabled: !!driverId,
  });

  const revealMutation = useMutation({
    mutationFn: async () =>
      (await apiClient.post<{ identityNumber: string }>(`/drivers/${driverId}/reveal-identity`)).data,
    onSuccess: (data) => setRevealed(data.identityNumber),
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
    return <p className="text-danger">تعذر العثور على السائق.</p>;
  }

  const driver = driverQuery.data;
  const canSeeUnmasked = permissions.includes('reports:view_all_stations');
  const displayedIdentity = canSeeUnmasked
    ? driver.identityNumber
    : (revealed ?? maskIdentityNumber(driver.identityNumber, permissions));

  return (
    <div>
      <PageHeader title={driver.fullName} />

      <div className="space-y-4">
        <Card className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3">
          <Field label="نوع الهوية" value={driver.identityType === 'NATIONAL_ID' ? 'رقم وطني' : 'رقم إداري'} />
          <div>
            <p className="text-[11px] text-ink-faint">رقم الهوية</p>
            <p className="mt-0.5 text-[13px] font-bold text-ink" data-testid="driver-identity-number">
              <LtrText>{displayedIdentity}</LtrText>
            </p>
            {canReveal && !canSeeUnmasked && !revealed && (
              <button
                type="button"
                onClick={() => revealMutation.mutate()}
                disabled={revealMutation.isPending}
                className="mt-1 text-[11px] font-bold text-accent-dark disabled:opacity-50"
              >
                {revealMutation.isPending ? '...' : 'كشف الرقم الوطني (سيُسجَّل هذا الإجراء)'}
              </button>
            )}
          </div>
          <Field label="الهاتف" value={driver.phone ?? '—'} />
        </Card>

        <Card>
          <CardHeader title="المركبة (المركبات)" />
          <div className="space-y-2 p-4">
            {driver.vehicles.length === 0 && <p className="text-[13px] text-ink-soft">لا توجد مركبة مرتبطة بهذا السائق.</p>}
            {driver.vehicles.map((v) => (
              <p key={v.vehicleId} className="text-[13px]">
                <Link to={`/vehicles/${v.vehicleId}`} className="font-bold text-primary hover:underline">
                  {v.vehicle.internalCode}
                </Link>
                {' — '}
                <LtrText>{formatLicensePlate(v.vehicle.currentPlate)}</LtrText>
                {v.isPrimary && (
                  <span className="ms-2">
                    <StatusPill variant="accent">أساسية</StatusPill>
                  </span>
                )}
              </p>
            ))}
          </div>
        </Card>

        <StandingExceptionsSection driverId={driver.id} />

        <Card>
          <CardHeader title="سجل التعبئات" />
          {historyQuery.isLoading && <p className="p-4 text-[13px] text-ink-soft">...جارٍ التحميل</p>}
          {historyQuery.isError && <p className="p-4 text-[13px] text-danger">تعذر تحميل السجل.</p>}
          {historyQuery.data && (
            <>
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="bg-surface-alt text-[11px] font-bold text-ink-soft">
                    <th className="px-[18px] py-2.5 text-start">التاريخ</th>
                    <th className="px-[18px] py-2.5 text-start">المحطة</th>
                    <th className="px-[18px] py-2.5 text-start">المركبة</th>
                    <th className="px-[18px] py-2.5 text-start">نوع الوقود</th>
                    <th className="px-[18px] py-2.5 text-start">الكمية (لتر)</th>
                    <th className="px-[18px] py-2.5 text-start">استثناء</th>
                  </tr>
                </thead>
                <tbody>
                  {historyQuery.data.rows.map((row) => (
                    <tr key={row.id} className="border-b border-surface-alt last:border-0">
                      <td className="px-[18px] py-3">
                        <CodeText>{new Date(row.occurredAt).toLocaleString('en-GB')}</CodeText>
                      </td>
                      <td className="px-[18px] py-3">{row.station.internalCode}</td>
                      <td className="px-[18px] py-3">
                        <Link to={`/vehicles/${row.vehicle.id}`} className="font-medium text-primary hover:underline">
                          <LtrText>{formatLicensePlate(row.vehicle.currentPlate)}</LtrText>
                        </Link>
                      </td>
                      <td className="px-[18px] py-3">{row.fuelType}</td>
                      <td className="px-[18px] py-3">
                        <LtrText>{row.quantityLiters}</LtrText>
                      </td>
                      <td className="px-[18px] py-3">
                        {row.isException ? <StatusPill variant="accent">نعم</StatusPill> : 'لا'}
                      </td>
                    </tr>
                  ))}
                  {historyQuery.data.rows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-[13px] text-ink-soft">
                        لا يوجد سجل
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              <div className="px-[18px] py-3">
                <Pagination skip={skip} take={TAKE} total={historyQuery.data.total} onSkipChange={setSkip} />
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

function Field({ label, value, testId }: { label: string; value: ReactNode; testId?: string }) {
  return (
    <div>
      <p className="text-[11px] text-ink-faint">{label}</p>
      <p className="mt-0.5 text-[13px] font-bold text-ink" data-testid={testId}>
        {value}
      </p>
    </div>
  );
}
