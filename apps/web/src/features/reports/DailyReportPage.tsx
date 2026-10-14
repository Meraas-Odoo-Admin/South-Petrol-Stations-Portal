import { FillUpPlate } from '../../components/FillUpPlate';
import { usePageParam } from '../../lib/usePageParam';
import { Pagination } from '../../components/Pagination';
import { formatTime } from '../../lib/dateFormat';
import { downloadCsv } from '../../lib/csv';
import { DirectorateOverview } from './DashboardPage';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Label, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DailyReportResponse, FuelType, ReportExportFormat } from '@fuel-tracking/shared-types';
import { apiClient } from '../../lib/apiClient';
import { downloadBlob } from '../../lib/download';
import { useAuth } from '../auth/AuthProvider';
import { StationSelect } from '../../components/StationSelect';
import { DateField } from '../../components/DateField';
import { PageHeader } from '../../components/design/PageHeader';
import { Card, CardHeader } from '../../components/design/Card';
import { PillButton } from '../../components/design/PillButton';
import { KpiCard } from '../../components/design/KpiCard';
import { LtrText } from '../../components/LtrText';
import { CodeText } from '../../components/design/CodeText';
import { FillUpStatusPill } from '../../components/FillUpStatusPill';
import { OwnerSearchSelect } from '../../components/OwnerSearchSelect';
import { OwnerIdentityReveal } from '../../components/OwnerIdentityReveal';
import { FUEL_TYPE_LABELS, fuelTypeLabel } from '../../lib/labels';
import { InfoHint } from '../../components/InfoHint';
import { maskIdentityNumber } from '../../lib/masking';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const selectClass =
  'h-9 rounded-sm bg-surface-alt px-3 text-[13px] lg:text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-60';
const tintedSelectClass =
  'h-9 rounded-sm bg-accent-100 px-3 text-[13px] lg:text-[12.5px] font-bold text-accent-ink focus:outline-none focus:ring-2 focus:ring-accent';

// Round 4 feedback item 9, matches design/feedback-2026-08-29/
// 10-design-target-daily-report.png: active (non-default) filters are
// visibly tinted, a live "تعرض X من أصل Y" line states how much the
// optional filters narrowed the set, KPI tiles + a fuel-type breakdown
// chart + the results table are all computed from the SAME filtered
// response the backend returns — never a separately hardcoded number.
const DAILY_PAGE_SIZE = 25;

export function DailyReportPage() {
  const { user, hasPermission } = useAuth();
  const canViewAllStations = hasPermission('reports:view_all_stations');
  const permissions = user?.permissions ?? [];
  const ownStation = user?.stationScope[0] ?? null;

  const [stationId, setStationId] = useState(canViewAllStations ? '' : (ownStation?.stationId ?? ''));
  const [date, setDate] = useState(todayIso());
  const [fuelType, setFuelType] = useState<FuelType | ''>('');
  const [ownerId, setOwnerId] = useState('');
  const [ownerLabel, setOwnerLabel] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [noCardOnly, setNoCardOnly] = useState(false);
  const [exporting, setExporting] = useState<ReportExportFormat | 'csv' | null>(null);

  const exportParams = {
    stationId: stationId || undefined,
    date,
    fuelType: fuelType || undefined,
    ownerId: ownerId || undefined,
    employeeId: employeeId || undefined,
    noCard: noCardOnly || undefined,
  };
  // 25 results a page, the page in the address; changing a filter returns to page 1.
  const { skip, setSkip } = usePageParam(DAILY_PAGE_SIZE);
  // A new filter starts again from page 1 (but a refresh keeps the page).
  const filterKey = `${stationId}|${date}|${fuelType}|${ownerId}|${employeeId}|${noCardOnly}`;
  const lastFilterKey = useRef(filterKey);
  useEffect(() => {
    if (lastFilterKey.current !== filterKey) {
      lastFilterKey.current = filterKey;
      setSkip(0);
    }
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ['reports', 'daily', stationId, date, fuelType, ownerId, employeeId, noCardOnly, skip],
    placeholderData: (prev) => prev,
    queryFn: async () =>
      (await apiClient.get<DailyReportResponse>('/reports/daily', { params: { ...exportParams, skip, take: DAILY_PAGE_SIZE } })).data,
  });

  async function handleExport(format: ReportExportFormat) {
    setExporting(format);
    try {
      const res = await apiClient.get('/reports/daily/export', {
        params: { ...exportParams, format },
        responseType: 'blob',
      });
      downloadBlob(res.data, `daily-report-${date}.${format}`);
    } finally {
      setExporting(null);
    }
  }

  async function handleExportCsv() {
    setExporting('csv');
    try {
      const res = await apiClient.get<DailyReportResponse>('/reports/daily', { params: { ...exportParams, skip: 0, take: 100 } });
      downloadCsv(
        `daily-report-${date}.csv`,
        ['الوقت', 'المحطة', 'اللوحة', 'المالك', 'الوقود', 'اللترات', 'الحالة', 'بدون بطاقة'],
        res.data.rows.map((r) => [
          formatTime(r.occurredAt),
          r.station.internalCode,
          r.vehicle?.currentPlate ?? r.typedPlate ?? '',
          r.vehicle?.owner?.fullName ?? '',
          fuelTypeLabel(r.fuelType),
          r.quantityLiters,
          r.isException ? 'استثناء' : 'مطابق للقواعد',
          r.identifiedBy === 'NO_CARD' ? 'نعم' : 'لا',
        ]),
      );
    } finally {
      setExporting(null);
    }
  }

  function resetFilters() {
    setDate(todayIso());
    setEmployeeId('');
    setNoCardOnly(false);
    setFuelType('');
    setOwnerId('');
    setOwnerLabel('');
  }

  const employeeChoices = (() => {
    const map = new Map<string, string>();
    for (const r of data?.rows ?? []) {
      if (r.recordedBy) map.set(r.recordedBy.id, r.recordedBy.fullName);
    }
    if (employeeId && !map.has(employeeId)) map.set(employeeId, 'الموظف المختار');
    return [...map.entries()];
  })();
  const filtersActive = date !== todayIso() || fuelType !== '' || ownerId !== '' || employeeId !== '' || noCardOnly;
  const isNarrowed = data ? data.totalFillUps < data.totalBeforeFilters : false;

  const fuelBreakdown = data
    ? (Object.keys(FUEL_TYPE_LABELS) as FuelType[]).map((ft) => ({
        fuelType: ft,
        label: fuelTypeLabel(ft),
        count: data.byFuelType?.find((r) => r.fuelType === ft)?.count ?? 0,
      }))
    : [];

  return (
    <div>
      <PageHeader
        title="اليوم"
        actions={
          <>
            <PillButton variant="secondary" size="sm" onClick={handleExportCsv} disabled={exporting !== null} data-testid="daily-export-csv">
              {exporting === 'csv' ? '...' : 'تنزيل CSV'}
            </PillButton>
            <PillButton size="sm" onClick={() => handleExport('pdf')} disabled={exporting !== null}>
              {exporting === 'pdf' ? '...' : 'تنزيل PDF'}
            </PillButton>
          </>
        }
      />

      <Card className="mb-4 p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[13px] lg:text-[12px] font-bold text-ink-soft">المرشحات</p>
          {filtersActive && (
            <button type="button" onClick={resetFilters} className="text-[13px] lg:text-[12px] font-bold text-accent-ink">
              إعادة الضبط
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-[13px] lg:text-[12px] font-bold text-ink-soft">المحطة</label>
            {canViewAllStations ? (
              <StationSelect value={stationId} onChange={setStationId} allowAllOption className={`w-56 ${selectClass}`} />
            ) : (
              <StationSelect value={stationId} onChange={setStationId} disabled className={`w-56 ${selectClass}`} />
            )}
          </div>
          <div>
            <label className="mb-1 block text-[13px] lg:text-[12px] font-bold text-ink-soft">التاريخ</label>
            <DateField
              value={date}
              onChange={setDate}
              inputClassName={`w-36 pe-9 ${date !== todayIso() ? tintedSelectClass : selectClass}`}
            />
          </div>
          <div>
            <label className="mb-1 block text-[13px] lg:text-[12px] font-bold text-ink-soft">نوع الوقود (اختياري)</label>
            <select
              value={fuelType}
              onChange={(e) => setFuelType(e.target.value as FuelType | '')}
              className={fuelType ? tintedSelectClass : selectClass}
            >
              <option value="">الكل</option>
              {Object.entries(FUEL_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[13px] lg:text-[12px] font-bold text-ink-soft">الموظف (اختياري)</label>
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className={employeeId ? tintedSelectClass : selectClass}
              data-testid="daily-filter-employee"
            >
              <option value="">الكل</option>
              {employeeChoices.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <label className="flex min-h-[44px] items-center gap-2 text-[14px] lg:text-[12.5px] font-bold text-ink">
            <input type="checkbox" checked={noCardOnly} onChange={(e) => setNoCardOnly(e.target.checked)} data-testid="daily-filter-nocard" />
            بدون بطاقة فقط
          </label>
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-[13px] lg:text-[12px] font-bold text-ink-soft">
              المالك (اختياري)
              <InfoHint text="اكتب اسم مالك المركبة أو رقم هويته (وطني أو إداري) لعرض تعبئاته فقط ضمن هذا اليوم." />
            </label>
            {ownerId ? (
              <div className={`flex w-56 items-center justify-between gap-2 ${tintedSelectClass}`}>
                <span className="truncate">{ownerLabel}</span>
                <button
                  type="button"
                  onClick={() => {
                    setOwnerId('');
                    setOwnerLabel('');
                  }}
                  className="text-accent-ink hover:opacity-70"
                >
                  ✕
                </button>
              </div>
            ) : (
              <OwnerSearchSelect
                value={ownerId}
                onChange={(id, label) => {
                  setOwnerId(id);
                  setOwnerLabel(label);
                }}
                className={`w-56 ${selectClass}`}
              />
            )}
          </div>
        </div>
      </Card>

      {isLoading && <p className="text-[15px] lg:text-[13px] text-ink-soft">...جارٍ التحميل</p>}
      {isError && (
        <p className="text-[15px] lg:text-[13px] text-danger">
          تعذر تحميل التقرير — تأكد من اختيار محطة إن لم تملك صلاحية عرض جميع المحطات.
        </p>
      )}

      {data && (
        <>
          {isNarrowed && (
            <p className="mb-3 text-[13px] lg:text-[12px] font-bold text-ink-soft" data-testid="daily-report-count-line">
              تعرض {data.totalFillUps} تعبئات من أصل {data.totalBeforeFilters} بعد تطبيق المرشحات
            </p>
          )}

          <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <KpiCard label="إجمالي التعبئات" value={data.totalFillUps} hint="عدد التعبئات المطابقة للمرشحات المحدَّدة أعلاه (المحطة والتاريخ ونوع الوقود والمالك)." />
            <KpiCard label="إجمالي اللترات" value={data.totalLiters} hint="مجموع كمية الوقود باللتر لكل التعبئات المطابقة للمرشحات." />
            <KpiCard
              label="استثناءات"
              value={data.exceptionsPending + data.exceptionsApproved}
              variant="accent"
              hint="تعبئات مُنعت بقاعدة وسُجِّلت باستثناء. لا يوجد اعتماد؛ تظهر فورًا في صفحة الاستثناءات."
            />
            <KpiCard label="بدون بطاقة" value={data.noCardCount ?? 0} hint="تعبئات لمركبات مسجّلة وُجدت بالبحث لأن بطاقتها لا تُستخدم، مع سبب مسجّل." />
          </div>

          {data.rows.length > 0 && (
            <Card className="mb-4">
              <CardHeader title="التوزيع حسب نوع الوقود" />
              {/* Fuel names sit under the bars in their own row, and the count axis
                  is named: the labels used to be drawn on top of the bars. */}
              <div className="h-64 p-4" data-testid="daily-fuel-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={fuelBreakdown} margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" fontSize={13} tickMargin={8} interval={0} height={36} />
                    <YAxis allowDecimals={false} fontSize={12} width={56}>
                      <Label value="عدد التعبئات" angle={-90} position="insideLeft" offset={-4} style={{ textAnchor: 'middle', fontSize: 12 }} />
                    </YAxis>
                    <Tooltip formatter={(value) => [`${value} تعبئة`, '']} labelFormatter={(label) => String(label)} />
                    <Bar dataKey="count" fill="#0d5c52" radius={[4, 4, 0, 0]} maxBarSize={72} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="نتائج التعبئات" />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-[13px] lg:text-[12.5px]">
                <thead>
                  <tr className="bg-surface-alt text-[13px] lg:text-[12px] font-bold text-ink-soft">
                    <th className="px-[18px] py-2.5 text-start">الوقت</th>
                    <th className="px-[18px] py-2.5 text-start">المحطة</th>
                    <th className="px-[18px] py-2.5 text-start">المركبة</th>
                    <th className="px-[18px] py-2.5 text-start">المالك</th>
                    <th className="px-[18px] py-2.5 text-start">نوع الوقود</th>
                    <th className="px-[18px] py-2.5 text-start">الكمية (لتر)</th>
                    <th className="px-[18px] py-2.5 text-start">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr key={row.id} className="border-b border-surface-alt last:border-0">
                      <td className="px-[18px] py-3">
                        <CodeText>{formatTime(row.occurredAt)}</CodeText>
                      </td>
                      <td className="px-[18px] py-3">{row.station.internalCode}</td>
                      <td className="px-[18px] py-3">
                        <FillUpPlate vehicle={row.vehicle} typedPlate={row.typedPlate} />
                      </td>
                      <td className="px-[18px] py-3">
                        {row.vehicle?.owner ? (
                          <>
                            {row.vehicle.owner.fullName} —{' '}
                            <OwnerIdentityReveal
                              ownerId={row.vehicle.owner.id}
                              maskedValue={maskIdentityNumber(row.vehicle.owner.identityNumber, permissions)}
                            />
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-[18px] py-3">{fuelTypeLabel(row.fuelType)}</td>
                      <td className="px-[18px] py-3">
                        <LtrText>{row.quantityLiters}</LtrText>
                      </td>
                      <td className="px-[18px] py-3">
                        <FillUpStatusPill row={row} />
                      </td>
                    </tr>
                  ))}
                  {data.rows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-[15px] lg:text-[13px] text-ink-soft">
                        لا توجد تعبئات مطابقة
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pagination
              skip={skip}
              take={DAILY_PAGE_SIZE}
              total={data.rowsTotal ?? data.rows.length}
              onSkipChange={setSkip}
              testId="daily-pager"
            />
          </Card>
        </>
      )}

      {canViewAllStations && <DirectorateOverview />}
    </div>
  );
}
