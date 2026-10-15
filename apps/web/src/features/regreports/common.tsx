import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { apiClient } from '../../lib/apiClient';
import { downloadBlob } from '../../lib/download';
import { downloadCsv, type CsvCell } from '../../lib/csv';
import { DateField } from '../../components/DateField';
import { PillButton } from '../../components/design/PillButton';
import { SkeletonRows } from '../../components/design/Skeleton';
import { FieldLabel } from '../../components/design/TextField';

// Pieces shared by the three monitoring reports (phase 4c).

const nf = new Intl.NumberFormat('en-US');
export const num = (value: number): string => nf.format(value);

const TRIPOLI_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Tripoli' });
export const tripoliToday = (): string => TRIPOLI_DAY.format(new Date());

export function addDays(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + delta)).toISOString().slice(0, 10);
}

// 2026-10-11 → 11/10/2026, the way dates already read elsewhere in the app.
export function dayLabel(day: string): string {
  const [y, m, d] = day.split('-');
  return `${d}/${m}/${y}`;
}
export function shortDay(day: string): string {
  const [, m, d] = day.split('-');
  return `${d}/${m}`;
}

const STAMP = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Tripoli',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
export const stamp = (value: string | null | undefined): string =>
  value ? STAMP.format(new Date(value)).replace(',', '') : '—';

// ── date range, kept in the address so a page can be shared as it is ──

export interface Range {
  from: string;
  to: string;
}

export function useRange(defaultDays: number): [Range, (next: Range) => void] {
  const [params, setParams] = useSearchParams();
  const today = tripoliToday();
  const to = params.get('to') ?? today;
  const from = params.get('from') ?? addDays(to, -(defaultDays - 1));
  return [
    { from, to },
    (next) =>
      setParams(
        (prev) => {
          const copy = new URLSearchParams(prev);
          copy.set('from', next.from);
          copy.set('to', next.to);
          return copy;
        },
        { replace: true },
      ),
  ];
}

const DATE_INPUT =
  'h-[52px] w-full rounded-sm border border-line bg-surface-alt px-3.5 text-[16px] text-ink focus:outline-none focus:ring-2 focus:ring-primary-dark lg:h-10 lg:text-[14px]';

const PRESETS = [
  { label: 'اليوم', days: 1 },
  { label: '7 أيام', days: 7 },
  { label: '14 يومًا', days: 14 },
  { label: '30 يومًا', days: 30 },
];

export function RangeBar({ range, onChange, extra }: { range: Range; onChange: (r: Range) => void; extra?: ReactNode }) {
  const today = tripoliToday();
  const activeDays = range.to === today ? PRESETS.find((p) => addDays(range.to, -(p.days - 1)) === range.from)?.days : undefined;
  return (
    <section aria-label="الفترة" className="mb-5 rounded-md bg-surface p-4 shadow-sm">
      <div className="grid grid-cols-2 gap-3 lg:flex lg:flex-wrap lg:items-end">
        <div>
          <FieldLabel htmlFor="range-from">من يوم</FieldLabel>
          <DateField value={range.from} onChange={(v) => v && onChange({ from: v, to: v > range.to ? v : range.to })} inputClassName={DATE_INPUT} />
        </div>
        <div>
          <FieldLabel htmlFor="range-to">إلى يوم</FieldLabel>
          <DateField value={range.to} onChange={(v) => v && onChange({ from: v < range.from ? v : range.from, to: v })} inputClassName={DATE_INPUT} />
        </div>
        {extra}
      </div>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="فترات جاهزة">
        {PRESETS.map((p) => (
          <PillButton
            key={p.days}
            size="field"
            variant={activeDays === p.days ? 'primary' : 'secondary'}
            aria-pressed={activeDays === p.days}
            onClick={() => onChange({ from: addDays(today, -(p.days - 1)), to: today })}
          >
            {p.label}
          </PillButton>
        ))}
      </div>
      <p className="mt-3 text-[14px] text-ink-soft lg:text-[12px]">
        الأيام بتوقيت طرابلس: كل يوم من منتصف الليل إلى منتصف الليل، وتشمل الفترة اليومين المختارين.
      </p>
    </section>
  );
}

// ── errors, loading ──

const ERROR_TEXT: Record<string, string> = {
  INVALID_DATE: 'تاريخ غير صحيح. اختر يومًا من التقويم.',
  RANGE_REVERSED: 'يوم البداية بعد يوم النهاية.',
  RANGE_TOO_LONG: 'الفترة أطول من المسموح (400 يوم). اختر فترة أقصر.',
  DATE_IN_THE_FUTURE: 'لا يمكن تسجيل وقت في المستقبل.',
  DELIVERY_NEEDS_A_QUANTITY: 'الدفعة المستلمة يجب أن تكون بطاقة واحدة على الأقل.',
  DESK_NOT_AT_THIS_STATION: 'هذا المكتب (الشباك) لا يتبع مكتب التسجيل المختار.',
  CORRECT_THE_ORIGINAL: 'صحّح السجل الأصلي لا سجل تصحيح.',
};

export function errorText(err: unknown): string {
  if (isAxiosError(err)) {
    if (err.response?.status === 403) return 'ليس لديك صلاحية على هذا المكتب أو هذه المحطة.';
    if (err.response?.status === 404) return 'غير موجود.';
    const message = (err.response?.data as { message?: string | string[] } | undefined)?.message;
    const first = Array.isArray(message) ? message[0] : message;
    if (first && ERROR_TEXT[first]) return ERROR_TEXT[first];
  }
  return 'تعذر تحميل البيانات. تحقق من الاتصال وحاول مرة أخرى.';
}

export function ErrorNote({ error }: { error: unknown }) {
  return (
    <p role="alert" className="rounded-md border border-danger bg-surface p-4 text-[16px] font-bold text-danger-dark lg:text-[14px]">
      {errorText(error)}
    </p>
  );
}

export function Loading() {
  return <SkeletonRows rows={5} />;
}

// ── headline numbers ──

export function Stat({ label, value, note, tone = 'plain' }: { label: string; value: ReactNode; note?: string; tone?: 'plain' | 'bad' | 'good' }) {
  const color = tone === 'bad' ? 'text-danger-dark' : tone === 'good' ? 'text-ok' : 'text-ink';
  return (
    <div className="rounded-md bg-surface p-4 shadow-sm">
      <p className="text-[14px] font-bold text-ink-soft lg:text-[12px]">{label}</p>
      <p className={`mt-1 text-[28px] font-extrabold leading-none ${color}`}>{value}</p>
      {note && <p className="mt-2 text-[14px] text-ink-soft lg:text-[12px]">{note}</p>}
    </div>
  );
}

// ── CSV and PDF buttons ──

export function CsvButton({ filename, headers, rows, label = 'تنزيل CSV' }: { filename: string; headers: string[]; rows: CsvCell[][]; label?: string }) {
  return (
    <PillButton size="field" variant="secondary" onClick={() => downloadCsv(filename, headers, rows)}>
      {label}
    </PillButton>
  );
}

export function PdfButton({ path, params, filename, label = 'تنزيل PDF' }: { path: string; params: Record<string, string | number | undefined>; filename: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function run() {
    setBusy(true);
    setFailed(false);
    try {
      const res = await apiClient.get<Blob>(path, { params: { ...params, format: 'pdf' }, responseType: 'blob' });
      downloadBlob(res.data, filename);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="inline-flex flex-col gap-1">
      <PillButton size="field" variant="secondary" disabled={busy} onClick={run}>
        {busy ? 'جارٍ إنشاء الملف…' : label}
      </PillButton>
      {failed && (
        <span role="alert" className="text-[14px] font-bold text-danger-dark lg:text-[12px]">
          تعذر إنشاء ملف PDF. حاول مرة أخرى.
        </span>
      )}
    </span>
  );
}

export function SectionTitle({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id} className="mb-2 mt-6 text-[18px] font-extrabold text-ink lg:text-[15px]">
      {children}
    </h2>
  );
}
