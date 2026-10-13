import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { Card } from '../../components/design/Card';
import { Dialog } from '../../components/design/Dialog';
import { PillButton } from '../../components/design/PillButton';
import { StatusPill } from '../../components/design/StatusPill';
import { TextField } from '../../components/design/TextField';
import { Icon, ICONS } from '../../components/icons';
import { Notice } from '../users/parts';
import { STAGE_LABELS } from '../places/StageCard';
import { useMunicipalityList } from '../places/placesShared';
import { adminErrorMessage } from './adminErrors';

const SELECT_CLASS =
  'h-[52px] w-full rounded-sm border border-line bg-surface-alt px-3 text-[16px] text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface lg:h-11 lg:text-[14px]';

// «إدارة البلديات» — the super admin's list of municipalities, with search,
// filters and sortable columns. Opening one shows everything about it. The
// super admin only creates municipalities (each with its security directorate,
// made automatically) and their managers; everything inside a municipality is
// run by its own managers.
export function MunicipalitiesAdminPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [status, setStatus] = useState('');
  const [archived, setArchived] = useState('');
  const [sort, setSort] = useState('name');
  const [dir, setDir] = useState<'asc' | 'desc'>('asc');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(timer);
  }, [q]);

  const list = useMunicipalityList({
    ...(debouncedQ ? { q: debouncedQ } : {}),
    ...(status ? { status } : {}),
    ...(archived ? { archived } : {}),
    sort,
    dir,
  });

  const create = useMutation({
    mutationFn: async () =>
      (await apiClient.post<{ id: string }>('/municipalities', { name: name.trim(), ...(code.trim() ? { code: code.trim().toUpperCase() } : {}) })).data,
    onSuccess: (created) => {
      setCreating(false);
      setName('');
      setCode('');
      navigate(`/admin/municipalities/${created.id}?created=1`);
    },
    onError: (err) => setProblem(adminErrorMessage(err, 'تعذّر إضافة البلدية.')),
  });

  function submit() {
    if (name.trim().length < 2) {
      setProblem('اكتب اسم البلدية.');
      return;
    }
    if (code.trim() && !/^[A-Za-z]{2,5}$/.test(code.trim())) {
      setProblem('رمز البطاقات من 2 إلى 5 أحرف إنجليزية.');
      return;
    }
    setProblem(null);
    create.mutate();
  }

  const rows = list.data ?? [];
  const sortHeader = (key: string, label: string) => (
    <th
      scope="col"
      aria-sort={sort === key ? (dir === 'desc' ? 'descending' : 'ascending') : 'none'}
      className="px-[18px] py-2.5 text-start"
    >
      <button
        type="button"
        onClick={() => {
          if (sort === key) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
          else {
            setSort(key);
            setDir('asc');
          }
        }}
        className="font-bold hover:text-primary"
      >
        {label} {sort === key && (dir === 'desc' ? '▼' : '▲')}
      </button>
    </th>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[22px] font-extrabold text-ink lg:text-[18px]">إدارة البلديات</h2>
          <p className="mt-1 text-[15px] text-ink-soft lg:text-[13px]">
            أنشئ البلدية ومديرها، وكل ما بداخلها يديره مديرها.
          </p>
        </div>
        <PillButton size="field" onClick={() => setCreating(true)}>
          <span className="inline-flex items-center gap-2">
            <Icon d={ICONS.plus} size={18} />
            بلدية جديدة
          </span>
        </PillButton>
      </div>

      <Card>
        <div className="space-y-3 p-4 lg:p-[18px]">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative sm:col-span-2">
              <label htmlFor="mu-search" className="mb-1.5 block text-[14px] font-bold text-ink lg:text-[12px]">بحث بالاسم أو الرمز</label>
              <span className="pointer-events-none absolute bottom-0 start-3.5 flex h-[52px] items-center text-ink-faint lg:h-11">
                <Icon d={ICONS.search} size={18} />
              </span>
              <input
                id="mu-search"
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className={`${SELECT_CLASS} ps-11`}
              />
            </div>
            <div>
              <label htmlFor="mu-status" className="mb-1.5 block text-[14px] font-bold text-ink lg:text-[12px]">الحالة</label>
              <select id="mu-status" value={status} onChange={(e) => setStatus(e.target.value)} className={SELECT_CLASS}>
                <option value="">كل الحالات</option>
                <option value="LIVE">مفعّلة</option>
                <option value="PREPARING">قيد الإعداد</option>
              </select>
            </div>
            <div>
              <label htmlFor="mu-archived" className="mb-1.5 block text-[14px] font-bold text-ink lg:text-[12px]">الأرشيف</label>
              <select id="mu-archived" value={archived} onChange={(e) => setArchived(e.target.value)} className={SELECT_CLASS}>
                <option value="">العاملة فقط</option>
                <option value="only">المؤرشفة فقط</option>
                <option value="include">العاملة والمؤرشفة</option>
              </select>
            </div>
          </div>
        </div>

        {list.isError && (
          <div className="m-4">
            <Notice kind="error">تعذّر تحميل البلديات. تأكد من الاتصال ثم أعد المحاولة.</Notice>
          </div>
        )}
        {list.isLoading && <p className="p-4 text-[15px] text-ink-soft lg:text-[13px]">جارٍ التحميل…</p>}
        {list.data && rows.length === 0 && (
          <div className="px-4 py-10 text-center">
            <p className="text-[18px] font-extrabold text-ink lg:text-[15px]">
              {q || status || archived ? 'لا توجد بلديات تطابق بحثك' : 'لا توجد بلديات بعد'}
            </p>
          </div>
        )}

        {rows.length > 0 && (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-[16px] lg:text-[14px]">
                <caption className="sr-only">البلديات</caption>
                <thead>
                  <tr className="bg-surface-alt text-[13px] lg:text-[12px] font-bold text-ink-soft">
                    {sortHeader('name', 'البلدية')}
                    <th scope="col" className="px-[18px] py-2.5 text-start">رمز البطاقات</th>
                    {sortHeader('status', 'الحالة')}
                    <th scope="col" className="px-[18px] py-2.5 text-start">المرحلة</th>
                    {sortHeader('stations', 'المحطات')}
                    {sortHeader('offices', 'مكاتب التسجيل')}
                    <th scope="col" className="px-[18px] py-2.5 text-start">الجهة الأمنية</th>
                    <th scope="col" className="px-[18px] py-2.5 text-start">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((m) => (
                    <tr key={m.id} className="border-b border-surface-alt last:border-0 hover:bg-surface-alt/60" data-testid={`municipality-row-${m.id}`}>
                      <td className="px-[18px] py-3 font-bold text-ink">
                        <Link to={`/admin/municipalities/${m.id}`} className="hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                          {m.name}
                        </Link>
                      </td>
                      <td className="px-[18px] py-3"><span dir="ltr" className="font-mono text-ink-soft">{m.code ?? '—'}</span></td>
                      <td className="px-[18px] py-3">
                        {m.archivedAt ? (
                          <StatusPill variant="neutral" size="md">مؤرشفة</StatusPill>
                        ) : (
                          <StatusPill variant={m.status === 'LIVE' ? 'ok' : 'neutral'} size="md">
                            {m.status === 'LIVE' ? 'مفعّلة' : 'قيد الإعداد'}
                          </StatusPill>
                        )}
                      </td>
                      <td className="px-[18px] py-3" data-testid={`municipality-stage-${m.id}`}>
                        <StatusPill variant={m.stage === 'CARD_REQUIRED' ? 'ok' : 'neutral'} size="md">
                          {STAGE_LABELS[m.stage ?? 'GRACE']}
                        </StatusPill>
                      </td>
                      <td className="px-[18px] py-3 text-ink">{m.stationCount ?? 0}</td>
                      <td className="px-[18px] py-3 text-ink">{m.officeCount ?? 0}</td>
                      <td className="px-[18px] py-3 text-ink-soft">{m.securityAuthority?.name ?? '—'}</td>
                      <td className="px-[18px] py-3">
                        <Link to={`/admin/municipalities/${m.id}`} className="rounded-full bg-surface-alt px-3 py-1.5 text-[15px] lg:text-[13px] font-bold text-ink-soft hover:text-primary">
                          فتح
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-surface-alt lg:hidden">
              {rows.map((m) => (
                <li key={m.id}>
                  <Link to={`/admin/municipalities/${m.id}`} className="block min-h-[88px] px-4 py-4 hover:bg-surface-alt/60">
                    <p className="text-[18px] font-extrabold text-ink">{m.name}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {m.archivedAt ? (
                        <StatusPill variant="neutral" size="md">مؤرشفة</StatusPill>
                      ) : (
                        <StatusPill variant={m.status === 'LIVE' ? 'ok' : 'neutral'} size="md">
                          {m.status === 'LIVE' ? 'مفعّلة' : 'قيد الإعداد'}
                        </StatusPill>
                      )}
                      <StatusPill variant="neutral" size="md">{STAGE_LABELS[m.stage ?? 'GRACE']}</StatusPill>
                    </div>
                    <p className="mt-1 text-[15px] text-ink-soft">
                      {m.stationCount ?? 0} محطة · {m.officeCount ?? 0} مكتب تسجيل
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <Dialog
        open={creating}
        title="بلدية جديدة"
        busy={create.isPending}
        onClose={() => !create.isPending && setCreating(false)}
        footer={
          <>
            <PillButton size="field" variant="secondary" disabled={create.isPending} onClick={() => setCreating(false)}>
              رجوع
            </PillButton>
            <PillButton size="field" disabled={create.isPending} onClick={submit} data-testid="municipality-create-save">
              {create.isPending ? 'جارٍ الإنشاء…' : 'إنشاء البلدية'}
            </PillButton>
          </>
        }
      >
        <div className="space-y-4">
          <TextField label="اسم البلدية" value={name} onChange={(e) => setName(e.target.value)} data-testid="municipality-create-name" />
          <TextField
            label="رمز البطاقات (اختياري)"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            hint="2 إلى 5 أحرف إنجليزية، مثل SBH؛ تبدأ به أرقام بطاقات هذه البلدية."
            ltr
            maxLength={5}
          />
          <Notice kind="info">
            تُنشأ الجهة الأمنية للبلدية تلقائيًا باسم «مديرية أمن ‹اسم البلدية›» ويمكنك تعديل اسمها بعد ذلك. تبدأ البلدية «قيد الإعداد».
          </Notice>
          {problem && <Notice kind="error">{problem}</Notice>}
        </div>
      </Dialog>
    </div>
  );
}
