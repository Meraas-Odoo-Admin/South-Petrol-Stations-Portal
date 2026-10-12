import { VEHICLE_FUEL_TYPE_LABELS_AR } from '@fuel-tracking/shared-types';
import { useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { FillUpHistoryResponse } from '@fuel-tracking/shared-types';
import { apiClient } from '../../lib/apiClient';
import { useAuth } from '../auth/AuthProvider';
import { maskIdentityNumber } from '../../lib/masking';
import { formatLicensePlate } from '../../lib/libyanFormats';
import {
  fuelTypeLabel,
  vehicleChangeTypeLabel,
  identityTypeLabel,
} from '../../lib/labels';
import { VehicleBrandLogo } from '../../components/VehicleBrandLogo';
import { VehicleCardPanel } from '../cards/VehicleCardPanel';
import { Pagination } from '../../components/Pagination';
import { LtrText } from '../../components/LtrText';
import { PageHeader } from '../../components/design/PageHeader';
import { Card, CardHeader } from '../../components/design/Card';
import { PillButton } from '../../components/design/PillButton';
import { StatusPill } from '../../components/design/StatusPill';
import { CodeText } from '../../components/design/CodeText';
import { StandingExceptionsSection } from '../standing-exceptions/StandingExceptionsSection';
import { FillUpStatusPill } from '../../components/FillUpStatusPill';
import { OwnerIdentityReveal } from '../../components/OwnerIdentityReveal';
import { ChangeRequestForm } from './ChangeRequestForm';
import { VehicleEditForm } from './VehicleEditForm';
import { OwnerEditForm } from './OwnerEditForm';
import { OwnerIdentityChangeRequestForm } from './OwnerIdentityChangeRequestForm';
import type { VehicleBasicInfo } from './types';

type ChangeFormType = 'CHASSIS_CHANGE' | 'BOOKLET_CHANGE' | 'OWNER_CHANGE' | 'PLATE_CHANGE' | 'VEHICLE_TYPE_CHANGE';

const TAKE = 20;

type MobileTab = 'identity' | 'plates' | 'card' | 'history';

const MOBILE_TABS: { id: MobileTab; label: string }[] = [
  { id: 'identity', label: 'الهوية' },
  { id: 'plates', label: 'سجل اللوحات' },
  // Round 15: "third tab beside «الهوية» و«اللوحات»" per
  // design/design_handoff_fuel_control_system/README.md §"Round 3".
  { id: 'card', label: 'البطاقة' },
  { id: 'history', label: 'سجل التعبئات' },
];

export function VehicleDetailPage() {
  const { vehicleId } = useParams<{ vehicleId: string }>();
  const { user, hasPermission } = useAuth();
  const permissions = user?.permissions ?? [];
  const canRequestChange = hasPermission('vehicles:request_change');
  const canEditVehicle = hasPermission('vehicles:manage');
  const canReadCards = hasPermission('cards:read');
  const canEditOwner = hasPermission('owners:manage');
  const canRequestOwnerChange = hasPermission('owners:request_change');
  const [skip, setSkip] = useState(0);
  const [openChangeForm, setOpenChangeForm] = useState<ChangeFormType | null>(null);
  const [editingCosmetic, setEditingCosmetic] = useState(false);
  const [editingOwner, setEditingOwner] = useState(false);
  const [requestingOwnerIdentityChange, setRequestingOwnerIdentityChange] = useState(false);
  // Matches design 5d — mobile gets tabs (identity / plate history /
  // fill-up history) instead of everything stacked with scrolling tables.
  // Desktop ignores this entirely: sections stay permanently visible via
  // the `sm:!block` override below, same markup/queries as before this
  // pass.
  const [mobileTab, setMobileTab] = useState<MobileTab>('identity');

  const vehicleQuery = useQuery({
    queryKey: ['vehicles', vehicleId],
    queryFn: async () => (await apiClient.get<VehicleBasicInfo>(`/vehicles/${vehicleId}`)).data,
    enabled: !!vehicleId,
  });

  const weeklyUsageQuery = useQuery({
    queryKey: ['vehicles', vehicleId, 'weekly-usage'],
    queryFn: async () =>
      (await apiClient.get<{ used: number; max: number }>(`/vehicles/${vehicleId}/weekly-usage`)).data,
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

  return (
    <div>
      <PageHeader title={vehicle.internalCode} subtitle={formatLicensePlate(vehicle.currentPlate)} />

      <div className="mb-4 flex gap-1.5 overflow-x-auto sm:hidden">
        {MOBILE_TABS.filter((tab) => tab.id !== 'card' || canReadCards).map((tab) => (
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
        {/* Round 16: QR-first, per the client's own framing of what a user
            opening a vehicle profile most likely wants — the code to share
            with the owner, right alongside the vehicle's identity, not
            buried after plate history/change requests/standing exceptions.
            The identity card and QR panel sit side by side on wide screens
            (lg:) instead of QR only ever reachable via its own mobile tab
            further down the stack — actually using the extra width a
            laptop viewport has instead of leaving it empty beside a single
            narrow column. Also folds the old separate, near-empty "بيانات
            المركبة" edit-toggle card into this same card's header (an
            action, not its own section) — one fewer nearly-blank card. */}
        <div className={`grid grid-cols-1 gap-4 ${canReadCards ? 'lg:grid-cols-[1fr_380px]' : ''}`}>
          <Card className={`animate-fade-in-up ${mobileTab === 'identity' ? '' : 'hidden sm:!block'}`}>
            <div className="flex items-center justify-between gap-3 border-b border-surface-alt p-4">
              <div className="flex min-w-0 items-center gap-3">
                {/* Round 14: "the car logo is an indicator of the car... it
                    should appear as the profile photo" — the brand's real logo
                    (same source VehicleBrandPicker uses), or a generic vehicle
                    glyph for an unmatched/blank brand, as a circular avatar
                    heading the identity card. */}
                <VehicleBrandLogo model={vehicle.make} size={52} />
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-extrabold text-ink">{[vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'طراز غير محدَّد'}</p>
                  <p className="truncate text-[11.5px] text-ink-faint">{vehicle.vehicleType?.name ?? 'نوع غير محدَّد'}</p>
                </div>
              </div>
              {canEditVehicle && !editingCosmetic && (
                <PillButton
                  variant="secondary"
                  size="sm"
                  className="shrink-0"
                  onClick={() => setEditingCosmetic(true)}
                >
                  تعديل
                </PillButton>
              )}
            </div>
            {editingCosmetic ? (
              <div className="p-4">
                <VehicleEditForm vehicle={vehicle} onDone={() => setEditingCosmetic(false)} />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3">
              <Field label="رقم اللوحة" value={<LtrText>{formatLicensePlate(vehicle.currentPlate)}</LtrText>} />
              <Field
                label="رقم الشاصي"
                value={vehicle.chassisNumber ? <CodeText>{vehicle.chassisNumber}</CodeText> : '—'}
              />
              <Field
                label="رقم كتيب المركبة"
                value={vehicle.registrationBooklet ? <CodeText>{vehicle.registrationBooklet}</CodeText> : '—'}
              />
              <Field label="نوع الوقود" value={vehicle.fuelType ? VEHICLE_FUEL_TYPE_LABELS_AR[vehicle.fuelType] : '—'} />
              {vehicle.chassisNonStandard && (
                <Field label="رقم الهيكل" value={<StatusPill variant="accent">غير قياسي</StatusPill>} />
              )}
              <Field label="اللون" value={vehicle.color ?? '—'} />
              <Field label="سنة الصنع" value={vehicle.manufactureYear?.toString() ?? '—'} />
              <Field
                label="المالك"
                value={
                  vehicle.owner && editingOwner ? (
                    <div className="col-span-2 -mt-1 sm:col-span-3">
                      <OwnerEditForm
                        ownerId={vehicle.owner.id}
                        fullName={vehicle.owner.fullName}
                        phone={vehicle.owner.phone}
                        isInstitution={vehicle.owner.ownerKind === 'INSTITUTION'}
                        onDone={() => setEditingOwner(false)}
                      />
                    </div>
                  ) : (
                    <>
                      {vehicle.owner?.fullName ?? '—'}
                      {vehicle.owner?.ownerKind === 'INSTITUTION' && (
                        <div className="mt-1">
                          <StatusPill variant="neutral">جهة / مؤسسة</StatusPill>
                          {vehicle.owner.responsibleDriverName && (
                            <p className="mt-1 text-[11px] text-ink-soft">السائق المسؤول: {vehicle.owner.responsibleDriverName}</p>
                          )}
                        </div>
                      )}
                      {vehicle.owner && canEditOwner && (
                        <button
                          type="button"
                          onClick={() => setEditingOwner(true)}
                          className="mt-1 block text-[11px] font-bold text-accent hover:underline"
                        >
                          تعديل
                        </button>
                      )}
                    </>
                  )
                }
              />
              <Field
                label="رقم هوية المالك"
                value={
                  vehicle.owner ? (
                    <>
                      <p className="mb-1 text-[10.5px] text-ink-faint">{identityTypeLabel(vehicle.owner.identityType)}</p>
                      <span data-testid="vehicle-owner-identity-number">
                        <OwnerIdentityReveal
                          ownerId={vehicle.owner.id}
                          maskedValue={maskIdentityNumber(vehicle.owner.identityNumber, permissions)}
                        />
                      </span>
                    </>
                  ) : (
                    '—'
                  )
                }
              />
              </div>
            )}
          </Card>

          {/* Registration pivot, phase 3: the printed card replaces the old
              on-screen QR (which encoded internalCode — no longer used). */}
          <VehicleCardPanel
            vehicleId={vehicle.id}
            className={`animate-fade-in-up ${mobileTab === 'card' ? '' : 'hidden sm:!block'}`}
            style={{ animationDelay: '60ms' }}
          />
        </div>

        {weeklyUsageQuery.data && (
          <Card
            className={`animate-fade-in-up ${mobileTab === 'identity' ? '' : 'hidden sm:!block'} p-4`}
            style={{ animationDelay: '100ms' }}
          >
            <p className="mb-2 text-[12.5px] font-bold text-ink">استهلاك هذا الأسبوع</p>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[22px] font-black text-ink" data-testid="vehicle-weekly-usage">
                {weeklyUsageQuery.data.used}
              </span>
              <span className="text-[12px] text-ink-soft">من {weeklyUsageQuery.data.max} تعبئات مسموح بها</span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-alt">
              <div
                className={`h-full rounded-full ${
                  weeklyUsageQuery.data.used >= weeklyUsageQuery.data.max ? 'bg-danger' : 'bg-primary'
                }`}
                style={{
                  width: `${Math.min(100, (weeklyUsageQuery.data.used / Math.max(1, weeklyUsageQuery.data.max)) * 100)}%`,
                }}
              />
            </div>
          </Card>
        )}

        {canRequestChange && (
          <Card
            className={`animate-fade-in-up ${mobileTab === 'identity' ? '' : 'hidden sm:!block'}`}
            style={{ animationDelay: '140ms' }}
          >
            <CardHeader title="تعديل هوية المركبة — يتطلب اعتمادًا" />
            <div className="p-4">
              {openChangeForm ? (
                <ChangeRequestForm
                  vehicleId={vehicle.id}
                  changeType={openChangeForm}
                  label={vehicleChangeTypeLabel(openChangeForm)}
                  onDone={() => setOpenChangeForm(null)}
                />
              ) : (
                <div className="flex flex-wrap gap-2">
                  <PillButton variant="secondary" onClick={() => setOpenChangeForm('PLATE_CHANGE')}>
                    طلب تغيير رقم اللوحة
                  </PillButton>
                  <PillButton variant="secondary" onClick={() => setOpenChangeForm('CHASSIS_CHANGE')}>
                    طلب تغيير رقم الشاصي
                  </PillButton>
                  <PillButton variant="secondary" onClick={() => setOpenChangeForm('BOOKLET_CHANGE')}>
                    طلب تغيير رقم كتيب المركبة
                  </PillButton>
                  {/* Round 12/14: every one of these affects fill-up rule
                      eligibility (see VehicleChangeType's schema comment),
                      so they all go through this same approval flow
                      instead of the immediate-save cosmetic form above —
                      requestable by any station employee
                      (vehicles:request_change), approved only by
                      supervisor/directorate-admin/system-admin
                      (vehicles:approve_change, gating the buttons this
                      form's own queue page shows). */}
                  <PillButton variant="secondary" onClick={() => setOpenChangeForm('OWNER_CHANGE')}>
                    طلب تغيير المالك
                  </PillButton>
                  <PillButton variant="secondary" onClick={() => setOpenChangeForm('VEHICLE_TYPE_CHANGE')}>
                    طلب تغيير نوع المركبة
                  </PillButton>
                </div>
              )}
            </div>
          </Card>
        )}

        {canRequestOwnerChange && vehicle.owner && (
          <Card
            className={`animate-fade-in-up ${mobileTab === 'identity' ? '' : 'hidden sm:!block'}`}
            style={{ animationDelay: '160ms' }}
          >
            <CardHeader title="تصحيح هوية المالك — يتطلب اعتمادًا" />
            <div className="p-4">
              {requestingOwnerIdentityChange ? (
                <OwnerIdentityChangeRequestForm
                  ownerId={vehicle.owner.id}
                  currentIdentityType={vehicle.owner.identityType}
                  onDone={() => setRequestingOwnerIdentityChange(false)}
                />
              ) : (
                <div className="flex flex-wrap gap-2">
                  {/* Round 20: correcting a typo'd owner NAME is a direct
                      OwnerEditForm edit above (no approval) — only the
                      identity number/type itself (the field fill-up quotas
                      key on) goes through this approval-gated request,
                      requestable by any station employee
                      (owners:request_change), approved only by
                      supervisor/directorate-admin/system-admin
                      (owners:approve_change). */}
                  <PillButton variant="secondary" onClick={() => setRequestingOwnerIdentityChange(true)}>
                    طلب تصحيح رقم الهوية
                  </PillButton>
                </div>
              )}
            </div>
          </Card>
        )}

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
            contextOwnerId={vehicle.owner?.id}
            contextOwnerLabel={vehicle.owner?.fullName}
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
                    <th className="px-[18px] py-2.5 text-start">المالك</th>
                    <th className="px-[18px] py-2.5 text-start">رقم الهوية</th>
                    <th className="px-[18px] py-2.5 text-start">نوع الوقود</th>
                    <th className="px-[18px] py-2.5 text-start">الكمية (لتر)</th>
                    <th className="px-[18px] py-2.5 text-start">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {historyQuery.data.rows.map((row) => (
                    <tr key={row.id} className="border-b border-surface-alt last:border-0">
                      <td className="px-[18px] py-3">
                        <CodeText>{new Date(row.occurredAt).toLocaleString('en-GB')}</CodeText>
                      </td>
                      <td className="px-[18px] py-3">{row.station.internalCode}</td>
                      <td className="px-[18px] py-3">{row.vehicle?.owner?.fullName ?? '—'}</td>
                      <td className="px-[18px] py-3">
                        {row.vehicle?.owner ? (
                          <OwnerIdentityReveal
                            ownerId={row.vehicle?.owner.id}
                            maskedValue={maskIdentityNumber(row.vehicle?.owner.identityNumber, permissions)}
                          />
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-[18px] py-3">{fuelTypeLabel(row.fuelType)}</td>
                      <td className="px-[18px] py-3">
                        <LtrText>{row.quantityLiters}</LtrText>
                      </td>
                      <td className="px-[18px] py-3">
                        <FillUpStatusPill row={row} />
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
