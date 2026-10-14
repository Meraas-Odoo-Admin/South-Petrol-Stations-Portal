import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { StatusPill } from '../../components/design/StatusPill';
import { useAuth } from '../auth/AuthProvider';

// The top of «إدارة المحطات» and of a municipality in «إدارة البلديات»:
// a short row of the numbers that need a decision.

interface SummaryResponse {
  municipality: { id: string; name: string };
  registration: { cardsToday: number; activeOffices: number; offices: number };
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
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="place-summary">
        <Figure testId="summary-cards-today" label="بطاقات صدرت اليوم" value={tall.format(r.cardsToday)} />
        <Figure
          testId="summary-offices-active"
          label="مكاتب تعمل"
          value={`${r.activeOffices} / ${r.offices}`}
          tone={r.offices > 0 && r.activeOffices < r.offices ? 'attention' : 'plain'}
          state={r.offices > 0 && r.activeOffices < r.offices ? 'بعضها مغلق' : undefined}
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
