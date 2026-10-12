import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { ACCOUNT_ACTION_LABELS } from '../../lib/labels';
import { PageHeader } from '../../components/design/PageHeader';
import { Card } from '../../components/design/Card';
import { StatusPill } from '../../components/design/StatusPill';
import { PillButton } from '../../components/design/PillButton';
import { CsvButton, ErrorNote, Loading, RangeBar, dayLabel, num, stamp, useRange } from './common';
import type { ActivityResponse } from './types';

// The full audit timeline of one registration employee over a range: what
// they did and when, newest first, paged. Detail shows only the safe keys the
// server passes through (no names, no ID numbers, no phone numbers).

const PAGE = 50;

const ACTION_LABELS: Record<string, string> = {
  ...ACCOUNT_ACTION_LABELS,
  LOGIN: 'دخل إلى النظام',
  ISSUE_CARD: 'أصدر بطاقة',
  REPLACE_CARD: 'أصدر بطاقة بدل',
  CANCEL_CARD: 'ألغى بطاقة',
  PRINT_CARD: 'طبع بطاقة',
  PRINT_TEST_CARD: 'طبع بطاقة اختبار',
  DUPLICATE_CAUGHT: 'اكتُشف تكرار مركبة',
  PLATE_CHANGE: 'غيّر لوحة مركبة',
  VEHICLE_CHANGE_REQUESTED: 'طلب تصحيح بيانات مركبة',
  VEHICLE_CHANGE_APPROVED: 'أُقرّ تصحيح بيانات مركبة',
  VEHICLE_CHANGE_REJECTED: 'رُفض تصحيح بيانات مركبة',
  LINK_UNREGISTERED_FILLUPS: 'ربط تعبئات سابقة بالمركبة',
  CREATE: 'أنشأ سجلًا',
  UPDATE: 'عدّل سجلًا',
};
const ENTITY_LABELS: Record<string, string> = {
  Vehicle: 'مركبة',
  VehicleCard: 'بطاقة',
  VehicleOwner: 'مالك',
  User: 'حساب',
  StockEntry: 'مخزون البطاقات',
};
const MODE_LABELS: Record<string, string> = { FIRST_ISSUE: 'أولى', LOST: 'بدل فاقد', DAMAGED: 'بدل تالف', DETAILS_CHANGED: 'بدل لتغيّر البيانات', FAILED_PRINT: 'إعادة طباعة بعد فشل' };

const actionLabel = (a: string) => ACTION_LABELS[a] ?? a;

function detailText(detail: Record<string, unknown> | null): string {
  if (!detail) return '';
  const parts: string[] = [];
  if (typeof detail.cardNumber === 'string') parts.push(`بطاقة ${detail.cardNumber}`);
  if (typeof detail.mode === 'string') parts.push(MODE_LABELS[detail.mode] ?? detail.mode);
  if (typeof detail.reason === 'string') parts.push(`السبب: ${detail.reason}`);
  if (typeof detail.cancelReason === 'string') parts.push(`سبب الإلغاء: ${detail.cancelReason}`);
  if (typeof detail.quantity === 'number') parts.push(`الكمية: ${detail.quantity}`);
  return parts.join(' — ');
}

export function EmployeeActivityPage() {
  const { userId } = useParams();
  const [range, setRange] = useRange(7);
  const [page, setPage] = useState(0);
  const query = useQuery({
    queryKey: ['reg-report', 'activity', userId, range, page],
    queryFn: async () =>
      (await apiClient.get<ActivityResponse>(`/reports/registration/employees/${userId}/activity`, { params: { ...range, skip: page * PAGE, take: PAGE } })).data,
    placeholderData: (prev) => prev,
  });
  const data = query.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE)) : 1;
  const csvRows = (data?.rows ?? []).map((r) => [stamp(r.createdAt), actionLabel(r.action), ENTITY_LABELS[r.entityType] ?? r.entityType, detailText(r.detail)]);
  const backOffice = data?.employee.offices[0]?.id;

  return (
    <div>
      <PageHeader
        title={data ? `نشاط ${data.employee.fullName}` : 'نشاط الموظف'}
        subtitle={`من ${dayLabel(range.from)} إلى ${dayLabel(range.to)}${data ? ` — ${num(data.total)} إجراءً` : ''}`}
        actions={data && <CsvButton filename={`employee-activity_${range.from}_${range.to}.csv`} headers={['الوقت', 'الإجراء', 'النوع', 'تفاصيل']} rows={csvRows} label="تنزيل CSV (هذه الصفحة)" />}
      />
      <Link
        to={backOffice ? `/reports/registration/offices/${backOffice}?from=${range.from}&to=${range.to}` : '/reports/registration'}
        className="mb-4 inline-flex min-h-11 items-center font-bold text-primary underline"
      >
        ← موظفو المكتب
      </Link>
      <RangeBar
        range={range}
        onChange={(r) => {
          setPage(0);
          setRange(r);
        }}
      />
      {query.isLoading && <Loading />}
      {query.isError && <ErrorNote error={query.error} />}
      {data && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2 text-[16px] text-ink-soft lg:text-[14px]">
            <StatusPill variant={data.employee.isActive ? 'ok' : 'neutral'} size="md">{data.employee.isActive ? 'فعّال' : 'موقوف'}</StatusPill>
            <span>آخر دخول: {stamp(data.employee.lastLoginAt)}</span>
          </div>
          {data.rows.length === 0 ? (
            <p className="rounded-md bg-surface p-4 text-[16px] text-ink-soft lg:text-[14px]">لا يوجد نشاط في هذه الفترة.</p>
          ) : (
            <Card>
              <ol>
                {data.rows.map((r) => (
                  <li key={r.id} className="border-b border-surface-alt px-4 py-3 last:border-b-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="text-[16px] font-bold text-ink lg:text-[14px]">{actionLabel(r.action)}</span>
                      <time dateTime={r.createdAt} dir="ltr" className="text-[14px] text-ink-soft lg:text-[12px]">{stamp(r.createdAt)}</time>
                    </div>
                    <p className="text-[14px] text-ink-soft lg:text-[12px]">
                      {ENTITY_LABELS[r.entityType] ?? r.entityType}
                      {detailText(r.detail) && ` — ${detailText(r.detail)}`}
                      {r.entityType === 'Vehicle' && (
                        <>
                          {' — '}
                          <Link to={`/vehicles/${r.entityId}`} className="font-bold text-primary underline">فتح المركبة</Link>
                        </>
                      )}
                    </p>
                  </li>
                ))}
              </ol>
            </Card>
          )}
          {pages > 1 && (
            <nav aria-label="الصفحات" className="mt-4 flex items-center justify-between gap-3">
              <PillButton size="field" variant="secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>السابق</PillButton>
              <span className="text-[16px] text-ink-soft lg:text-[14px]">صفحة {num(page + 1)} من {num(pages)}</span>
              <PillButton size="field" variant="secondary" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>التالي</PillButton>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
