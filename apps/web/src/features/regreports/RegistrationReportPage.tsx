import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { roleLabel } from '../../lib/labels';
import { PageHeader } from '../../components/design/PageHeader';
import { Card } from '../../components/design/Card';
import { CsvButton, ErrorNote, Loading, PdfButton, RangeBar, SectionTitle, dayLabel, num, stamp, useRange } from './common';
import type { OfficeReport, OfficesResponse } from './types';

// Phase 4c, report 1: the registration offices side by side. Phone: one card
// per office with the figures stacked. Desktop: one table with an office per
// column. Both are drawn from the same list of rows, as is the CSV.

interface Row {
  label: string;
  value: (o: OfficeReport) => string | number;
  // Marks the figure that deserves a second look (never colour alone: the
  // note column on the card says why).
  emphasise?: boolean;
}
interface Group {
  title: string;
  rows: Row[];
}

function groupsFor(offices: OfficeReport[], since: string | null): Group[] {
  const jobs = Array.from(new Set(offices.flatMap((o) => o.people.byJob.map((j) => j.name))));
  return [
    {
      title: 'البطاقات',
      rows: [
        { label: 'بطاقات صدرت', value: (o) => o.cards.issued, emphasise: true },
        { label: 'أولى', value: (o) => o.cards.first },
        { label: 'بدل فاقد', value: (o) => o.cards.replacements.lost },
        { label: 'بدل تالف', value: (o) => o.cards.replacements.damaged },
        { label: 'بدل لتغيّر البيانات', value: (o) => o.cards.replacements.detailsChanged },
        { label: 'إعادة طباعة بعد فشل الطباعة', value: (o) => o.cards.failedPrintReprints },
        { label: 'بطاقات هُدرت (فشلت طباعتها)', value: (o) => o.cards.wastedCards },
        { label: 'فعّالة', value: (o) => o.cards.active },
        { label: 'ملغاة', value: (o) => o.cards.cancelled },
        { label: 'استُبدلت', value: (o) => o.cards.replaced },
      ],
    },
    {
      title: 'المركبات',
      rows: [
        { label: 'مركبات جديدة سُجّلت', value: (o) => o.vehicles.registered, emphasise: true },
        {
          label: since ? `تكرار اكتُشف (مسجَّل منذ ${dayLabel(since)})` : 'تكرار اكتُشف',
          value: (o) => o.vehicles.duplicatesCaught,
        },
        { label: 'تصحيحات طُلبت', value: (o) => o.vehicles.corrections.requested },
        { label: '— ما زالت بانتظار القرار', value: (o) => o.vehicles.corrections.pending },
        { label: '— أُقرّت', value: (o) => o.vehicles.corrections.approved },
        { label: '— رُفضت', value: (o) => o.vehicles.corrections.rejected },
      ],
    },
    {
      title: 'الموظفون',
      rows: [
        { label: 'عدد الحسابات', value: (o) => o.people.total },
        { label: 'فعّالة', value: (o) => o.people.active },
        { label: 'موقوفة', value: (o) => o.people.deactivated },
        ...jobs.flatMap((job): Row[] => [
          { label: `${roleLabel(job)} — فعّال`, value: (o) => o.people.byJob.find((j) => j.name === job)?.active ?? 0 },
          { label: `${roleLabel(job)} — موقوف`, value: (o) => o.people.byJob.find((j) => j.name === job)?.deactivated ?? 0 },
        ]),
        { label: 'آخر دخول لأي حساب', value: (o) => stamp(o.people.lastLoginAt) },
      ],
    },
  ];
}

export function RegistrationReportPage() {
  const [range, setRange] = useRange(7);
  const query = useQuery({
    queryKey: ['reg-report', 'offices', range],
    queryFn: async () => (await apiClient.get<OfficesResponse>('/reports/registration/offices', { params: range })).data,
  });
  const data = query.data;
  const groups = data ? groupsFor(data.offices, data.duplicatesRecordedSince) : [];
  const csvHeaders = ['القسم', 'البند', ...(data?.offices.map((o) => o.name) ?? [])];
  const csvRows = data ? groups.flatMap((g) => g.rows.map((r) => [g.title, r.label, ...data.offices.map((o) => r.value(o))])) : [];

  return (
    <div>
      <PageHeader
        title="متابعة مكاتب التسجيل"
        subtitle="البطاقات والمركبات والموظفون، مكتبًا بجوار مكتب"
        actions={
          data && (
            <>
              <CsvButton filename={`registration-offices_${range.from}_${range.to}.csv`} headers={csvHeaders} rows={csvRows} />
              <PdfButton path="/reports/registration/offices/export" params={{ ...range }} filename={`registration-offices_${range.from}_${range.to}.pdf`} />
            </>
          )
        }
      />
      <RangeBar range={range} onChange={setRange} />

      {query.isLoading && <Loading />}
      {query.isError && <ErrorNote error={query.error} />}
      {data && data.offices.length === 0 && (
        <p className="rounded-md bg-surface p-4 text-[16px] text-ink-soft lg:text-[14px]">لا توجد مكاتب تسجيل ضمن نطاقك.</p>
      )}

      {data && data.offices.length > 0 && (
        <>
          {/* Phone: a card per office. */}
          <div className="space-y-4 lg:hidden">
            {data.offices.map((office) => (
              <Card key={office.id} className="p-4">
                <h2 className="text-[18px] font-extrabold text-ink">{office.name}</h2>
                <p className="text-[14px] text-ink-soft">{office.municipality}</p>
                <p className="mt-3 text-[14px] font-bold text-ink-soft">بطاقات صدرت</p>
                <p className="text-[28px] font-extrabold leading-none text-ink">{num(office.cards.issued)}</p>
                {groups.map((g) => (
                  <section key={g.title} aria-label={g.title} className="mt-4">
                    <h3 className="mb-1 text-[16px] font-extrabold text-ink">{g.title}</h3>
                    <dl>
                      {g.rows.map((r) => (
                        <div key={r.label} className="flex items-baseline justify-between gap-3 border-b border-surface-alt py-2">
                          <dt className="text-[16px] text-ink-soft">{r.label}</dt>
                          <dd className="shrink-0 text-[16px] font-bold text-ink">{typeof r.value(office) === 'number' ? num(r.value(office) as number) : r.value(office)}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                ))}
                <Link
                  to={`/reports/registration/offices/${office.id}?from=${range.from}&to=${range.to}`}
                  className="mt-4 flex h-12 items-center justify-center rounded-full bg-surface-alt text-[16px] font-bold text-ink"
                >
                  موظفو المكتب ونشاطهم
                </Link>
              </Card>
            ))}
          </div>

          {/* Desktop: one table, an office per column. */}
          <Card className="hidden overflow-x-auto lg:block">
            <table className="w-full text-[14px]">
              <caption className="sr-only">مقارنة مكاتب التسجيل من {dayLabel(range.from)} إلى {dayLabel(range.to)}</caption>
              <thead>
                <tr className="border-b border-surface-alt text-start">
                  <th scope="col" className="px-4 py-3 text-start font-bold text-ink-soft">البند</th>
                  {data.offices.map((o) => (
                    <th key={o.id} scope="col" className="px-4 py-3 text-start font-extrabold text-ink">
                      {o.name}
                      <span className="block text-[12px] font-normal text-ink-soft">{o.municipality}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              {groups.map((g) => (
                <tbody key={g.title}>
                  <tr>
                    <th scope="colgroup" colSpan={data.offices.length + 1} className="bg-surface-alt px-4 py-2 text-start text-[14px] font-extrabold text-ink">
                      {g.title}
                    </th>
                  </tr>
                  {g.rows.map((r) => (
                    <tr key={r.label} className="border-b border-surface-alt">
                      <th scope="row" className="px-4 py-2.5 text-start font-normal text-ink-soft">{r.label}</th>
                      {data.offices.map((o) => {
                        const v = r.value(o);
                        return (
                          <td key={o.id} className={`px-4 py-2.5 ${r.emphasise ? 'text-[16px] font-extrabold text-ink' : 'font-bold text-ink'}`}>
                            {typeof v === 'number' ? num(v) : v}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              ))}
              <tfoot>
                <tr>
                  <th scope="row" className="px-4 py-3 text-start font-bold text-ink-soft">موظفو المكتب</th>
                  {data.offices.map((o) => (
                    <td key={o.id} className="px-4 py-3">
                      <Link to={`/reports/registration/offices/${o.id}?from=${range.from}&to=${range.to}`} className="font-bold text-primary underline">
                        نشاط كل موظف
                      </Link>
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </Card>

          {data.duplicatesRecordedSince && (
            <>
              <SectionTitle>ملاحظة عن التكرار</SectionTitle>
              <p className="text-[16px] text-ink-soft lg:text-[14px]">
                حالات التكرار التي اكتُشفت تُسجَّل منذ {dayLabel(data.duplicatesRecordedSince)} فقط؛ ما قبل ذلك لم يكن يُحفظ، فلا يظهر في هذه الأرقام.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
