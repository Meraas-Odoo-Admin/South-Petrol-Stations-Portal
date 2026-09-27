import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { Card, CardHeader } from '../../components/design/Card';
import { PillButton } from '../../components/design/PillButton';
import { StatusPill } from '../../components/design/StatusPill';
import { CodeText } from '../../components/design/CodeText';
import { LtrText } from '../../components/LtrText';
import type { MunicipalityRef } from '../stations/types';
import { adminErrorMessage } from './adminErrors';

type RegistrationStationStatus = 'ACTIVE' | 'TEMPORARILY_CLOSED' | 'CLOSED';

interface RegistrationStationRow {
  id: string;
  internalCode: string;
  officialCode: string | null;
  name: string;
  municipalityId: string;
  municipality: {
    id: string;
    name: string;
    status: 'PREPARING' | 'LIVE';
    securityAuthority: { id: string; name: string } | null;
  };
  address: string;
  latitude: string | null;
  longitude: string | null;
  contactPhone: string | null;
  workingHours: string | null;
  status: RegistrationStationStatus;
  statusNote: string | null;
}

interface FormValues {
  name: string;
  officialCode: string;
  municipalityId: string;
  address: string;
  latitude: string;
  longitude: string;
  contactPhone: string;
  workingHours: string;
  status: RegistrationStationStatus;
  statusNote: string;
}

const EMPTY_FORM: FormValues = {
  name: '',
  officialCode: '',
  municipalityId: '',
  address: '',
  latitude: '',
  longitude: '',
  contactPhone: '',
  workingHours: '',
  status: 'ACTIVE',
  statusNote: '',
};

export const REGISTRATION_STATUS_LABELS: Record<RegistrationStationStatus, string> = {
  ACTIVE: 'يعمل',
  TEMPORARILY_CLOSED: 'مغلق مؤقتًا',
  CLOSED: 'مغلق',
};
const STATUS_VARIANT: Record<RegistrationStationStatus, 'ok' | 'accent' | 'danger'> = {
  ACTIVE: 'ok',
  TEMPORARILY_CLOSED: 'accent',
  CLOSED: 'danger',
};

function toForm(row: RegistrationStationRow): FormValues {
  return {
    name: row.name,
    officialCode: row.officialCode ?? '',
    municipalityId: row.municipalityId,
    address: row.address,
    latitude: row.latitude ?? '',
    longitude: row.longitude ?? '',
    contactPhone: row.contactPhone ?? '',
    workingHours: row.workingHours ?? '',
    status: row.status,
    statusNote: row.statusNote ?? '',
  };
}

// An empty optional field is omitted on create, and sent as null on edit
// so clearing it actually clears it (the API's @IsOptional accepts null).
function toPayload(values: FormValues, mode: 'create' | 'edit') {
  const empty = mode === 'create' ? undefined : null;
  const optional = (v: string) => (v.trim() ? v.trim() : empty);
  const coordinate = (v: string) => (v.trim() ? Number(v) : empty);
  return {
    name: values.name.trim(),
    officialCode: optional(values.officialCode),
    municipalityId: values.municipalityId,
    address: values.address.trim(),
    latitude: coordinate(values.latitude),
    longitude: coordinate(values.longitude),
    contactPhone: optional(values.contactPhone),
    workingHours: optional(values.workingHours),
    status: values.status,
    statusNote: optional(values.statusNote),
  };
}

const inputClass =
  'h-9 w-full rounded-sm bg-surface-alt px-3 text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-accent';
const labelClass = 'mb-1 block text-[11px] font-bold text-ink-soft';

function StationForm({
  values,
  onChange,
  municipalities,
}: {
  values: FormValues;
  onChange: (v: FormValues) => void;
  municipalities: MunicipalityRef[] | undefined;
}) {
  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => onChange({ ...values, [key]: value });
  const authority = municipalities?.find((m) => m.id === values.municipalityId)?.securityAuthority;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="sm:col-span-2">
        <label className={labelClass}>اسم مكتب التسجيل</label>
        <input value={values.name} onChange={(e) => set('name', e.target.value)} className={inputClass} data-testid="reg-station-name" />
      </div>
      <div>
        <label className={labelClass}>الرمز الرسمي (اختياري)</label>
        <input value={values.officialCode} onChange={(e) => set('officialCode', e.target.value)} dir="ltr" className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>البلدية</label>
        <select
          value={values.municipalityId}
          onChange={(e) => set('municipalityId', e.target.value)}
          className={inputClass}
          data-testid="reg-station-municipality"
        >
          <option value="">اختر البلدية</option>
          {municipalities?.map((m) => (
            <option key={m.id} value={m.id}>
              {m.status === 'PREPARING' ? `${m.name} (قيد الإعداد)` : m.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClass}>الجهة الأمنية المشرفة</label>
        <input
          value={
            values.municipalityId
              ? (authority?.name ?? 'لا توجد جهة أمنية لهذه البلدية بعد')
              : 'تُحدَّد تلقائيًا من البلدية'
          }
          disabled
          className={`${inputClass} opacity-60`}
        />
      </div>
      <div>
        <label className={labelClass}>هاتف التواصل (اختياري)</label>
        <input value={values.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} dir="ltr" className={inputClass} />
      </div>
      <div className="sm:col-span-2">
        <label className={labelClass}>العنوان</label>
        <input value={values.address} onChange={(e) => set('address', e.target.value)} className={inputClass} data-testid="reg-station-address" />
      </div>
      <div>
        <label className={labelClass}>ساعات العمل (اختياري)</label>
        <input
          value={values.workingHours}
          onChange={(e) => set('workingHours', e.target.value)}
          placeholder="السبت–الخميس 8:00–14:00"
          className={inputClass}
        />
      </div>
      <div>
        <label className={labelClass}>خط العرض (اختياري)</label>
        <input value={values.latitude} onChange={(e) => set('latitude', e.target.value)} dir="ltr" inputMode="decimal" className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>خط الطول (اختياري)</label>
        <input value={values.longitude} onChange={(e) => set('longitude', e.target.value)} dir="ltr" inputMode="decimal" className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>الحالة</label>
        <select value={values.status} onChange={(e) => set('status', e.target.value as RegistrationStationStatus)} className={inputClass}>
          {(Object.keys(REGISTRATION_STATUS_LABELS) as RegistrationStationStatus[]).map((s) => (
            <option key={s} value={s}>
              {REGISTRATION_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      {values.status !== 'ACTIVE' && (
        <div className="sm:col-span-3">
          <label className={labelClass}>سبب الإغلاق (اختياري)</label>
          <input value={values.statusNote} onChange={(e) => set('statusNote', e.target.value)} className={inputClass} />
        </div>
      )}
    </div>
  );
}

// Registration pivot, phase 2 (plan §4): police-station registration desks
// — the only places vehicles and owners are registered. No authority field:
// it comes from the municipality. Desks and printers arrive in Phase 3.
export function RegistrationStationsAdminPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createValues, setCreateValues] = useState<FormValues>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<FormValues>(EMPTY_FORM);

  const stationsQuery = useQuery({
    queryKey: ['registration-stations'],
    queryFn: async () => (await apiClient.get<RegistrationStationRow[]>('/registration-stations')).data,
  });
  const municipalitiesQuery = useQuery({
    queryKey: ['admin', 'municipalities'],
    queryFn: async () => (await apiClient.get<MunicipalityRef[]>('/municipalities')).data,
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['registration-stations'] });

  const isComplete = (v: FormValues) => !!v.name.trim() && !!v.municipalityId && !!v.address.trim();

  const createMutation = useMutation({
    mutationFn: () => apiClient.post('/registration-stations', toPayload(createValues, 'create')),
    onSuccess: () => {
      setError(null);
      setShowCreate(false);
      setCreateValues(EMPTY_FORM);
      invalidate();
    },
    onError: (err) => setError(adminErrorMessage(err, 'تعذر إضافة مكتب التسجيل — تحقّق من البيانات.')),
  });

  const updateMutation = useMutation({
    mutationFn: () => apiClient.patch(`/registration-stations/${editingId}`, toPayload(editValues, 'edit')),
    onSuccess: () => {
      setError(null);
      setEditingId(null);
      invalidate();
    },
    onError: (err) => setError(adminErrorMessage(err, 'تعذر حفظ التعديلات — تحقّق من البيانات.')),
  });

  return (
    <div className="space-y-4">
      {showCreate && (
        <Card className="p-4">
          <p className="mb-3 text-[12.5px] font-bold text-primary-dark">مكتب تسجيل جديد</p>
          <StationForm values={createValues} onChange={setCreateValues} municipalities={municipalitiesQuery.data} />
          <PillButton
            className="mt-4"
            data-testid="reg-station-create"
            disabled={!isComplete(createValues) || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            إضافة
          </PillButton>
          <p className="mt-2 text-[11px] text-ink-faint">يُولَّد الرمز الداخلي تلقائيًا عند الحفظ.</p>
        </Card>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      <Card>
        <CardHeader
          title="مكاتب التسجيل"
          subtitle={stationsQuery.data ? `${stationsQuery.data.length} مكتب` : undefined}
          action={
            <PillButton size="sm" onClick={() => setShowCreate((s) => !s)}>
              {showCreate ? 'إلغاء' : 'مكتب تسجيل جديد +'}
            </PillButton>
          }
        />
        {stationsQuery.isLoading && <p className="p-4 text-sm text-ink-soft">...جارٍ التحميل</p>}
        {stationsQuery.isError && <p className="p-4 text-sm text-danger">تعذر تحميل مكاتب التسجيل.</p>}
        {stationsQuery.data?.length === 0 && (
          <p className="p-4 text-[12.5px] text-ink-soft">لا توجد مكاتب تسجيل بعد.</p>
        )}
        <ul>
          {stationsQuery.data?.map((station) => (
            <li key={station.id} className="border-b border-surface-alt px-[18px] py-3 last:border-0">
              {editingId === station.id ? (
                <div>
                  <StationForm values={editValues} onChange={setEditValues} municipalities={municipalitiesQuery.data} />
                  <div className="mt-3 flex gap-2">
                    <PillButton
                      size="sm"
                      disabled={!isComplete(editValues) || updateMutation.isPending}
                      onClick={() => updateMutation.mutate()}
                    >
                      حفظ
                    </PillButton>
                    <PillButton variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                      إلغاء
                    </PillButton>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13.5px] font-bold text-ink">{station.name}</span>
                      <StatusPill variant={STATUS_VARIANT[station.status]}>{REGISTRATION_STATUS_LABELS[station.status]}</StatusPill>
                      {station.municipality.status === 'PREPARING' && <StatusPill variant="neutral">البلدية قيد الإعداد</StatusPill>}
                    </div>
                    <p className="mt-1 text-[11.5px] text-ink-soft">
                      {station.municipality.name} · {station.address}
                      {station.municipality.securityAuthority ? ` · ${station.municipality.securityAuthority.name}` : ''}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-faint">
                      <span>
                        الرمز الداخلي: <CodeText>{station.internalCode}</CodeText>
                      </span>
                      {station.officialCode && (
                        <span>
                          الرمز الرسمي: <CodeText>{station.officialCode}</CodeText>
                        </span>
                      )}
                      {station.contactPhone && (
                        <span>
                          الهاتف: <LtrText>{station.contactPhone}</LtrText>
                        </span>
                      )}
                      {station.workingHours && <span>ساعات العمل: {station.workingHours}</span>}
                      {station.statusNote && station.status !== 'ACTIVE' && <span>السبب: {station.statusNote}</span>}
                    </div>
                  </div>
                  <PillButton
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setError(null);
                      setEditValues(toForm(station));
                      setEditingId(station.id);
                    }}
                  >
                    تعديل
                  </PillButton>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
