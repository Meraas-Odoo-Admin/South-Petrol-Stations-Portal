import { useState } from 'react';
import { isAxiosError } from 'axios';
import type { RuleCheckDetail } from '@fuel-tracking/shared-types';
import { apiClient } from '../../lib/apiClient';
import { APP_NAME } from '../../lib/appInfo';
import { formatLicensePlate } from '../../lib/libyanFormats';
import { formatDate, formatTime } from '../../lib/dateFormat';
import { BrandMark } from '../../components/BrandMark';
import { LtrText } from '../../components/LtrText';
import { PillButton } from '../../components/design/PillButton';
import { QrScanPanel } from '../../components/QrScanPanel';

// GET /public/card-status/:cardNumber — only what the printed card shows, and
// the verdict of the same rules the pump applies, with the times they count from.
interface CitizenCheck extends RuleCheckDetail {
  // Gap rules: from when this rule lets the vehicle fill up (ISO).
  nextAllowedAt: string | null;
}
interface CardStatus {
  cardNumber: string;
  canFill: boolean;
  checks: CitizenCheck[];
  lastVehicleFillUpAt: string | null;
  lastOwnerFillUpAt: string | null;
  vehicle: { plate: string; make: string | null; model: string | null; color: string | null; fuelType: 'PETROL' | 'DIESEL' | null };
}

const FUEL_WORDS: Record<string, string> = { PETROL: 'بنزين', DIESEL: 'ديزل' };
const days = (n: number) => (n === 1 ? 'يوم واحد' : n === 2 ? 'يومان' : n <= 10 ? `${n} أيام` : `${n} يومًا`);
const WEEKDAY = new Intl.DateTimeFormat('ar-LY', { timeZone: 'Africa/Tripoli', weekday: 'long' });

// «الأحد 19/10/2026 الساعة 14:32», in Libya's time.
function when(iso: string): string {
  return `${WEEKDAY.format(new Date(iso))} ${formatDate(iso)} الساعة ${formatTime(iso)}`;
}

// Each rule, side by side with the vehicle's own situation (after review,
// 19 Oct 2026: "show the conditions compared with his status, and the last
// fill-up with the hour").
function ruleRow(check: CitizenCheck, status: CardStatus): { title: string; rule: string; yours: string; next: string | null } {
  const owner = check.reason.startsWith('OWNER_') || check.reason === 'LITERS_PER_PERSON_CAP_REACHED';
  const scope = owner ? 'لكل مركبات المالك' : 'للمركبة';
  switch (check.reason) {
    case 'VEHICLE_GAP_TOO_SHORT':
    case 'OWNER_GAP_TOO_SHORT': {
      const last = check.reason === 'OWNER_GAP_TOO_SHORT' ? status.lastOwnerFillUpAt : status.lastVehicleFillUpAt;
      return {
        title: `المدة بين تعبئتين ${scope}`,
        rule: `لا تقل عن ${days(check.limit)} (${check.limit * 24} ساعة)`,
        yours: last ? `آخر تعبئة: ${when(last)}` : 'لا توجد تعبئة سابقة',
        next: check.nextAllowedAt ? `يمكنك التعبئة ابتداءً من ${when(check.nextAllowedAt)}` : null,
      };
    }
    case 'VEHICLE_WEEKLY_CAP_REACHED':
    case 'OWNER_WEEKLY_CAP_REACHED':
      return {
        title: `عدد التعبئات في الأسبوع ${scope}`,
        rule: `حتى ${check.limit} تعبئات في الأسبوع`,
        yours: `${check.actual ?? 0} تعبئة هذا الأسبوع`,
        next: 'تتاح التعبئة مجددًا مع بداية الأسبوع القادم',
      };
    case 'LITERS_PER_PERSON_CAP_REACHED':
      return {
        title: `كمية الوقود في الأسبوع ${scope}`,
        rule: `حتى ${check.limit} لتر في الأسبوع`,
        yours: `${check.actual ?? 0} لتر هذا الأسبوع`,
        next: 'تتاح التعبئة مجددًا مع بداية الأسبوع القادم',
      };
  }
}

// The one line under the verdict: from when the vehicle can fill up.
function verdictLine(status: CardStatus): string | null {
  const failed = status.checks.filter((c) => !c.passed);
  if (failed.length === 0) return null;
  if (failed.some((c) => !c.nextAllowedAt)) return 'تتاح التعبئة مجددًا مع بداية الأسبوع القادم';
  const latest = failed.map((c) => c.nextAllowedAt!).sort().at(-1)!;
  return `يمكنك التعبئة ابتداءً من ${when(latest)}`;
}

const SCAN_MESSAGES = {
  'not-a-card': { title: 'لم نتعرّف على هذه البطاقة', body: 'تأكد أنك تمسح رمز بطاقة تعبئة الوقود، أو اكتب رقم البطاقة أدناه.' },
  revoked: { title: 'هذه البطاقة ملغاة', body: 'استُبدلت أو أُلغيت. راجع مكتب التسجيل لاستلام بطاقتك الحالية.' },
  error: { title: 'تعذّر التحقق الآن', body: 'قد تكون الخدمة مزدحمة أو الاتصال ضعيفًا. أعد المحاولة بعد قليل.' },
};

// The citizen's own check (after review, 19 Oct 2026): scan the QR on the
// vehicle's card — or type its number — and see whether it may fill up now,
// and if not, why and when. Public: no account, nothing personal shown.
export function CitizenCheckPage() {
  const [status, setStatus] = useState<CardStatus | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function lookUpTyped() {
    const code = typed.trim().toUpperCase();
    if (!code) return setProblem('اكتب رقم البطاقة كما هو مطبوع عليها، مثل SBH-7K2M9Q4X.');
    setBusy(true);
    setProblem(null);
    try {
      setStatus((await apiClient.get<CardStatus>(`/public/card-status/${encodeURIComponent(code)}`)).data);
    } catch (err) {
      const code = isAxiosError(err) ? err.response?.status : undefined;
      setProblem(
        code === 404
          ? 'لا توجد بطاقة بهذا الرقم. راجع الرقم المطبوع على البطاقة.'
          : code === 409
            ? SCAN_MESSAGES.revoked.body
            : code === 429
              ? 'وصلت إلى عدد الفحوص المسموح في الساعة. أعد المحاولة لاحقًا.'
              : code === 503
                ? 'الخدمة مزدحمة الآن. أعد المحاولة بعد دقيقة.'
                : SCAN_MESSAGES.error.body,
      );
    } finally {
      setBusy(false);
    }
  }

  function again() {
    setStatus(null);
    setTyped('');
    setProblem(null);
    setCameraOn(false);
  }

  const v = status?.vehicle;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-paper" dir="rtl">
      <header className="flex items-center justify-center gap-2.5 bg-primary py-3 text-white">
        <BrandMark variant="white" size={28} />
        <p className="text-[16px] font-black">{APP_NAME}</p>
      </header>

      {/* --chrome-extra: what this page adds around the camera beyond the fill-up
          screen's own (~260px): the card-number field. The camera fills the rest. */}
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col p-4" style={{ '--chrome-extra': '48px' } as React.CSSProperties}>
        {!status ? (
          <>
            <h1 className="text-[22px] font-black text-ink">هل يمكنني التعبئة الآن؟</h1>
            <p className="mt-1 text-[15px] leading-[1.7] text-ink-soft">امسح الرمز المربع على بطاقة تعبئة الوقود الخاصة بمركبتك.</p>

            <div className="mt-4 flex-1">
              {cameraOn ? (
                <QrScanPanel<CardStatus>
                  variant="inline"
                  autoStart
                  lookUpPath={(code) => `/public/card-status/${encodeURIComponent(code)}`}
                  outcomeMessages={SCAN_MESSAGES}
                  onResolved={setStatus}
                  onCancel={() => setCameraOn(false)}
                  onCameraUnavailable={() => undefined}
                />
              ) : (
                <PillButton size="field" className="h-14 w-full text-[18px]" onClick={() => setCameraOn(true)} data-testid="citizen-open-camera">
                  فتح الكاميرا ومسح البطاقة
                </PillButton>
              )}
            </div>

            <div className="mt-5 border-t border-line pt-4">
              <label htmlFor="citizen-card" className="mb-1.5 block text-[15px] font-bold text-ink">
                أو اكتب رقم البطاقة
              </label>
              <div className="flex gap-2">
                <input
                  id="citizen-card"
                  data-testid="citizen-card-number"
                  dir="ltr"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 20))}
                  onKeyDown={(e) => e.key === 'Enter' && void lookUpTyped()}
                  placeholder="SBH-7K2M9Q4X"
                  className="h-[52px] min-w-0 flex-1 rounded-sm border border-line bg-surface-alt px-3 text-center font-mono text-[18px] text-ink focus:outline-none focus:ring-2 focus:ring-primary-dark"
                />
                <PillButton size="field" variant="secondary" onClick={() => void lookUpTyped()} disabled={busy}>
                  تحقّق
                </PillButton>
              </div>
              {problem && (
                <p role="alert" className="mt-2 text-[15px] font-bold text-danger-dark">
                  {problem}
                </p>
              )}
            </div>
          </>
        ) : (
          <>
            <section
              data-testid="citizen-verdict"
              className={`rounded-md p-5 text-center ${status.canFill ? 'bg-ok-100' : 'bg-danger-100'}`}
              role="status"
            >
              <p className={`text-[26px] font-black ${status.canFill ? 'text-ok' : 'text-danger-dark'}`}>
                {status.canFill ? 'يمكنك التعبئة الآن ✓' : 'لا يمكنك التعبئة الآن'}
              </p>
              {verdictLine(status) && <p className="mt-1.5 text-[16px] font-bold text-ink">{verdictLine(status)}</p>}
            </section>

            <h2 className="mt-4 text-[17px] font-extrabold text-ink">الشروط وحالتك</h2>
            <ul className="mt-2 space-y-2" data-testid="citizen-rules">
              {status.checks.map((c) => {
                const row = ruleRow(c, status);
                return (
                  <li key={c.reason} className={`rounded-md bg-surface p-3.5 shadow-sm ${c.passed ? '' : 'ring-2 ring-inset ring-danger'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[16px] font-extrabold text-ink">{row.title}</p>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-0.5 text-[13px] font-bold ${c.passed ? 'bg-ok-100 text-ok' : 'bg-danger-100 text-danger-dark'}`}
                      >
                        {c.passed ? '✓ مستوفى' : '✗ غير مستوفى'}
                      </span>
                    </div>
                    <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[15px] leading-[1.6]">
                      <dt className="text-ink-soft">الشرط:</dt>
                      <dd className="text-ink">{row.rule}</dd>
                      <dt className="text-ink-soft">حالتك:</dt>
                      <dd className="font-bold text-ink">{row.yours}</dd>
                    </dl>
                    {!c.passed && row.next && <p className="mt-1.5 text-[15px] font-bold text-danger-dark">{row.next}</p>}
                  </li>
                );
              })}
            </ul>

            {v && (
              <section className="mt-3 rounded-md bg-surface p-4 text-center shadow-sm">
                <p className="text-[14px] font-bold text-ink-soft">المركبة</p>
                <p className="mt-1 text-[36px] font-black leading-none text-ink">
                  <LtrText>{formatLicensePlate(v.plate)}</LtrText>
                </p>
                <p className="mt-2 text-[17px] font-bold text-ink">
                  {[[v.make, v.model].filter(Boolean).join(' '), v.color, v.fuelType ? FUEL_WORDS[v.fuelType] : null].filter(Boolean).join(' — ')}
                </p>
                <p className="mt-1 text-[14px] text-ink-faint">
                  رقم البطاقة <LtrText className="font-mono">{status.cardNumber}</LtrText>
                </p>
              </section>
            )}

            <PillButton size="field" variant="secondary" className="mt-auto h-12 w-full pt-0 text-[17px]" onClick={again} data-testid="citizen-again">
              فحص بطاقة أخرى
            </PillButton>
          </>
        )}
      </main>
    </div>
  );
}
