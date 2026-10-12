import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { PillButton } from '../../components/design/PillButton';
import { Dialog } from '../../components/design/Dialog';
import { TextAreaField, TextField } from '../../components/design/TextField';
import { adminErrorMessage } from '../admin/adminErrors';
import { Notice, SectionCard } from '../users/parts';
import { formatWhen } from '../users/format';

// ── shapes the places screens read ─────────────────────────────────────

export interface MunicipalityLite {
  id: string;
  name: string;
  code: string | null;
  status: 'PREPARING' | 'LIVE';
  stage?: 'GRACE' | 'AWARENESS' | 'CARD_REQUIRED';
  awarenessStartDate?: string | null;
  cardRequiredFromDate?: string | null;
  archivedAt?: string | null;
  securityAuthority: { id: string; name: string } | null;
  stationCount?: number;
  officeCount?: number;
}

export interface StationRow {
  id: string;
  internalCode: string;
  stationNumber: string;
  name: string;
  companyId: string;
  company?: { id: string; name: string } | null;
  municipalityId: string | null;
  municipality: MunicipalityLite | null;
  routeId: string | null;
  route: { id: string; name: string } | null;
  status: string;
  statusNote: string | null;
  ownershipType: 'GOVERNMENT' | 'PRIVATE' | null;
  locality?: string | null;
  supervisorName: string | null;
  supervisorPhone: string | null;
  operatorSameAsSupervisor: boolean;
  operatorName: string | null;
  operatorPhone: string | null;
  fuelAvailability: { fuelType: string; isAvailable: boolean }[];
  archivedAt?: string | null;
}

export type OfficeStatus = 'ACTIVE' | 'TEMPORARILY_CLOSED' | 'CLOSED';

export interface OfficeRow {
  id: string;
  internalCode: string;
  officialCode: string | null;
  name: string;
  municipalityId: string;
  municipality: { id: string; name: string; status: 'PREPARING' | 'LIVE' };
  address: string;
  locality?: string | null;
  latitude: string | null;
  longitude: string | null;
  contactPhone: string | null;
  workingHours: string | null;
  status: OfficeStatus;
  statusNote: string | null;
  archivedAt?: string | null;
}

export const OFFICE_STATUS_LABELS: Record<OfficeStatus, string> = {
  ACTIVE: 'يعمل',
  TEMPORARILY_CLOSED: 'مغلق مؤقتًا',
  CLOSED: 'مغلق',
};
export const OFFICE_STATUS_VARIANT: Record<OfficeStatus, 'ok' | 'accent' | 'danger'> = {
  ACTIVE: 'ok',
  TEMPORARILY_CLOSED: 'accent',
  CLOSED: 'danger',
};

export interface PlaceActivity {
  fillUpsLast30Days?: number;
  vehiclesLast30Days?: number;
  cardsLast30Days?: number;
  items: { id: string; action: string; createdAt: string; actorName: string | null; reason: string | null }[];
}

// What an audit action reads as, in one plain sentence.
export const PLACE_ACTION_LABELS: Record<string, string> = {
  CREATE: 'أُنشئ',
  UPDATE: 'عُدّلت بياناته',
  UPDATE_STAGE_DATES: 'غُيّرت تواريخ المراحل',
  ARCHIVE: 'أُرشف',
  RESTORE: 'استُعيد من الأرشيف',
  DUPLICATE_CAUGHT: 'رُفض تسجيل مكرر',
  CREATE_USER: 'أُنشئ حساب',
  ARCHIVE_USER: 'أُرشف حساب',
  RESTORE_USER: 'استُعيد حساب',
  DEACTIVATE_USER: 'أُوقف حساب',
  REACTIVATE_USER: 'أُعيد تفعيل حساب',
  RESET_PASSWORD: 'أُعيد تعيين كلمة مرور',
  CHANGE_JOB: 'تغيّرت وظيفة',
  SET_PLACES: 'تغيّرت أماكن عمل',
};
export function placeActionLabel(action: string): string {
  return PLACE_ACTION_LABELS[action] ?? 'تغيير مسجَّل';
}

// ── data hooks ─────────────────────────────────────────────────────────

export interface PlaceFilters {
  q?: string;
  municipalityId?: string;
  companyId?: string;
  status?: string;
  locality?: string;
  archived?: 'only' | 'include' | '';
  sort?: string;
  dir?: string;
}

function toParams(filters: PlaceFilters): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value) params[key] = value;
  }
  return params;
}

export function useStationList(filters: PlaceFilters, enabled = true) {
  return useQuery({
    queryKey: ['stations', 'managed', filters],
    enabled,
    queryFn: async () => (await apiClient.get<StationRow[]>('/stations', { params: toParams(filters) })).data,
  });
}

export function useOfficeList(filters: PlaceFilters, enabled = true) {
  return useQuery({
    queryKey: ['registration-stations', 'managed', filters],
    enabled,
    queryFn: async () => (await apiClient.get<OfficeRow[]>('/registration-stations', { params: toParams(filters) })).data,
  });
}

export function useMunicipalityList(params: Record<string, string> = {}) {
  return useQuery({
    queryKey: ['municipalities', 'list', params],
    queryFn: async () => (await apiClient.get<MunicipalityLite[]>('/municipalities', { params })).data,
  });
}

export function useStation(id: string | undefined) {
  return useQuery({
    queryKey: ['stations', 'one', id],
    enabled: Boolean(id),
    retry: false,
    queryFn: async () => (await apiClient.get<StationRow>(`/stations/${id}`)).data,
  });
}

export function useOffice(id: string | undefined) {
  return useQuery({
    queryKey: ['registration-stations', 'one', id],
    enabled: Boolean(id),
    retry: false,
    queryFn: async () => (await apiClient.get<OfficeRow>(`/registration-stations/${id}`)).data,
  });
}

export function usePlaceActivity(kind: 'stations' | 'registration-stations', id: string | undefined) {
  return useQuery({
    queryKey: [kind, 'activity', id],
    enabled: Boolean(id),
    queryFn: async () => (await apiClient.get<PlaceActivity>(`/${kind}/${id}/activity`)).data,
  });
}

// ── archive / restore, with a written reason ───────────────────────────

export function ArchiveRestoreButton({
  kind,
  id,
  name,
  archived,
  onDone,
  confirmName,
}: {
  kind: 'stations' | 'registration-stations' | 'municipalities';
  id: string;
  name: string;
  archived: boolean;
  onDone?: () => void;
  /** A live municipality is archived only with its name typed. */
  confirmName?: string;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () =>
      apiClient.post(`/${kind}/${id}/${archived ? 'restore' : 'archive'}`, {
        reason: reason.trim(),
        ...(confirmName ? { confirmName: typed.trim() } : {}),
      }),
    onSuccess: async () => {
      setOpen(false);
      setReason('');
      setTyped('');
      setProblem(null);
      await queryClient.invalidateQueries();
      onDone?.();
    },
    onError: (err) => setProblem(adminErrorMessage(err, 'تعذّر تنفيذ الإجراء. حاول مجددًا.')),
  });

  function submit() {
    if (reason.trim().length < 3) {
      setProblem('اكتب سببًا واضحًا (ثلاثة أحرف على الأقل). يُحفظ في سجل التغييرات.');
      return;
    }
    if (confirmName && !archived && typed.trim() !== confirmName) {
      setProblem('الاسم المكتوب لا يطابق اسم البلدية.');
      return;
    }
    setProblem(null);
    mutation.mutate();
  }

  const noun = kind === 'stations' ? 'المحطة' : kind === 'registration-stations' ? 'المكتب' : 'البلدية';
  return (
    <>
      <PillButton size="field" variant={archived ? 'primary' : 'danger'} onClick={() => setOpen(true)}>
        {archived ? `استعادة ${noun}` : `أرشفة ${noun}`}
      </PillButton>
      <Dialog
        open={open}
        title={archived ? `استعادة ${noun}` : `أرشفة ${noun}`}
        busy={mutation.isPending}
        onClose={() => !mutation.isPending && setOpen(false)}
        footer={
          <>
            <PillButton size="field" variant="secondary" disabled={mutation.isPending} onClick={() => setOpen(false)}>
              رجوع
            </PillButton>
            <PillButton size="field" variant={archived ? 'primary' : 'danger'} disabled={mutation.isPending} onClick={submit}>
              {mutation.isPending ? 'جارٍ التنفيذ…' : archived ? 'استعادة' : 'أرشفة'}
            </PillButton>
          </>
        }
      >
        <p className="mb-3 leading-[1.8]">
          {archived
            ? `ستعود «${name}» إلى الشاشات اليومية.`
            : `ستختفي «${name}» من الشاشات اليومية ولن تقبل تعبئات أو تسجيلات جديدة، ويبقى كل ما سُجّل فيها محفوظًا. يمكنك استعادتها من فلتر «مؤرشف».`}
        </p>
        {confirmName && !archived && (
          <div className="mb-3">
            <TextField label={`للتأكيد اكتب اسم البلدية: ${confirmName}`} value={typed} onChange={(e) => setTyped(e.target.value)} />
          </div>
        )}
        <TextAreaField
          label="السبب (مطلوب)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={problem}
          hint="يُحفظ السبب في سجل التغييرات مع اسمك."
        />
      </Dialog>
    </>
  );
}

// ── what happened lately ───────────────────────────────────────────────

export function ActivityCard({
  activity,
  loading,
  summary,
}: {
  activity: PlaceActivity | undefined;
  loading: boolean;
  summary?: ReactNode;
}) {
  return (
    <SectionCard title="النشاط" description="آخر ما جرى هنا، بأسماء من نفّذه.">
      {loading && <p className="text-[15px] text-ink-soft lg:text-[13px]">جارٍ التحميل…</p>}
      {summary}
      {activity && activity.items.length === 0 && (
        <p className="text-[15px] text-ink-soft lg:text-[13px]">لا توجد تغييرات مسجّلة بعد.</p>
      )}
      {activity && activity.items.length > 0 && (
        <ul className="divide-y divide-surface-alt">
          {activity.items.map((item) => (
            <li key={item.id} className="py-3">
              <p className="text-[16px] font-bold text-ink lg:text-[14px]">{placeActionLabel(item.action)}</p>
              <p className="text-[14px] text-ink-soft lg:text-[12px]">
                {item.actorName ?? 'النظام'} · <span dir="ltr">{formatWhen(item.createdAt)}</span>
              </p>
              {item.reason && <p className="mt-0.5 text-[14px] text-ink lg:text-[12px]">السبب: {item.reason}</p>}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

export function ArchivedBanner({ what }: { what: string }) {
  return (
    <Notice kind="pending">
      {what} مؤرشف: لا يظهر في الشاشات اليومية ولا يقبل تعبئات أو تسجيلات جديدة، وكل سجلاته محفوظة.
    </Notice>
  );
}
