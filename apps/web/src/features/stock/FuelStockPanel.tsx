import { useEffect, useMemo, useState } from 'react';
import { usePageParam } from '../../lib/usePageParam';
import { Pagination } from '../../components/Pagination';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { apiClient } from '../../lib/apiClient';
import { FUEL_TYPE_LABELS } from '../../lib/labels';
import { Card } from '../../components/design/Card';
import { Dialog } from '../../components/design/Dialog';
import { PillButton } from '../../components/design/PillButton';
import { StatusPill } from '../../components/design/StatusPill';
import { Switch } from '../../components/design/Switch';
import { TextField, TextAreaField } from '../../components/design/TextField';
import { adminErrorMessage } from '../admin/adminErrors';
import { Notice, SectionCard } from '../users/parts';
import { useAuth } from '../auth/AuthProvider';
import { stamp, tripoliToday, addDays, shortDay } from '../regreports/common';
import type { OpsReport } from '../reports/OpsReportView';
import {
  litersText,
  STOCK_STATUS_TEXT,
  STOCK_STATUS_VARIANT,
  FUEL_ENTRIES_PAGE_SIZE,
  useFuelEntries,
  useFuelStock,
  type FuelEntry,
  type FuelLevel,
} from './fuelStock';

// «الوقود والمخزون» — one station's tanks (phase 5B). The level is computed by
// the server from the opening level, the deliveries and the fill-ups; nobody
// types it. Deliveries are never edited: a mistake is a linked correction with
// a reason, and a reset to zero is its own recorded entry.

const RESET_WORD = 'تصفير';
const TEAL = '#0D5C52';
const AMBER = '#B97A1A';

const nowLocalInput = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

function numberOr(value: string): number | null {
  const n = Number(value.replace(/[^\d.]/g, ''));
  return value.trim() !== '' && Number.isFinite(n) ? n : null;
}

// ── a tank card ────────────────────────────────────────────────────────

function LevelCard({
  level,
  canManage,
  onSetup,
  onDeliver,
  onReset,
}: {
  level: FuelLevel;
  canManage: boolean;
  onSetup: () => void;
  onDeliver: () => void;
  onReset: () => void;
}) {
  const warning = level.status === 'DATA_WARNING';
  const barColor = level.status === 'OK' ? TEAL : AMBER;
  return (
    <Card className="p-4" data-testid={`fuel-card-${level.fuelType}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-[20px] font-extrabold text-ink lg:text-[17px]">{level.fuelLabel}</h3>
        <StatusPill variant={STOCK_STATUS_VARIANT[level.status]} size="md">
          {STOCK_STATUS_TEXT[level.status]}
        </StatusPill>
      </div>

      {!level.configured ? (
        <div className="mt-3 space-y-3">
          <p className="text-[16px] leading-[1.7] text-ink-soft lg:text-[14px]">
            لم يُضبط خزان هذا النوع بعد. أدخل سعة الخزان والمستوى الحالي لتبدأ المنظومة بحساب المخزون.
          </p>
          {canManage && (
            <PillButton size="field" data-testid={`fuel-setup-${level.fuelType}`} onClick={onSetup}>
              ضبط الخزان
            </PillButton>
          )}
        </div>
      ) : (
        <>
          <p className="mt-3 text-[34px] font-extrabold leading-none tabular-nums text-ink lg:text-[30px]" data-testid={`fuel-level-${level.fuelType}`}>
            {warning ? 'غير معروف' : litersText(level.level)}
          </p>
          {warning ? (
            <p className="mt-2 text-[15px] leading-[1.7] text-ink lg:text-[13px]">
              المخزون المحسوب أقل من الصفر: يوجد توريد غير مسجَّل أو مستوى افتتاحي غير صحيح.
              {level.detail?.computedLevel !== undefined && (
                <> الرقم المحسوب <span dir="ltr" className="font-bold tabular-nums">{Math.round(level.detail.computedLevel)}</span> لتر.</>
              )}
            </p>
          ) : (
            <div className="mt-3">
              <div
                role="img"
                aria-label={`${level.percentFull ?? 0}% من سعة الخزان`}
                className="h-3 overflow-hidden rounded-full bg-surface-alt"
              >
                <div className="h-full rounded-full" style={{ width: `${level.percentFull ?? 0}%`, background: barColor }} />
              </div>
              <p className="mt-1.5 text-[14px] text-ink-soft lg:text-[12px]">
                {level.percentFull}% من سعة {litersText(level.capacityLiters)}
              </p>
            </div>
          )}
          {level.detail && (
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-3">
              <div>
                <dt className="text-[15px] lg:text-[13px] text-ink-soft">منذ آخر نقطة بداية</dt>
                <dd className="text-[15px] font-bold text-ink tabular-nums">{litersText(level.detail.delivered)} توريد</dd>
              </div>
              <div>
                <dt className="text-[15px] lg:text-[13px] text-ink-soft">المصروف بالتعبئات</dt>
                <dd className="text-[15px] font-bold text-ink tabular-nums">{litersText(level.detail.dispensed)}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-[15px] lg:text-[13px] text-ink-soft">
                  {level.detail.lastResetAt ? 'آخر تصفير' : 'المستوى الافتتاحي'}
                </dt>
                <dd className="text-[15px] font-bold text-ink">
                  {level.detail.lastResetAt
                    ? stamp(level.detail.lastResetAt)
                    : `${litersText(level.detail.openingLevelLiters)} في ${stamp(level.detail.openedAt)}`}
                </dd>
              </div>
            </dl>
          )}
          {canManage && (
            <div className="mt-4 flex flex-wrap gap-2.5">
              <PillButton size="field" data-testid={`fuel-deliver-${level.fuelType}`} onClick={onDeliver}>
                تسجيل توريد
              </PillButton>
              <PillButton size="field" variant="secondary" onClick={onSetup}>
                تعديل السعة
              </PillButton>
              <PillButton size="field" variant="danger" data-testid={`fuel-reset-${level.fuelType}`} onClick={onReset}>
                تصفير المستوى
              </PillButton>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

// ── dialogs ────────────────────────────────────────────────────────────

function useRefreshStock(stationId: string) {
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.invalidateQueries({ queryKey: ['fuel-stock', stationId] });
    await queryClient.invalidateQueries({ queryKey: ['ops-report'] });
  };
}

function SetupDialog({
  stationId,
  level,
  onClose,
}: {
  stationId: string;
  level: FuelLevel;
  onClose: () => void;
}) {
  const refresh = useRefreshStock(stationId);
  const [capacity, setCapacity] = useState(level.capacityLiters ? String(level.capacityLiters) : '');
  const [opening, setOpening] = useState(level.detail ? String(level.detail.openingLevelLiters) : '');
  const [error, setError] = useState<string | null>(null);
  const editing = level.configured;

  const save = useMutation({
    mutationFn: async () =>
      apiClient.put(`/stations/${stationId}/fuel-stock/${level.fuelType}/storage`, {
        capacityLiters: numberOr(capacity),
        openingLevelLiters: numberOr(opening),
      }),
    onSuccess: async () => {
      await refresh();
      onClose();
    },
    onError: (err) => setError(adminErrorMessage(err, 'تعذّر حفظ الخزان. تحقّق من الأرقام.')),
  });

  const capacityValue = numberOr(capacity);
  const openingValue = numberOr(opening);
  const valid = capacityValue !== null && capacityValue > 0 && openingValue !== null && openingValue >= 0;

  return (
    <Dialog
      open
      title={`${editing ? 'تعديل' : 'ضبط'} خزان ${level.fuelLabel}`}
      busy={save.isPending}
      onClose={onClose}
      footer={
        <>
          <PillButton size="field" variant="secondary" disabled={save.isPending} onClick={onClose}>
            رجوع
          </PillButton>
          <PillButton size="field" disabled={!valid || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'جارٍ الحفظ…' : 'حفظ'}
          </PillButton>
        </>
      }
    >
      <div className="space-y-4">
        <TextField
          label="سعة الخزان (لتر)"
          inputMode="decimal"
          ltr
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
        />
        <TextField
          label="المستوى الحالي عند بدء استخدام المنظومة (لتر)"
          inputMode="decimal"
          ltr
          value={opening}
          disabled={editing && level.detail !== undefined && level.detail.delivered + level.detail.dispensed > 0}
          disabledReason="لا يتغيّر المستوى الافتتاحي بعد تسجيل توريد أو تعبئة."
          hint="المستوى الفعلي في الخزان الآن. المنظومة تحسب الباقي بنفسها بعد ذلك."
          onChange={(e) => setOpening(e.target.value)}
        />
        {error && <Notice kind="error">{error}</Notice>}
      </div>
    </Dialog>
  );
}

function DeliveryDialog({ stationId, level, onClose }: { stationId: string; level: FuelLevel; onClose: () => void }) {
  const refresh = useRefreshStock(stationId);
  const [when, setWhen] = useState(nowLocalInput());
  // Left alone, the delivery is stamped with the server's own clock when it is
  // saved; only a time the person actually chose is sent.
  const [whenChosen, setWhenChosen] = useState(false);
  const [liters, setLiters] = useState('');
  const [plate, setPlate] = useState('');
  const [waybill, setWaybill] = useState('');
  const [driver, setDriver] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () =>
      apiClient.post(`/stations/${stationId}/fuel-stock/${level.fuelType}/deliveries`, {
        liters: numberOr(liters),
        ...(whenChosen ? { occurredAt: new Date(when).toISOString() } : {}),
        truckPlate: plate.trim(),
        waybillNumber: waybill.trim(),
        ...(driver.trim() ? { driverName: driver.trim() } : {}),
      }),
    onSuccess: async () => {
      await refresh();
      onClose();
    },
    onError: (err) => setError(adminErrorMessage(err, 'تعذّر تسجيل التوريد. تحقّق من البيانات.')),
  });
  const litersValue = numberOr(liters);
  const valid = litersValue !== null && litersValue > 0 && plate.trim().length >= 2 && waybill.trim().length >= 1 && when !== '';

  return (
    <Dialog
      open
      title={`تسجيل توريد ${level.fuelLabel}`}
      busy={save.isPending}
      onClose={onClose}
      footer={
        <>
          <PillButton size="field" variant="secondary" disabled={save.isPending} onClick={onClose}>
            رجوع
          </PillButton>
          <PillButton size="field" data-testid="delivery-save" disabled={!valid || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'جارٍ الحفظ…' : 'تسجيل التوريد'}
          </PillButton>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="delivery-when" className="mb-1.5 block text-[14px] font-bold text-ink lg:text-[12px]">
            تاريخ ووقت التوريد
          </label>
          <input
            id="delivery-when"
            type="datetime-local"
            dir="ltr"
            value={when}
            max={nowLocalInput()}
            onChange={(e) => {
              setWhen(e.target.value);
              setWhenChosen(true);
            }}
            className="h-[52px] w-full rounded-sm border border-line bg-surface-alt px-3.5 text-[16px] text-ink focus:outline-none focus:ring-2 focus:ring-accent lg:text-[14px]"
          />
        </div>
        <TextField label="الكمية (لتر)" data-testid="delivery-liters" inputMode="decimal" ltr value={liters} onChange={(e) => setLiters(e.target.value)} />
        <TextField label="رقم لوحة الشاحنة" data-testid="delivery-plate" ltr value={plate} onChange={(e) => setPlate(e.target.value)} />
        <TextField label="رقم البوليصة" data-testid="delivery-waybill" ltr value={waybill} onChange={(e) => setWaybill(e.target.value)} />
        <TextField label="اسم السائق (اختياري)" value={driver} onChange={(e) => setDriver(e.target.value)} />
        <p className="text-[14px] leading-[1.7] text-ink-soft lg:text-[12px]">
          لا يُعدَّل التوريد بعد حفظه؛ إن أخطأت تُضاف إليه سجلًا تصحيحيًا بسببه.
        </p>
        {error && <Notice kind="error">{error}</Notice>}
      </div>
    </Dialog>
  );
}

function CorrectionDialog({ stationId, entry, onClose }: { stationId: string; entry: FuelEntry; onClose: () => void }) {
  const refresh = useRefreshStock(stationId);
  const [liters, setLiters] = useState(String(entry.liters));
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: async () =>
      apiClient.post(`/fuel-stock/entries/${entry.id}/corrections`, { liters: numberOr(liters), reason: reason.trim() }),
    onSuccess: async () => {
      await refresh();
      onClose();
    },
    onError: (err) => setError(adminErrorMessage(err, 'تعذّر حفظ التصحيح.')),
  });
  const value = numberOr(liters);
  return (
    <Dialog
      open
      title="تصحيح توريد"
      busy={save.isPending}
      onClose={onClose}
      footer={
        <>
          <PillButton size="field" variant="secondary" disabled={save.isPending} onClick={onClose}>
            رجوع
          </PillButton>
          <PillButton size="field" disabled={value === null || reason.trim().length < 3 || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'جارٍ الحفظ…' : 'حفظ التصحيح'}
          </PillButton>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-[15px] leading-[1.7] text-ink-soft lg:text-[13px]">
          {entry.fuelLabel} — بوليصة <span dir="ltr">{entry.waybillNumber}</span>. الكمية المسجَّلة {litersText(entry.liters)}. يبقى السجل الأصلي كما هو ويُضاف إليه تصحيح.
        </p>
        <TextField label="الكمية الصحيحة (لتر)" inputMode="decimal" ltr value={liters} onChange={(e) => setLiters(e.target.value)} />
        <TextAreaField label="سبب التصحيح" value={reason} onChange={(e) => setReason(e.target.value)} />
        {error && <Notice kind="error">{error}</Notice>}
      </div>
    </Dialog>
  );
}

function ResetDialog({ stationId, level, onClose }: { stationId: string; level: FuelLevel; onClose: () => void }) {
  const refresh = useRefreshStock(stationId);
  const [reason, setReason] = useState('');
  const [word, setWord] = useState('');
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: async () =>
      apiClient.post(`/stations/${stationId}/fuel-stock/${level.fuelType}/reset`, {
        reason: reason.trim(),
        confirmation: word.trim(),
      }),
    onSuccess: async () => {
      await refresh();
      onClose();
    },
    onError: (err) => setError(adminErrorMessage(err, 'تعذّر التصفير.')),
  });
  const ready = reason.trim().length >= 3 && word.trim() === RESET_WORD;
  return (
    <Dialog
      open
      title={`تصفير مخزون ${level.fuelLabel}`}
      busy={save.isPending}
      onClose={onClose}
      footer={
        <>
          <PillButton size="field" variant="secondary" disabled={save.isPending} onClick={onClose}>
            رجوع
          </PillButton>
          <PillButton size="field" variant="danger" data-testid="reset-confirm" disabled={!ready || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'جارٍ التصفير…' : 'تصفير المستوى'}
          </PillButton>
        </>
      }
    >
      <div className="space-y-4" data-testid="reset-dialog">
        <dl className="rounded-md bg-surface-alt p-3.5">
          <div className="flex justify-between gap-3">
            <dt className="text-[15px] text-ink-soft lg:text-[13px]">نوع الوقود</dt>
            <dd className="text-[16px] font-bold text-ink lg:text-[14px]">{level.fuelLabel}</dd>
          </div>
          <div className="mt-1.5 flex justify-between gap-3">
            <dt className="text-[15px] text-ink-soft lg:text-[13px]">المستوى المسجَّل الآن</dt>
            <dd className="text-[16px] font-bold tabular-nums text-ink lg:text-[14px]">
              {level.status === 'DATA_WARNING' ? 'غير معروف' : litersText(level.level)}
            </dd>
          </div>
        </dl>
        <p className="text-[15px] leading-[1.7] text-ink lg:text-[13px]">
          سيُصبح المستوى صفرًا ثم يستمر من الصفر مع التوريد القادم. يُسجَّل التصفير باسمك وسببه ومستواه السابق، ويُبلَّغ به مدير البلدية.
        </p>
        <TextAreaField label="سبب التصفير (مطلوب)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <TextField
          label={`اكتب كلمة «${RESET_WORD}» للتأكيد`}
          data-testid="reset-word"
          value={word}
          onChange={(e) => setWord(e.target.value)}
        />
        {error && <Notice kind="error">{error}</Notice>}
      </div>
    </Dialog>
  );
}

// ── level over time ────────────────────────────────────────────────────

function LevelChart({ stationId, fuelType, threshold }: { stationId: string; fuelType: string; threshold: number | null }) {
  const today = tripoliToday();
  const from = addDays(today, -13);
  const report = useQuery({
    queryKey: ['ops-report', 'station-series', stationId, from, today],
    queryFn: async () =>
      (await apiClient.get<OpsReport>('/ops-reports/station', { params: { stationId, from, to: addDays(today, 1) } })).data,
    staleTime: 60_000,
  });
  const label = FUEL_TYPE_LABELS[fuelType] ?? fuelType;
  const rows = useMemo(() => {
    const table = report.data?.tables.find((t) => t.id === 'level-series');
    return (table?.rows ?? []).filter((r) => r.fuel === label);
  }, [report.data, label]);
  if (rows.length < 2) return null;
  const data = rows.map((r) => ({
    label: shortDay(String(r.day)),
    level: typeof r.level === 'number' ? Math.round(r.level) : 0,
    below: typeof r.level === 'number' && threshold !== null && r.level < threshold,
  }));
  const nf = new Intl.NumberFormat('en-US');
  return (
    <figure>
      <figcaption className="mb-2 text-[15px] font-bold text-ink lg:text-[13px]">
        مستوى {label} في نهاية كل يوم (آخر 14 يومًا)
      </figcaption>
      <ul className="mb-2 flex flex-wrap gap-x-5 gap-y-1 text-[14px] text-ink lg:text-[13px]">
        <li className="flex items-center gap-2">
          <span aria-hidden className="inline-block h-3.5 w-3.5 rounded-sm" style={{ background: TEAL }} />
          فوق الحد المنبِّه
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="inline-block h-3.5 w-3.5 rounded-sm" style={{ background: AMBER }} />
          تحت الحد المنبِّه ({threshold !== null ? litersText(threshold) : '—'})
        </li>
      </ul>
      <div dir="ltr" role="img" aria-label={`مستوى ${label} اليومي، آخر قيمة ${nf.format(data[data.length - 1]!.level)} لتر`} className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#CBD5D2" />
            <XAxis dataKey="label" tick={{ fontSize: 13, fill: "#475957" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis width={52} tick={{ fontSize: 13, fill: "#475957" }} tickLine={false} axisLine={false} />
            <Tooltip formatter={(v) => [`${nf.format(Number(v))} لتر`, 'المستوى']} />
            <Bar
              dataKey="level"
              radius={[4, 4, 0, 0]}
              shape={(props: { x?: number; y?: number; width?: number; height?: number; payload?: { below?: boolean } }) => (
                <rect
                  x={props.x}
                  y={props.y}
                  width={props.width}
                  height={props.height}
                  rx={4}
                  fill={props.payload?.below ? AMBER : TEAL}
                />
              )}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

// ── the panel ──────────────────────────────────────────────────────────

export function FuelStockPanel({ stationId, stationName }: { stationId: string; stationName?: string }) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('fuel_stock:manage');
  const canRead = hasPermission('fuel_stock:read');
  const queryClient = useQueryClient();
  const stock = useFuelStock(stationId);
  const entriesPage = usePageParam(FUEL_ENTRIES_PAGE_SIZE);
  const entries = useFuelEntries(stationId, canRead, entriesPage.skip);
  const [dialog, setDialog] = useState<
    | { kind: 'setup' | 'deliver' | 'reset'; level: FuelLevel }
    | { kind: 'correct'; entry: FuelEntry }
    | null
  >(null);
  const [chartFuel, setChartFuel] = useState('');
  const [switchError, setSwitchError] = useState<string | null>(null);

  const visibility = useMutation({
    mutationFn: async (show: boolean) => apiClient.patch(`/stations/${stationId}/stock-visibility`, { show }),
    onSuccess: async () => {
      setSwitchError(null);
      await queryClient.invalidateQueries({ queryKey: ['fuel-stock', stationId] });
    },
    onError: (err) => setSwitchError(adminErrorMessage(err, 'تعذّر تغيير الإعداد.')),
  });

  const configured = stock.data?.levels.filter((l) => l.configured) ?? [];
  useEffect(() => {
    if (!chartFuel && configured[0]) setChartFuel(configured[0].fuelType);
  }, [chartFuel, configured]);

  if (stock.isLoading) return <p className="p-4 text-[15px] text-ink-soft">جارٍ التحميل…</p>;
  if (stock.isError || !stock.data) {
    return <Notice kind="error">تعذّر تحميل مخزون الوقود. تأكد من الاتصال ثم أعد المحاولة.</Notice>;
  }
  const data = stock.data;
  const deliveries = (entries.data?.entries ?? []).filter((e) => e.kind === 'DELIVERY' || e.kind === 'RESET');

  return (
    <div className="space-y-4" data-testid="fuel-stock-panel">
      {stationName && <h2 className="sr-only">الوقود والمخزون في {stationName}</h2>}

      {data.levels.length === 0 ? (
        <Notice kind="info">
          لم تُحدَّد أنواع وقود لهذه المحطة بعد. اختر الأنواع التي تبيعها المحطة من تبويب «نظرة عامة».
        </Notice>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.levels.map((level) => (
            <LevelCard
              key={level.fuelType}
              level={level}
              canManage={canManage}
              onSetup={() => setDialog({ kind: 'setup', level })}
              onDeliver={() => setDialog({ kind: 'deliver', level })}
              onReset={() => setDialog({ kind: 'reset', level })}
            />
          ))}
        </div>
      )}

      {data.threshold !== null && (
        <p className="text-[14px] leading-[1.7] text-ink-soft lg:text-[12px]">
          يُنبَّه المشرف ومدير البلدية عندما ينزل أي نوع تحت {litersText(data.threshold)}، مرة عند الانخفاض ومرة أخرى بعد إعادة التعبئة وانخفاضه ثانية. لا يُمنع تسجيل التعبئة بسبب المخزون.
        </p>
      )}

      {canManage && (
        <SectionCard title="إظهار المخزون للموظفين" description="تحكّم في ما يراه موظفو المحطة على شاشاتهم.">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-xl text-[15px] leading-[1.7] text-ink lg:text-[13px]">
              عند الإيقاف لا يرى الموظفون مستويات الوقود إطلاقًا، ولا يصلهم تنبيه الانخفاض. تبقى أنت ومدير البلدية ترون كل شيء.
            </p>
            <Switch
              checked={data.showToEmployees}
              onChange={(next) => visibility.mutate(next)}
              busy={visibility.isPending}
              label="إظهار المخزون للموظفين"
              onLabel="ظاهر للموظفين"
              offLabel="مخفي عن الموظفين"
              testId="stock-visibility-switch"
            />
          </div>
          {switchError && <Notice kind="error">{switchError}</Notice>}
        </SectionCard>
      )}

      {canRead && configured.length > 0 && (
        <SectionCard title="مستوى الوقود عبر الأيام">
          {configured.length > 1 && (
            <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="نوع الوقود">
              {configured.map((l) => (
                <PillButton
                  key={l.fuelType}
                  size="field"
                  variant={chartFuel === l.fuelType ? 'primary' : 'secondary'}
                  aria-pressed={chartFuel === l.fuelType}
                  onClick={() => setChartFuel(l.fuelType)}
                >
                  {l.fuelLabel}
                </PillButton>
              ))}
            </div>
          )}
          {chartFuel && <LevelChart stationId={stationId} fuelType={chartFuel} threshold={data.threshold} />}
        </SectionCard>
      )}

      {canRead && (
        <SectionCard title="سجل التوريد والتصفير" description="لا يُحذف ولا يُعدَّل أي سجل: التصحيح يُضاف إليه.">
          {entries.isLoading && <p className="text-[15px] text-ink-soft">جارٍ التحميل…</p>}
          {entries.data && deliveries.length === 0 && (
            <p className="text-[16px] text-ink-soft lg:text-[14px]">لم يُسجَّل أي توريد بعد.</p>
          )}
          {deliveries.length > 0 && (
            <ul className="divide-y divide-line" data-testid="fuel-entries">
              {deliveries.map((e) => (
                <li key={e.id} className="py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[17px] font-bold text-ink lg:text-[14px]">
                        {e.kind === 'RESET' ? `تصفير ${e.fuelLabel}` : `توريد ${e.fuelLabel}`}
                        <span className="ms-2 tabular-nums">
                          {e.kind === 'RESET' ? `(كان ${litersText(e.originalLiters)})` : litersText(e.liters)}
                        </span>
                      </p>
                      <p className="mt-0.5 text-[14px] leading-[1.7] text-ink-soft lg:text-[12px]">
                        {stamp(e.occurredAt)} — {e.createdBy.fullName}
                        {e.kind === 'DELIVERY' && (
                          <>
                            {' '}· شاحنة <span dir="ltr">{e.truckPlate}</span> · بوليصة <span dir="ltr">{e.waybillNumber}</span>
                            {e.driverName ? ` · ${e.driverName}` : ''}
                          </>
                        )}
                        {e.kind === 'RESET' && e.reason ? ` · السبب: ${e.reason}` : ''}
                      </p>
                      {e.corrected && (
                        <p className="mt-1 text-[14px] text-ink lg:text-[12px]">
                          <StatusPill variant="warn" size="md">مصحَّح</StatusPill>{' '}
                          الأصل {litersText(e.originalLiters)}، بعد التصحيح {litersText(e.liters)}
                          {e.corrections.at(-1)?.reason ? ` — ${e.corrections.at(-1)!.reason}` : ''}
                        </p>
                      )}
                    </div>
                    {canManage && e.kind === 'DELIVERY' && (
                      <PillButton size="field" variant="secondary" onClick={() => setDialog({ kind: 'correct', entry: e })}>
                        تصحيح
                      </PillButton>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="-mx-4 -mb-4 mt-2 lg:-mx-5 lg:-mb-5">
            <Pagination
              skip={entriesPage.skip}
              take={FUEL_ENTRIES_PAGE_SIZE}
              total={entries.data?.total ?? 0}
              onSkipChange={entriesPage.setSkip}
              testId="fuel-entries-pager"
            />
          </div>
        </SectionCard>
      )}

      {dialog && dialog.kind === 'setup' && <SetupDialog stationId={stationId} level={dialog.level} onClose={() => setDialog(null)} />}
      {dialog && dialog.kind === 'deliver' && (
        <DeliveryDialog stationId={stationId} level={dialog.level} onClose={() => setDialog(null)} />
      )}
      {dialog && dialog.kind === 'reset' && <ResetDialog stationId={stationId} level={dialog.level} onClose={() => setDialog(null)} />}
      {dialog && dialog.kind === 'correct' && (
        <CorrectionDialog stationId={stationId} entry={dialog.entry} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}
