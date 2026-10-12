import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { roleLabel } from '../../lib/labels';
import { PageHeader } from '../../components/design/PageHeader';
import { Card } from '../../components/design/Card';
import { StatusPill } from '../../components/design/StatusPill';
import { CsvButton, ErrorNote, Loading, RangeBar, dayLabel, num, stamp, useRange } from './common';
import type { EmployeesResponse } from './types';

// One office's employees with their figures for the range; each links to the
// full audit timeline.
export function OfficeEmployeesPage() {
  const { officeId } = useParams();
  const [range, setRange] = useRange(7);
  const query = useQuery({
    queryKey: ['reg-report', 'employees', officeId, range],
    queryFn: async () =>
      (await apiClient.get<EmployeesResponse>(`/reports/registration/offices/${officeId}/employees`, { params: range })).data,
  });
  const data = query.data;
  const headers = ['الموظف', 'اسم الدخول', 'الوظيفة', 'الحالة', 'مركبات سُجّلت', 'بطاقات صدرت', 'إعادة طباعة', 'فشل طباعة', 'بطاقات اختبار', 'تصحيحات طُلبت', 'آخر دخول'];
  const rows = (data?.employees ?? []).map((e) => [
    e.fullName,
    e.username,
    e.job ? roleLabel(e.job) : '',
    e.isActive ? 'فعّال' : 'موقوف',
    e.vehiclesRegistered,
    e.cardsIssued,
    e.reprints,
    e.failedPrints,
    e.testPrints,
    e.correctionsRequested,
    stamp(e.lastLoginAt),
  ]);
  const query_ = `?from=${range.from}&to=${range.to}`;

  return (
    <div>
      <PageHeader
        title={data ? `موظفو ${data.office.name}` : 'موظفو المكتب'}
        subtitle={`من ${dayLabel(range.from)} إلى ${dayLabel(range.to)}`}
        actions={data && <CsvButton filename={`office-employees_${range.from}_${range.to}.csv`} headers={headers} rows={rows} />}
      />
      <Link to={`/reports/registration${query_}`} className="mb-4 inline-flex min-h-11 items-center font-bold text-primary underline">
        ← كل المكاتب
      </Link>
      <RangeBar range={range} onChange={setRange} />
      {query.isLoading && <Loading />}
      {query.isError && <ErrorNote error={query.error} />}
      {data && data.employees.length === 0 && (
        <p className="rounded-md bg-surface p-4 text-[16px] text-ink-soft lg:text-[14px]">لا يوجد موظفون في هذا المكتب.</p>
      )}
      {data && data.employees.length > 0 && (
        <>
          <div className="space-y-3 lg:hidden">
            {data.employees.map((e) => (
              <Card key={e.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-[18px] font-extrabold text-ink">{e.fullName}</h2>
                    <p className="text-[14px] text-ink-soft">{e.job ? roleLabel(e.job) : '—'}</p>
                  </div>
                  <StatusPill variant={e.isActive ? 'ok' : 'neutral'} size="md">{e.isActive ? 'فعّال' : 'موقوف'}</StatusPill>
                </div>
                <dl className="mt-3">
                  {[
                    ['مركبات سُجّلت', e.vehiclesRegistered],
                    ['بطاقات صدرت', e.cardsIssued],
                    ['إعادة طباعة', e.reprints],
                    ['فشل طباعة', e.failedPrints],
                    ['بطاقات اختبار', e.testPrints],
                    ['تصحيحات طُلبت', e.correctionsRequested],
                  ].map(([label, value]) => (
                    <div key={label as string} className="flex items-baseline justify-between border-b border-surface-alt py-2">
                      <dt className="text-[16px] text-ink-soft">{label}</dt>
                      <dd className="text-[16px] font-bold text-ink">{num(value as number)}</dd>
                    </div>
                  ))}
                  <div className="flex items-baseline justify-between py-2">
                    <dt className="text-[16px] text-ink-soft">آخر دخول</dt>
                    <dd className="text-[16px] font-bold text-ink">{stamp(e.lastLoginAt)}</dd>
                  </div>
                </dl>
                <Link
                  to={`/reports/registration/employees/${e.id}${query_}`}
                  className="mt-2 flex h-12 items-center justify-center rounded-full bg-surface-alt text-[16px] font-bold text-ink"
                >
                  السجل الكامل لنشاطه
                </Link>
              </Card>
            ))}
          </div>

          <Card className="hidden overflow-x-auto lg:block">
            <table className="w-full text-[14px]">
              <caption className="sr-only">نشاط موظفي المكتب</caption>
              <thead>
                <tr className="border-b border-surface-alt">
                  {['الموظف', 'مركبات سُجّلت', 'بطاقات صدرت', 'إعادة طباعة', 'فشل طباعة', 'بطاقات اختبار', 'تصحيحات طُلبت', 'آخر دخول', ''].map((h, i) => (
                    <th key={i} scope="col" className="px-4 py-3 text-start font-bold text-ink-soft">{h || <span className="sr-only">السجل</span>}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.employees.map((e) => (
                  <tr key={e.id} className="border-b border-surface-alt">
                    <th scope="row" className="px-4 py-2.5 text-start font-bold text-ink">
                      {e.fullName}
                      <span className="block text-[12px] font-normal text-ink-soft">
                        {e.job ? roleLabel(e.job) : '—'}
                        {!e.isActive && ' — موقوف'}
                      </span>
                    </th>
                    <td className="px-4 py-2.5 font-bold">{num(e.vehiclesRegistered)}</td>
                    <td className="px-4 py-2.5 font-bold">{num(e.cardsIssued)}</td>
                    <td className="px-4 py-2.5">{num(e.reprints)}</td>
                    <td className="px-4 py-2.5">{num(e.failedPrints)}</td>
                    <td className="px-4 py-2.5">{num(e.testPrints)}</td>
                    <td className="px-4 py-2.5">{num(e.correctionsRequested)}</td>
                    <td className="px-4 py-2.5">{stamp(e.lastLoginAt)}</td>
                    <td className="px-4 py-2.5">
                      <Link to={`/reports/registration/employees/${e.id}${query_}`} className="font-bold text-primary underline">
                        السجل الكامل
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
