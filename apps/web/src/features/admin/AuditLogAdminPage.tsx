import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import { downloadBlob } from '../../lib/download';
import { addDays, tripoliToday } from '../regreports/common';
import { fuelTypeLabel, roleLabel } from '../../lib/labels';
import {
  ALERT_ACTIONS,
  AUDIT_ACTION_GROUPS,
  AUDIT_ACTION_LABELS,
  AUDIT_ENTITY_LABELS,
  AUDIT_FIELD_LABELS,
  AUDIT_REPORT_LABELS,
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

// After review (19 Oct 2026): the parts of an entry narrow the list to them.
type Narrow = (f: Partial<Filters>) => void;

const LINK = 'rounded-sm underline decoration-dotted underline-offset-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-dark';

// One sentence: who did what to which record.
function Sentence({ row, narrow }: { row: AuditLogRow; narrow: Narrow }) {
  const action = AUDIT_ACTION_LABELS[row.action] ?? row.action;
  const kind = AUDIT_ENTITY_LABELS[row.entityType] ?? row.entityType;
  // An export names its report by key: shown in words.
  const name = row.entityLabel ?? (row.entityType === 'Report' ? (AUDIT_REPORT_LABELS[row.entityId] ?? row.entityId) : null);
  const typedName = typeof asRecord(row.newValue).username === 'string' ? String(asRecord(row.newValue).username) : null;

  if (row.action === 'LOGIN_FAILED' || row.action === 'ACCOUNT_LOCKED') {
    const reason = asRecord(row.newValue).reason;
    return (
      <p>
        <span className="font-bold text-danger-dark">{action}</span> —{' '}
        {row.entityLabel ? (
          <button type="button" className={LINK} title="كل ما حدث لهذا الحساب" onClick={() => narrow({ entityType: 'User', entityId: row.entityId, what: row.entityLabel ?? '' })}>
            حساب «{row.entityLabel}»
          </button>
        ) : (
          <>الاسم المكتوب «<bdi dir="ltr">{typedName ?? '—'}</bdi>»</>
        )}
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
      {row.user ? (
        <button type="button" className={`font-bold ${LINK}`} title="كل أفعال هذا الشخص" onClick={() => narrow({ userId: row.user!.id, who: row.user!.fullName })}>
          {row.user.fullName}
        </button>
      ) : (
        <span className="font-bold">النظام</span>
      )}{' '}
      {action}
      {!aboutSelf && (
        <>
          {' '}
          <span className="text-ink-soft">{kind}</span>
          {name && row.entityId !== '-' ? (
            <>
              {' '}
              <button
                type="button"
                className={LINK}
                title="كل ما حدث لهذا السجل"
                onClick={() => narrow({ entityType: row.entityType, entityId: row.entityId, what: name })}
              >
                «{name}»
              </button>
            </>
          ) : (
            name && <> «{name}»</>
          )}
        </>
      )}
    </p>
  );
}

function AuditRow({ row, narrow }: { row: AuditLogRow; narrow: Narrow }) {
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
          <Sentence row={row} narrow={narrow} />
          {/* Only the name itself reads left-to-right: the line stays under the
              person's name, not pushed to the far side of the row. */}
          {row.user && (
            <p className="text-[13px] text-ink-faint lg:text-[12px]">
              <bdi dir="ltr">@{row.user.username}</bdi>
            </p>
          )}

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
              العنوان:{' '}
              {row.ipAddress ? (
                <button type="button" className={LINK} title="كل ما جاء من هذا العنوان" onClick={() => narrow({ q: row.ipAddress! })}>
                  <bdi dir="ltr" className="font-mono">{row.ipAddress}</bdi>
                </button>
              ) : (
                '—'
              )}
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

// Everything the list is narrowed by — kept in the address, so a view can be
// shared, bookmarked and come back to with the back button. `who` and `what`
// are only the names shown on the chips.
interface Filters {
  q: string;
  action: string;
  entityType: string;
  entityId: string;
  userId: string;
  from: string;
  to: string;
  who: string;
  what: string;
}
const FILTER_KEYS: Array<keyof Filters> = ['q', 'action', 'entityType', 'entityId', 'userId', 'from', 'to', 'who', 'what'];

interface Summary {
  total: number;
  byAction: Array<{ action: string; count: number }>;
  topActors: Array<{ userId: string; fullName: string; username: string; count: number }>;
}

const SENSITIVE = ['REVEAL_NATIONAL_ID', 'UPDATE_IDENTITY', 'UPDATE_OWNER_IDENTITY', 'CANCEL_CARD', 'DEACTIVATE_USER', 'RESET_PASSWORD', 'TEST_DATA_REMOVAL', 'FUEL_RESET'];

// One-tap views for the usual oversight questions.
function presets(today: string): Array<{ label: string; filters: Partial<Filters> }> {
  return [
    { label: 'اليوم', filters: { from: today, to: today } },
    { label: 'آخر 7 أيام', filters: { from: addDays(today, -6), to: today } },
    { label: 'محاولات الدخول الفاشلة', filters: { action: 'LOGIN_FAILED,ACCOUNT_LOCKED' } },
    { label: 'كشف الرقم الوطني', filters: { action: 'REVEAL_NATIONAL_ID' } },
    { label: 'تعديلات الهوية', filters: { action: 'UPDATE_IDENTITY,UPDATE_OWNER_IDENTITY,PLATE_CHANGE' } },
    { label: 'التصدير', filters: { action: 'EXPORT' } },
  ];
}

// The person picker: names from the accounts list.
function ActorPicker({ onPick }: { onPick: (id: string, name: string) => void }) {
  const [text, setText] = useState('');
  const q = useDebounced(text.trim());
  const people = useQuery({
    queryKey: ['admin', 'audit-log', 'actors', q],
    enabled: q.length >= 2,
    queryFn: async () =>
      (await apiClient.get<{ items: Array<{ id: string; fullName: string; username: string }> }>('/users', { params: { q, take: 8 } })).data.items,
  });
  return (
    <div className="relative">
      <label htmlFor="audit-actor" className={LABEL}>
        الشخص
      </label>
      <input
        id="audit-actor"
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="اكتب اسمه أو اسم المستخدم"
        className={CONTROL}
        autoComplete="off"
      />
      {q.length >= 2 && (people.data?.length ?? 0) > 0 && (
        <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-64 overflow-auto rounded-sm border border-line bg-surface shadow-lg" role="listbox">
          {people.data!.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-start text-[15px] hover:bg-surface-alt lg:text-[13px]"
                onClick={() => {
                  onPick(p.id, p.fullName);
                  setText('');
                }}
              >
                {p.fullName} <bdi dir="ltr" className="text-ink-faint">@{p.username}</bdi>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// The audit log (after review, 19 Oct 2026): every entry as a sentence — who
// did what to which record, by name — with the address and the device it came
// from, and its recorded values in Arabic. For oversight:
//  - narrow by a person, a record, an address, the kind of action or record,
//    and the days — or tap a name, a record or an address in an entry;
//  - one-tap views (today, failed sign-ins, identity revealed or changed,
//    exports);
//  - a summary of what the current view holds, and who did the most of it;
//  - the view as a CSV file (and that export is itself in the log);
//  - the whole view lives in the address.
export function AuditLogAdminPage() {
  const [params, setParams] = useSearchParams();
  const { skip, setSkip } = usePageParam(TAKE);
  const filters = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) ?? ''])) as unknown as Filters;
  const [qText, setQText] = useState(filters.q);
  const dq = useDebounced(qText.trim());

  // A change of what is asked starts again from page 1.
  function narrow(change: Partial<Filters>) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(change)) {
          if (v) next.set(k, v);
          else next.delete(k);
        }
        // A record chip without its record, or a person chip without the person, goes too.
        if (!next.get('entityId')) next.delete('what');
        if (!next.get('userId')) next.delete('who');
        next.delete('page');
        return next;
      },
      { replace: false },
    );
    if (change.q !== undefined) setQText(change.q);
  }
  useEffect(() => {
    if (dq !== filters.q) narrow({ q: dq });
  }, [dq]);

  const asked = {
    q: filters.q || undefined,
    action: filters.action || undefined,
    entityType: filters.entityType || undefined,
    entityId: filters.entityId || undefined,
    userId: filters.userId || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
  };
  const filtered = Object.values(asked).some(Boolean);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'audit-log', skip, asked],
    queryFn: async () => (await apiClient.get<{ total: number; rows: AuditLogRow[] }>('/audit-log', { params: { skip, take: TAKE, ...asked } })).data,
    placeholderData: (prev) => prev,
  });
  const summary = useQuery({
    queryKey: ['admin', 'audit-log', 'summary', asked],
    queryFn: async () => (await apiClient.get<Summary>('/audit-log/summary', { params: asked })).data,
    placeholderData: (prev) => prev,
  });

  const [exporting, setExporting] = useState(false);
  const [exportProblem, setExportProblem] = useState<string | null>(null);
  async function exportCsv() {
    setExporting(true);
    setExportProblem(null);
    try {
      const res = await apiClient.get<Blob>('/audit-log/export', { params: asked, responseType: 'blob' });
      downloadBlob(res.data, `audit-log-${tripoliToday()}.csv`);
      if (res.headers['x-truncated'] === 'true') setExportProblem('الملف يضم أحدث 10,000 إدخال فقط. ضيّق التصفية لتصدير الباقي.');
    } catch {
      setExportProblem('تعذّر التصدير. أعد المحاولة.');
    } finally {
      setExporting(false);
    }
  }

  const count = (actions: string[]) => (summary.data?.byAction ?? []).filter((a) => actions.includes(a.action)).reduce((n, a) => n + a.count, 0);
  const today = tripoliToday();
  const chips: Array<{ label: string; clear: Partial<Filters> }> = [
    ...(filters.userId ? [{ label: `الشخص: ${filters.who || filters.userId}`, clear: { userId: '', who: '' } }] : []),
    ...(filters.entityId
      ? [{ label: `السجل: ${filters.what || filters.entityId}`, clear: { entityId: '', what: '', entityType: '' } }]
      : []),
  ];

  return (
    <div className="space-y-4">
      {/* What the current view holds. */}
      <section aria-label="ملخص السجل" className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="audit-summary">
        {[
          { label: 'الإدخالات', value: summary.data?.total, tone: 'text-ink' },
          { label: 'محاولات دخول فاشلة', value: count(['LOGIN_FAILED', 'ACCOUNT_LOCKED']), tone: 'text-danger-dark', go: { action: 'LOGIN_FAILED,ACCOUNT_LOCKED' } },
          { label: 'تصدير تقارير', value: count(['EXPORT']), tone: 'text-ink', go: { action: 'EXPORT' } },
          { label: 'أفعال حساسة', value: count(SENSITIVE), tone: 'text-accent-ink', go: { action: SENSITIVE.join(',') } },
        ].map((k) => (
          <button
            key={k.label}
            type="button"
            disabled={!k.go}
            onClick={() => k.go && narrow(k.go)}
            className="rounded-md bg-surface p-3.5 text-start shadow-sm enabled:hover:ring-2 enabled:hover:ring-primary-100 disabled:cursor-default"
          >
            <p className="text-[14px] font-bold text-ink-soft lg:text-[12px]">{k.label}</p>
            <p className={`mt-1 text-[24px] font-black tabular-nums ${k.tone}`}>{summary.data ? (k.value ?? 0).toLocaleString('en-US') : '—'}</p>
          </button>
        ))}
      </section>

      {(summary.data?.topActors.length ?? 0) > 0 && (
        <section aria-label="الأكثر نشاطًا" className="rounded-md bg-surface p-3.5 shadow-sm">
          <p className="text-[14px] font-bold text-ink-soft lg:text-[12px]">الأكثر نشاطًا في هذا العرض</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {summary.data!.topActors.map((a) => (
              <li key={a.userId}>
                <button
                  type="button"
                  onClick={() => narrow({ userId: a.userId, who: a.fullName })}
                  className="rounded-full bg-surface-alt px-3 py-1.5 text-[14px] font-bold text-ink hover:bg-primary-100 lg:text-[12px]"
                >
                  {a.fullName} <span className="tabular-nums text-ink-soft">({a.count.toLocaleString('en-US')})</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Card>
        <CardHeader
          title="سجل التدقيق"
          subtitle={data ? `${data.total.toLocaleString('en-US')} إدخال${filtered ? ' مطابق' : ''}` : undefined}
          action={
            <PillButton size="sm" variant="secondary" onClick={() => void exportCsv()} disabled={exporting || !data?.total} data-testid="audit-export">
              {exporting ? 'جارٍ التصدير…' : 'تصدير CSV'}
            </PillButton>
          }
        />

        {/* One-tap views. */}
        <div className="flex flex-wrap gap-2 border-b border-line-soft px-4 py-3 lg:px-[18px]" data-testid="audit-presets">
          {presets(today).map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => narrow(preset.filters)}
              className="rounded-full border border-line bg-surface-alt px-3 py-1.5 text-[14px] font-bold text-ink hover:border-primary lg:text-[12px]"
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="grid gap-3 border-b border-line-soft p-4 sm:grid-cols-2 lg:grid-cols-6 lg:px-[18px]" data-testid="audit-filters">
          <div className="lg:col-span-2">
            <ActorPicker onPick={(id, name) => narrow({ userId: id, who: name })} />
          </div>
          <div className="lg:col-span-2">
            <label htmlFor="audit-q" className={LABEL}>
              بحث
            </label>
            <input
              id="audit-q"
              type="search"
              value={qText}
              onChange={(e) => setQText(e.target.value)}
              placeholder="اسم، اسم مستخدم، عنوان، أو معرّف سجل"
              className={CONTROL}
            />
          </div>
          <div className="lg:col-span-2">
            <label htmlFor="audit-action" className={LABEL}>
              الإجراء
            </label>
            <select id="audit-action" value={filters.action} onChange={(e) => narrow({ action: e.target.value })} className={CONTROL}>
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
            <select id="audit-entity" value={filters.entityType} onChange={(e) => narrow({ entityType: e.target.value, entityId: '', what: '' })} className={CONTROL}>
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
            <DateField id="audit-from" value={filters.from} onChange={(v) => narrow({ from: v })} inputClassName={`pe-9 ${CONTROL}`} />
          </div>
          <div className="lg:col-span-2">
            <label htmlFor="audit-to" className={LABEL}>
              إلى يوم
            </label>
            <DateField id="audit-to" value={filters.to} onChange={(v) => narrow({ to: v })} inputClassName={`pe-9 ${CONTROL}`} />
          </div>
        </div>

        {(chips.length > 0 || filtered) && (
          <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-4 py-2.5 lg:px-[18px]" data-testid="audit-active-filters">
            {chips.map((chip) => (
              <span key={chip.label} className="inline-flex items-center gap-1.5 rounded-full bg-primary-100 px-3 py-1 text-[14px] font-bold text-primary-dark lg:text-[12px]">
                {chip.label}
                <button type="button" aria-label={`إزالة ${chip.label}`} onClick={() => narrow(chip.clear)} className="rounded-full px-1 hover:bg-surface">
                  ✕
                </button>
              </span>
            ))}
            {filtered && (
              <PillButton
                size="sm"
                variant="ghost"
                onClick={() => {
                  setQText('');
                  setParams(new URLSearchParams());
                }}
              >
                مسح كل التصفية
              </PillButton>
            )}
          </div>
        )}
        {exportProblem && <p className="px-4 py-2 text-[14px] font-bold text-danger-dark lg:px-[18px]">{exportProblem}</p>}

        {isLoading && <SkeletonRows rows={6} />}
        {isError && <p className="p-4 text-[15px] text-danger lg:text-[13px]">تعذّر تحميل سجل التدقيق. تأكد من الاتصال ثم أعد المحاولة.</p>}

        {data && (
          <>
            <ul aria-label="إدخالات سجل التدقيق">
              {data.rows.map((row) => (
                <AuditRow key={row.id} row={row} narrow={narrow} />
              ))}
            </ul>
            {data.rows.length === 0 && (
              <p className="p-6 text-center text-[15px] text-ink-soft lg:text-[13px]">{filtered ? 'لا توجد إدخالات تطابق التصفية' : 'لا توجد إدخالات بعد'}</p>
            )}

            <Pagination skip={skip} take={TAKE} total={data.total} onSkipChange={setSkip} alwaysShow={data.total > 0} testId="audit-pager" />
            <p className="px-[18px] pb-3 text-[13px] text-ink-faint lg:text-[12px]">
              السجل للإضافة فقط — لا يُعدّل ولا يُحذف، حتى من قاعدة البيانات. العنوان والجهاز يُسجّلان منذ تحديث 15 أكتوبر 2026.
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
