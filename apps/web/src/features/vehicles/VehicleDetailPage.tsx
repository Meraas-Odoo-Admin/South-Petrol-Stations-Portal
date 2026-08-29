import { useState, type ReactNode } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { FillUpHistoryResponse } from '@fuel-tracking/shared-types';
import { apiClient } from '../../lib/apiClient';
import { useAuth } from '../auth/AuthProvider';
import { maskIdentityNumber } from '../../lib/masking';
import { formatLicensePlate } from '../../lib/libyanFormats';
import { usageTypeLabel, fuelTypeLabel, vehicleChangeTypeLabel } from '../../lib/labels';
import { Pagination } from '../../components/Pagination';
import { LtrText } from '../../components/LtrText';
import { PageHeader } from '../../components/design/PageHeader';
import { Card, CardHeader } from '../../components/design/Card';
import { PillButton } from '../../components/design/PillButton';
import { StatusPill } from '../../components/design/StatusPill';
import { CodeText } from '../../components/design/CodeText';
import { StandingExceptionsSection } from '../standing-exceptions/StandingExceptionsSection';
import { ChangeRequestForm } from './ChangeRequestForm';
import type { VehicleBasicInfo } from './types';

const TAKE = 20;

type MobileTab = 'identity' | 'plates' | 'drivers' | 'history';

const MOBILE_TABS: { id: MobileTab; label: string }[] = [
  { id: 'identity', label: 'الهوية' },
  { id: 'plates', label: 'سجل اللوحات' },
  { id: 'drivers', label: 'السائق والمالك' },
  { id: 'history', label: 'سجل التعبئات' },
];

export function VehicleDetailPage() {
  const { vehicleId } = useParams<{ vehicleId: string }>();
  const { user, hasPermission } = useAuth();
  const permissions = user?.permissions ?? [];
  const canRequestChange = hasPermission('vehicles:request_change');
  const [skip, setSkip] = useState(0);
  const [openChangeForm, setOpenChangeForm] = useState<'CHASSIS_CHANGE' | 'BOOKLET_CHANGE' | null>(null);
  // Matches design 5d — mobile gets tabs (identity / plate history /
  // driver+owner / fill-up history) instead of everything stacked with
  // scrolling tables. Desktop ignores this entirely: sections stay
  // permanently visible via the `sm:!block` override below, same
  // markup/queries as before this pass.
  const [mobileTab, setMobileTab] = useState<MobileTab>('identity');

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
    return <p className="text-danger">تعذر العثور على المركبة.</p>;
  }

  const vehicle = vehicleQuery.data;
  const primaryDriver = vehicle.drivers.find((d) => d.isPrimary) ?? vehicle.drivers[0];
  const otherDrivers = vehicle.drivers.filter((d) => d.driverId !== primaryDriver?.driverId);

  return (
    <div>
      <PageHeader title={vehicle.internalCode} subtitle={formatLicensePlate(vehicle.currentPlate)} />

      <div className="mb-4 flex gap-1.5 overflow-x-auto sm:hidden">
        {MOBILE_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setMobileTab(tab.id)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-bold ${
              mobileTab === tab.id ? 'bg-primary text-white' : 'bg-surface-alt text-ink-soft'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        <Card className={`${mobileTab === 'identity' ? '' : 'hidden'} grid grid-cols-2 gap-4 p-4 sm:!grid sm:grid-cols-4`}>
          <Field label="رقم اللوحة" value={<LtrText>{formatLicensePlate(vehicle.currentPlate)}</LtrText>} />
          <Field
            label="رقم الشاصي"
            value={vehicle.chassisNumber ? <CodeText>{vehicle.chassisNumber}</CodeText> : '—'}
          />
          <Field
            label="رقم كتيب المركبة"
            value={vehicle.registrationBooklet ? <CodeText>{vehicle.registrationBooklet}</CodeText> : '—'}
          />
          <Field label="النوع" value={vehicle.vehicleType ?? '—'} />
          <Field label="الطراز" value={vehicle.model ?? '—'} />
          <Field label="اللون" value={vehicle.color ?? '—'} />
          <Field label="سنة الصنع" value={vehicle.manufactureYear?.toString() ?? '—'} />
          <Field label="نوع الاستخدام" value={usageTypeLabel(vehicle.usageType)} />
          <Field label="المالك" value={vehicle.owner?.fullName ?? '—'} />
        </Card>

        {canRequestChange && (
          <Card className={mobileTab === 'identity' ? '' : 'hidden sm:!block'}>
            <CardHeader title="تعديل هوية المركبة" />
            <div className="p-4">
              {openChangeForm ? (
                <ChangeRequestForm
                  vehicleId={vehicle.id}
                  changeType={openChangeForm}
                  label={vehicleChangeTypeLabel(openChangeForm)}
                  onDone={() => setOpenChangeForm(null)}
                />
              ) : (
                <div className="flex gap-2">
                  <PillButton variant="secondary" onClick={() => setOpenChangeForm('CHASSIS_CHANGE')}>
                    طلب تغيير رقم الشاصي
                  </PillButton>
                  <PillButton variant="secondary" onClick={() => setOpenChangeForm('BOOKLET_CHANGE')}>
                    طلب تغيير رقم كتيب المركبة
                  </PillButton>
                </div>
              )}
            </div>
          </Card>
        )}

        <Card className={mobileTab === 'drivers' ? '' : 'hidden sm:!block'}>
          <CardHeader title="السائق (السائقون)" />
          <div className="space-y-2 p-4">
            {vehicle.drivers.length === 0 && <p className="text-[13px] text-ink-soft">لا يوجد سائق مرتبط بهذه المركبة.</p>}
            {primaryDriver && (
              <p className="text-[13px]">
                <span className="text-ink-faint">السائق الأساسي: </span>
                <Link to={`/drivers/${primaryDriver.driverId}`} className="font-bold text-primary hover:underline">
                  {primaryDriver.driver.fullName}
                </Link>
                {' — '}
                <LtrText>{maskIdentityNumber(primaryDriver.driver.identityNumber, permissions)}</LtrText>
              </p>
            )}
            {otherDrivers.map((d) => (
              <p key={d.driverId} className="text-[13px]">
                <span className="text-ink-faint">سائق آخر: </span>
                <Link to={`/drivers/${d.driverId}`} className="font-bold text-primary hover:underline">
                  {d.driver.fullName}
                </Link>
                {' — '}
                <LtrText>{maskIdentityNumber(d.driver.identityNumber, permissions)}</LtrText>
              </p>
            ))}
          </div>
        </Card>

        <Card className={mobileTab === 'plates' ? '' : 'hidden sm:!block'}>
          <CardHeader title="سجل اللوحات" />
          {vehicle.plateHistory.length === 0 && <p className="p-4 text-[13px] text-ink-soft">لا يوجد سجل.</p>}
          {vehicle.plateHistory.length > 0 && (
            <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[12.5px]">
              <thead>
                <tr className="bg-surface-alt text-[11px] font-bold text-ink-soft">
                  <th className="px-[18px] py-2.5 text-start">رقم اللوحة</th>
                  <th className="px-[18px] py-2.5 text-start">سارية من</th>
                  <th className="px-[18px] py-2.5 text-start">سارية حتى</th>
                </tr>
              </thead>
              <tbody>
                {vehicle.plateHistory.map((entry) => (
                  <tr key={entry.id} className="border-b border-surface-alt last:border-0">
                    <td className="px-[18px] py-3">
                      <LtrText>{formatLicensePlate(entry.plate)}</LtrText>
                    </td>
                    <td className="px-[18px] py-3">
                      <CodeText>{new Date(entry.validFrom).toLocaleDateString('en-GB')}</CodeText>
                    </td>
                    <td className="px-[18px] py-3">
                      {entry.validTo ? (
                        <CodeText>{new Date(entry.validTo).toLocaleDateString('en-GB')}</CodeText>
                      ) : (
                        <StatusPill variant="ok">حاليًا سارية</StatusPill>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </Card>

        <div className={mobileTab === 'identity' ? '' : 'hidden sm:!block'}>
          <StandingExceptionsSection
            vehicleId={vehicle.id}
            vehicleLabel={formatLicensePlate(vehicle.currentPlate)}
            contextDriverId={primaryDriver?.driverId}
            contextDriverLabel={primaryDriver?.driver.fullName}
          />
        </div>

        <Card className={mobileTab === 'history' ? '' : 'hidden sm:!block'}>
          <CardHeader title="سجل التعبئات" />
          {historyQuery.isLoading && <p className="p-4 text-[13px] text-ink-soft">...جارٍ التحميل</p>}
          {historyQuery.isError && <p className="p-4 text-[13px] text-danger">تعذر تحميل السجل.</p>}
          {historyQuery.data && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-[12.5px]">
                <thead>
                  <tr className="bg-surface-alt text-[11px] font-bold text-ink-soft">
                    <th className="px-[18px] py-2.5 text-start">التاريخ</th>
                    <th className="px-[18px] py-2.5 text-start">المحطة</th>
                    <th className="px-[18px] py-2.5 text-start">السائق</th>
                    <th className="px-[18px] py-2.5 text-start">رقم الهوية</th>
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
                        <Link to={`/drivers/${row.driver.id}`} className="font-medium text-primary hover:underline">
                          {row.driver.fullName}
                        </Link>
                      </td>
                      <td className="px-[18px] py-3">
                        <LtrText>{maskIdentityNumber(row.driver.identityNumber, permissions)}</LtrText>
                      </td>
                      <td className="px-[18px] py-3">{fuelTypeLabel(row.fuelType)}</td>
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
                      <td colSpan={7} className="p-4 text-center text-[13px] text-ink-soft">
                        لا يوجد سجل
                      </td>
                    </tr>
                  )}
                </tbody>
                </table>
              </div>
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

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-[11px] text-ink-faint">{label}</p>
      <p className="mt-0.5 text-[13px] font-bold text-ink">{value}</p>
    </div>
  );
}
