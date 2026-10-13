import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { roleLabel } from '../../lib/labels';
import { formatDateTime } from '../../lib/dateFormat';
import { usePageParam } from '../../lib/usePageParam';
import { Card } from '../../components/design/Card';
import { PillButton } from '../../components/design/PillButton';
import { StatusPill } from '../../components/design/StatusPill';
import { Icon, ICONS } from '../../components/icons';
import { LtrText } from '../../components/LtrText';
import { Pagination } from '../../components/Pagination';
import { OpsReportPanel } from '../reports/OpsReportPanel';
import { Notice } from '../users/parts';
import { placeActionLabel } from '../places/placesShared';

// The tabs of a municipality's page that list things. Each one is mounted only
// while its tab is open, so a tab's data is asked for when it is opened, one
// page (25 rows) at a time, with search, filters and sort done by the server.

const PAGE_SIZE = 25;

const FIELD =
  'h-[52px] w-full rounded-sm border border-line bg-surface-alt px-3 text-[16px] text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface lg:h-11 lg:text-[14px]';

function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

// ── الأشخاص ────────────────────────────────────────────────────────────

interface PersonRow {
  id: string;
  fullName: string;
  username: string;
  isActive: boolean;
  locked: boolean;
  lastLoginAt: string | null;
  job: { id: string; name: string } | null;
}
interface PeoplePage {
  total: number;
  items: PersonRow[];
}

export function PeopleTab({
  municipalityId,
  municipalityName,
  byJob,
  archived,
}: {
  municipalityId: string;
  municipalityName: string;
  byJob: Array<{ roleId: string; name: string; count: number }>;
  archived: boolean;
}) {
  const location = useLocation();
  const { skip, setSkip, reset } = usePageParam(PAGE_SIZE);
  const [q, setQ] = useState('');
  const [roleId, setRoleId] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState<'name' | 'username' | 'lastLogin'>('name');
  const dq = useDebounced(q);

  const asked = JSON.stringify({ dq, roleId, status, sort });
  const [lastAsked, setLastAsked] = useState(asked);
  useEffect(() => {
    if (asked !== lastAsked) {
      setLastAsked(asked);
      reset();
    }
  }, [asked, lastAsked, reset]);

  const params = { skip, take: PAGE_SIZE, q: dq.trim() || undefined, roleId: roleId || undefined, status: status || undefined, sort };
  const query = useQuery({
    queryKey: ['municipalities', 'people', municipalityId, params],
    queryFn: async () => (await apiClient.get<PeoplePage>(`/municipalities/${municipalityId}/people`, { params })).data,
    placeholderData: (prev) => prev,
  });
  const rows = query.data?.items ?? [];
  const total = query.data?.total ?? 0;

  const here = `${location.pathname}${location.search}`;
  const createPath = `/people/new?${new URLSearchParams({ kind: 'MUNICIPALITY', place: municipalityId, placeName: municipalityName, back: here }).toString()}`;
  const personLink = (id: string) => `/people/${id}?back=${encodeURIComponent(here)}`;

  return (
    <Card data-testid="people-list">
      <div className="space-y-3 p-4 lg:p-[18px]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[15px] text-ink-soft lg:text-[13px]">
            {byJob.length === 0 ? 'لا يوجد أشخاص بعد.' : 'كل من له محطة أو مكتب أو مسؤولية في هذه البلدية.'}
          </p>
          {!archived && (
            <Link to={createPath}>
              <PillButton size="field">
                <span className="inline-flex items-center gap-2">
                  <Icon d={ICONS.plus} size={18} />
                  إضافة مدير بلدية
                </span>
              </PillButton>
            </Link>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <label htmlFor="pp-search" className="mb-1.5 block text-[14px] font-bold text-ink lg:text-[12px]">
              بحث بالاسم أو اسم المستخدم
            </label>
            <input id="pp-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} className={FIELD} />
          </div>
          <div>
            <label htmlFor="pp-job" className="mb-1.5 block text-[14px] font-bold text-ink lg:text-[12px]">الوظيفة</label>
            <select id="pp-job" value={roleId} onChange={(e) => setRoleId(e.target.value)} className={FIELD}>
              <option value="">كل الوظائف</option>
              {byJob.map((j) => (
                <option key={j.roleId} value={j.roleId}>
                  {roleLabel(j.name)} ({j.count.toLocaleString('en-US')})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="pp-status" className="mb-1.5 block text-[14px] font-bold text-ink lg:text-[12px]">الحالة</label>
            <select id="pp-status" value={status} onChange={(e) => setStatus(e.target.value)} className={FIELD}>
              <option value="">كل الحالات</option>
              <option value="active">فعّال</option>
              <option value="deactivated">موقوف</option>
              <option value="locked">مقفل مؤقتًا</option>
            </select>
          </div>
          <div>
            <label htmlFor="pp-sort" className="mb-1.5 block text-[14px] font-bold text-ink lg:text-[12px]">الترتيب</label>
            <select id="pp-sort" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className={FIELD}>
              <option value="name">الاسم</option>
              <option value="username">اسم المستخدم</option>
              <option value="lastLogin">آخر دخول</option>
            </select>
          </div>
        </div>
      </div>

      {query.isError && (
        <div className="m-4">
          <Notice kind="error">تعذّر تحميل الأشخاص. تأكد من الاتصال ثم أعد المحاولة.</Notice>
        </div>
      )}
      {query.isLoading && <p className="p-4 text-[15px] text-ink-soft lg:text-[13px]">جارٍ التحميل…</p>}
      {query.data && rows.length === 0 && (
        <div className="px-4 py-10 text-center">
          <p className="text-[18px] font-extrabold text-ink lg:text-[15px]">لا يوجد أشخاص يطابقون بحثك</p>
          <p className="mt-1 text-[15px] text-ink-soft lg:text-[13px]">غيّر كلمات البحث أو الوظيفة أو الحالة.</p>
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full text-[16px] lg:text-[14px]">
              <caption className="sr-only">أشخاص البلدية</caption>
              <thead>
                <tr className="bg-surface-alt text-[13px] font-bold text-ink-soft lg:text-[12px]">
                  <th scope="col" className="px-[18px] py-2.5 text-start">الاسم</th>
                  <th scope="col" className="px-[18px] py-2.5 text-start">الوظيفة</th>
                  <th scope="col" className="px-[18px] py-2.5 text-start">آخر دخول</th>
                  <th scope="col" className="px-[18px] py-2.5 text-start">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-b border-surface-alt last:border-0 hover:bg-surface-alt/60">
                    <td className="px-[18px] py-3">
                      <Link to={personLink(p.id)} className="font-bold text-ink hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                        {p.fullName}
                      </Link>
                      <div><LtrText><span className="font-mono text-[13px] text-ink-soft lg:text-[12px]">{p.username}</span></LtrText></div>
                    </td>
                    <td className="px-[18px] py-3 text-ink">{p.job ? roleLabel(p.job.name) : '—'}</td>
                    <td className="px-[18px] py-3 text-ink">{p.lastLoginAt ? <LtrText>{formatDateTime(p.lastLoginAt)}</LtrText> : 'لم يدخل بعد'}</td>
                    <td className="px-[18px] py-3"><PersonStatus person={p} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="divide-y divide-surface-alt lg:hidden">
            {rows.map((p) => (
              <li key={p.id}>
                <Link to={personLink(p.id)} className="block min-h-[72px] px-4 py-3.5 hover:bg-surface-alt/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent">
                  <p className="break-words text-[18px] font-extrabold leading-snug text-ink">{p.fullName}</p>
                  <p className="text-[16px] text-ink-soft">{p.job ? roleLabel(p.job.name) : '—'}</p>
                  <div className="mt-1.5"><PersonStatus person={p} /></div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      <Pagination skip={skip} take={PAGE_SIZE} total={total} onSkipChange={setSkip} alwaysShow={total > 0} testId="people-pager" />
    </Card>
  );
}

function PersonStatus({ person }: { person: PersonRow }) {
  if (!person.isActive) return <StatusPill variant="neutral" size="md">موقوف</StatusPill>;
  if (person.locked) return <StatusPill variant="warn" size="md">مقفل مؤقتًا</StatusPill>;
  return <StatusPill variant="ok" size="md">فعّال</StatusPill>;
}

// ── سجل النشاط ────────────────────────────────────────────────────────

const ENTITY_LABELS: Record<string, string> = {
  Municipality: 'البلدية',
  Station: 'محطة',
  RegistrationStation: 'مكتب تسجيل',
  User: 'حساب',
};

interface ActivityPage {
  total: number;
  items: Array<{ id: string; action: string; entityType: string; createdAt: string; actorName: string | null }>;
}

export function ActivityTab({ municipalityId }: { municipalityId: string }) {
  const { skip, setSkip } = usePageParam(PAGE_SIZE);
  const query = useQuery({
    queryKey: ['municipalities', 'activity', municipalityId, skip],
    queryFn: async () =>
      (await apiClient.get<ActivityPage>(`/municipalities/${municipalityId}/activity`, { params: { skip, take: PAGE_SIZE } })).data,
    placeholderData: (prev) => prev,
  });
  const rows = query.data?.items ?? [];
  const total = query.data?.total ?? 0;

  return (
    <Card data-testid="activity-list">
      <div className="p-4 lg:p-[18px]">
        <h2 className="text-[18px] font-extrabold text-ink lg:text-[15px]">سجل النشاط</h2>
        <p className="mt-0.5 text-[15px] text-ink-soft lg:text-[13px]">آخر ما جرى في البلدية ومحطاتها ومكاتبها وأشخاصها، الأحدث أولًا.</p>
      </div>
      {query.isError && (
        <div className="m-4">
          <Notice kind="error">تعذّر تحميل النشاط. تأكد من الاتصال ثم أعد المحاولة.</Notice>
        </div>
      )}
      {query.isLoading && <p className="px-4 pb-4 text-[15px] text-ink-soft lg:text-[13px]">جارٍ التحميل…</p>}
      {query.data && rows.length === 0 && (
        <p className="px-4 pb-6 text-[15px] text-ink-soft lg:text-[13px]">لا توجد تغييرات مسجّلة بعد.</p>
      )}
      {rows.length > 0 && (
        <ul className="divide-y divide-surface-alt border-t border-surface-alt">
          {rows.map((a) => (
            <li key={a.id} className="px-4 py-3 lg:px-[18px]">
              <p className="text-[16px] font-bold text-ink lg:text-[14px]">
                {ENTITY_LABELS[a.entityType] ?? ''}: {placeActionLabel(a.action)}
              </p>
              <p className="text-[14px] text-ink-soft lg:text-[12px]">
                {a.actorName ?? 'النظام'} · <LtrText>{formatDateTime(a.createdAt)}</LtrText>
              </p>
            </li>
          ))}
        </ul>
      )}
      <Pagination skip={skip} take={PAGE_SIZE} total={total} onSkipChange={setSkip} alwaysShow={total > 0} testId="activity-pager" />
    </Card>
  );
}

// ── التقارير ──────────────────────────────────────────────────────────

export function ReportsTab({ municipalityId }: { municipalityId: string }) {
  return (
    <div className="space-y-4" data-testid="municipality-reports">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 lg:p-[18px]">
          <p className="max-w-xl text-[15px] leading-[1.8] text-ink-soft lg:text-[13px]">
            التقارير نفسها التي يقرؤها مدير البلدية، لهذه البلدية وحدها. اختر تقريرًا واحدًا لتقرأه.
          </p>
          <div className="flex flex-wrap gap-2.5">
            <Link to="/reports?report=summary">
              <PillButton size="field" variant="secondary">مقارنة البلديات</PillButton>
            </Link>
            <Link to="/admin/audit-log">
              <PillButton size="field" variant="secondary">سجل المراجعة</PillButton>
            </Link>
          </div>
        </div>
      </Card>
      <OpsReportPanel report="municipality" fixedMunicipalityId={municipalityId} />
    </div>
  );
}
