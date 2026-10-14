import { useState } from 'react';
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
import { DateField } from '../../components/DateField';
import { useAuth } from '../auth/AuthProvider';
import { Card, CardHeader } from '../../components/design/Card';
import { KpiCard } from '../../components/design/KpiCard';
import { CodeText } from '../../components/design/CodeText';
import { InfoHint } from '../../components/InfoHint';
import { fuelTypeLabel } from '../../lib/labels';

function isoDateDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// GET /reports/dashboard requires reports:view_all_stations specifically
// (route guard on the backend, not scope-filtering) — the nav link is
// already hidden without it, but this page also checks directly in case
// someone lands here by URL, rather than firing a query that will 403.
//
// Phase 6: no longer a screen of its own - it is the lower half of «اليوم»
// (the daily report), for those who see every station. KPI card row +
// per-station table, the station with the most exceptions marked with a word.
export function DirectorateOverview() {
  const { hasPermission } = useAuth();
  const canView = hasPermission('reports:view_all_stations');
  const [fromDate, setFromDate] = useState(isoDateDaysAgo(30));
  const [toDate, setToDate] = useState(todayIso());

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
  const worstStationId =
    data && data.perStation.length > 0
      ? [...data.perStation].sort((a, b) => exceptionRate(b) - exceptionRate(a))[0]?.stationId
      : null;

  return (
    <section aria-label="على مستوى المديرية" className="mt-8" data-testid="directorate-overview">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-[20px] font-extrabold text-ink lg:text-[17px]">على مستوى المديرية</h2>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-[13px] lg:text-[12px] font-bold text-ink-soft">
              من
              <InfoHint text="بداية النطاق الزمني الذي تُحسب عليه كل الأرقام والرسوم في هذا القسم." />
            </label>
            <DateField
              value={fromDate}
              onChange={setFromDate}
              inputClassName="h-9 w-36 rounded-sm bg-surface-alt px-3 pe-9 text-[13px] lg:text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <div>
            <label className="mb-1 block text-[13px] lg:text-[12px] font-bold text-ink-soft">إلى</label>
            <DateField
              value={toDate}
              onChange={setToDate}
              inputClassName="h-9 w-36 rounded-sm bg-surface-alt px-3 pe-9 text-[13px] lg:text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
        </div>
      </div>

      {isLoading && <p className="text-[15px] lg:text-[13px] text-ink-soft">...جارٍ التحميل</p>}
      {isError && <p className="text-[15px] lg:text-[13px] text-danger">تعذر تحميل البيانات.</p>}

      {data && (
        <>
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <KpiCard
              label="إجمالي التعبئات"
              value={data.totalFillUps}
              hint="عدد عمليات التعبئة المسجَّلة في كل محطات المديرية خلال النطاق الزمني المحدَّد أعلاه."
            />
            <KpiCard
              label="إجمالي اللترات"
              value={data.totalLiters}
              hint="مجموع كمية الوقود (باللتر) المصروفة في كل التعبئات ضمن هذا النطاق، لكل أنواع الوقود مجتمعة."
            />
            <KpiCard
              label="نسبة الاستثناءات"
              value={`${(data.exceptionRate * 100).toFixed(1)}%`}
              variant="danger"
              hint="نسبة التعبئات التي سُجِّلت كاستثناء (خرقت إحدى قواعد التعبئة) إلى إجمالي التعبئات — رقم مرتفع يستحق المتابعة."
            />
          </div>

          {data.daily.length > 0 && (
            <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader title="اتجاه حجم التعبئات" subtitle="عدد التعبئات يوميًا خلال النطاق المحدَّد" />
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
                      <Line type="monotone" dataKey="rate" stroke="#c2410c" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>
          )}

          {data.byFuelType.length > 0 && (
            <Card className="mb-4">
              <CardHeader title="التوزيع حسب نوع الوقود" />
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
                    <Tooltip formatter={(value) => [`${value} لتر`, '']} labelFormatter={() => ''} />
                    <Bar dataKey="totalLiters" fill="#e8a53d" radius={[0, 4, 4, 0]} />
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
            <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13px] lg:text-[12.5px]">
              <thead>
                <tr className="bg-surface-alt text-[13px] lg:text-[12px] font-bold text-ink-soft">
                  <th className="px-[18px] py-2.5 text-start">المحطة</th>
                  <th className="px-[18px] py-2.5 text-start">إجمالي التعبئات</th>
                  <th className="px-[18px] py-2.5 text-start">إجمالي اللترات</th>
                  <th className="px-[18px] py-2.5 text-start">الاستثناءات</th>
                </tr>
              </thead>
              <tbody>
                {data.perStation.map((station) => (
                  <tr
                    key={station.stationId}
                    className={`border-b border-surface-alt last:border-0 ${
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
                    <td className="px-[18px] py-3 text-ink">{station.totalLiters}</td>
                    <td className="px-[18px] py-3 text-ink">{station.exceptionCount}</td>
                  </tr>
                ))}
                {data.perStation.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-[15px] lg:text-[13px] text-ink-soft">
                      لا توجد بيانات لهذا النطاق الزمني
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          </Card>
        </>
      )}
    </section>
  );
}
