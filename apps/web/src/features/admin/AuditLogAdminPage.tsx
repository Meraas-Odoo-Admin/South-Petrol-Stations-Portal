import { useEffect, useState } from 'react';
import { formatDate, formatTime } from '../../lib/dateFormat';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { Card, CardHeader } from '../../components/design/Card';
import { PillButton } from '../../components/design/PillButton';
import { StatusPill } from '../../components/design/StatusPill';
import { DateField } from '../../components/DateField';
import { Icon, ICONS } from '../../components/icons';
import type { AuditLogRow } from './types';
import { SkeletonRows } from '../../components/design/Skeleton';
import { LIST_PAGE_SIZE } from '../../lib/pageSize';
import { Pagination } from '../../components/Pagination';
import { usePageParam } from '../../lib/usePageParam';
import { fuelTypeLabel, roleLabel } from '../../lib/labels';
import {
  ALERT_ACTIONS,
  AUDIT_ACTION_GROUPS,
  AUDIT_ACTION_LABELS,
  AUDIT_ENTITY_LABELS,
  AUDIT_FIELD_LABELS,
  LOGIN_FAILURE_LABELS,
  auditValueText,
  describeDevice,
} from '../../lib/auditLabels';

const TAKE = LIST_PAGE_SIZE;

const CONTROL =
  'h-[52px] w-full rounded-sm border border-line bg-surface-alt px-3 text-[16px] text-ink focus:outline-none focus:ring-2 focus:ring-primary-dark focus:ring-offset-2 focus:ring-offset-surface lg:h-11 lg:text-[14px]';
const LABEL = 'mb-1.5 block text-[14px] font-bold text-ink lg:text-[12px]';

// Codes a person reads as words: a fuel, a job, a sign-in failure.
function formatterFor(field: string, action: string): ((code: string) => string) | undefined {
  if (field === 'fuelType' || field === 'fuelTypes') return fuelTypeLabel;
  if (field === 'job' || field === 'jobs' || field === 'roleName') return roleLabel;
  if (field === 'reason' && action === 'LOGIN_FAILED') return (c) => LOGIN_FAILURE_LABELS[c] ?? c;
  return undefined;
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

// The fields an entry changed or recorded, old beside new.
function changesOf(row: AuditLogRow) {
  const oldV = asRecord(row.oldValue);
  const newV = asRecord(row.newValue);
  const keys = [...new Set([...Object.keys(oldV), ...Object.keys(newV)])];
  return keys.map((key) => ({
    key,
    label: AUDIT_FIELD_LABELS[key] ?? key,
    hadOld: key in oldV,
    oldText: auditValueText(oldV[key], formatterFor(key, row.action)),
    newText: auditValueText(newV[key], formatterFor(key, row.action)),
    // Ids say nothing on the line itself; they stay in the details.
    isId: /Id$/.test(key) && key !== 'roleId',
  }));
}

// One sentence: who did what to which record.
function Sentence({ row }: { row: AuditLogRow }) {
  const action = AUDIT_ACTION_LABELS[row.action] ?? row.action;
  const kind = AUDIT_ENTITY_LABELS[row.entityType] ?? row.entityType;
  const typedName = typeof asRecord(row.newValue).username === 'string' ? String(asRecord(row.newValue).username) : null;

  if (row.action === 'LOGIN_FAILED' || row.action === 'ACCOUNT_LOCKED') {
    const reason = asRecord(row.newValue).reason;
    return (
      <p>
        <span className="font-bold text-danger-dark">{action}</span> — {row.entityLabel ? <>حساب «{row.entityLabel}»</> : <>الاسم المكتوب «<bdi dir="ltr">{typedName ?? '—'}</bdi>»</>}
        {typeof reason === 'string' && (
          <span className="ms-2 inline-block align-middle">
            <StatusPill variant="danger">{LOGIN_FAILURE_LABELS[reason] ?? reason}</StatusPill>
          </span>
        )}
      </p>
    );
  }

  // Signing in, out or renewing is about oneself: no record to name.
  const aboutSelf = ['LOGIN', 'LOGOUT', 'ROTATE', 'CHANGE_PASSWORD'].includes(row.action);
  return (
    <p>
      <span className="font-bold">{row.user ? row.user.fullName : 'النظام'}</span> {action}
      {!aboutSelf && (
        <>
          {' '}
          <span className="text-ink-soft">{kind}</span>
          {row.entityLabel && <> «{row.entityLabel}»</>}
        </>
      )}
    </p>
  );
}

function AuditRow({ row }: { row: AuditLogRow }) {
  const [open, setOpen] = useState(false);
  const device = describeDevice(row.userAgent);
  const changes = changesOf(row);
  const inline = changes.filter((c) => !c.isId && c.key !== 'reason' && c.key !== 'username').slice(0, 4);
  const alert = ALERT_ACTIONS.has(row.action);
  const detailsId = `audit-details-${row.id}`;

  return (
    <li
      className={`border-b border-line-soft px-[18px] py-3.5 last:border-0 ${alert ? 'bg-danger-100/40' : ''}`}
      data-testid="audit-row"
      data-action={row.action}
    >
      <div className="flex gap-3.5">
        <div className="w-24 shrink-0 pt-0.5 text-[13px] lg:text-[12px]">
          <p className="font-bold text-ink">{formatDate(row.createdAt)}</p>
          <p className="font-mono text-ink-faint" dir="ltr">
            {formatTime(row.createdAt)}
          </p>
        </div>
        <div className="min-w-0 flex-1 text-[15px] leading-[1.7] text-ink lg:text-[13px]">
          <Sentence row={row} />
          {row.user && <p className="text-[13px] text-ink-faint lg:text-[12px]" dir="ltr">@{row.user.username}</p>}

          {inline.length > 0 && (
            <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[13px] lg:text-[12px]">
              {inline.map((c) => (
                <li key={c.key}>
                  <span className="text-ink-soft">{c.label}: </span>
                  {c.hadOld && (
                    <>
                      <span className="text-ink-soft line-through decoration-ink-faint">{c.oldText}</span>
                      <span className="mx-1 text-ink-faint">←</span>
                    </>
                  )}
                  <span className="font-bold">{c.newText}</span>
                </li>
              ))}
              {changes.length > inline.length && <li className="text-ink-faint">والمزيد في التفاصيل</li>}
            </ul>
          )}

          {/* Where it came from: the address and the device. */}
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-soft lg:text-[12px]">
            <span>
              العنوان: <bdi dir="ltr" className="font-mono">{row.ipAddress ?? '—'}</bdi>
            </span>
            <span>الجهاز: {device ? `${device.text}${device.mobile ? ' (هاتف)' : ''}` : '—'}</span>
            {device?.automated && <StatusPill variant="danger">أداة آلية وليست متصفحًا</StatusPill>}
          </p>

          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls={detailsId}
            className="mt-1.5 inline-flex min-h-[44px] items-center gap-1 rounded-sm text-[14px] font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-dark lg:min-h-0 lg:text-[12px]"
          >
            {open ? 'إخفاء التفاصيل' : 'التفاصيل'}
            <Icon d={ICONS.chevronDown} size={14} />
          </button>

          {open && (
            <div id={detailsId} className="mt-2 rounded-sm border border-line-soft bg-surface p-3 text-[13px] lg:text-[12px]">
              {changes.length > 0 ? (
                <table className="w-full">
                  <caption className="sr-only">ما سُجّل في هذا الإدخال</caption>
                  <thead>
                    <tr className="text-ink-soft">
                      <th scope="col" className="py-1 text-start font-bold">الحقل</th>
                      <th scope="col" className="py-1 text-start font-bold">قبل</th>
                      <th scope="col" className="py-1 text-start font-bold">بعد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changes.map((c) => (
                      <tr key={c.key} className="border-t border-line-soft align-top">
                        <td className="py-1 pe-3 text-ink-soft">{c.label}</td>
                        <td className="py-1 pe-3 break-all">{c.hadOld ? c.oldText : '—'}</td>
                        <td className="py-1 break-all font-bold">{c.newText}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-ink-soft">لا توجد قيم مسجّلة لهذا الإدخال.</p>
              )}
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-line-soft pt-2 text-ink-soft">
                <dt>نوع السجل</dt>
                <dd>{AUDIT_ENTITY_LABELS[row.entityType] ?? row.entityType}</dd>
                <dt>المعرّف</dt>
                <dd className="break-all font-mono" dir="ltr">{row.entityId}</dd>
                <dt>رمز الإجراء</dt>
                <dd className="font-mono" dir="ltr">{row.action}</dd>
                <dt>المتصفح كاملًا</dt>
                <dd className="break-all font-mono" dir="ltr">{row.userAgent ?? '—'}</dd>
              </dl>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

// The audit log (after review, 15 Oct 2026): every entry as a sentence — who
// did what to which record, by name — with the address and the device it came
// from, and its recorded values in Arabic. Filters: who or which address, the
// kind of action, the kind of record, and the days. Failed sign-ins and other
// entries worth a second look are tinted.
export function AuditLogAdminPage() {
  // The page lives in the address, like every other list (?page=).
  const { skip, setSkip, reset } = usePageParam(TAKE);
  const [q, setQ] = useState('');
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const dq = useDebounced(q.trim());

  // Any change of what is asked starts again from the first page.
  const asked = JSON.stringify({ dq, action, entityType, from, to });
  const [lastAsked, setLastAsked] = useState(asked);
  useEffect(() => {
    if (asked !== lastAsked) {
      setLastAsked(asked);
      reset();
    }
  }, [asked, lastAsked, reset]);

  const filtered = Boolean(q || action || entityType || from || to);
  function clearFilters() {
    setQ('');
    setAction('');
    setEntityType('');
    setFrom('');
    setTo('');
  }

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'audit-log', skip, dq, action, entityType, from, to],
    queryFn: async () =>
      (
        await apiClient.get<{ total: number; rows: AuditLogRow[] }>('/audit-log', {
          params: {
            skip,
            take: TAKE,
            q: dq || undefined,
            action: action || undefined,
            entityType: entityType || undefined,
            from: from || undefined,
            to: to || undefined,
          },
        })
      ).data,
    placeholderData: (prev) => prev,
  });

  return (
    <Card>
      <CardHeader title="سجل التدقيق" subtitle={data ? `${data.total} إدخال${filtered ? ' مطابق' : ''}` : undefined} />

      <div className="grid gap-3 border-b border-line-soft p-4 sm:grid-cols-2 lg:grid-cols-6 lg:px-[18px]" data-testid="audit-filters">
        <div className="lg:col-span-2">
          <label htmlFor="audit-q" className={LABEL}>
            بحث
          </label>
          <input
            id="audit-q"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="اسم الشخص، اسم المستخدم أو العنوان"
            className={CONTROL}
          />
        </div>
        <div className="lg:col-span-2">
          <label htmlFor="audit-action" className={LABEL}>
            الإجراء
          </label>
          <select id="audit-action" value={action} onChange={(e) => setAction(e.target.value)} className={CONTROL}>
            <option value="">كل الإجراءات</option>
            <option value="LOGIN_FAILED,ACCOUNT_LOCKED">محاولات الدخول الفاشلة فقط</option>
            {AUDIT_ACTION_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                <option value={group.actions.join(',')}>كل «{group.label}»</option>
                {group.actions.map((a) => (
                  <option key={a} value={a}>
                    {AUDIT_ACTION_LABELS[a]}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="lg:col-span-2">
          <label htmlFor="audit-entity" className={LABEL}>
            نوع السجل
          </label>
          <select id="audit-entity" value={entityType} onChange={(e) => setEntityType(e.target.value)} className={CONTROL}>
            <option value="">كل الأنواع</option>
            {Object.entries(AUDIT_ENTITY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="lg:col-span-2">
          <label htmlFor="audit-from" className={LABEL}>
            من يوم
          </label>
          <DateField id="audit-from" value={from} onChange={setFrom} inputClassName={`pe-9 ${CONTROL}`} />
        </div>
        <div className="lg:col-span-2">
          <label htmlFor="audit-to" className={LABEL}>
            إلى يوم
          </label>
          <DateField id="audit-to" value={to} onChange={setTo} inputClassName={`pe-9 ${CONTROL}`} />
        </div>
        <div className="flex items-end lg:col-span-2">
          {filtered && (
            <PillButton variant="ghost" size="field" onClick={clearFilters}>
              مسح التصفية
            </PillButton>
          )}
        </div>
      </div>

      {isLoading && <SkeletonRows rows={6} />}
      {isError && <p className="p-4 text-[15px] text-danger lg:text-[13px]">تعذّر تحميل سجل التدقيق. تأكد من الاتصال ثم أعد المحاولة.</p>}

      {data && (
        <>
          <ul aria-label="إدخالات سجل التدقيق">
            {data.rows.map((row) => (
              <AuditRow key={row.id} row={row} />
            ))}
          </ul>
          {data.rows.length === 0 && (
            <p className="p-6 text-center text-[15px] text-ink-soft lg:text-[13px]">{filtered ? 'لا توجد إدخالات تطابق التصفية' : 'لا توجد إدخالات بعد'}</p>
          )}

          <Pagination skip={skip} take={TAKE} total={data.total} onSkipChange={setSkip} alwaysShow={data.total > 0} testId="audit-pager" />
          <p className="px-[18px] pb-3 text-[13px] text-ink-faint lg:text-[12px]">
            السجل للإضافة فقط — لا يُعدّل ولا يُحذف. العنوان والجهاز يُسجّلان منذ تحديث 15 أكتوبر 2026؛ الإدخالات الأقدم بلا جهاز.
          </p>
        </>
      )}
    </Card>
  );
}
