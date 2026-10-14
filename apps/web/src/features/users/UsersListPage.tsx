import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { adminErrorMessage } from '../admin/adminErrors';
import { TextAreaField } from '../../components/design/TextField';
import { useAuth } from '../auth/AuthProvider';
import { Card, CardHeader } from '../../components/design/Card';
import { PageHeader } from '../../components/design/PageHeader';
import { PillButton } from '../../components/design/PillButton';
import { Dialog } from '../../components/design/Dialog';
import { CodeText } from '../../components/design/CodeText';
import { Icon, ICONS } from '../../components/icons';
import { roleLabel } from '../../lib/labels';
import { AccountStatusPill } from './AccountStatusPill';
import { PlacePicker } from './PlacePicker';
import { formatWhen } from './format';
import { USERS_PAGE_SIZE, usePlaceOptions, useUserList, useUserOptions } from './useUsers';
import type { UserListItem } from './types';

const SIDE_OPTIONS = [
  { value: '', label: 'كل الجهات' },
  { value: 'PETROL_STATION', label: 'محطات الوقود' },
  { value: 'REGISTRATION', label: 'مكاتب التسجيل' },
  { value: 'ADMIN', label: 'الإدارة' },
];
const STATUS_OPTIONS = [
  { value: '', label: 'كل الحالات' },
  { value: 'active', label: 'نشط' },
  { value: 'deactivated', label: 'موقوف' },
  { value: 'locked', label: 'مقفل' },
  { value: 'must_change', label: 'يجب تغيير كلمة المرور' },
  { value: 'archived', label: 'مؤرشف' },
];


const SELECT_CLASS =
  'h-[52px] w-full rounded-sm border border-line bg-surface-alt px-3 text-[16px] text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface lg:h-11 lg:text-[14px]';

function whereText(item: UserListItem): string {
  if (item.sees === 'ALL') return 'كل البلديات والمحطات والمكاتب';
  if (item.placeCount === 0) return 'لم يُحدَّد مكان عمل';
  const extra = item.placeCount - item.placeNames.length;
  return item.placeNames.join('، ') + (extra > 0 ? ` +${extra}` : '');
}

// The accounts list. The same screen serves admins (at /admin/users) and
// supervisors (at /staff); what each sees and may do is decided by the
// server, so a supervisor's list simply holds their own employees.
//
// Phase 5A: the list lives INSIDE a station, an office or a municipality:
// `fixedPlaceId` narrows it to that place (and hides the place filters), and
// `createParams` carry the presets of the create page (job kind, the place).
export function UsersListPage({
  basePath,
  standalone = false,
  fixedPlaceId,
  createParams,
  title = 'الحسابات',
  emptyText,
}: {
  basePath: string;
  standalone?: boolean;
  fixedPlaceId?: string;
  createParams?: Record<string, string>;
  title?: string;
  emptyText?: string;
}) {
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const isAdminView = hasPermission('users:manage') && !fixedPlaceId;
  const here = `${location.pathname}${location.search}`;
  const [rowAction, setRowAction] = useState<{ user: UserListItem; kind: 'archive' | 'restore' } | null>(null);
  const [rowReason, setRowReason] = useState('');
  const [rowError, setRowError] = useState<string | null>(null);
  const rowMutation = useMutation({
    mutationFn: async () =>
      apiClient.post(`/users/${rowAction!.user.id}/${rowAction!.kind}`, { reason: rowReason.trim() }),
    onSuccess: () => {
      setRowAction(null);
      setRowReason('');
      setRowError(null);
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e) => setRowError(adminErrorMessage(e, 'تعذّر تنفيذ الإجراء. حاول مجددًا.')),
  });

  const filters = {
    q: params.get('q') ?? '',
    side: params.get('side') ?? '',
    roleId: params.get('roleId') ?? '',
    placeId: fixedPlaceId ?? params.get('placeId') ?? '',
    status: params.get('status') ?? '',
    sort: params.get('sort') ?? '',
    dir: params.get('dir') ?? '',
    skip: Number(params.get('skip') ?? '0') || 0,
  };

  // Typing waits a moment before it asks the server.
  const [search, setSearch] = useState(filters.q);
  useEffect(() => {
    if (search === filters.q) return;
    const timer = setTimeout(() => update({ q: search }), 300);
    return () => clearTimeout(timer);
  }, [search]);

  function update(change: Partial<Record<'q' | 'side' | 'roleId' | 'placeId' | 'status' | 'sort' | 'dir' | 'skip', string>>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(change)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!('skip' in change)) next.delete('skip');
    setParams(next, { replace: true });
  }

  const list = useUserList(filters);
  const options = useUserOptions();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [placeDialog, setPlaceDialog] = useState(false);
  const places = usePlaceOptions(isAdminView && (placeDialog || filters.placeId) ? 'ALL' : null);
  const placeName = places.options.find((o) => o.id === filters.placeId)?.name;

  const activeFilterCount = [filters.side, filters.roleId, fixedPlaceId ? '' : filters.placeId, filters.status].filter(Boolean).length;
  function sortBy(key: string) {
    if (filters.sort === key) update({ sort: key, dir: filters.dir === 'desc' ? 'asc' : 'desc' });
    else update({ sort: key, dir: 'asc' });
  }
  const anyFilter = activeFilterCount > 0 || filters.q !== '';
  const jobOptions = useMemo(() => options.data?.jobs ?? [], [options.data]);

  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const createQuery = new URLSearchParams({ ...(createParams ?? {}), back: here });
  const createPath = `${basePath}/new?${createQuery.toString()}`;
  const personLink = (id: string) => `${basePath}/${id}?back=${encodeURIComponent(here)}`;

  const createButton = (
    <PillButton size="field" onClick={() => navigate(createPath)}>
      <span className="inline-flex items-center gap-2">
        <Icon d={ICONS.plus} size={18} />
        حساب جديد
      </span>
    </PillButton>
  );

  const filterGrid = (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {isAdminView && (
        <>
          <div>
            <label htmlFor="f-side" className="mb-1.5 block text-[14px] font-bold text-ink lg:text-[12px]">
              الجهة
            </label>
            <select id="f-side" value={filters.side} onChange={(e) => update({ side: e.target.value })} className={SELECT_CLASS}>
              {SIDE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-job" className="mb-1.5 block text-[14px] font-bold text-ink lg:text-[12px]">
              الوظيفة
            </label>
            <select id="f-job" value={filters.roleId} onChange={(e) => update({ roleId: e.target.value })} className={SELECT_CLASS}>
              <option value="">كل الوظائف</option>
              {jobOptions.map((job) => (
                <option key={job.id} value={job.id}>
                  {roleLabel(job.name)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="mb-1.5 block text-[14px] font-bold text-ink lg:text-[12px]">المحطة أو المكتب</span>
            <button
              type="button"
              onClick={() => setPlaceDialog(true)}
              className={`${SELECT_CLASS} flex items-center justify-between text-start`}
            >
              <span className={`truncate ${placeName ? '' : 'text-ink-soft'}`}>{placeName ?? 'كل الأماكن'}</span>
              <Icon d={ICONS.chevronDown} size={18} />
            </button>
          </div>
        </>
      )}
      <div>
        <label htmlFor="f-status" className="mb-1.5 block text-[14px] font-bold text-ink lg:text-[12px]">
          الحالة
        </label>
        <select id="f-status" value={filters.status} onChange={(e) => update({ status: e.target.value })} className={SELECT_CLASS}>
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );

  const body = (
    <>
      <div className="space-y-3 p-4 lg:p-[18px]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="relative flex-1">
            <label htmlFor="f-search" className="mb-1.5 block text-[14px] font-bold text-ink lg:text-[12px]">
              بحث بالاسم أو اسم المستخدم
            </label>
            <span className="pointer-events-none absolute bottom-0 start-3.5 flex h-[52px] items-center text-ink-faint lg:h-11">
              <Icon d={ICONS.search} size={18} />
            </span>
            <input
              id="f-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-[52px] w-full rounded-sm border border-line bg-surface-alt ps-11 pe-3.5 text-[16px] text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface lg:h-11 lg:text-[14px]"
            />
          </div>
          <button
            type="button"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((o) => !o)}
            className="flex h-12 items-center justify-center gap-2 rounded-full bg-surface-alt px-5 text-[16px] font-bold text-ink-soft hover:bg-primary-100 hover:text-primary lg:hidden"
          >
            <Icon d={ICONS.filter} size={18} />
            تصفية{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </button>
        </div>
        <div className={`${filtersOpen ? 'block' : 'hidden'} lg:block`}>{filterGrid}</div>
        {anyFilter && (
          <div className="flex items-center justify-between gap-3">
            <p role="status" className="text-[14px] text-ink-soft lg:text-[12px]">
              {total === 0 ? 'لا نتائج' : `${total} نتيجة`}
            </p>
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setParams({}, { replace: true });
              }}
              className="h-11 rounded-full px-4 text-[15px] font-bold text-primary hover:bg-primary-100 lg:h-9 lg:text-[13px]"
            >
              مسح التصفية
            </button>
          </div>
        )}
      </div>

      {list.isError && (
        <div role="alert" className="m-4 flex flex-col gap-3 rounded-md bg-danger-100 p-4 lg:m-[18px]">
          <p className="text-[16px] font-medium text-danger-dark lg:text-[14px]">تعذّر تحميل قائمة الحسابات. تأكد من الاتصال ثم حاول مجددًا.</p>
          <div>
            <PillButton size="field" variant="secondary" onClick={() => list.refetch()}>
              إعادة المحاولة
            </PillButton>
          </div>
        </div>
      )}

      {list.isLoading && (
        <div className="space-y-3 p-4 lg:p-[18px]" aria-busy="true" aria-label="جارٍ التحميل">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse-soft rounded-md bg-surface-alt motion-reduce:animate-none" />
          ))}
        </div>
      )}

      {!list.isLoading && !list.isError && items.length === 0 && (
        <div className="px-4 py-10 text-center lg:px-[18px]">
          <p className="text-[18px] font-extrabold text-ink lg:text-[15px]">
            {anyFilter ? 'لا توجد حسابات تطابق بحثك' : (emptyText ?? (isAdminView ? 'لا توجد حسابات بعد' : 'لا يوجد أشخاص هنا بعد'))}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-[15px] text-ink-soft lg:text-[13px]">
            {anyFilter ? 'غيّر كلمات البحث أو امسح التصفية.' : 'أنشئ أول حساب وسيظهر هنا.'}
          </p>
          <div className="mt-4 flex justify-center">
            {anyFilter ? (
              <PillButton
                size="field"
                variant="secondary"
                onClick={() => {
                  setSearch('');
                  setParams({}, { replace: true });
                }}
              >
                مسح التصفية
              </PillButton>
            ) : (
              createButton
            )}
          </div>
        </div>
      )}

      {items.length > 0 && (
        <>
          {/* Desktop: a table. */}
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full text-[16px] lg:text-[14px]">
              <caption className="sr-only">قائمة الحسابات</caption>
              <thead>
                <tr className="bg-surface-alt text-[13px] lg:text-[12px] font-bold text-ink-soft">
                  <th scope="col" aria-sort={filters.sort === 'name' || !filters.sort ? (filters.dir === 'desc' ? 'descending' : 'ascending') : 'none'} className="px-[18px] py-2.5 text-start">
                    <button type="button" onClick={() => sortBy('name')} className="font-bold hover:text-primary">
                      الاسم {(filters.sort === 'name' || !filters.sort) && (filters.dir === 'desc' ? '▼' : '▲')}
                    </button>
                  </th>
                  <th scope="col" className="px-[18px] py-2.5 text-start">الوظيفة</th>
                  {!fixedPlaceId && <th scope="col" className="px-[18px] py-2.5 text-start">مكان العمل</th>}
                  <th scope="col" className="px-[18px] py-2.5 text-start">الحالة</th>
                  <th scope="col" aria-sort={filters.sort === 'lastLogin' ? (filters.dir === 'desc' ? 'descending' : 'ascending') : 'none'} className="px-[18px] py-2.5 text-start">
                    <button type="button" onClick={() => sortBy('lastLogin')} className="font-bold hover:text-primary">
                      آخر دخول {filters.sort === 'lastLogin' && (filters.dir === 'desc' ? '▼' : '▲')}
                    </button>
                  </th>
                  <th scope="col" className="px-[18px] py-2.5 text-start">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {items.map((u) => (
                  <tr
                    key={u.id}
                    onClick={() => navigate(personLink(u.id))}
                    className="cursor-pointer border-b border-line-soft align-middle last:border-0 hover:bg-surface-alt/60"
                  >
                    <td className="px-[18px] py-3">
                      <Link to={personLink(u.id)} className="font-bold text-ink hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                        {u.fullName}
                      </Link>
                      <div>
                        <CodeText size="md">{u.username}</CodeText>
                      </div>
                    </td>
                    <td className="px-[18px] py-3 text-ink">
                      {u.job ? roleLabel(u.job.name) : <span className="text-ink-soft">بلا وظيفة</span>}
                      {u.jobCount > 1 && <span className="ms-1 text-[13px] lg:text-[12px] text-ink-soft">(+{u.jobCount - 1} وظائف)</span>}
                    </td>
                    {/* Inside a place's own page the place is the page: not repeated on every row. */}
                    {!fixedPlaceId && <td className="max-w-[260px] px-[18px] py-3 text-ink">{whereText(u)}</td>}
                    <td className="px-[18px] py-3">
                      <AccountStatusPill status={u.status} />
                    </td>
                    <td className="px-[18px] py-3 text-ink-soft">
                      {u.lastLoginAt ? <span dir="ltr">{formatWhen(u.lastLoginAt)}</span> : 'لم يسجّل الدخول بعد'}
                    </td>
                    <td className="px-[18px] py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-2">
                        <Link to={personLink(u.id)} className="rounded-full bg-surface-alt px-3 py-1.5 text-[15px] lg:text-[13px] font-bold text-ink-soft hover:text-primary">
                          فتح
                        </Link>
                        {u.canManage && (
                          <button
                            type="button"
                            onClick={() => setRowAction({ user: u, kind: u.archivedAt || u.status === 'archived' ? 'restore' : 'archive' })}
                            className="rounded-full border border-line px-3 py-1.5 text-[15px] lg:text-[13px] font-bold text-ink-soft hover:border-danger hover:text-danger"
                          >
                            {u.archivedAt || u.status === 'archived' ? 'استعادة' : 'أرشفة'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phone: one card per person; the whole card opens them. */}
          <ul className="divide-y divide-line-soft lg:hidden">
            {items.map((u) => (
              <li key={u.id}>
                <Link
                  to={personLink(u.id)}
                  className="block min-h-[88px] px-4 py-4 hover:bg-surface-alt/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
                >
                  <p className="break-words text-[18px] font-extrabold leading-snug text-ink">{u.fullName}</p>
                  <CodeText size="md">{u.username}</CodeText>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <p className="text-[16px] font-bold text-primary-dark">{u.job ? roleLabel(u.job.name) : 'بلا وظيفة'}</p>
                    <AccountStatusPill status={u.status} />
                  </div>
                  {!fixedPlaceId && <p className="text-[15px] text-ink">{whereText(u)}</p>}
                  <p className="mt-1 text-[16px] lg:text-[14px] text-ink-soft">
                    آخر دخول: {u.lastLoginAt ? <span dir="ltr">{formatWhen(u.lastLoginAt)}</span> : 'لم يسجّل الدخول بعد'}
                  </p>
                </Link>
              </li>
            ))}
          </ul>

          {total > USERS_PAGE_SIZE && (
            <nav aria-label="التنقل بين الصفحات" className="flex items-center justify-between gap-3 border-t border-line-soft p-4 lg:px-[18px]">
              <span className="text-[14px] text-ink-soft lg:text-[12px]">
                {filters.skip + 1}–{Math.min(filters.skip + USERS_PAGE_SIZE, total)} من {total}
              </span>
              <div className="flex gap-2">
                <PillButton
                  size="field"
                  variant="secondary"
                  disabled={filters.skip === 0}
                  onClick={() => update({ skip: String(Math.max(0, filters.skip - USERS_PAGE_SIZE)) })}
                >
                  السابق
                </PillButton>
                <PillButton
                  size="field"
                  variant="secondary"
                  disabled={filters.skip + USERS_PAGE_SIZE >= total}
                  onClick={() => update({ skip: String(filters.skip + USERS_PAGE_SIZE) })}
                >
                  التالي
                </PillButton>
              </div>
            </nav>
          )}
        </>
      )}
    </>
  );

  return (
    <div className="space-y-4">
      {standalone && (
        <PageHeader
          title="فريق العمل"
          subtitle="موظفو محطتك أو مكتبك — أضف موظفًا أو أوقف حسابه أو أعد تعيين كلمة مروره"
          actions={createButton}
        />
      )}
      <Card>
        {!standalone && (
          <CardHeader title={title} subtitle={list.data ? `${total} حساب` : undefined} action={createButton} />
        )}
        {body}
      </Card>

      <Dialog
        open={rowAction !== null}
        title={rowAction?.kind === 'archive' ? 'أرشفة الحساب' : 'استعادة الحساب'}
        busy={rowMutation.isPending}
        onClose={() => {
          if (!rowMutation.isPending) {
            setRowAction(null);
            setRowReason('');
            setRowError(null);
          }
        }}
        footer={
          <>
            <PillButton size="field" variant="secondary" disabled={rowMutation.isPending} onClick={() => setRowAction(null)}>
              رجوع
            </PillButton>
            <PillButton
              size="field"
              variant={rowAction?.kind === 'archive' ? 'danger' : 'primary'}
              disabled={rowMutation.isPending}
              onClick={() => {
                if (rowReason.trim().length < 3) {
                  setRowError('اكتب سببًا واضحًا (ثلاثة أحرف على الأقل).');
                  return;
                }
                rowMutation.mutate();
              }}
            >
              {rowAction?.kind === 'archive' ? 'أرشفة الحساب' : 'استعادة الحساب'}
            </PillButton>
          </>
        }
      >
        <p className="mb-3 leading-[1.8]">
          {rowAction?.kind === 'archive'
            ? `سيختفي حساب ${rowAction.user.fullName} من القوائم اليومية ولن يستطيع الدخول، ويبقى سجله محفوظًا ويمكن استعادته.`
            : `سيعود حساب ${rowAction?.user.fullName ?? ''} فعّالًا.`}
        </p>
        <TextAreaField label="السبب (مطلوب)" value={rowReason} onChange={(e) => setRowReason(e.target.value)} error={rowError} />
      </Dialog>

      <Dialog
        open={placeDialog}
        title="اختر المحطة أو المكتب"
        onClose={() => setPlaceDialog(false)}
        footer={
          filters.placeId ? (
            <PillButton
              size="field"
              variant="secondary"
              onClick={() => {
                update({ placeId: '' });
                setPlaceDialog(false);
              }}
            >
              كل الأماكن
            </PillButton>
          ) : undefined
        }
      >
        <PlacePicker
          single
          searchLabel="ابحث عن محطة أو مكتب"
          options={places.options}
          loading={places.isLoading}
          selected={filters.placeId ? [filters.placeId] : []}
          onChange={(ids) => {
            update({ placeId: ids[0] ?? '' });
            setPlaceDialog(false);
          }}
        />
      </Dialog>
    </div>
  );
}
