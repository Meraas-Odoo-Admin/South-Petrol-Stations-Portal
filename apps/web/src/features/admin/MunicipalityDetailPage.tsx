import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { arabicCount } from '@fuel-tracking/shared-types';
import { apiClient } from '../../lib/apiClient';
import { roleLabel } from '../../lib/labels';
import { Dialog } from '../../components/design/Dialog';
import { PillButton } from '../../components/design/PillButton';
import { StatusPill } from '../../components/design/StatusPill';
import { TextAreaField, TextField } from '../../components/design/TextField';
import { TabPanel, Tabs, useTab, type TabDef } from '../../components/design/Tabs';
import { Icon, ICONS } from '../../components/icons';
import { Notice, SectionCard } from '../users/parts';
import { PlaceSummaryRow } from '../places/MunicipalitySummary';
import { PlacesList } from '../places/PlacesList';
import { ArchiveRestoreButton, ArchivedBanner, type MunicipalityLite } from '../places/placesShared';
import { adminErrorMessage } from './adminErrors';
import { ActivityTab, PeopleTab, ReportsTab } from './MunicipalityTabs';

interface Overview {
  // activatedByName: who switched the municipality on (the date is municipality.activatedOn).
  municipality: MunicipalityLite & { activatedByName?: string | null };
  counts: { stations: number; offices: number; people: number };
  people: { total: number; byJob: { roleId: string; name: string; count: number }[] };
}

const TABS: TabDef[] = [
  { key: 'overview', label: 'نظرة عامة' },
  { key: 'places', label: 'المحطات والمكاتب' },
  { key: 'people', label: 'الأشخاص' },
  { key: 'reports', label: 'التقارير' },
  { key: 'activity', label: 'سجل النشاط' },
  { key: 'settings', label: 'الإعدادات' },
];

// One municipality, split into tabs so no tab is a wall of rows (UX round):
//   نظرة عامة            the summary figures
//   المحطات والمكاتب      one paged list with search, filters and sort
//   الأشخاص              paged, by job, with search and status
//   التقارير              one report at a time
//   سجل النشاط            the activity log, paged
//   الإعدادات             name, directorate, activation switch, archive
// The tab and the page are in the address; a tab's data is asked for only
// when the tab is opened.
export function MunicipalityDetailPage() {
  const { municipalityId } = useParams();
  const [searchParams] = useSearchParams();
  const justCreated = searchParams.get('created') === '1';
  const [urlTab, setTab] = useTab(TABS);
  // A municipality that was just created opens on its people, where its
  // manager is added.
  const tab = justCreated && !searchParams.get('tab') ? 'people' : urlTab;

  const overview = useQuery({
    queryKey: ['municipalities', 'overview', municipalityId],
    enabled: Boolean(municipalityId),
    retry: false,
    queryFn: async () => (await apiClient.get<Overview>(`/municipalities/${municipalityId}/overview`)).data,
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

  const { municipality: m, counts, people } = overview.data;
  const archived = Boolean(m.archivedAt);
  const live = m.status === 'LIVE';

  return (
    <div className="mx-auto max-w-5xl space-y-4">
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
            <StatusPill variant={live ? 'ok' : 'neutral'} size="md">{live ? 'مفعّلة' : 'غير مفعّلة'}</StatusPill>
          )}
        </div>
        {/* The headline numbers stay in view on every tab. */}
        <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-surface-alt pt-4" data-testid="municipality-counts">
          {[
            ['المحطات', counts.stations, 'station'],
            ['المكاتب', counts.offices, 'office'],
            ['الأشخاص', counts.people, 'person'],
          ].map(([label, value, unit]) => (
            <div key={String(label)}>
              <dt className="text-[14px] text-ink-soft lg:text-[12px]">{label}</dt>
              <dd className="text-[24px] font-extrabold tabular-nums leading-tight text-ink lg:text-[20px]">
                {(value as number).toLocaleString('en-US')}
                <span className="sr-only"> ({arabicCount(value as number, unit as 'station' | 'office' | 'person')})</span>
              </dd>
            </div>
          ))}
        </dl>
      </header>

      {justCreated && (
        <Notice kind="success">
          أُنشئت البلدية وأُنشئت معها جهتها الأمنية «{m.securityAuthority?.name}». أضف مدير البلدية من تبويب «الأشخاص».
        </Notice>
      )}
      {archived && <ArchivedBanner what="هذه البلدية" />}

      <Tabs tabs={TABS} value={tab} onChange={setTab} label="أقسام البلدية" />

      <TabPanel tab="overview" value={tab}>
        {archived ? (
          <Notice kind="info">هذه البلدية مؤرشفة؛ لا تظهر لها أرقام. يمكن استعادتها من «الإعدادات».</Notice>
        ) : (
          <PlaceSummaryRow municipalityId={m.id} />
        )}
      </TabPanel>

      <TabPanel tab="places" value={tab}>
        <PlacesList municipalityId={m.id} emptyHint="لا توجد محطات بعد. يضيفها مدير البلدية من «إدارة المحطات»." />
      </TabPanel>

      <TabPanel tab="people" value={tab}>
        <PeopleTab municipalityId={m.id} municipalityName={m.name} byJob={people.byJob} archived={archived} />
      </TabPanel>

      <TabPanel tab="reports" value={tab}>
        <ReportsTab municipalityId={m.id} />
      </TabPanel>

      <TabPanel tab="activity" value={tab}>
        <ActivityTab municipalityId={m.id} />
      </TabPanel>

      <TabPanel tab="settings" value={tab}>
        <SettingsTab municipality={m} live={live} archived={archived} peopleByJob={people.byJob} />
      </TabPanel>
    </div>
  );
}

// «الإعدادات»: name, directorate name and the card code, the activation switch,
// and the archive - the one destructive action - set apart at the bottom.
function SettingsTab({
  municipality: m,
  live,
  archived,
  peopleByJob,
}: {
  municipality: MunicipalityLite & { activatedByName?: string | null };
  live: boolean;
  archived: boolean;
  peopleByJob: Array<{ roleId: string; name: string; count: number }>;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState<string | null>(null);
  const [authorityName, setAuthorityName] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [activateOpen, setActivateOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const patch = useMutation({
    mutationFn: async (body: Record<string, unknown>) => apiClient.patch(`/municipalities/${m.id}`, body),
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

  const nameValue = name ?? m.name;
  const authorityValue = authorityName ?? m.securityAuthority?.name ?? '';
  const codeValue = code ?? m.code ?? '';
  const dirty = name !== null || authorityName !== null || code !== null;
  const jobsLine = peopleByJob.length === 0 ? '' : peopleByJob.map((j) => `${roleLabel(j.name)}: ${j.count}`).join(' · ');

  return (
    <div className="space-y-4" data-testid="municipality-settings">
      {problem && <Notice kind="error">{problem}</Notice>}
      {saved && <Notice kind="success">{saved}</Notice>}

      <SectionCard title="الاسم والجهة الأمنية ورمز البطاقات">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="اسم البلدية" value={nameValue} onChange={(e) => setName(e.target.value)} disabled={archived} />
            <TextField
              label="اسم الجهة الأمنية (المديرية)"
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
          {!archived && dirty && (
            <PillButton
              size="field"
              disabled={patch.isPending}
              onClick={() => {
                setSaved(null);
                const body: Record<string, unknown> = {};
                if (name !== null && name.trim() && name.trim() !== m.name) body.name = name.trim();
                if (authorityName !== null && authorityName.trim() !== (m.securityAuthority?.name ?? '')) {
                  body.securityAuthorityName = authorityName.trim();
                }
                if (code !== null && code.trim() !== (m.code ?? '') && code.trim()) body.code = code.trim();
                if (Object.keys(body).length === 0) return;
                patch.mutate(body, {
                  onSuccess: () => {
                    setName(null);
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

      {!archived && (
        <SectionCard
          title="تفعيل البلدية"
          description="مفتاح تفعيل للتتبّع والتقارير فقط؛ لا يمنع تسجيل أي تعبئة ولا يخفي أي محطة."
        >
          <div className="space-y-4" data-testid="municipality-activation">
            <p className="text-[18px] font-extrabold text-ink lg:text-[16px]" data-testid="municipality-activation-state">
              {live
                ? `مفعّلة منذ ${m.activatedOn ?? '—'}${m.activatedByName ? ` · بواسطة ${m.activatedByName}` : ''}`
                : 'غير مفعّلة'}
            </p>
            {live ? (
              <PillButton
                size="field"
                variant="danger"
                data-testid="municipality-deactivate-open"
                onClick={() => { setReason(''); setProblem(null); setSwitchOpen(true); }}
              >
                إيقاف التفعيل
              </PillButton>
            ) : (
              <PillButton
                size="field"
                data-testid="municipality-activate-open"
                disabled={patch.isPending}
                onClick={() => { setProblem(null); setActivateOpen(true); }}
              >
                تفعيل البلدية
              </PillButton>
            )}
          </div>
        </SectionCard>
      )}

      {/* The danger zone: the only destructive action, set apart. */}
      <section
        aria-label="منطقة الخطر"
        data-testid="municipality-danger-zone"
        className="rounded-md border-2 border-danger bg-danger-100/30 p-4 lg:p-5"
      >
        <h2 className="text-[18px] font-extrabold text-danger-dark lg:text-[15px]">منطقة الخطر: الأرشفة</h2>
        <p className="mt-1 mb-4 text-[15px] leading-[1.8] text-ink lg:text-[13px]">
          لا تُحذف البلديات؛ تُؤرشف ويبقى كل سجلها محفوظًا ويمكن استعادتها.
          {jobsLine && !archived ? ` يعمل فيها الآن: ${jobsLine}.` : ''}
        </p>
        <ArchiveRestoreButton
          kind="municipalities"
          id={m.id}
          name={m.name}
          archived={archived}
          confirmName={live ? m.name : undefined}
          onDone={() => navigate('/admin/municipalities')}
        />
      </section>

      <Dialog
        open={activateOpen}
        title={`تفعيل «${m.name}»`}
        busy={patch.isPending}
        onClose={() => !patch.isPending && setActivateOpen(false)}
        footer={
          <>
            <PillButton size="field" variant="secondary" disabled={patch.isPending} onClick={() => setActivateOpen(false)}>
              رجوع
            </PillButton>
            <PillButton
              size="field"
              data-testid="municipality-activate-confirm-button"
              disabled={patch.isPending}
              onClick={() =>
                patch.mutate(
                  { status: 'LIVE' },
                  { onSuccess: () => { setActivateOpen(false); setSaved('فُعّلت البلدية.'); } },
                )
              }
            >
              {patch.isPending ? 'جارٍ التفعيل…' : 'نعم، فعّل البلدية'}
            </PillButton>
          </>
        }
      >
        <p className="leading-[1.8]" data-testid="municipality-activate-confirm">
          سيُسجَّل تاريخ التفعيل واسمك، وتبدأ تقارير هذه البلدية من هذا اليوم. التفعيل لا يمنع أي تعبئة ولا يغيّر ما يراه المستخدمون.
        </p>
      </Dialog>

      <Dialog
        open={switchOpen}
        title={`إيقاف تفعيل «${m.name}»`}
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
              disabled={patch.isPending || reason.trim().length < 3}
              onClick={() =>
                patch.mutate(
                  { status: 'PREPARING', reason: reason.trim() },
                  { onSuccess: () => { setSwitchOpen(false); setSaved('أُوقف تفعيل البلدية.'); } },
                )
              }
            >
              إيقاف التفعيل
            </PillButton>
          </>
        }
      >
        <div data-testid="municipality-deactivate-confirm" className="space-y-3">
          <p className="leading-[1.8]">لا يتوقف أي تسجيل للتعبئات بإيقاف التفعيل. اكتب سبب الإيقاف ليُسجَّل.</p>
          <TextAreaField label="السبب" value={reason} onChange={(e) => setReason(e.target.value)} data-testid="municipality-deactivate-reason" />
        </div>
      </Dialog>
    </div>
  );
}
