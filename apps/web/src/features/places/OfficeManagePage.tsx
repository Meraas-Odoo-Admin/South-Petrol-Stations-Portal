import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { PageHeader } from '../../components/design/PageHeader';
import { PillButton } from '../../components/design/PillButton';
import { StatusPill } from '../../components/design/StatusPill';
import { CodeText } from '../../components/design/CodeText';
import { Icon, ICONS } from '../../components/icons';
import { adminErrorMessage } from '../admin/adminErrors';
import { RegistrationDesksEditor } from '../admin/RegistrationDesksEditor';
import { useAuth } from '../auth/AuthProvider';
import { Notice, SectionCard } from '../users/parts';
import { UsersListPage } from '../users/UsersListPage';
import {
  ActivityCard,
  ArchiveRestoreButton,
  ArchivedBanner,
  OFFICE_STATUS_LABELS,
  OFFICE_STATUS_VARIANT,
  useMunicipalityList,
  useOffice,
  usePlaceActivity,
} from './placesShared';
import {
  EMPTY_OFFICE,
  OfficeForm,
  officePayload,
  officeToValues,
  validateOffice,
  type OfficeFormValues,
} from './PlaceForms';

function BackLink({ to, children }: { to: string; children: string }) {
  return (
    <Link
      to={to}
      className="inline-flex min-h-[44px] items-center gap-2 rounded-full pe-3 text-[16px] font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 lg:text-[14px]"
    >
      <Icon d={ICONS.arrowBack} size={18} />
      {children}
    </Link>
  );
}

export function OfficeCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const municipalities = useMunicipalityList();
  const [values, setValues] = useState<OfficeFormValues>(EMPTY_OFFICE);
  const [errors, setErrors] = useState<ReturnType<typeof validateOffice>>({});

  const only = municipalities.data?.length === 1 ? municipalities.data[0]! : null;
  useEffect(() => {
    if (only && !values.municipalityId) setValues((v) => ({ ...v, municipalityId: only.id }));
  }, [only, values.municipalityId]);

  const create = useMutation({
    mutationFn: async () =>
      (await apiClient.post<{ id: string }>('/registration-stations', officePayload(values, 'create'))).data,
    onSuccess: async (office) => {
      await queryClient.invalidateQueries({ queryKey: ['registration-stations'] });
      navigate(`/manage/offices/${office.id}`);
    },
  });

  function submit() {
    const found = validateOffice(values);
    setErrors(found);
    if (Object.keys(found).length === 0) create.mutate();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <BackLink to="/manage">العودة إلى إدارة المحطات</BackLink>
      <PageHeader title="مكتب تسجيل جديد" subtitle={only ? `في ${only.name}` : undefined} />
      <SectionCard title="بيانات المكتب">
        <OfficeForm values={values} onChange={setValues} errors={errors} />
      </SectionCard>
      {create.isError && (
        <Notice kind="error">{adminErrorMessage(create.error, 'تعذّر إضافة مكتب التسجيل — تحقّق من البيانات.')}</Notice>
      )}
      <div className="flex gap-2.5">
        <PillButton size="field" data-testid="reg-station-create" disabled={create.isPending} onClick={submit}>
          {create.isPending ? 'جارٍ الحفظ…' : 'حفظ المكتب'}
        </PillButton>
        <PillButton size="field" variant="ghost" onClick={() => navigate('/manage')}>
          إلغاء
        </PillButton>
      </div>
    </div>
  );
}

// One registration office as its manager sees it: details (editable), desks
// and printers, the office manager and what happened there; archived and
// restored from here.
export function OfficeManagePage() {
  const { officeId } = useParams();
  const queryClient = useQueryClient();
  const { hasPermission } = useAuth();
  const office = useOffice(officeId);
  const activity = usePlaceActivity('registration-stations', officeId);
  const [values, setValues] = useState<OfficeFormValues>(EMPTY_OFFICE);
  const [errors, setErrors] = useState<ReturnType<typeof validateOffice>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (office.data) setValues(officeToValues(office.data));
  }, [office.data]);

  const save = useMutation({
    mutationFn: async () => apiClient.patch(`/registration-stations/${officeId}`, officePayload(values, 'edit')),
    onSuccess: async () => {
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: ['registration-stations'] });
    },
  });

  if (office.isLoading) return <p className="p-4 text-[15px] text-ink-soft">جارٍ التحميل…</p>;
  if (office.isError || !office.data) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <BackLink to="/manage">العودة إلى إدارة المحطات</BackLink>
        <Notice kind="error">تعذّر فتح هذا المكتب. قد يكون خارج بلديتك.</Notice>
      </div>
    );
  }
  const o = office.data;
  const archived = Boolean(o.archivedAt);

  function submit() {
    setSaved(false);
    const found = validateOffice(values);
    setErrors(found);
    if (Object.keys(found).length === 0) save.mutate();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <BackLink to="/manage">العودة إلى إدارة المحطات</BackLink>
      <header className="rounded-md bg-surface p-4 shadow-sm lg:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[24px] font-extrabold leading-tight text-ink lg:text-xl">{o.name}</h1>
            <CodeText size="md">{o.internalCode}</CodeText>
          </div>
          {archived ? (
            <StatusPill variant="neutral" size="md">مؤرشف</StatusPill>
          ) : (
            <StatusPill variant={OFFICE_STATUS_VARIANT[o.status]} size="md">{OFFICE_STATUS_LABELS[o.status]}</StatusPill>
          )}
        </div>
        <p className="mt-2 text-[15px] text-ink-soft lg:text-[13px]">{[o.municipality.name, o.address].filter(Boolean).join(' · ')}</p>
      </header>

      {archived && <ArchivedBanner what="هذا المكتب" />}

      <SectionCard title="بيانات المكتب">
        <div className="space-y-4">
          <OfficeForm values={values} onChange={setValues} errors={errors} />
          {save.isError && <Notice kind="error">{adminErrorMessage(save.error, 'تعذّر حفظ التعديلات — تحقّق من البيانات.')}</Notice>}
          {saved && <Notice kind="success">تم حفظ بيانات المكتب.</Notice>}
          {!archived && (
            <PillButton size="field" disabled={save.isPending} onClick={submit}>
              {save.isPending ? 'جارٍ الحفظ…' : 'حفظ التعديلات'}
            </PillButton>
          )}
        </div>
      </SectionCard>

      {hasPermission('registration_desks:manage') && (
        <SectionCard title="المكاتب والطابعات" description="مكتب الموظف والطابعة المتصلة به؛ كل بطاقة تسجّل المكتب الذي طُبعت عليه.">
          <RegistrationDesksEditor registrationStationId={o.id} />
        </SectionCard>
      )}

      <UsersListPage
        basePath="/people"
        fixedPlaceId={o.id}
        title="مدير المكتب"
        createParams={{ kind: 'REGISTRATION', place: o.id, placeName: o.name }}
        emptyText="لا يوجد مدير لهذا المكتب بعد. أضف مديرًا، وهو يضيف موظفي التسجيل."
      />

      <ActivityCard
        activity={activity.data}
        loading={activity.isLoading}
        summary={
          activity.data && (
            <p className="mb-3 text-[16px] text-ink lg:text-[14px]">
              آخر 30 يومًا: مركبات مسجّلة <span className="font-extrabold">{activity.data.vehiclesLast30Days ?? 0}</span> · بطاقات
              مُصدرة <span className="font-extrabold">{activity.data.cardsLast30Days ?? 0}</span>
            </p>
          )
        }
      />

      <SectionCard title="الأرشفة" description="لا تُحذف المكاتب؛ تُؤرشف ويبقى سجلها وبطاقاتها محفوظة.">
        <ArchiveRestoreButton kind="registration-stations" id={o.id} name={o.name} archived={archived} />
      </SectionCard>
    </div>
  );
}
