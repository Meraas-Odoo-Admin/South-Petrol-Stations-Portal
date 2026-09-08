import type { ReactNode } from 'react';
import {
  STATION_STATUS_LABELS,
  OWNERSHIP_TYPE_LABELS,
  FUEL_TYPE_LABELS,
} from '../../lib/labels';
import type { LookupRef, StationBasicInfo, StationOwnershipType } from './types';

interface CompanyRow {
  id: string;
  name: string;
}

// Matches apps/api/prisma/schema.prisma's StationStatus enum exactly.
export type StationStatus = keyof typeof STATION_STATUS_LABELS;
export type FuelTypeKey = keyof typeof FUEL_TYPE_LABELS;

// station-card-field-spec — the create/edit form's full shape, in the
// order the spec's own field table lays it out.
//
// Round 19: moved here from features/admin/StationsAdminPage.tsx (now
// deleted) — "the system admin and admin should be able to add/edit/
// delete all the stations from the stations page instead of doing it from
// the settings, I think that is much more logical." One shared component
// used by StationsListPage.tsx directly now; there is no separate admin
// surface for this anymore.
export interface StationFormValues {
  stationNumber: string;
  name: string;
  companyId: string;
  municipalityId: string;
  routeId: string;
  securityAuthorityId: string;
  ownershipType: StationOwnershipType | '';
  status: StationStatus;
  statusNote: string;
  fuelTypes: FuelTypeKey[];
  supervisorName: string;
  supervisorPhone: string;
  operatorSameAsSupervisor: boolean;
  operatorName: string;
  operatorPhone: string;
}

export const EMPTY_STATION_FORM: StationFormValues = {
  stationNumber: '',
  name: '',
  companyId: '',
  municipalityId: '',
  routeId: '',
  securityAuthorityId: '',
  ownershipType: '',
  status: 'ACTIVE',
  statusNote: '',
  fuelTypes: [],
  supervisorName: '',
  supervisorPhone: '',
  operatorSameAsSupervisor: false,
  operatorName: '',
  operatorPhone: '',
};

export function stationToFormValues(station: StationBasicInfo): StationFormValues {
  return {
    stationNumber: station.stationNumber,
    name: station.name,
    companyId: station.companyId,
    municipalityId: station.municipalityId ?? '',
    routeId: station.routeId ?? '',
    securityAuthorityId: station.securityAuthorityId ?? '',
    ownershipType: station.ownershipType ?? '',
    status: (station.status as StationStatus) ?? 'ACTIVE',
    statusNote: station.statusNote ?? '',
    fuelTypes: station.fuelAvailability.filter((f) => f.isAvailable).map((f) => f.fuelType as FuelTypeKey),
    supervisorName: station.supervisorName ?? '',
    supervisorPhone: station.supervisorPhone ?? '',
    operatorSameAsSupervisor: station.operatorSameAsSupervisor,
    operatorName: station.operatorName ?? '',
    operatorPhone: station.operatorPhone ?? '',
  };
}

export function stationFormToPayload(values: StationFormValues) {
  return {
    stationNumber: values.stationNumber,
    name: values.name,
    companyId: values.companyId,
    municipalityId: values.municipalityId || undefined,
    routeId: values.routeId || undefined,
    securityAuthorityId: values.securityAuthorityId || undefined,
    ownershipType: values.ownershipType || undefined,
    status: values.status,
    // Only meaningful once status !== ACTIVE — still sent as-is either
    // way (an empty string clears a stale note if status returns to
    // ACTIVE without the field being touched).
    statusNote: values.statusNote || undefined,
    fuelTypes: values.fuelTypes,
    supervisorName: values.supervisorName || undefined,
    supervisorPhone: values.supervisorPhone || undefined,
    operatorSameAsSupervisor: values.operatorSameAsSupervisor,
    operatorName: values.operatorSameAsSupervisor ? undefined : values.operatorName || undefined,
    operatorPhone: values.operatorSameAsSupervisor ? undefined : values.operatorPhone || undefined,
  };
}

const inputClass =
  'h-9 w-full rounded-sm bg-surface-alt px-3 text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-accent';
const labelClass = 'mb-1 block text-[11px] font-bold text-ink-soft';
const sectionLabelClass = 'mb-2 text-[11px] font-bold text-ink-faint';

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className={labelClass}>{label}</label>
      {children}
    </div>
  );
}

// station-card-field-spec: the create/edit form follows the field
// hierarchy and ordering the spec lays out — internalCode auto-generated
// (never typed), company/municipality/route/security-authority as
// Settings-managed dropdowns (never free text, which the spec's own
// research found causes real spelling drift), ownership/status as fixed
// enums, fuel types as a multi-select, and the operator-same-as-supervisor
// toggle so the "same person" case (the spec's own most common real-data
// shape) doesn't require retyping a name and number already on the form.
export function StationFormFields({
  values,
  onChange,
  companies,
  municipalities,
  routes,
  securityAuthorities,
  disableCompany,
  // Set when editing an EXISTING station — it already has a real
  // internalCode, so the field shows that (read-only, still never
  // typed/edited) instead of the "will be auto-generated" placeholder,
  // which only makes sense before the station exists yet.
  existingInternalCode,
}: {
  values: StationFormValues;
  onChange: (values: StationFormValues) => void;
  companies: CompanyRow[] | undefined;
  municipalities: LookupRef[] | undefined;
  routes: LookupRef[] | undefined;
  securityAuthorities: LookupRef[] | undefined;
  disableCompany?: boolean;
  existingInternalCode?: string;
}) {
  function set<K extends keyof StationFormValues>(key: K, value: StationFormValues[K]) {
    onChange({ ...values, [key]: value });
  }

  return (
    <div className="space-y-4">
      <div>
        <p className={sectionLabelClass}>الرمز الداخلي</p>
        <input
          value={existingInternalCode ?? 'سيُحدَّد تلقائيًا عند الحفظ'}
          disabled
          dir={existingInternalCode ? 'ltr' : undefined}
          className={`w-48 opacity-60 ${inputClass}`}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="الشركة">
          <select
            value={values.companyId}
            disabled={disableCompany}
            onChange={(e) => set('companyId', e.target.value)}
            className={`${inputClass} disabled:opacity-60`}
          >
            <option value="">اختر الشركة</option>
            {companies?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="رقم المحطة">
          <input
            value={values.stationNumber}
            onChange={(e) => set('stationNumber', e.target.value)}
            dir="ltr"
            className={inputClass}
          />
        </Field>
        <Field label="اسم المحطة">
          <input value={values.name} onChange={(e) => set('name', e.target.value)} className={inputClass} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="البلدية / الموقع">
          <select
            value={values.municipalityId}
            onChange={(e) => set('municipalityId', e.target.value)}
            className={inputClass}
          >
            <option value="">اختر البلدية</option>
            {municipalities?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="خط الإعداد (اختياري)">
          <select value={values.routeId} onChange={(e) => set('routeId', e.target.value)} className={inputClass}>
            <option value="">— غير محدَّد —</option>
            {routes?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="الجهة الأمنية المشرفة (اختياري)">
          <select
            value={values.securityAuthorityId}
            onChange={(e) => set('securityAuthorityId', e.target.value)}
            className={inputClass}
          >
            <option value="">— غير محدَّد —</option>
            {securityAuthorities?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="نوع الملكية (اختياري)">
          <select
            value={values.ownershipType}
            onChange={(e) => set('ownershipType', e.target.value as StationOwnershipType | '')}
            className={inputClass}
          >
            <option value="">— غير محدَّد —</option>
            {(Object.entries(OWNERSHIP_TYPE_LABELS) as [StationOwnershipType, string][]).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="حالة المحطة">
          <select
            value={values.status}
            onChange={(e) => set('status', e.target.value as StationStatus)}
            className={inputClass}
          >
            {Object.entries(STATION_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        {values.status !== 'ACTIVE' && (
          <Field label="ملاحظة الحالة">
            <input
              value={values.statusNote}
              onChange={(e) => set('statusNote', e.target.value)}
              placeholder="مثال: بحاجة إلى تحويل كهرباء"
              className={inputClass}
            />
          </Field>
        )}
      </div>

      <div>
        <p className={sectionLabelClass}>أنواع الوقود المتوفرة</p>
        <div className="flex flex-wrap gap-3">
          {(Object.entries(FUEL_TYPE_LABELS) as [FuelTypeKey, string][]).map(([value, label]) => {
            const checked = values.fuelTypes.includes(value);
            return (
              <label key={value} className="flex items-center gap-1.5 text-[12.5px] text-ink">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) =>
                    set(
                      'fuelTypes',
                      e.target.checked ? [...values.fuelTypes, value] : values.fuelTypes.filter((f) => f !== value),
                    )
                  }
                  className="h-4 w-4 accent-accent"
                />
                {label}
              </label>
            );
          })}
        </div>
      </div>

      <div>
        <p className={sectionLabelClass}>مشرف المحطة</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="الاسم">
            <input
              value={values.supervisorName}
              onChange={(e) => set('supervisorName', e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="الهاتف">
            <input
              value={values.supervisorPhone}
              onChange={(e) => set('supervisorPhone', e.target.value)}
              dir="ltr"
              className={inputClass}
            />
          </Field>
        </div>
      </div>

      <div>
        <label className="flex items-center gap-2 text-[12.5px] font-bold text-ink">
          <input
            type="checkbox"
            checked={values.operatorSameAsSupervisor}
            onChange={(e) => set('operatorSameAsSupervisor', e.target.checked)}
            className="h-4 w-4 accent-accent"
          />
          المشغل نفس المشرف
        </label>
        {!values.operatorSameAsSupervisor && (
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="مشغل المحطة — الاسم">
              <input
                value={values.operatorName}
                onChange={(e) => set('operatorName', e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="مشغل المحطة — الهاتف">
              <input
                value={values.operatorPhone}
                onChange={(e) => set('operatorPhone', e.target.value)}
                dir="ltr"
                className={inputClass}
              />
            </Field>
          </div>
        )}
      </div>
    </div>
  );
}
