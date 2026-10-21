import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { PageHeader } from '../../components/design/PageHeader';
import { StatusPill } from '../../components/design/StatusPill';
import { SkeletonRows } from '../../components/design/Skeleton';
import { TabPanel, Tabs, useTab, type TabDef } from '../../components/design/Tabs';
import { Icon, ICONS } from '../../components/icons';
import { Notice } from '../users/parts';
import { useAuth } from '../auth/AuthProvider';
import { useMunicipalityList, useStation } from '../places/placesShared';
import { FuelStockPanel } from '../stock/FuelStockPanel';
import { DailyReportPage } from '../reports/DailyReportPage';
import { OpsReportPanel } from '../reports/OpsReportPanel';
import { stamp } from '../regreports/common';
import { litersText, STOCK_STATUS_TEXT, STOCK_STATUS_VARIANT, type StockStatus } from '../stock/fuelStock';

// After review (21 Oct 2026): every fill-up is a fixed amount, so the liters
// dispensed are an estimate; «تقرير التوريد والتعبئة» (a tab of this screen,
// and of each station) sets the vehicles filled beside the fuel delivered.
//
// «مراقبة المحطات» (after review, 19 Oct 2026) — the municipality manager's
// screen for the stations' fuel: every station's tanks at a glance, which
// need a delivery, and, per station, the deliveries and resets (recorded here
// and nowhere else), every fill-up, and the reports. Each fill-up is taken off
// its station's stock by the server; nobody types a level.

interface OverviewTank {
  fuelType: string;
  fuelLabel: string;
  configured: boolean;
  capacityLiters: number | null;
  level: number | null;
  percentFull: number | null;
  status: StockStatus;
  dispensedToday: number;
  fillUpsToday: number;
  dispensedWeek: number;
  daysLeft: number | null;
  lastDeliveryAt: string | null;
  lastDeliveryLiters: number | null;
  lastFillUpAt: string | null;
}

interface OverviewStation {
  id: string;
  name: string;
  internalCode: string;
  locality: string | null;
  status: string;
  tanks: OverviewTank[];
}

interface Overview {
  threshold: number;
  totals: {
    stations: number;
    low: number;
    empty: number;
    notSetUp: number;
    dispensedToday: number;
    fillUpsToday: number;
    byFuel: Array<{ fuelType: string; fuelLabel: string; level: number; capacityLiters: number; dispensedToday: number }>;
  };
  stations: OverviewStation[];
}

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const SELECT_CLASS =
  'h-[52px] w-full rounded-sm border border-line bg-surface-alt px-3 text-[16px] text-ink focus:outline-none focus:ring-2 focus:ring-primary-dark lg:h-11 lg:text-[14px] sm:w-72';

// The worse a station's worst tank, the higher it is on the list.
const RANK: Record<StockStatus, number> = { DATA_WARNING: 0, EMPTY: 1, LOW: 2, NOT_SET_UP: 3, OK: 4 };
const worst = (s: OverviewStation) => Math.min(...s.tanks.map((t) => RANK[t.status]), 5);

type Show = 'all' | 'attention' | 'not-set-up';

function Figure({ label, value, unit, tone = 'plain', onClick, active }: { label: string; value: string; unit?: string; tone?: 'plain' | 'attention'; onClick?: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      disabled={!onClick}
      onClick={onClick}
      aria-pressed={onClick ? active : undefined}
      className={`rounded-md p-4 text-start shadow-sm disabled:cursor-default ${tone === 'attention' ? 'bg-accent-100' : 'bg-surface'} ${
        active ? 'ring-2 ring-primary' : 'enabled:hover:ring-2 enabled:hover:ring-primary-100'
      }`}
    >
      <p className="text-[14px] font-bold text-ink-soft lg:text-[12px]">{label}</p>
      <p className="mt-1.5 text-[30px] font-extrabold leading-none tabular-nums text-ink lg:text-[26px]">
        {value}
        {unit && <span className="ms-1.5 text-[15px] font-bold text-ink-soft lg:text-[13px]">{unit}</span>}
      </p>
    </button>
  );
}

function TankLine({ tank }: { tank: OverviewTank }) {
  const bar = tank.status === 'OK' ? '#0D5C52' : '#B97A1A';
  return (
    <div className="py-2.5" data-testid={`monitor-tank-${tank.fuelType}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[16px] font-bold text-ink lg:text-[14px]">{tank.fuelLabel}</p>
        <StatusPill variant={STOCK_STATUS_VARIANT[tank.status]} size="md">
          {STOCK_STATUS_TEXT[tank.status]}
        </StatusPill>
      </div>
      {tank.configured && (
        <>
          {tank.status !== 'DATA_WARNING' && (
            <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-surface-alt" role="img" aria-label={`${tank.percentFull ?? 0}% من السعة`}>
              <div className="h-full rounded-full" style={{ width: `${tank.percentFull ?? 0}%`, background: bar }} />
            </div>
          )}
          <p className="mt-1.5 text-[14px] leading-[1.7] text-ink-soft lg:text-[12px]">
            <span className="font-bold tabular-nums text-ink">{tank.status === 'DATA_WARNING' ? 'تحت الصفر — راجع السجل' : litersText(tank.level)}</span>
            {' '}من {litersText(tank.capacityLiters)}
            {tank.percentFull !== null && <> ({tank.percentFull}%)</>}
            {' · '}صُرف اليوم {litersText(tank.dispensedToday)}
            {tank.daysLeft !== null && <> · يكفي نحو {nf.format(tank.daysLeft)} يوم</>}
          </p>
          <p className="text-[13px] leading-[1.7] text-ink-faint lg:text-[12px]">
            {tank.lastDeliveryAt ? <>آخر توريد {litersText(tank.lastDeliveryLiters)} في {stamp(tank.lastDeliveryAt)}</> : 'لم يُسجَّل توريد بعد'}
            {tank.lastFillUpAt && <> · آخر تعبئة {stamp(tank.lastFillUpAt)}</>}
          </p>
        </>
      )}
      {!tank.configured && <p className="mt-1 text-[14px] text-ink-soft lg:text-[12px]">لم تُضبط سعة الخزان. افتح المحطة واضبطها.</p>}
    </div>
  );
}

export function StationsMonitoringPage() {
  const municipalities = useMunicipalityList();
  const choices = municipalities.data ?? [];
  const [chosenId, setChosenId] = useState('');
  const municipality = choices.find((m) => m.id === chosenId) ?? choices[0] ?? null;
  const [show, setShow] = useState<Show>('all');
  const [q, setQ] = useState('');
  const views: TabDef[] = [
    { key: 'stations', label: 'المحطات' },
    { key: 'supply', label: 'تقرير التوريد والتعبئة' },
  ];
  const [view, setView] = useTab(views, 'view');

  const overview = useQuery({
    queryKey: ['fuel-stock-overview', municipality?.id ?? ''],
    enabled: Boolean(municipality),
    queryFn: async () => (await apiClient.get<Overview>('/fuel-stock/overview', { params: { municipalityId: municipality!.id } })).data,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const data = overview.data;
  const needle = q.trim();
  const rows = (data?.stations ?? [])
    .filter((s) => (show === 'attention' ? s.tanks.some((t) => ['LOW', 'EMPTY', 'DATA_WARNING'].includes(t.status)) : true))
    .filter((s) => (show === 'not-set-up' ? s.tanks.some((t) => t.status === 'NOT_SET_UP') : true))
    .filter((s) => !needle || s.name.includes(needle) || s.internalCode.includes(needle) || (s.locality ?? '').includes(needle))
    .sort((a, b) => worst(a) - worst(b) || a.name.localeCompare(b.name, 'ar'));
  const attention = data ? data.totals.low + data.totals.empty : 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title="مراقبة المحطات"
        subtitle={municipality ? `مخزون الوقود والتوريد والصرف في محطات ${municipality.name}` : 'مخزون الوقود والتوريد والصرف في المحطات'}
      />

      {choices.length > 1 && (
        <div>
          <label htmlFor="mon-muni" className="mb-1.5 block text-[14px] font-bold text-ink lg:text-[12px]">
            البلدية
          </label>
          <select id="mon-muni" value={municipality?.id ?? ''} onChange={(e) => setChosenId(e.target.value)} className={SELECT_CLASS}>
            {choices.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {(municipalities.isError || overview.isError) && <Notice kind="error">تعذّر تحميل المحطات. تأكد من الاتصال ثم أعد المحاولة.</Notice>}
      {overview.isLoading && <SkeletonRows rows={5} />}

      <Tabs tabs={views} value={view} onChange={setView} label="مراقبة المحطات" />
      {view === 'supply' && municipality && (
        <div className="pt-4" data-testid="monitor-supply">
          <OpsReportPanel key={municipality.id} report="supply" fixedMunicipalityId={municipality.id} />
        </div>
      )}

      {view === 'stations' && data && (
        <>
          <section aria-label="ملخص المحطات" className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="monitor-summary">
            <Figure label="المحطات" value={nf.format(data.totals.stations)} onClick={() => setShow('all')} active={show === 'all'} />
            <Figure
              label="تحتاج توريدًا"
              value={nf.format(attention)}
              tone={attention > 0 ? 'attention' : 'plain'}
              onClick={() => setShow('attention')}
              active={show === 'attention'}
            />
            <Figure
              label="خزانات غير مضبوطة"
              value={nf.format(data.totals.notSetUp)}
              tone={data.totals.notSetUp > 0 ? 'attention' : 'plain'}
              onClick={() => setShow('not-set-up')}
              active={show === 'not-set-up'}
            />
            <Figure label={`صُرف اليوم (${nf.format(data.totals.fillUpsToday)} تعبئة)`} value={nf.format(data.totals.dispensedToday)} unit="لتر" />
          </section>

          {data.totals.byFuel.length > 0 && (
            <section aria-label="المخزون حسب نوع الوقود" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.totals.byFuel.map((f) => (
                <div key={f.fuelType} className="rounded-md bg-surface p-4 shadow-sm">
                  <p className="text-[14px] font-bold text-ink-soft lg:text-[12px]">مخزون {f.fuelLabel} في كل المحطات</p>
                  <p className="mt-1 text-[22px] font-extrabold tabular-nums text-ink lg:text-[20px]">
                    {litersText(f.level)} <span className="text-[14px] font-bold text-ink-soft lg:text-[12px]">من {litersText(f.capacityLiters)}</span>
                  </p>
                  <p className="text-[14px] text-ink-soft lg:text-[12px]">صُرف اليوم {litersText(f.dispensedToday)}</p>
                </div>
              ))}
            </section>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full sm:w-80">
              <label htmlFor="mon-q" className="mb-1.5 block text-[14px] font-bold text-ink lg:text-[12px]">
                بحث
              </label>
              <input
                id="mon-q"
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="اسم المحطة أو رمزها أو المنطقة"
                className="h-[52px] w-full rounded-sm border border-line bg-surface-alt px-3 text-[16px] text-ink focus:outline-none focus:ring-2 focus:ring-primary-dark lg:h-11 lg:text-[14px]"
              />
            </div>
            <p className="pb-2 text-[14px] text-ink-soft lg:text-[12px]">
              {nf.format(rows.length)} محطة · الأسوأ حالًا أولًا · يُنبَّه تحت {litersText(data.threshold)}
            </p>
          </div>

          {rows.length === 0 ? (
            <p className="rounded-md bg-surface p-6 text-center text-[15px] text-ink-soft shadow-sm lg:text-[13px]">لا توجد محطات تطابق العرض.</p>
          ) : (
            <ul className="grid gap-3 lg:grid-cols-2" data-testid="monitor-stations">
              {rows.map((s) => (
                <li key={s.id}>
                  <Link
                    to={`/monitoring/stations/${s.id}`}
                    className="block rounded-md bg-surface p-4 shadow-sm hover:ring-2 hover:ring-primary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-dark"
                    data-testid={`monitor-station-${s.id}`}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-[18px] font-extrabold text-ink lg:text-[16px]">{s.name}</p>
                      <p className="text-[13px] text-ink-faint lg:text-[12px]">
                        <bdi dir="ltr" className="font-mono">{s.internalCode}</bdi>
                        {s.locality ? ` · ${s.locality}` : ''}
                      </p>
                    </div>
                    {s.tanks.length === 0 ? (
                      <p className="mt-2 text-[14px] text-ink-soft lg:text-[12px]">لا تبيع المحطة أي نوع وقود حاليًا.</p>
                    ) : (
                      <div className="mt-1 divide-y divide-line-soft">
                        {s.tanks.map((t) => (
                          <TankLine key={t.fuelType} tank={t} />
                        ))}
                      </div>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

// One station in «مراقبة المحطات»: its tanks (deliveries, corrections, the
// capacity and the reset are done here), every fill-up of a day, and the
// station's reports.
export function StationMonitorPage() {
  const { stationId } = useParams();
  const { hasPermission } = useAuth();
  const station = useStation(stationId);
  const canReports = hasPermission('reports:view');
  const tabs: TabDef[] = [
    { key: 'stock', label: 'المخزون والتوريد' },
    { key: 'supply', label: 'التوريد والتعبئة' },
    ...(canReports ? [{ key: 'fillups', label: 'الصرف (التعبئات)' }, { key: 'reports', label: 'التقارير' }] : []),
  ];
  const [tab, setTab] = useTab(tabs);
  if (!stationId) return null;
  const name = station.data?.name ?? '';

  return (
    <div className="space-y-4">
      <Link
        to="/monitoring"
        className="inline-flex min-h-[44px] items-center gap-2 rounded-full pe-3 text-[16px] font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-dark lg:text-[14px]"
      >
        <Icon d={ICONS.arrowBack} size={18} />
        العودة إلى مراقبة المحطات
      </Link>
      {station.isError && <Notice kind="error">تعذّر فتح هذه المحطة. قد لا تكون ضمن بلديتك.</Notice>}
      <PageHeader title={name || 'المحطة'} subtitle={station.data ? `مراقبة الوقود — ${station.data.internalCode}` : undefined} />
      <Tabs tabs={tabs} value={tab} onChange={setTab} label={`${name}: أقسام`} />

      <TabPanel tab="stock" value={tab}>
        <FuelStockPanel stationId={stationId} stationName={name} />
      </TabPanel>
      <TabPanel tab="supply" value={tab}>
        <OpsReportPanel report="supply" fixedStationId={stationId} />
      </TabPanel>
      {canReports && (
        <>
          <TabPanel tab="fillups" value={tab}>
            <DailyReportPage fixedStationId={stationId} embedded />
          </TabPanel>
          <TabPanel tab="reports" value={tab}>
            <OpsReportPanel report="station" fixedStationId={stationId} />
          </TabPanel>
        </>
      )}
    </div>
  );
}
