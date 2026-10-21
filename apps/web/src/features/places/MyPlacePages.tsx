import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePageParam } from '../../lib/usePageParam';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { FUEL_TYPE_LABELS, STATION_STATUS_LABELS, STATION_STATUS_VARIANT } from '../../lib/labels';
import { PageHeader } from '../../components/design/PageHeader';
import { PillButton } from '../../components/design/PillButton';
import { StatusPill } from '../../components/design/StatusPill';
import { CodeText } from '../../components/design/CodeText';
import { adminErrorMessage } from '../admin/adminErrors';
import { Notice, SectionCard } from '../users/parts';
import { OfficeWorkspace, StationWorkspace } from './Workspaces';
import { SkeletonRows } from '../../components/design/Skeleton';
import { litersText, STOCK_STATUS_TEXT, STOCK_STATUS_VARIANT, type StockStatus } from '../stock/fuelStock';
import { tripoliToday } from '../regreports/common';
import {
  ActivityCard,
  OFFICE_STATUS_LABELS,
  OFFICE_STATUS_VARIANT,
  useOfficeList,
  ACTIVITY_PAGE_SIZE,
  usePlaceActivity,
  useStationList,
  type OfficeRow,
  type StationRow,
} from './placesShared';

const SELECT_CLASS =
  'h-[52px] w-full rounded-sm border border-line bg-surface-alt px-3 text-[16px] text-ink focus:outline-none focus:ring-2 focus:ring-primary-dark focus:ring-offset-2 focus:ring-offset-surface sm:w-96 lg:h-11 lg:text-[14px]';

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[14px] text-ink-soft lg:text-[12px]">{label}</dt>
      <dd className="text-[17px] font-bold text-ink lg:text-[15px]">{children}</dd>
    </div>
  );
}

// «محطتي» — the station supervisor's own station: what it is, the fuel types
// it sells (the one thing a supervisor controls about it), its employees, and
// what happened there. The supervisor reaches their own station(s) only.
// After review (21 Oct 2026): a supervisor oversees a GROUP of stations (and a
// station may have more than one supervisor). With several, «محطاتي» opens on
// all of them at a glance — today's fill-ups and liters, today's exceptions and
// the tanks — and each one opens on its usual tabs (the choice is in the address).
export function MyStationPage() {
  const stations = useStationList({});
  const [params, setParams] = useSearchParams();
  const chosen = params.get('station') ?? '';
  const list = stations.data ?? [];
  const station: StationRow | undefined = list.length === 1 ? list[0] : list.find((s) => s.id === chosen);
  const choose = (id: string) =>
    setParams((prev) => {
      const next = new URLSearchParams();
      if (id) next.set('station', id);
      // A station's own tab is kept only while staying on that station.
      if (id && prev.get('station') === id && prev.get('tab')) next.set('tab', prev.get('tab')!);
      return next;
    });

  if (stations.isLoading) return <SkeletonRows rows={6} />;
  if (stations.isError) return <Notice kind="error">تعذّر تحميل محطتك. تأكد من الاتصال ثم أعد المحاولة.</Notice>;
  if (list.length === 0) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="محطتي" />
        <Notice kind="info">حسابك غير مرتبط بأي محطة. تواصل مع مدير البلدية.</Notice>
      </div>
    );
  }
  const many = list.length > 1;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title={many ? 'محطاتي' : 'محطتي'}
        subtitle={many ? `${list.length} محطات تحت إشرافك: نشاط اليوم والمخزون، ثم كل محطة بتفاصيلها` : 'موظفو المحطة والوقود والمخزون والتقارير'}
      />
      {many && (
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="my-station" className="mb-1.5 block text-[14px] font-bold text-ink lg:text-[12px]">المحطة</label>
            <select id="my-station" value={station?.id ?? ''} onChange={(e) => choose(e.target.value)} className={SELECT_CLASS}>
              <option value="">كل محطاتي</option>
              {list.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      {station ? <MyStation key={station.id} station={station} /> : <MyStationsGlance stations={list} onOpen={choose} />}
    </div>
  );
}

interface GlanceTank {
  fuelType: string;
  fuelLabel: string;
  level: number | null;
  percentFull: number | null;
  status: StockStatus;
  fillUpsToday: number;
  dispensedToday: number;
}

// Every station of the group on one page, the worst first.
function MyStationsGlance({ stations, onOpen }: { stations: StationRow[]; onOpen: (id: string) => void }) {
  const today = tripoliToday();
  const stock = useQuery({
    queryKey: ['fuel-stock-overview', 'mine'],
    queryFn: async () =>
      (await apiClient.get<{ stations: Array<{ id: string; tanks: GlanceTank[] }> }>('/fuel-stock/overview')).data,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const exceptions = useQueries({
    queries: stations.map((s) => ({
      queryKey: ['exceptions', 'today-count', s.id, today],
      queryFn: async () =>
        (await apiClient.get<{ total: number }>('/exceptions', { params: { stationId: s.id, from: today, to: today, take: 1 } })).data.total,
      staleTime: 60_000,
    })),
  });
  const tanksOf = new Map((stock.data?.stations ?? []).map((s) => [s.id, s.tanks]));
  const RANK: Record<StockStatus, number> = { DATA_WARNING: 0, EMPTY: 1, LOW: 2, NOT_SET_UP: 3, OK: 4 };
  const rows = stations
    .map((s, i) => {
      const tanks = tanksOf.get(s.id) ?? [];
      return {
        station: s,
        tanks,
        fillUps: tanks.reduce((n, t) => n + t.fillUpsToday, 0),
        liters: tanks.reduce((n, t) => n + t.dispensedToday, 0),
        exceptions: exceptions[i]?.data,
        worst: Math.min(5, ...tanks.map((t) => RANK[t.status])),
      };
    })
    .sort((a, b) => a.worst - b.worst || a.station.name.localeCompare(b.station.name, 'ar'));
  const nf = new Intl.NumberFormat('en-US');
  const total = (pick: (r: (typeof rows)[number]) => number) => rows.reduce((n, r) => n + pick(r), 0);

  return (
    <div className="space-y-4" data-testid="my-stations-glance">
      <section aria-label="اليوم في كل محطاتي" className="grid grid-cols-3 gap-3">
        {[
          { label: 'تعبئات اليوم', value: nf.format(total((r) => r.fillUps)) },
          { label: 'لترات اليوم', value: litersText(total((r) => r.liters)) },
          { label: 'استثناءات اليوم', value: nf.format(total((r) => r.exceptions ?? 0)) },
        ].map((k) => (
          <div key={k.label} className="rounded-md bg-surface p-4 shadow-sm">
            <p className="text-[14px] font-bold text-ink-soft lg:text-[12px]">{k.label}</p>
            <p className="mt-1.5 text-[24px] font-extrabold tabular-nums text-ink lg:text-[22px]">{stock.data ? k.value : '—'}</p>
          </div>
        ))}
      </section>
      {stock.isError && <Notice kind="error">تعذّر تحميل المخزون. تأكد من الاتصال ثم أعد المحاولة.</Notice>}
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.station.id}>
            <button
              type="button"
              onClick={() => onOpen(r.station.id)}
              className="block w-full rounded-md bg-surface p-4 text-start shadow-sm hover:ring-2 hover:ring-primary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-dark"
              data-testid={`my-station-row-${r.station.id}`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[18px] font-extrabold text-ink lg:text-[16px]">{r.station.name}</p>
                <StatusPill variant={STATION_STATUS_VARIANT[r.station.status] ?? 'neutral'} size="md">
                  {STATION_STATUS_LABELS[r.station.status] ?? r.station.status}
                </StatusPill>
              </div>
              <p className="mt-1 text-[15px] text-ink-soft lg:text-[13px]">
                اليوم: <span className="font-bold tabular-nums text-ink">{nf.format(r.fillUps)}</span> تعبئة ·{' '}
                <span className="font-bold tabular-nums text-ink">{litersText(r.liters)}</span> ·{' '}
                <span className={`font-bold tabular-nums ${(r.exceptions ?? 0) > 0 ? 'text-danger-dark' : 'text-ink'}`}>
                  {r.exceptions === undefined ? '—' : nf.format(r.exceptions)}
                </span>{' '}
                استثناء
              </p>
              {r.tanks.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {r.tanks.map((t) => (
                    <span key={t.fuelType} className="inline-flex items-center gap-1.5 text-[14px] text-ink lg:text-[12px]">
                      {t.fuelLabel}
                      {t.level !== null && <span className="tabular-nums text-ink-soft">{litersText(t.level)}</span>}
                      <StatusPill variant={STOCK_STATUS_VARIANT[t.status]} size="sm">
                        {STOCK_STATUS_TEXT[t.status]}
                      </StatusPill>
                    </span>
                  ))}
                </div>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MyStation({ station }: { station: StationRow }) {
  const queryClient = useQueryClient();
  const activityPage = usePageParam(ACTIVITY_PAGE_SIZE);
  const activity = usePlaceActivity('stations', station.id, activityPage.skip);
  const available = station.fuelAvailability.filter((f) => f.isAvailable).map((f) => f.fuelType);
  const [fuelTypes, setFuelTypes] = useState<string[]>(available);
  const [saved, setSaved] = useState(false);
  useEffect(() => setFuelTypes(available), [station.id, available.join(',')]);

  const save = useMutation({
    mutationFn: async () => apiClient.patch(`/stations/${station.id}`, { fuelTypes }),
    onSuccess: async () => {
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: ['stations'] });
    },
  });
  const changed = fuelTypes.length !== available.length || fuelTypes.some((f) => !available.includes(f));

  return (
    <>
      <header className="rounded-md bg-surface p-4 shadow-sm lg:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[22px] font-extrabold leading-tight text-ink lg:text-xl">{station.name}</h2>
            <CodeText size="md">{station.internalCode}</CodeText>
          </div>
          <StatusPill variant={STATION_STATUS_VARIANT[station.status] ?? 'neutral'} size="md">
            {STATION_STATUS_LABELS[station.status] ?? station.status}
          </StatusPill>
        </div>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <Fact label="الشركة">{station.company?.name ?? '—'}</Fact>
          <Fact label="البلدية">{station.municipality?.name ?? '—'}</Fact>
          <Fact label="رقم المحطة">
            <span dir="ltr">{station.stationNumber}</span>
          </Fact>
        </dl>
      </header>

      <StationWorkspace
        stationId={station.id}
        stationName={station.name}
        staffTitle="موظفو المحطة"
        staffEmpty="لا يوجد موظفون في محطتك بعد. أنشئ أول حساب وسيظهر هنا."
        createParams={{ kind: 'PETROL_STATION', place: station.id, placeName: station.name }}
        overview={
          <>
      <SectionCard title="الوقود الذي تبيعه المحطة" description="هذا ما تتحكم به أنت في محطتك. بقية بيانات المحطة لمدير البلدية.">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            {Object.entries(FUEL_TYPE_LABELS).map(([value, label]) => {
              const checked = fuelTypes.includes(value);
              return (
                <label
                  key={value}
                  className={`flex min-h-[48px] cursor-pointer items-center gap-2 rounded-full border-2 px-4 text-[16px] font-bold lg:min-h-[40px] lg:text-[14px] ${
                    checked ? 'border-primary bg-primary-100 text-primary-dark' : 'border-line text-ink-soft'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      setSaved(false);
                      setFuelTypes(e.target.checked ? [...fuelTypes, value] : fuelTypes.filter((f) => f !== value));
                    }}
                    className="h-5 w-5 accent-primary"
                  />
                  {label}
                </label>
              );
            })}
          </div>
          {save.isError && <Notice kind="error">{adminErrorMessage(save.error, 'تعذّر حفظ أنواع الوقود.')}</Notice>}
          {saved && <Notice kind="success">تم حفظ أنواع الوقود.</Notice>}
          <PillButton size="field" disabled={!changed || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'جارٍ الحفظ…' : 'حفظ أنواع الوقود'}
          </PillButton>
          <p className="text-[14px] text-ink-soft lg:text-[12px]">سعة الخزانات والتوريد والمستوى في تبويب «الوقود والمخزون».</p>
        </div>
      </SectionCard>


      <ActivityCard
        activity={activity.data}
        paging={{ skip: activityPage.skip, setSkip: activityPage.setSkip }}
        loading={activity.isLoading}
        summary={
          activity.data && (
            <p className="mb-3 text-[16px] text-ink lg:text-[14px]">
              تعبئات آخر 30 يومًا: <span className="font-extrabold">{activity.data.fillUpsLast30Days ?? 0}</span>
            </p>
          )
        }
      />
          </>
        }
      />
    </>
  );
}

// «مكتبي» — the office manager's own office: its details,
// its employees, and what happened there.
export function MyOfficePage() {
  const offices = useOfficeList({});
  const [chosen, setChosen] = useState('');
  const list = offices.data ?? [];
  const office: OfficeRow | undefined = list.length === 1 ? list[0] : list.find((o) => o.id === chosen);
  const activityPage = usePageParam(ACTIVITY_PAGE_SIZE);
  const activity = usePlaceActivity('registration-stations', office?.id, activityPage.skip);

  if (offices.isLoading) return <SkeletonRows rows={6} />;
  if (offices.isError) return <Notice kind="error">تعذّر تحميل مكتبك. تأكد من الاتصال ثم أعد المحاولة.</Notice>;
  if (list.length === 0) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="مكتبي" />
        <Notice kind="info">حسابك غير مرتبط بأي مكتب تسجيل. تواصل مع مدير البلدية.</Notice>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="مكتبي" subtitle="موظفو المكتب وما جرى فيه اليوم" />
      {list.length > 1 && (
        <div>
          <label htmlFor="my-office" className="mb-1.5 block text-[14px] font-bold text-ink lg:text-[12px]">المكتب</label>
          <select id="my-office" value={chosen} onChange={(e) => setChosen(e.target.value)} className={SELECT_CLASS}>
            <option value="">اختر مكتبك</option>
            {list.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {!office ? (
        <Notice kind="info">اختر المكتب أولًا.</Notice>
      ) : (
        <>
          <header className="rounded-md bg-surface p-4 shadow-sm lg:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-[22px] font-extrabold leading-tight text-ink lg:text-xl">{office.name}</h2>
                <CodeText size="md">{office.internalCode}</CodeText>
              </div>
              <StatusPill variant={OFFICE_STATUS_VARIANT[office.status]} size="md">
                {OFFICE_STATUS_LABELS[office.status]}
              </StatusPill>
            </div>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <Fact label="البلدية">{office.municipality.name}</Fact>
              <Fact label="العنوان">{office.address}</Fact>
              {office.workingHours && <Fact label="ساعات العمل">{office.workingHours}</Fact>}
            </dl>
          </header>

          <OfficeWorkspace
            officeId={office.id}
            officeName={office.name}
            staffTitle="موظفو المكتب"
            staffEmpty="لا يوجد موظفو تسجيل في مكتبك بعد. أنشئ أول حساب وسيظهر هنا."
            createParams={{ kind: 'REGISTRATION', place: office.id, placeName: office.name }}
            overview={
              <>

          <ActivityCard
            activity={activity.data}
            paging={{ skip: activityPage.skip, setSkip: activityPage.setSkip }}
            loading={activity.isLoading}
            summary={
              activity.data && (
                <p className="mb-3 text-[16px] text-ink lg:text-[14px]">
                  آخر 30 يومًا: مركبات مسجّلة <span className="font-extrabold">{activity.data.vehiclesLast30Days ?? 0}</span> · بطاقات
                  مُصدرة <span className="font-extrabold">{activity.data.cardsLast30Days ?? 0}</span>
                </p>
              )
            }
          />
              </>
            }
          />
        </>
      )}
    </div>
  );
}
