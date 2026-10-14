import { useState } from 'react';
import { LookupSearch, useLookup } from '../../lib/useLookup';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { checkLibyanMobile } from '@fuel-tracking/shared-types';
import { apiClient } from '../../lib/apiClient';
import { FUEL_TYPE_LABELS, STATION_STATUS_LABELS } from '../../lib/labels';
import { restrictToPhoneNumber } from '../../lib/libyanFormats';
import { PillButton } from '../../components/design/PillButton';
import { TextField } from '../../components/design/TextField';
import { adminErrorMessage } from '../admin/adminErrors';
import { Notice } from '../users/parts';
import {
  OFFICE_STATUS_LABELS,
  useMunicipalityList,
  type OfficeRow,
  type OfficeStatus,
  type StationRow,
} from './placesShared';

const SELECT_CLASS =
  'h-[52px] w-full rounded-sm border border-line bg-surface-alt px-3 text-[16px] text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface lg:h-11 lg:text-[14px] disabled:opacity-60';

function SelectField({
  label,
  value,
  onChange,
  children,
  error,
  disabled,
  id,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  error?: string | null;
  disabled?: boolean;
  id: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[14px] font-bold text-ink lg:text-[12px]">
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={`${SELECT_CLASS} ${error ? 'border-danger' : ''}`}
      >
        {children}
      </select>
      {error && (
        <p role="alert" className="mt-1.5 text-[14px] font-medium text-danger-dark lg:text-[12px]">
          {error}
        </p>
      )}
    </div>
  );
}

// ═══ petrol station ═══════════════════════════════════════════════════

export interface StationFormValues {
  stationNumber: string;
  name: string;
  companyId: string;
  municipalityId: string;
  routeId: string;
  status: string;
  statusNote: string;
  locality: string;
  fuelTypes: string[];
  supervisorName: string;
  supervisorPhone: string;
  operatorSameAsSupervisor: boolean;
  operatorName: string;
  operatorPhone: string;
}

export const EMPTY_STATION: StationFormValues = {
  stationNumber: '',
  name: '',
  companyId: '',
  municipalityId: '',
  routeId: '',
  status: 'ACTIVE',
  statusNote: '',
  locality: '',
  fuelTypes: [],
  supervisorName: '',
  supervisorPhone: '',
  operatorSameAsSupervisor: false,
  operatorName: '',
  operatorPhone: '',
};

export function stationToValues(s: StationRow): StationFormValues {
  return {
    stationNumber: s.stationNumber,
    name: s.name,
    companyId: s.companyId,
    municipalityId: s.municipalityId ?? '',
    routeId: s.routeId ?? '',
    status: s.status,
    statusNote: s.statusNote ?? '',
    locality: s.locality ?? '',
    fuelTypes: s.fuelAvailability.filter((f) => f.isAvailable).map((f) => f.fuelType),
    supervisorName: s.supervisorName ?? '',
    supervisorPhone: s.supervisorPhone ?? '',
    operatorSameAsSupervisor: s.operatorSameAsSupervisor,
    operatorName: s.operatorName ?? '',
    operatorPhone: s.operatorPhone ?? '',
  };
}

type StationErrors = Partial<Record<keyof StationFormValues, string>>;

export function validateStation(values: StationFormValues): StationErrors {
  const errors: StationErrors = {};
  if (!values.companyId) errors.companyId = 'اختر الشركة.';
  if (!values.stationNumber.trim()) errors.stationNumber = 'رقم المحطة مطلوب (رقمها لدى الشركة).';
  if (values.name.trim().length < 2) errors.name = 'اسم المحطة مطلوب.';
  if (!values.municipalityId) errors.municipalityId = 'اختر البلدية.';
  const sup = checkLibyanMobile(values.supervisorPhone);
  if (!sup.ok) errors.supervisorPhone = sup.message;
  if (!values.operatorSameAsSupervisor) {
    const op = checkLibyanMobile(values.operatorPhone);
    if (!op.ok) errors.operatorPhone = op.message;
  }
  return errors;
}

// An empty optional text is sent as undefined on create and "" on edit would
// not clear anything in the API, so optional texts are simply trimmed.
export function stationPayload(values: StationFormValues, mode: 'create' | 'edit') {
  const text = (v: string) => (v.trim() ? v.trim() : mode === 'create' ? undefined : '');
  const phone = (v: string) => {
    const c = checkLibyanMobile(v);
    return c.ok && c.value ? c.value : undefined;
  };
  return {
    stationNumber: values.stationNumber.trim(),
    name: values.name.trim(),
    companyId: values.companyId,
    municipalityId: values.municipalityId || undefined,
    routeId: values.routeId || undefined,
    status: values.status,
    statusNote: text(values.statusNote),
    locality: text(values.locality),
    fuelTypes: values.fuelTypes,
    supervisorName: text(values.supervisorName),
    supervisorPhone: phone(values.supervisorPhone),
    operatorSameAsSupervisor: values.operatorSameAsSupervisor,
    operatorName: values.operatorSameAsSupervisor ? undefined : text(values.operatorName),
    operatorPhone: values.operatorSameAsSupervisor ? undefined : phone(values.operatorPhone),
  };
}

interface Lookup {
  id: string;
  name: string;
}

export function StationForm({
  values,
  onChange,
  errors,
  existingInternalCode,
  lockCompany = false,
}: {
  values: StationFormValues;
  onChange: (values: StationFormValues) => void;
  errors: StationErrors;
  existingInternalCode?: string;
  lockCompany?: boolean;
}) {
  const queryClient = useQueryClient();
  const set = <K extends keyof StationFormValues>(key: K, value: StationFormValues[K]) =>
    onChange({ ...values, [key]: value });

  const companyLookup = useLookup<Lookup>('/companies', 'companies');
  const routeLookup = useLookup<Lookup>('/routes', 'routes');
  const companies = { data: companyLookup.items };
  const routes = { data: routeLookup.items };
  const municipalities = useMunicipalityList();
  const municipalityOptions = municipalities.data ?? [];
  const oneMunicipality = municipalityOptions.length === 1;

  const [newCompany, setNewCompany] = useState('');
  const [companyError, setCompanyError] = useState<string | null>(null);
  const addCompany = useMutation({
    mutationFn: async () => (await apiClient.post<Lookup>('/companies', { name: newCompany.trim() })).data,
    onSuccess: async (company) => {
      await queryClient.invalidateQueries({ queryKey: ['companies'] });
      set('companyId', company.id);
      setNewCompany('');
      setCompanyError(null);
    },
    onError: (err) => setCompanyError(adminErrorMessage(err, 'تعذّرت إضافة الشركة. قد تكون موجودة باسم مطابق.')),
  });

  const authority = municipalityOptions.find((m) => m.id === values.municipalityId)?.securityAuthority;

  return (
    <div className="space-y-5">
      {existingInternalCode && (
        <p className="text-[15px] text-ink-soft lg:text-[13px]">
          الرمز الداخلي: <span dir="ltr" className="font-mono font-bold text-ink">{existingInternalCode}</span>
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <SelectField
            id="st-company"
            label="الشركة"
            value={values.companyId}
            onChange={(v) => set('companyId', v)}
            disabled={lockCompany}
            error={errors.companyId}
          >
            <option value="">اختر الشركة</option>
            {companies.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
          <LookupSearch id="st-company-search" q={companyLookup.q} onChange={companyLookup.setQ} capped={companyLookup.capped} />
          {!lockCompany && (
            <div className="mt-2 flex items-end gap-2">
              <div className="flex-1">
                <TextField
                  label="شركة غير موجودة؟ أضفها"
                  value={newCompany}
                  onChange={(e) => setNewCompany(e.target.value)}
                  error={companyError}
                />
              </div>
              <PillButton
                size="field"
                variant="secondary"
                disabled={newCompany.trim().length < 2 || addCompany.isPending}
                onClick={() => addCompany.mutate()}
              >
                إضافة
              </PillButton>
            </div>
          )}
        </div>
        <TextField
          label="رقم المحطة لدى الشركة"
          value={values.stationNumber}
          onChange={(e) => set('stationNumber', e.target.value)}
          error={errors.stationNumber}
          hint="قد يتكرر الرقم بين الشركات؛ المحطة تُعرف بالشركة مع الرقم."
          ltr
        />
        <TextField label="اسم المحطة" value={values.name} onChange={(e) => set('name', e.target.value)} error={errors.name} />
        <TextField
          label="المنطقة أو الحي (اختياري)"
          value={values.locality}
          onChange={(e) => set('locality', e.target.value)}
          hint="تُستعمل في تصفية القوائم."
        />
        {!oneMunicipality && (
          <SelectField
            id="st-municipality"
            label="البلدية"
            value={values.municipalityId}
            onChange={(v) => set('municipalityId', v)}
            error={errors.municipalityId}
          >
            <option value="">اختر البلدية</option>
            {municipalityOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </SelectField>
        )}
        <SelectField id="st-route" label="خط الإعداد (اختياري)" value={values.routeId} onChange={(v) => set('routeId', v)}>
          <option value="">— غير محدَّد —</option>
          {routes.data?.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </SelectField>
        <LookupSearch id="st-route-search" q={routeLookup.q} onChange={routeLookup.setQ} capped={routeLookup.capped} />
        <SelectField id="st-status" label="حالة المحطة" value={values.status} onChange={(v) => set('status', v)}>
          {Object.entries(STATION_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
        {values.status !== 'ACTIVE' && (
          <TextField label="ملاحظة الحالة" value={values.statusNote} onChange={(e) => set('statusNote', e.target.value)} />
        )}
      </div>

      {authority !== undefined && (
        <p className="text-[15px] text-ink-soft lg:text-[13px]">
          الجهة الأمنية المشرفة: <span className="font-bold text-ink">{authority?.name ?? 'لا توجد جهة لهذه البلدية'}</span> — تُحدَّد من البلدية.
        </p>
      )}

      <fieldset>
        <legend className="mb-2 text-[14px] font-bold text-ink lg:text-[12px]">أنواع الوقود التي تبيعها المحطة</legend>
        <div className="flex flex-wrap gap-3">
          {Object.entries(FUEL_TYPE_LABELS).map(([value, label]) => {
            const checked = values.fuelTypes.includes(value);
            return (
              <label
                key={value}
                className={`flex min-h-[48px] cursor-pointer items-center gap-2 rounded-full border-2 px-4 text-[16px] font-bold lg:min-h-[40px] lg:text-[14px] ${
                  checked ? 'border-primary bg-primary-100 text-primary-dark' : 'border-line text-ink-soft'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) =>
                    set('fuelTypes', e.target.checked ? [...values.fuelTypes, value] : values.fuelTypes.filter((f) => f !== value))
                  }
                  className="h-5 w-5 accent-primary"
                />
                {label}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="مشرف المحطة — الاسم (اختياري)" value={values.supervisorName} onChange={(e) => set('supervisorName', e.target.value)} />
        <TextField
          label="مشرف المحطة — الهاتف (اختياري)"
          value={values.supervisorPhone}
          onChange={(e) => set('supervisorPhone', restrictToPhoneNumber(e.target.value))}
          error={errors.supervisorPhone}
          inputMode="tel"
          ltr
        />
      </div>
      <label className="flex min-h-[44px] items-center gap-2 text-[16px] font-bold text-ink lg:text-[14px]">
        <input
          type="checkbox"
          checked={values.operatorSameAsSupervisor}
          onChange={(e) => set('operatorSameAsSupervisor', e.target.checked)}
          className="h-5 w-5 accent-primary"
        />
        المشغّل نفس المشرف
      </label>
      {!values.operatorSameAsSupervisor && (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="المشغّل — الاسم (اختياري)" value={values.operatorName} onChange={(e) => set('operatorName', e.target.value)} />
          <TextField
            label="المشغّل — الهاتف (اختياري)"
            value={values.operatorPhone}
            onChange={(e) => set('operatorPhone', restrictToPhoneNumber(e.target.value))}
            error={errors.operatorPhone}
            inputMode="tel"
            ltr
          />
        </div>
      )}
    </div>
  );
}

// ═══ registration office ══════════════════════════════════════════════

export interface OfficeFormValues {
  name: string;
  officialCode: string;
  municipalityId: string;
  address: string;
  locality: string;
  latitude: string;
  longitude: string;
  contactPhone: string;
  workingHours: string;
  status: OfficeStatus;
  statusNote: string;
}

export const EMPTY_OFFICE: OfficeFormValues = {
  name: '',
  officialCode: '',
  municipalityId: '',
  address: '',
  locality: '',
  latitude: '',
  longitude: '',
  contactPhone: '',
  workingHours: '',
  status: 'ACTIVE',
  statusNote: '',
};

export function officeToValues(o: OfficeRow): OfficeFormValues {
  return {
    name: o.name,
    officialCode: o.officialCode ?? '',
    municipalityId: o.municipalityId,
    address: o.address,
    locality: o.locality ?? '',
    latitude: o.latitude ?? '',
    longitude: o.longitude ?? '',
    contactPhone: o.contactPhone ?? '',
    workingHours: o.workingHours ?? '',
    status: o.status,
    statusNote: o.statusNote ?? '',
  };
}

type OfficeErrors = Partial<Record<keyof OfficeFormValues, string>>;

// The desk's contact is a landline or a duty phone as often as a mobile, so it
// is checked as "a phone number": digits with an optional +, 6 to 20 long.
const CONTACT_PHONE = /^\+?\d[\d\s-]{5,19}$/;

export function validateOffice(values: OfficeFormValues): OfficeErrors {
  const errors: OfficeErrors = {};
  if (values.name.trim().length < 2) errors.name = 'اسم مكتب التسجيل مطلوب.';
  if (!values.municipalityId) errors.municipalityId = 'اختر البلدية.';
  if (values.address.trim().length < 2) errors.address = 'العنوان مطلوب.';
  if (values.contactPhone.trim() && !CONTACT_PHONE.test(values.contactPhone.trim())) {
    errors.contactPhone = 'رقم الهاتف غير صحيح: أرقام فقط (ويجوز + في أوله)، من 6 إلى 20 خانة.';
  }
  const lat = values.latitude.trim();
  if (lat && !(Number(lat) >= -90 && Number(lat) <= 90)) errors.latitude = 'خط العرض رقم بين -90 و90.';
  const lng = values.longitude.trim();
  if (lng && !(Number(lng) >= -180 && Number(lng) <= 180)) errors.longitude = 'خط الطول رقم بين -180 و180.';
  return errors;
}

export function officePayload(values: OfficeFormValues, mode: 'create' | 'edit') {
  const empty = mode === 'create' ? undefined : null;
  const optional = (v: string) => (v.trim() ? v.trim() : empty);
  const coordinate = (v: string) => (v.trim() ? Number(v) : empty);
  return {
    name: values.name.trim(),
    officialCode: optional(values.officialCode),
    municipalityId: values.municipalityId,
    address: values.address.trim(),
    locality: optional(values.locality),
    latitude: coordinate(values.latitude),
    longitude: coordinate(values.longitude),
    contactPhone: optional(values.contactPhone),
    workingHours: optional(values.workingHours),
    status: values.status,
    statusNote: optional(values.statusNote),
  };
}

export function OfficeForm({
  values,
  onChange,
  errors,
}: {
  values: OfficeFormValues;
  onChange: (values: OfficeFormValues) => void;
  errors: OfficeErrors;
}) {
  const set = <K extends keyof OfficeFormValues>(key: K, value: OfficeFormValues[K]) =>
    onChange({ ...values, [key]: value });
  const municipalities = useMunicipalityList();
  const options = municipalities.data ?? [];
  const oneMunicipality = options.length === 1;
  const authority = options.find((m) => m.id === values.municipalityId)?.securityAuthority;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="اسم مكتب التسجيل" value={values.name} onChange={(e) => set('name', e.target.value)} error={errors.name} data-testid="reg-station-name" />
        <TextField label="الرمز الرسمي (اختياري)" value={values.officialCode} onChange={(e) => set('officialCode', e.target.value)} ltr />
        {!oneMunicipality && (
          <SelectField
            id="of-municipality"
            label="البلدية"
            value={values.municipalityId}
            onChange={(v) => set('municipalityId', v)}
            error={errors.municipalityId}
          >
            <option value="">اختر البلدية</option>
            {options.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </SelectField>
        )}
        <TextField label="المنطقة أو الحي (اختياري)" value={values.locality} onChange={(e) => set('locality', e.target.value)} hint="تُستعمل في تصفية القوائم." />
        <div className="sm:col-span-2">
          <TextField label="العنوان" value={values.address} onChange={(e) => set('address', e.target.value)} error={errors.address} data-testid="reg-station-address" />
        </div>
        <TextField
          label="هاتف التواصل (اختياري)"
          value={values.contactPhone}
          onChange={(e) => set('contactPhone', e.target.value)}
          error={errors.contactPhone}
          inputMode="tel"
          ltr
        />
        <TextField
          label="ساعات العمل (اختياري)"
          value={values.workingHours}
          onChange={(e) => set('workingHours', e.target.value)}
          placeholder="السبت–الخميس 8:00–14:00"
        />
        <TextField label="خط العرض (اختياري)" value={values.latitude} onChange={(e) => set('latitude', e.target.value)} error={errors.latitude} inputMode="decimal" ltr />
        <TextField label="خط الطول (اختياري)" value={values.longitude} onChange={(e) => set('longitude', e.target.value)} error={errors.longitude} inputMode="decimal" ltr />
        <SelectField id="of-status" label="الحالة" value={values.status} onChange={(v) => set('status', v as OfficeStatus)}>
          {(Object.keys(OFFICE_STATUS_LABELS) as OfficeStatus[]).map((s) => (
            <option key={s} value={s}>
              {OFFICE_STATUS_LABELS[s]}
            </option>
          ))}
        </SelectField>
        {values.status !== 'ACTIVE' && (
          <TextField label="سبب الإغلاق (اختياري)" value={values.statusNote} onChange={(e) => set('statusNote', e.target.value)} />
        )}
      </div>
      {authority !== undefined && (
        <Notice kind="info">
          الجهة الأمنية المشرفة: {authority?.name ?? 'لا توجد جهة لهذه البلدية'} — تُحدَّد من البلدية. يُولَّد الرمز الداخلي تلقائيًا عند الحفظ.
        </Notice>
      )}
    </div>
  );
}

export { SelectField };
