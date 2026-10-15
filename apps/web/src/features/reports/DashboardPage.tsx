import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DashboardResponse } from '@fuel-tracking/shared-types';
import { apiClient } from '../../lib/apiClient';
import { useAuth } from '../auth/AuthProvider';
import { Card, CardHeader } from '../../components/design/Card';
import { KpiCard } from '../../components/design/KpiCard';
import { CodeText } from '../../components/design/CodeText';
import { InfoHint } from '../../components/InfoHint';
import { fuelTypeLabel } from '../../lib/labels';
import { SkeletonRows } from '../../components/design/Skeleton';
import { Pagination } from '../../components/Pagination';
import { useClientPage } from '../../lib/pageSize';

// The 30 days ending on `endDate` (YYYY-MM-DD), both ends included.
const OVERVIEW_DAYS = 30;
function startOfWindow(endDate: string): string {
  const date = new Date(`${endDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - (OVERVIEW_DAYS - 1));
  return date.toISOString().slice(0, 10);
}

// Litres as a person reads them: 3865.040000000001 is «3,865». One decimal at most.
const litres = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(n);
const percent = (rate: number) => `${(rate * 100).toFixed(1)}%`;

function displayDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// GET /reports/dashboard requires reports:view_all_stations specifically
// (route guard on the backend, not scope-filtering) — the nav link is
// already hidden without it, but this page also checks directly in case
// someone lands here by URL, rather than firing a query that will 403.
//
// Phase 6: no longer a screen of its own - it is the lower half of «اليوم»
// (the daily report), for those who see every station. KPI card row +
// per-station table, the station with the most exceptions marked with a word.
//
// Phase 7 (4.2): «اليوم» has ONE date control. This section has none of its own
// any more: it covers the 30 days that end on the page's date, and says so.
export function DirectorateOverview({ endDate }: { endDate: string }) {
  const { hasPermission } = useAuth();
  const canView = hasPermission('reports:view_all_stations');
  const toDate = endDate;
  const fromDate = startOfWindow(endDate);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['reports', 'dashboard', fromDate, toDate],
    queryFn: async () =>
      (
        await apiClient.get<DashboardResponse>('/reports/dashboard', {
          params: { from: `${fromDate}T00:00:00.000Z`, to: `${toDate}T23:59:59.999Z` },
        })
      ).data,
    enabled: canView,
  });

  if (!canView) return null;

  const exceptionRate = (s: { totalFillUps: number; exceptionCount: number }) =>
    s.totalFillUps > 0 ? s.exceptionCount / s.totalFillUps : 0;
  // «مرتبة بنسبة الاستثناءات»: highest rate first, then the busiest.
  const stations = data
    ? [...data.perStation].sort((a, b) => exceptionRate(b) - exceptionRate(a) || b.totalFillUps - a.totalFillUps)
    : [];
  const worstStationId = stations[0]?.stationId ?? null;
  const stationPage = useClientPage(stations);

  return (
    <section aria-label="على مستوى المديرية" className="mt-8" data-testid="directorate-overview">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[20px] font-extrabold text-ink lg:text-[17px]">على مستوى المديرية</h2>
          <p className="mt-0.5 flex items-center gap-1.5 text-[15px] text-ink-soft lg:text-[13px]" data-testid="directorate-overview-window">
            آخر {OVERVIEW_DAYS} يومًا حتى <bdi dir="ltr">{displayDate(toDate)}</bdi> (التاريخ المختار أعلاه)
            <InfoHint text="كل الأرقام والرسوم في هذا القسم تُحسب على آخر 30 يومًا تنتهي بالتاريخ المختار في المرشحات أعلى الصفحة." />
          </p>
        </div>
      </div>

      {isLoading && <SkeletonRows rows={4} />}
      {isError && <p className="text-[15px] lg:text-[13px] text-danger">تعذر تحميل البيانات.</p>}

      {data && (
        <>
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <KpiCard
              label="إجمالي التعبئات"
              value={data.totalFillUps}
              hint="عدد عمليات التعبئة المسجَّلة في كل محطات المديرية خلال آخر 30 يومًا حتى التاريخ المختار."
            />
            <KpiCard
              label="إجمالي اللترات"
              value={litres(data.totalLiters)}
              hint="مجموع كمية الوقود (باللتر) المصروفة في كل التعبئات ضمن هذا النطاق، لكل أنواع الوقود مجتمعة."
            />
            <KpiCard
              label="نسبة الاستثناءات"
              value={percent(data.exceptionRate)}
              // Amber («needs a look») when there are exceptions; red is kept for
              // a broken rule, not for a rate (Meaning-Fixed Rule).
              variant={data.exceptionRate > 0 ? 'accent' : 'neutral'}
              hint="نسبة التعبئات التي سُجِّلت كاستثناء (خرقت إحدى قواعد التعبئة) إلى إجمالي التعبئات — رقم مرتفع يستحق المتابعة."
            />
          </div>

          {data.daily.length > 0 && (
            <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader title="اتجاه حجم التعبئات" subtitle="عدد التعبئات يوميًا خلال آخر 30 يومًا" />
                <div className="h-56 p-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.daily} margin={{ left: -12 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" fontSize={10} />
                      <YAxis allowDecimals={false} fontSize={11} />
                      <Tooltip formatter={(value) => [`${value}`, 'تعبئات']} />
                      <Line type="monotone" dataKey="totalFillUps" stroke="#0d5c52" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <Card>
                <CardHeader title="نسبة الاستثناءات عبر الوقت" subtitle="نسبة الاستثناءات إلى إجمالي التعبئات كل يوم" />
                <div className="h-56 p-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={data.daily.map((d) => ({
                        date: d.date,
                        rate: d.totalFillUps > 0 ? Math.round((d.exceptionCount / d.totalFillUps) * 1000) / 10 : 0,
                      }))}
                      margin={{ left: -12 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" fontSize={10} />
                      <YAxis allowDecimals={false} fontSize={11} unit="%" />
                      <Tooltip formatter={(value) => [`${value}%`, 'نسبة الاستثناءات']} />
                      <Line type="monotone" dataKey="rate" stroke="#C1462D" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>
          )}

          {data.byFuelType.length > 0 && (
            <Card className="mb-4">
              <CardHeader title="اللترات حسب نوع الوقود" subtitle="خلال آخر 30 يومًا" />
              <div className="h-56 p-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data.byFuelType.map((f) => ({ label: fuelTypeLabel(f.fuelType), totalLiters: f.totalLiters }))}
                    layout="vertical"
                    margin={{ left: 8, right: 24 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" fontSize={11} />
                    <YAxis type="category" dataKey="label" width={70} fontSize={12} />
                    <Tooltip formatter={(value) => [`${litres(Number(value))} لتر`, '']} labelFormatter={() => ''} />
                    <Bar dataKey="totalLiters" fill="#0D5C52" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          <Card>
            <CardHeader
              title="حسب المحطة"
              subtitle="مرتبة بنسبة الاستثناءات"
              action={
                <InfoHint
                  className="me-1"
                  text="المحطة صاحبة أعلى نسبة استثناءات ضمن هذا النطاق الزمني مكتوب بجانبها «الأعلى» — أول مكان يستحق المراجعة."
                />
              }
            />
            <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[640px] text-[13px] lg:text-[12.5px]">
              <thead>
                <tr className="bg-surface-alt text-[13px] lg:text-[12px] font-bold text-ink-soft">
                  <th className="px-[18px] py-2.5 text-start">المحطة</th>
                  <th className="px-[18px] py-2.5 text-start">إجمالي التعبئات</th>
                  <th className="px-[18px] py-2.5 text-start">إجمالي اللترات</th>
                  <th className="px-[18px] py-2.5 text-start">الاستثناءات</th>
                  <th className="px-[18px] py-2.5 text-start">نسبة الاستثناءات</th>
                </tr>
              </thead>
              <tbody>
                {stationPage.pageItems.map((station) => (
                  <tr
                    key={station.stationId}
                    className={`border-b border-line-soft last:border-0 ${
                      station.stationId === worstStationId && station.exceptionCount > 0 ? 'bg-danger-100' : ''
                    }`}
                  >
                    <td className="px-[18px] py-3">
                      <span className="font-bold text-ink">{station.name ?? ''}</span>
                      {station.stationId === worstStationId && station.exceptionCount > 0 && (
                        <span className="ms-2 rounded-full bg-danger-100 px-2 py-0.5 text-[12px] font-bold text-danger-dark">الأعلى</span>
                      )}
                      <br />
                      <CodeText>{station.internalCode ?? station.stationId}</CodeText>
                    </td>
                    <td className="px-[18px] py-3 text-ink">{station.totalFillUps}</td>
                    <td className="px-[18px] py-3 text-ink">{litres(station.totalLiters)}</td>
                    <td className="px-[18px] py-3 text-ink">{station.exceptionCount}</td>
                    <td className="px-[18px] py-3 font-bold text-ink">{percent(exceptionRate(station))}</td>
                  </tr>
                ))}
                {data.perStation.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-[15px] lg:text-[13px] text-ink-soft">
                      لا توجد بيانات لهذا النطاق الزمني
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
            {/* On a phone each station is a small card: nothing scrolls sideways. */}
            <ul className="divide-y divide-line-soft lg:hidden" data-testid="directorate-stations-stacked">
              {stationPage.pageItems.map((station) => (
                <li key={station.stationId} className="space-y-1 px-4 py-3.5">
                  <p className="flex flex-wrap items-center gap-2 text-[16px] font-bold text-ink">
                    {station.name ?? ''}
                    {station.stationId === worstStationId && station.exceptionCount > 0 && (
                      <span className="rounded-full bg-danger-100 px-2 py-0.5 text-[13px] font-bold text-danger-dark">الأعلى</span>
                    )}
                  </p>
                  <CodeText>{station.internalCode ?? station.stationId}</CodeText>
                  <p className="flex flex-wrap gap-x-4 gap-y-1 text-[15px] text-ink-soft">
                    <span>{station.totalFillUps} تعبئة</span>
                    <span>{litres(station.totalLiters)} لتر</span>
                    <span className="font-bold text-ink">استثناءات {station.exceptionCount} ({percent(exceptionRate(station))})</span>
                  </p>
                </li>
              ))}
              {stations.length === 0 && <li className="p-4 text-center text-[15px] text-ink-soft">لا توجد بيانات لهذا النطاق الزمني</li>}
            </ul>
            <Pagination skip={stationPage.skip} take={stationPage.take} total={stationPage.total} onSkipChange={stationPage.setSkip} testId="directorate-stations-pager" />
          </Card>
        </>
      )}
    </section>
  );
}
