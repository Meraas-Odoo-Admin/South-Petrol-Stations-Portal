import { useEffect, useState } from 'react';
import { usePageParam } from '../../lib/usePageParam';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { PageHeader } from '../../components/design/PageHeader';
import { PillButton } from '../../components/design/PillButton';
import { StatusPill } from '../../components/design/StatusPill';
import { CodeText } from '../../components/design/CodeText';
import { Icon, ICONS } from '../../components/icons';
import { STATION_STATUS_LABELS, STATION_STATUS_VARIANT } from '../../lib/labels';
import { adminErrorMessage } from '../admin/adminErrors';
import { Notice, SectionCard } from '../users/parts';
import { StationWorkspace } from './Workspaces';
import { SkeletonRows } from '../../components/design/Skeleton';
import { focusFirstInvalid } from '../../lib/focusField';
import {
  ActivityCard,
  ArchiveRestoreButton,
  ArchivedBanner,
  ACTIVITY_PAGE_SIZE,
  usePlaceActivity,
  useStation,
  useMunicipalityList,
} from './placesShared';
import {
  EMPTY_STATION,
  StationForm,
  stationPayload,
  stationToValues,
  validateStation,
  type StationFormValues,
} from './PlaceForms';

function BackLink({ to, children }: { to: string; children: string }) {
  return (
    <Link
      to={to}
      className="inline-flex min-h-[44px] items-center gap-2 rounded-full pe-3 text-[16px] font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-dark focus-visible:ring-offset-2 lg:text-[14px]"
    >
      <Icon d={ICONS.arrowBack} size={18} />
      {children}
    </Link>
  );
}

// A new petrol station, inside the municipality the caller manages.
export function StationCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const municipalities = useMunicipalityList();
  const [values, setValues] = useState<StationFormValues>(EMPTY_STATION);
  const [errors, setErrors] = useState<ReturnType<typeof validateStation>>({});

  // A manager with one municipality does not choose it.
  const only = municipalities.data?.length === 1 ? municipalities.data[0]! : null;
  useEffect(() => {
    if (only && !values.municipalityId) setValues((v) => ({ ...v, municipalityId: only.id }));
  }, [only, values.municipalityId]);

  const create = useMutation({
    mutationFn: async () => (await apiClient.post<{ id: string }>('/stations', stationPayload(values, 'create'))).data,
    onSuccess: async (station) => {
      await queryClient.invalidateQueries({ queryKey: ['stations'] });
      navigate(`/manage/stations/${station.id}`);
    },
  });

  function submit() {
    const found = validateStation(values, 'create');
    setErrors(found);
    if (Object.keys(found).length > 0) return focusFirstInvalid();
    create.mutate();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <BackLink to="/manage">العودة إلى إدارة المحطات</BackLink>
      <PageHeader title="محطة وقود جديدة" subtitle={only ? `في ${only.name}` : undefined} />
      <SectionCard title="بيانات المحطة" description="يُولَّد الرمز الداخلي تلقائيًا عند الحفظ.">
        <StationForm values={values} onChange={setValues} errors={errors} withTanks />
      </SectionCard>
      {create.isError && (
        <Notice kind="error">
          {adminErrorMessage(create.error, 'تعذّر إضافة المحطة — تحقّق من عدم تكرار رقم المحطة لدى هذه الشركة.')}
        </Notice>
      )}
      <div className="flex gap-2.5">
        <PillButton size="field" disabled={create.isPending} onClick={submit}>
          {create.isPending ? 'جارٍ الحفظ…' : 'حفظ المحطة'}
        </PillButton>
        <PillButton size="field" variant="ghost" onClick={() => navigate('/manage')}>
          إلغاء
        </PillButton>
      </div>
    </div>
  );
}

// One petrol station as its manager sees it: its details (editable), its
// people - create, edit and archive its supervisor - and what happened there.
// The page is also where the station is archived and restored.
export function StationManagePage() {
  const { stationId } = useParams();
  const queryClient = useQueryClient();
  const station = useStation(stationId);
  const activityPage = usePageParam(ACTIVITY_PAGE_SIZE);
  const activity = usePlaceActivity('stations', stationId, activityPage.skip);
  const [values, setValues] = useState<StationFormValues>(EMPTY_STATION);
  const [errors, setErrors] = useState<ReturnType<typeof validateStation>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (station.data) setValues(stationToValues(station.data));
  }, [station.data]);

  const save = useMutation({
    mutationFn: async () => apiClient.patch(`/stations/${stationId}`, stationPayload(values, 'edit')),
    onSuccess: async () => {
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: ['stations'] });
      await queryClient.invalidateQueries({ queryKey: ['stations', 'activity', stationId] });
    },
  });

  if (station.isLoading) return <SkeletonRows rows={6} />;
  if (station.isError || !station.data) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <BackLink to="/manage">العودة إلى إدارة المحطات</BackLink>
        <Notice kind="error">تعذّر فتح هذه المحطة. قد تكون خارج بلديتك.</Notice>
      </div>
    );
  }
  const s = station.data;
  const archived = Boolean(s.archivedAt);

  function submit() {
    setSaved(false);
    const found = validateStation(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return focusFirstInvalid();
    save.mutate();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <BackLink to="/manage">العودة إلى إدارة المحطات</BackLink>
      <header className="rounded-md bg-surface p-4 shadow-sm lg:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[24px] font-extrabold leading-tight text-ink lg:text-xl">{s.name}</h1>
            <CodeText size="md">{s.internalCode}</CodeText>
          </div>
          {archived ? (
            <StatusPill variant="neutral" size="md">مؤرشفة</StatusPill>
          ) : (
            <StatusPill variant={STATION_STATUS_VARIANT[s.status] ?? 'neutral'} size="md">
              {STATION_STATUS_LABELS[s.status] ?? s.status}
            </StatusPill>
          )}
        </div>
        <p className="mt-2 text-[15px] text-ink-soft lg:text-[13px]">
          {[s.company?.name, s.municipality?.name, s.locality].filter(Boolean).join(' · ')}
        </p>
      </header>

      {archived && <ArchivedBanner what="هذه المحطة" />}

      <StationWorkspace
        stationId={s.id}
        stationName={s.name}
        staffTitle="مشرفو المحطة"
        staffEmpty="لا يوجد مشرف لهذه المحطة بعد. أضف مشرفًا، وهو يضيف موظفيه."
        createParams={{ kind: 'PETROL_STATION', place: s.id, placeName: s.name }}
        overview={
          <>
      <SectionCard title="بيانات المحطة">
        <div className="space-y-4">
          <StationForm values={values} onChange={setValues} errors={errors} existingInternalCode={s.internalCode} lockCompany />
          {save.isError && <Notice kind="error">{adminErrorMessage(save.error, 'تعذّر حفظ التعديلات.')}</Notice>}
          {saved && <Notice kind="success">تم حفظ بيانات المحطة.</Notice>}
          {!archived && (
            <PillButton size="field" disabled={save.isPending} onClick={submit}>
              {save.isPending ? 'جارٍ الحفظ…' : 'حفظ التعديلات'}
            </PillButton>
          )}
        </div>
      </SectionCard>


      <ActivityCard
        activity={activity.data}
        paging={{ skip: activityPage.skip, setSkip: activityPage.setSkip }}
        loading={activity.isLoading}
        summary={
          activity.data && (
            <p className="mb-3 text-[16px] text-ink lg:text-[14px]">
              تعبئات آخر 30 يومًا: <span className="font-extrabold">{activity.data.fillUpsLast30Days ?? 0}</span>
            </p>
          )
        }
      />

      <SectionCard title="الأرشفة" description="لا تُحذف المحطات؛ تُؤرشف ويبقى سجلها محفوظًا.">
        <ArchiveRestoreButton kind="stations" id={s.id} name={s.name} archived={archived} />
      </SectionCard>
          </>
        }
      />
    </div>
  );
}
