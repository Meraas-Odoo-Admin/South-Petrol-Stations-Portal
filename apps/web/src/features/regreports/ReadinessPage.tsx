import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { PageHeader } from '../../components/design/PageHeader';
import { Card } from '../../components/design/Card';
import { StatusPill } from '../../components/design/StatusPill';
import { FieldLabel, TextField } from '../../components/design/TextField';
import { CsvButton, ErrorNote, Loading, PdfButton, RangeBar, SectionTitle, Stat, dayLabel, num, shortDay, useRange } from './common';
import { CardVsNoCardChart, IssuanceChart } from './ReadinessCharts';
import type { ReadinessHeadline, ReadinessResponse } from './types';

// Phase 4c, report 3: how ready a municipality is for the card deadline.

const SELECT =
  'h-[52px] w-full rounded-sm border border-line bg-surface-alt px-3.5 text-[16px] text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface lg:h-10 lg:text-[14px]';

function verdictText(h: ReadinessHeadline): { tone: 'ok' | 'warn' | 'danger' | 'neutral'; mark: string; text: string } {
  const deadline = h.deadline ? dayLabel(h.deadline) : '';
  switch (h.verdict) {
    case 'NONE_REMAINING':
      return { tone: 'ok', mark: '✓', text: `لم تُسجَّل لوحة بلا بطاقة في آخر ${num(h.windowDays)} يومًا، فلا يتبقى ما يُصدَر له.` };
    case 'NO_ISSUANCE':
      return { tone: 'warn', mark: '⚠', text: `لم تصدر أي بطاقة أولى في آخر ${num(h.windowDays)} يومًا، فلا يمكن تقدير المدة. هناك ${num(h.cardlessPlates)} لوحة بلا بطاقة.` };
    case 'NO_DEADLINE':
      return { tone: 'neutral', mark: 'ℹ', text: `بهذا المعدل يلزم نحو ${num(h.daysNeeded ?? 0)} يومًا لإصدار بطاقات لـ ${num(h.cardlessPlates)} لوحة. لم يُحدَّد موعد نهائي لهذه البلدية، فلا مقارنة بالأيام المتبقية.` };
    case 'DEADLINE_PASSED':
      return { tone: 'danger', mark: '✕', text: `انقضى الموعد النهائي (${deadline}) وما زالت ${num(h.cardlessPlates)} لوحة بلا بطاقة.` };
    case 'ON_TRACK':
      return { tone: 'ok', mark: '✓', text: `يلزم نحو ${num(h.daysNeeded ?? 0)} يومًا وبقي ${num(h.daysLeft ?? 0)} يومًا حتى الموعد (${deadline}): يكفي بهذا المعدل.` };
    default:
      return { tone: 'danger', mark: '✕', text: `يلزم نحو ${num(h.daysNeeded ?? 0)} يومًا وبقي ${num(h.daysLeft ?? 0)} يومًا فقط حتى الموعد (${deadline}): بهذا المعدل تبقى نحو ${num(h.shortfall ?? 0)} لوحة بلا بطاقة.` };
  }
}

function TableView({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="mt-3">
      <summary className="flex min-h-11 cursor-pointer items-center text-[16px] font-bold text-primary lg:text-[14px]">{summary}</summary>
      <div className="mt-2 overflow-x-auto">{children}</div>
    </details>
  );
}

export function ReadinessPage() {
  const [range, setRange] = useRange(21);
  const [municipalityId, setMunicipalityId] = useState('');
  const [daysText, setDaysText] = useState('14');
  const days = Math.min(90, Math.max(1, Number(daysText) || 14));
  const params = { ...range, municipalityId: municipalityId || undefined, days };

  const query = useQuery({
    queryKey: ['readiness', params],
    queryFn: async () => (await apiClient.get<ReadinessResponse>('/reports/readiness', { params })).data,
    placeholderData: (prev) => prev,
    // A deadline or a day's activity may have changed since the last visit.
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const data = query.data;

  const dailyHeaders = ['اليوم', 'بالبطاقة', 'بدون بطاقة', '— رقم لوحة مسجَّلة', '— رقم لوحة غير مسجَّلة', '— استثناء طارئ', 'لوحات مختلفة بلا بطاقة', 'بطاقات صدرت', 'منها أولى'];
  const dailyRows = (data?.daily ?? []).map((d) => [dayLabel(d.day), d.withCard, d.withoutCard, d.typedRegistered, d.typedUnregistered, d.emergencyOverride, d.distinctCardlessPlates, d.cardsIssued, d.firstCardsIssued]);
  const stationHeaders = ['المحطة', 'بالبطاقة', '— رقم لوحة مسجَّلة', '— رقم لوحة غير مسجَّلة', '— استثناء طارئ', 'بدون بطاقة', 'لوحات مختلفة بلا بطاقة'];
  const sortedStations = [...(data?.stations ?? [])].sort((a, b) => b.withCard + b.withoutCard - (a.withCard + a.withoutCard));
  const activeStations = sortedStations.filter((s) => s.withCard + s.withoutCard > 0);
  const quietStations = sortedStations.length - activeStations.length;
  const stationRows = sortedStations.map((s) => [s.name, s.withCard, s.typedRegistered, s.typedUnregistered, s.emergencyOverride, s.withoutCard, s.distinctCardlessPlates]);
  const officeHeaders = ['المكتب', 'بطاقات صدرت', 'منها أولى'];
  const officeRows = (data?.offices ?? []).map((o) => [o.name, o.cardsIssued, o.firstCardsIssued]);

  const headline = data?.headline ?? null;
  const verdict = headline ? verdictText(headline) : null;
  const m = data?.municipality;

  return (
    <div>
      <PageHeader
        title="الجاهزية للموعد النهائي"
        subtitle={m ? `بلدية ${m.name}` : 'التعبئات بالبطاقة وبدونها، وإصدار البطاقات'}
        actions={data && <PdfButton path="/reports/readiness/export" params={params} filename={`deadline-readiness_${range.from}_${range.to}.pdf`} />}
      />
      <RangeBar
        range={range}
        onChange={setRange}
        extra={
          <>
            {(data?.municipalities.length ?? 0) > 1 && (
              <div className="col-span-2 lg:col-span-1">
                <FieldLabel htmlFor="ready-muni">البلدية</FieldLabel>
                <select id="ready-muni" className={SELECT} value={municipalityId || data!.municipality.id} onChange={(e) => setMunicipalityId(e.target.value)}>
                  {data!.municipalities.map((x) => (
                    <option key={x.id} value={x.id}>{x.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="col-span-2 lg:col-span-1 lg:w-56">
              <TextField
                label="عدد الأيام الأخيرة للتقدير"
                inputMode="numeric"
                value={daysText}
                onChange={(e) => setDaysText(e.target.value.replace(/\D/g, '').slice(0, 2))}
                hint="من 1 إلى 90. الافتراضي 14."
                ltr
              />
            </div>
          </>
        }
      />

      {query.isLoading && <Loading />}
      {query.isError && <ErrorNote error={query.error} />}

      {data && (
        <>
          {headline && verdict && (
            <Card className="mb-5 p-4 lg:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[18px] font-extrabold text-ink lg:text-[15px]">متى نكون جاهزين؟</h2>
                <StatusPill variant="neutral" size="md">تقدير وليس حقيقة مؤكدة</StatusPill>
              </div>
              <p className="mt-3 flex items-start gap-2 text-[20px] font-extrabold leading-snug text-ink lg:text-[18px]">
                <span aria-hidden className={verdict.tone === 'danger' ? 'text-danger-dark' : verdict.tone === 'ok' ? 'text-ok' : 'text-accent-dark'}>{verdict.mark}</span>
                <span>{verdict.text}</span>
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat label="لوحات بلا بطاقة" value={num(headline.cardlessPlates)} />
                <Stat label="معدل الإصدار اليومي" value={num(headline.averagePerDay)} />
                <Stat label="أيام لازمة" value={headline.daysNeeded === null ? '—' : num(headline.daysNeeded)} />
                <Stat label="أيام متبقية" value={headline.daysLeft === null ? 'لا موعد' : num(headline.daysLeft)} />
              </div>
              <p className="mt-3 text-[14px] text-ink-soft lg:text-[12px]">
                كيف يُحسب: عدد اللوحات المختلفة التي عُبّئت دون مسح بطاقة في آخر {num(headline.windowDays)} يومًا ولا بطاقة فعّالة لها، مقسومًا على متوسط البطاقات الأولى الصادرة يوميًا في المدة نفسها. يفترض أن الإصدار يستمر بنفس الوتيرة.
              </p>
              {!headline.deadline && (
                <p className="mt-2 text-[14px] text-ink-soft lg:text-[12px]">لم يُحدَّد موعد نهائي لهذه البلدية؛ يُضبط من إدارة البلديات.</p>
              )}
            </Card>
          )}
          {!data.sees.headline && (
            <p className="mb-5 rounded-md bg-surface p-4 text-[16px] text-ink-soft lg:text-[14px]">
              التقدير الإجمالي للمديرية والإدارة. ما يظهر لك هنا هو الجزء الخاص بمحطاتك أو مكاتبك.
            </p>
          )}
          {data.approximateRows > 0 && (
            <p role="note" className="mb-5 rounded-md border border-accent bg-accent-100 p-4 text-[16px] text-ink lg:text-[14px]">
              ⚠ {num(data.approximateRows)} تعبئة في هذه الفترة طريقة تعريفها تقريبية (أُعيد ملؤها عند ترحيل النظام{data.approximateBefore ? ` قبل ${dayLabel(data.approximateBefore)}` : ''}). الأرقام قريبة لكنها ليست دقيقة تمامًا.
            </p>
          )}

          {data.sees.stations !== 'none' && (
            <>
              <SectionTitle>التعبئات يوميًا: بالبطاقة وبدونها</SectionTitle>
              {data.daily.length === 0 ? (
                <p className="text-[16px] text-ink-soft lg:text-[14px]">لا تعبئات في هذه الفترة.</p>
              ) : (
                <Card className="p-4">
                  <CardVsNoCardChart daily={data.daily} />
                  <TableView summary="عرض الأرقام في جدول">
                    <table className="w-full min-w-[640px] text-[14px]">
                      <caption className="sr-only">التعبئات اليومية بالبطاقة وبدونها</caption>
                      <thead>
                        <tr className="border-b border-surface-alt">
                          {dailyHeaders.map((h) => (
                            <th key={h} scope="col" className="px-2 py-2 text-start font-bold text-ink-soft">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.daily.map((d) => (
                          <tr key={d.day} className="border-b border-surface-alt">
                            <th scope="row" className="px-2 py-2 text-start font-bold" dir="ltr">{shortDay(d.day)}</th>
                            {[d.withCard, d.withoutCard, d.typedRegistered, d.typedUnregistered, d.emergencyOverride, d.distinctCardlessPlates, d.cardsIssued, d.firstCardsIssued].map((v, i) => (
                              <td key={i} className="px-2 py-2">{num(v)}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableView>
                  <div className="mt-3">
                    <CsvButton filename={`readiness-daily_${range.from}_${range.to}.csv`} headers={dailyHeaders} rows={dailyRows} />
                  </div>
                </Card>
              )}

              <SectionTitle>حسب المحطة</SectionTitle>
              {data.stations.length === 0 ? (
                <p className="text-[16px] text-ink-soft lg:text-[14px]">لا محطات ضمن نطاقك في هذه البلدية.</p>
              ) : (
                <>
                  <div className="space-y-3 lg:hidden">
                    {activeStations.map((s) => (
                      <Card key={s.id} className="p-4">
                        <h3 className="text-[18px] font-extrabold text-ink">{s.name}</h3>
                        <dl className="mt-2">
                          {[
                            ['بالبطاقة', s.withCard],
                            ['بدون بطاقة', s.withoutCard],
                            ['— رقم لوحة مسجَّلة', s.typedRegistered],
                            ['— رقم لوحة غير مسجَّلة', s.typedUnregistered],
                            ['— استثناء طارئ', s.emergencyOverride],
                            ['لوحات مختلفة بلا بطاقة', s.distinctCardlessPlates],
                          ].map(([label, value]) => (
                            <div key={label as string} className="flex items-baseline justify-between border-b border-surface-alt py-2 last:border-b-0">
                              <dt className="text-[16px] text-ink-soft">{label}</dt>
                              <dd className="text-[16px] font-bold text-ink">{num(value as number)}</dd>
                            </div>
                          ))}
                        </dl>
                      </Card>
                    ))}
                  </div>
                  {quietStations > 0 && (
                    <p className="mt-3 text-[16px] text-ink-soft lg:text-[14px]">{num(quietStations)} محطة بلا أي تعبئة في هذه الفترة (ليست معروضة هنا؛ هي في ملف CSV).</p>
                  )}
                  <Card className="hidden overflow-x-auto lg:block">
                    <table className="w-full text-[14px]">
                      <caption className="sr-only">التعبئات حسب المحطة</caption>
                      <thead>
                        <tr className="border-b border-surface-alt">
                          {stationHeaders.map((h) => (
                            <th key={h} scope="col" className="px-4 py-3 text-start font-bold text-ink-soft">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {activeStations.map((s) => (
                          <tr key={s.id} className="border-b border-surface-alt">
                            <th scope="row" className="px-4 py-2.5 text-start font-bold text-ink">{s.name}</th>
                            {[s.withCard, s.typedRegistered, s.typedUnregistered, s.emergencyOverride, s.withoutCard, s.distinctCardlessPlates].map((v, i) => (
                              <td key={i} className="px-4 py-2.5">{num(v)}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Card>
                  <div className="mt-3">
                    <CsvButton filename={`readiness-stations_${range.from}_${range.to}.csv`} headers={stationHeaders} rows={stationRows} />
                  </div>
                </>
              )}
            </>
          )}

          {data.sees.offices !== 'none' && (
            <>
              <SectionTitle>إصدار البطاقات يوميًا</SectionTitle>
              <Card className="p-4">
                <IssuanceChart daily={data.daily} />
                <TableView summary="عرض الأرقام حسب المكتب">
                  <table className="w-full text-[14px]">
                    <caption className="sr-only">بطاقات صدرت حسب المكتب</caption>
                    <thead>
                      <tr className="border-b border-surface-alt">
                        {officeHeaders.map((h) => (
                          <th key={h} scope="col" className="px-2 py-2 text-start font-bold text-ink-soft">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.offices.map((o) => (
                        <tr key={o.id} className="border-b border-surface-alt">
                          <th scope="row" className="px-2 py-2 text-start font-bold">{o.name}</th>
                          <td className="px-2 py-2">{num(o.cardsIssued)}</td>
                          <td className="px-2 py-2">{num(o.firstCardsIssued)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableView>
                <div className="mt-3">
                  <CsvButton filename={`readiness-offices_${range.from}_${range.to}.csv`} headers={officeHeaders} rows={officeRows} />
                </div>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
