import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { STATION_STATUS_LABELS } from '../../lib/labels';
import { roleLabel } from '../../lib/labels';
import { Dialog } from '../../components/design/Dialog';
import { PillButton } from '../../components/design/PillButton';
import { StatusPill } from '../../components/design/StatusPill';
import { TextField } from '../../components/design/TextField';
import { CodeText } from '../../components/design/CodeText';
import { Icon, ICONS } from '../../components/icons';
import { Notice, SectionCard } from '../users/parts';
import { UsersListPage } from '../users/UsersListPage';
import { formatWhen } from '../users/format';
import { PlaceSummaryRow, ReadinessPanel } from '../places/MunicipalitySummary';
import { OpsReportPanel } from '../reports/OpsReportPanel';
import { StageCard } from '../places/StageCard';
import {
  ArchiveRestoreButton,
  ArchivedBanner,
  OFFICE_STATUS_LABELS,
  placeActionLabel,
  type MunicipalityLite,
} from '../places/placesShared';
import { adminErrorMessage } from './adminErrors';

interface Overview {
  municipality: MunicipalityLite;
  stations: { id: string; internalCode: string; name: string; stationNumber: string; status: string; archivedAt: string | null; company: { name: string } }[];
  offices: { id: string; internalCode: string; name: string; status: 'ACTIVE' | 'TEMPORARILY_CLOSED' | 'CLOSED'; archivedAt: string | null; address: string }[];
  people: { total: number; byJob: { roleId: string; name: string; count: number }[] };
  activity: { id: string; action: string; entityType: string; createdAt: string; actorName: string | null }[];
}

const ENTITY_LABELS: Record<string, string> = {
  Municipality: 'البلدية',
  Station: 'محطة',
  RegistrationStation: 'مكتب تسجيل',
  User: 'حساب',
};

// One municipality, everything about it: its status and security directorate,
// stage and dates, its stations and offices, its people by job (and a button
// to add its manager), and its activity. The super admin creates the manager
// here, already assigned to this municipality.
export function MunicipalityDetailPage() {
  const { municipalityId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const justCreated = searchParams.get('created') === '1';

  const overview = useQuery({
    queryKey: ['municipalities', 'overview', municipalityId],
    enabled: Boolean(municipalityId),
    retry: false,
    queryFn: async () => (await apiClient.get<Overview>(`/municipalities/${municipalityId}/overview`)).data,
  });

  const [authorityName, setAuthorityName] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const patch = useMutation({
    mutationFn: async (body: Record<string, unknown>) => apiClient.patch(`/municipalities/${municipalityId}`, body),
    onSuccess: async () => {
      setProblem(null);
      await queryClient.invalidateQueries({ queryKey: ['municipalities'] });
      await queryClient.invalidateQueries({ queryKey: ['stations'] });
    },
    onError: (err) => {
      setSaved(null);
      setProblem(adminErrorMessage(err, 'تعذّر حفظ التغيير.'));
    },
  });

  if (overview.isLoading) return <p className="text-[15px] text-ink-soft">جارٍ التحميل…</p>;
  if (overview.isError || !overview.data) {
    return (
      <div className="space-y-4">
        <Notice kind="error">تعذّر فتح هذه البلدية.</Notice>
        <Link to="/admin/municipalities" className="font-bold text-primary underline">العودة إلى البلديات</Link>
      </div>
    );
  }

  const { municipality: m, stations, offices, people, activity } = overview.data;
  const archived = Boolean(m.archivedAt);
  const live = m.status === 'LIVE';
  const authorityValue = authorityName ?? m.securityAuthority?.name ?? '';
  const codeValue = code ?? m.code ?? '';

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link
        to="/admin/municipalities"
        className="inline-flex min-h-[44px] items-center gap-2 rounded-full pe-3 text-[16px] font-bold text-primary hover:underline lg:text-[14px]"
      >
        <Icon d={ICONS.arrowBack} size={18} />
        العودة إلى البلديات
      </Link>

      <header className="rounded-md bg-surface p-4 shadow-sm lg:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[24px] font-extrabold leading-tight text-ink lg:text-xl">{m.name}</h1>
            <p className="mt-1 text-[15px] text-ink-soft lg:text-[13px]">{m.securityAuthority?.name ?? 'بلا جهة أمنية بعد'}</p>
          </div>
          {archived ? (
            <StatusPill variant="neutral" size="md">مؤرشفة</StatusPill>
          ) : (
            <StatusPill variant={live ? 'ok' : 'neutral'} size="md">{live ? 'مفعّلة' : 'قيد الإعداد'}</StatusPill>
          )}
        </div>
      </header>

      {justCreated && (
        <Notice kind="success">
          أُنشئت البلدية وأُنشئت معها جهتها الأمنية «{m.securityAuthority?.name}». أضف مدير البلدية من قسم «مديرو البلدية» أدناه.
        </Notice>
      )}
      {archived && <ArchivedBanner what="هذه البلدية" />}
      {problem && <Notice kind="error">{problem}</Notice>}
      {saved && <Notice kind="success">{saved}</Notice>}

      {!archived && (
        <>
          <PlaceSummaryRow municipalityId={m.id} />
          <ReadinessPanel municipalityId={m.id} />
        </>
      )}

      <SectionCard title="الجهة الأمنية ورمز البطاقات">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="اسم الجهة الأمنية"
              value={authorityValue}
              onChange={(e) => setAuthorityName(e.target.value)}
              hint="تُنشأ تلقائيًا مع البلدية، ويمكنك تعديل اسمها."
              disabled={archived}
            />
            <TextField
              label="رمز البطاقات"
              value={codeValue}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={5}
              ltr
              hint="2 إلى 5 أحرف إنجليزية؛ تبدأ به أرقام البطاقات."
              disabled={archived}
            />
          </div>
          {!archived && (authorityName !== null || code !== null) && (
            <PillButton
              size="field"
              disabled={patch.isPending}
              onClick={() => {
                setSaved(null);
                const body: Record<string, unknown> = {};
                if (authorityName !== null && authorityName.trim() !== (m.securityAuthority?.name ?? '')) {
                  body.securityAuthorityName = authorityName.trim();
                }
                if (code !== null && code.trim() !== (m.code ?? '') && code.trim()) body.code = code.trim();
                if (Object.keys(body).length === 0) return;
                patch.mutate(body, {
                  onSuccess: () => {
                    setAuthorityName(null);
                    setCode(null);
                    setSaved('تم حفظ التغييرات.');
                  },
                });
              }}
            >
              {patch.isPending ? 'جارٍ الحفظ…' : 'حفظ'}
            </PillButton>
          )}
        </div>
      </SectionCard>

      <StageCard municipality={m} />

      {!archived && (
        <SectionCard
          title="تفعيل البلدية"
          description={live ? 'البلدية مفعّلة وتقبل التعبئات.' : 'البلدية قيد الإعداد: لا تقبل تعبئات وتظهر محطاتها للإدارة فقط.'}
        >
          {live ? (
            <PillButton size="field" variant="danger" onClick={() => { setTyped(''); setSwitchOpen(true); }}>
              إعادة إلى قيد الإعداد
            </PillButton>
          ) : (
            <PillButton
              size="field"
              disabled={patch.isPending}
              onClick={() => patch.mutate({ status: 'LIVE' }, { onSuccess: () => setSaved('فُعّلت البلدية.') })}
            >
              تفعيل البلدية
            </PillButton>
          )}
        </SectionCard>
      )}

      <SectionCard title="محطات الوقود" description={`${stations.length} محطة`}>
        {stations.length === 0 ? (
          <p className="text-[15px] text-ink-soft lg:text-[13px]">لا توجد محطات بعد. يضيفها مدير البلدية من «إدارة المحطات».</p>
        ) : (
          <ul className="divide-y divide-surface-alt">
            {stations.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <Link to={`/manage/stations/${s.id}`} className="text-[16px] font-bold text-ink hover:text-primary lg:text-[14px]">
                    {s.name}
                  </Link>
                  <p className="text-[14px] text-ink-soft lg:text-[12px]">
                    {s.company.name} · <CodeText>{s.internalCode}</CodeText>
                  </p>
                </div>
                <StatusPill variant={s.archivedAt ? 'neutral' : s.status === 'ACTIVE' ? 'ok' : 'accent'} size="md">
                  {s.archivedAt ? 'مؤرشفة' : (STATION_STATUS_LABELS[s.status] ?? s.status)}
                </StatusPill>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="مكاتب التسجيل" description={`${offices.length} مكتب`}>
        {offices.length === 0 ? (
          <p className="text-[15px] text-ink-soft lg:text-[13px]">لا توجد مكاتب تسجيل بعد.</p>
        ) : (
          <ul className="divide-y divide-surface-alt">
            {offices.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <Link to={`/manage/offices/${o.id}`} className="text-[16px] font-bold text-ink hover:text-primary lg:text-[14px]">
                    {o.name}
                  </Link>
                  <p className="text-[14px] text-ink-soft lg:text-[12px]">{o.address}</p>
                </div>
                <StatusPill variant={o.archivedAt ? 'neutral' : o.status === 'ACTIVE' ? 'ok' : 'accent'} size="md">
                  {o.archivedAt ? 'مؤرشف' : OFFICE_STATUS_LABELS[o.status]}
                </StatusPill>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="الأشخاص" description={`${people.total} شخص في هذه البلدية`}>
        {people.byJob.length === 0 ? (
          <p className="text-[15px] text-ink-soft lg:text-[13px]">لا يوجد أشخاص بعد.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {people.byJob.map((j) => (
              <li key={j.roleId}>
                <StatusPill variant="neutral" size="md">
                  {roleLabel(j.name)}: {j.count}
                </StatusPill>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <UsersListPage
        basePath="/people"
        fixedPlaceId={m.id}
        title="مديرو البلدية"
        createParams={{ kind: 'MUNICIPALITY', place: m.id, placeName: m.name }}
        emptyText="لا يوجد مدير لهذه البلدية بعد. أنشئ حسابه من الزر أعلاه."
      />

      <SectionCard title="النشاط" description="آخر ما جرى في البلدية ومحطاتها ومكاتبها وأشخاصها.">
        {activity.length === 0 ? (
          <p className="text-[15px] text-ink-soft lg:text-[13px]">لا توجد تغييرات مسجّلة بعد.</p>
        ) : (
          <ul className="divide-y divide-surface-alt">
            {activity.map((a) => (
              <li key={a.id} className="py-3">
                <p className="text-[16px] font-bold text-ink lg:text-[14px]">
                  {ENTITY_LABELS[a.entityType] ?? ''}: {placeActionLabel(a.action)}
                </p>
                <p className="text-[14px] text-ink-soft lg:text-[12px]">
                  {a.actorName ?? 'النظام'} · <span dir="ltr">{formatWhen(a.createdAt)}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="الأرشفة" description="لا تُحذف البلديات؛ تُؤرشف ويبقى كل سجلها محفوظًا ويمكن استعادتها.">
        <ArchiveRestoreButton
          kind="municipalities"
          id={m.id}
          name={m.name}
          archived={archived}
          confirmName={live ? m.name : undefined}
          onDone={() => navigate('/admin/municipalities')}
        />
      </SectionCard>

      <Dialog
        open={switchOpen}
        title={`إعادة «${m.name}» إلى قيد الإعداد`}
        busy={patch.isPending}
        onClose={() => !patch.isPending && setSwitchOpen(false)}
        footer={
          <>
            <PillButton size="field" variant="secondary" disabled={patch.isPending} onClick={() => setSwitchOpen(false)}>
              رجوع
            </PillButton>
            <PillButton
              size="field"
              variant="danger"
              data-testid="municipality-deactivate-confirm-button"
              disabled={patch.isPending || typed.trim() !== m.name}
              onClick={() =>
                patch.mutate(
                  { status: 'PREPARING', confirmName: typed.trim() },
                  { onSuccess: () => { setSwitchOpen(false); setSaved('أُعيدت البلدية إلى قيد الإعداد.'); } },
                )
              }
            >
              إعادة إلى قيد الإعداد
            </PillButton>
          </>
        }
      >
        <div data-testid="municipality-deactivate-confirm" className="space-y-3">
          <p className="leading-[1.8]">
            سيتوقف تسجيل أي تعبئة في كل محطات هذه البلدية فورًا، وتختفي محطاتها عن غير الإدارة. للتأكيد اكتب اسم البلدية كما هو.
          </p>
          <TextField label={`اكتب: ${m.name}`} value={typed} onChange={(e) => setTyped(e.target.value)} data-testid="municipality-confirm-name" />
        </div>
      </Dialog>

      <SectionCard
        title="تقارير البلدية"
        description="التقارير نفسها التي يقرؤها مدير البلدية، لهذه البلدية وحدها. للمقارنة بين البلديات انتقل إلى ملخص البلديات، ولسجل التغييرات إلى سجل المراجعة."
      >
        <div className="mb-4 flex flex-wrap gap-2.5">
          <Link to="/reports?report=summary">
            <PillButton size="field" variant="secondary">ملخص مقارنة البلديات</PillButton>
          </Link>
          <Link to="/admin/audit-log">
            <PillButton size="field" variant="secondary">سجل المراجعة</PillButton>
          </Link>
        </div>
        <OpsReportPanel report="municipality" fixedMunicipalityId={m.id} />
      </SectionCard>
    </div>
  );
}
