import { arabicCount } from '@fuel-tracking/shared-types';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { Card } from '../../components/design/Card';
import { StatusPill } from '../../components/design/StatusPill';
import { PillButton } from '../../components/design/PillButton';
import { CardVsNoCardChart } from '../regreports/ReadinessCharts';
import { PdfButton, dayLabel, num } from '../regreports/common';
import type { ReadinessResponse } from '../regreports/types';
import { useAuth } from '../auth/AuthProvider';

// The top of «إدارة المحطات» and of a municipality in «إدارة البلديات»
// (phase 5B, section 4): a short row of the numbers that need a decision, then
// the deadline-readiness panel with its answer in one sentence first.

interface SummaryResponse {
  municipality: { id: string; name: string };
  registration: { cardsToday: number; activeOffices: number; offices: number; unaccountedCards: number };
  fuel: { stations: number; lowStockStations: number; unaccountedFuel: number; windowDays: number };
}

function Figure({
  label,
  value,
  unit,
  tone = 'plain',
  state,
  testId,
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: 'plain' | 'attention' | 'good';
  /** The state in words: a figure that needs a look always says so. */
  state?: string;
  testId: string;
}) {
  const bg = tone === 'attention' ? 'bg-accent-100' : 'bg-surface';
  return (
    <div className={`rounded-md p-4 shadow-sm ${bg}`} data-testid={testId}>
      <p className="text-[14px] font-bold text-ink-soft lg:text-[12px]">{label}</p>
      <p className="mt-1.5 text-[32px] font-extrabold leading-none tabular-nums text-ink lg:text-[28px]">
        {value}
        {unit && <span className="ms-1.5 text-[15px] font-bold text-ink-soft lg:text-[13px]">{unit}</span>}
      </p>
      {state && (
        <p className="mt-2">
          <StatusPill variant={tone === 'attention' ? 'warn' : 'ok'} size="md">
            {state}
          </StatusPill>
        </p>
      )}
    </div>
  );
}

export function PlaceSummaryRow({ municipalityId }: { municipalityId?: string }) {
  const { hasPermission } = useAuth();
  const allowed = hasPermission('reports:municipality');
  const query = useQuery({
    queryKey: ['ops-report', 'municipality-summary', municipalityId ?? ''],
    enabled: allowed,
    queryFn: async () =>
      (await apiClient.get<SummaryResponse>('/ops-reports/municipality-summary', { params: { municipalityId } })).data,
    staleTime: 60_000,
  });
  if (!allowed) return null;
  if (query.isLoading) return <p className="mb-4 text-[15px] text-ink-soft">جارٍ تحميل الملخص…</p>;
  if (query.isError || !query.data) return null;
  const { registration: r, fuel: f } = query.data;
  const tall = new Intl.NumberFormat('en-US');
  return (
    <section aria-label="ملخص اليوم" className="mb-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" data-testid="place-summary">
        <Figure testId="summary-cards-today" label="بطاقات صدرت اليوم" value={tall.format(r.cardsToday)} />
        <Figure
          testId="summary-offices-active"
          label="مكاتب تعمل"
          value={`${r.activeOffices} / ${r.offices}`}
          tone={r.offices > 0 && r.activeOffices < r.offices ? 'attention' : 'plain'}
          state={r.offices > 0 && r.activeOffices < r.offices ? 'بعضها مغلق' : undefined}
        />
        <Figure
          testId="summary-cards-unaccounted"
          label="بطاقات فارغة غير مبرَّرة"
          value={tall.format(r.unaccountedCards)}
          tone={r.unaccountedCards > 0 ? 'attention' : 'good'}
          state={r.unaccountedCards > 0 ? 'تحتاج مراجعة' : 'مطابقة'}
        />
        <Figure
          testId="summary-low-stock"
          label="محطات مخزونها منخفض"
          value={`${f.lowStockStations}`}
          unit={`من ${f.stations}`}
          tone={f.lowStockStations > 0 ? 'attention' : 'good'}
          state={f.lowStockStations > 0 ? 'تحتاج توريدًا' : 'كلها سليمة'}
        />
        <Figure
          testId="summary-fuel-unaccounted"
          label={`وقود غير مبرَّر (آخر ${f.windowDays} يومًا)`}
          value={tall.format(f.unaccountedFuel)}
          unit="لتر"
          tone={f.unaccountedFuel > 0 ? 'attention' : 'good'}
          state={f.unaccountedFuel > 0 ? 'تحتاج مراجعة' : 'مطابق'}
        />
      </div>
    </section>
  );
}

// ── deadline readiness ─────────────────────────────────────────────────

const WINDOWS = [7, 14, 21, 30];

function sentence(h: NonNullable<ReadinessResponse['headline']>): { text: string; badge: string; tone: 'ok' | 'warn' | 'danger' | 'neutral' } {
  switch (h.verdict) {
    case 'NONE_REMAINING':
      return { text: 'لا توجد مركبات بلا بطاقة الآن.', badge: 'لا أحد بلا بطاقة', tone: 'ok' };
    case 'NO_ISSUANCE':
      return {
        text: `لم تُصدر بطاقات أولى في آخر ${arabicCount(h.windowDays, 'day', { oblique: true })}، فلا يمكن تقدير المدة — ${arabicCount(h.cardlessPlates, 'vehicle')} بلا بطاقة.`,
        badge: 'لم تُصدر بطاقات',
        tone: 'warn',
      };
    case 'NO_DEADLINE':
      return {
        text: `يحتاج التسجيل نحو ${arabicCount(h.daysNeeded ?? 0, 'day', { oblique: true })} — لم يُحدَّد موعد نهائي بعد.`,
        badge: 'بلا موعد نهائي',
        tone: 'neutral',
      };
    case 'DEADLINE_PASSED':
      return { text: `انقضى الموعد النهائي وما زالت ${arabicCount(h.cardlessPlates, 'vehicle')} بلا بطاقة.`, badge: 'فات الموعد', tone: 'danger' };
    case 'ON_TRACK':
      return {
        text: `يحتاج التسجيل نحو ${arabicCount(h.daysNeeded ?? 0, 'day', { oblique: true })} — باقٍ على الموعد ${arabicCount(h.daysLeft ?? 0, 'day')}.`,
        badge: 'في المسار',
        tone: 'ok',
      };
    default:
      return {
        text: `يحتاج التسجيل نحو ${arabicCount(h.daysNeeded ?? 0, 'day', { oblique: true })} — باقٍ على الموعد ${arabicCount(h.daysLeft ?? 0, 'day')} فقط.`,
        badge: 'معرّض للتأخر',
        tone: 'danger',
      };
  }
}

export function ReadinessPanel({ municipalityId }: { municipalityId?: string }) {
  const { hasPermission } = useAuth();
  const [days, setDays] = useState(14);
  const allowed = hasPermission('readiness:view');
  const query = useQuery({
    queryKey: ['readiness-panel', municipalityId ?? '', days],
    enabled: allowed,
    queryFn: async () =>
      (await apiClient.get<ReadinessResponse>('/reports/readiness', { params: { municipalityId, days } })).data,
    placeholderData: (prev) => prev,
    staleTime: 0,
  });
  if (!allowed) return null;
  const data = query.data;
  const headline = data?.headline ?? null;
  const verdict = headline ? sentence(headline) : null;
  const surface = verdict?.tone === 'danger' ? 'bg-danger-100' : verdict?.tone === 'warn' ? 'bg-accent-100' : verdict?.tone === 'ok' ? 'bg-ok-100' : 'bg-surface-alt';

  return (
    <Card className="mb-5" data-testid="readiness-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-primary-100/50 px-4 py-3">
        <h2 className="text-[18px] font-extrabold text-primary-dark lg:text-[15px]">الجاهزية للموعد النهائي</h2>
        <div className="flex flex-wrap items-center gap-3">
          {data?.municipality.cardRequiredFromDate && (
            <p className="text-[15px] text-ink lg:text-[13px]">
              الموعد: <span className="font-bold tabular-nums" dir="ltr">{dayLabel(data.municipality.cardRequiredFromDate)}</span>
            </p>
          )}
          {data && (
            <PdfButton
              path="/reports/readiness/export"
              params={{ municipalityId: data.municipality.id, days }}
              filename={`deadline-readiness_${data.municipality.name}.pdf`}
            />
          )}
        </div>
      </div>

      {query.isLoading && <p className="p-4 text-[15px] text-ink-soft">جارٍ التحميل…</p>}
      {query.isError && (
        <p role="alert" className="p-4 text-[15px] font-bold text-danger-dark">
          تعذّر تحميل التقدير. أعد المحاولة بعد قليل.
        </p>
      )}

      {data && !headline && (
        <p className="p-4 text-[16px] text-ink-soft lg:text-[14px]">
          التقدير الكامل يظهر لمن يرى المحطات والمكاتب كلها في البلدية.
        </p>
      )}

      {data && headline && verdict && (
        <div className="space-y-5 p-4">
          {/* 1. the answer, in one sentence */}
          <div className={`rounded-md p-4 ${surface}`}>
            <p className="mb-2">
              <StatusPill variant={verdict.tone} size="md">{verdict.badge}</StatusPill>
            </p>
            <p className="text-[22px] font-extrabold leading-snug text-ink lg:text-[19px]" data-testid="readiness-sentence">
              {verdict.text}
            </p>
            <p className="mt-2 text-[14px] leading-[1.7] text-ink-soft lg:text-[12px]">
              تقدير وليس حقيقة مؤكدة: يفترض أن إصدار البطاقات يستمر بالوتيرة الأخيرة.
            </p>
          </div>

          {/* 2. the chart */}
          {data.daily.length > 0 ? (
            <CardVsNoCardChart daily={data.daily} />
          ) : (
            <p className="text-[16px] text-ink-soft lg:text-[14px]">لا تعبئات في الفترة لعرضها.</p>
          )}

          {/* 3. the details, and the one input, aligned */}
          <div>
            <h3 className="mb-3 text-[16px] font-extrabold text-ink lg:text-[14px]">التفاصيل</h3>
            <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                ['مركبات بلا بطاقة', num(headline.cardlessPlates)],
                ['بطاقات أولى في اليوم', num(headline.averagePerDay)],
                ['أيام يحتاجها التسجيل', headline.daysNeeded === null ? '—' : num(headline.daysNeeded)],
                ['أيام باقية', headline.daysLeft === null ? 'لا موعد' : num(headline.daysLeft)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-md border border-line p-3">
                  <dt className="text-[14px] text-ink-soft lg:text-[12px]">{label}</dt>
                  <dd className="mt-1 text-[26px] font-extrabold leading-none tabular-nums text-ink lg:text-[22px]">{value}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-4 flex flex-wrap items-center gap-3" role="group" aria-label="مدة التقدير">
              <span className="text-[15px] font-bold text-ink lg:text-[13px]">يعتمد التقدير على آخر</span>
              <div className="flex flex-wrap gap-2">
                {WINDOWS.map((w) => (
                  <PillButton
                    key={w}
                    size="field"
                    variant={days === w ? 'primary' : 'secondary'}
                    aria-pressed={days === w}
                    onClick={() => setDays(w)}
                  >
                    {w} يومًا
                  </PillButton>
                ))}
              </div>
            </div>
            <p className="mt-3 text-[14px] leading-[1.7] text-ink-soft lg:text-[12px]">
              كيف يُحسب: عدد المركبات المختلفة التي عُبّئت دون مسح بطاقة في هذه المدة ولا بطاقة فعّالة لها، مقسومًا على متوسط البطاقات الأولى الصادرة يوميًا فيها.
            </p>
          </div>

          {data.stations.length > 0 && (
            <details>
              <summary className="flex min-h-11 cursor-pointer items-center text-[16px] font-bold text-primary lg:text-[14px]">
                حسب المحطة
              </summary>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[420px] text-[16px] lg:text-[14px]">
                  <caption className="sr-only">التعبئات حسب المحطة بالبطاقة وبدونها</caption>
                  <thead>
                    <tr className="border-b-2 border-line bg-surface-alt/60">
                      <th scope="col" className="px-3 py-2 text-start font-extrabold">المحطة</th>
                      <th scope="col" className="px-3 py-2 text-start font-extrabold">بالبطاقة</th>
                      <th scope="col" className="px-3 py-2 text-start font-extrabold">بدون بطاقة</th>
                      <th scope="col" className="px-3 py-2 text-start font-extrabold">مركبات بلا بطاقة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.stations.map((s) => (
                      <tr key={s.id} className="border-b border-line">
                        <th scope="row" className="px-3 py-2.5 text-start font-bold text-ink">{s.name}</th>
                        <td className="px-3 py-2.5 tabular-nums">{num(s.withCard)}</td>
                        <td className="px-3 py-2.5 tabular-nums">{num(s.withoutCard)}</td>
                        <td className="px-3 py-2.5 tabular-nums">{num(s.distinctCardlessPlates)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>
      )}
      {municipalityId === undefined && hasPermission('reports:municipality') && (
        <p className="border-t border-line px-4 py-3 text-[14px] text-ink-soft lg:text-[12px]">
          الأرقام التفصيلية لكل مكتب ومحطة في{' '}
          <Link to="/reports?report=municipality" className="font-bold text-primary underline">
            تقارير البلدية
          </Link>
          .
        </p>
      )}
    </Card>
  );
}
