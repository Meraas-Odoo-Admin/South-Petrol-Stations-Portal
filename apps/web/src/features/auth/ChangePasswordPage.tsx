import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { isAxiosError } from 'axios';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { BrandMark } from '../../components/BrandMark';
import { EyeIcon } from '../../components/EyeIcon';
import { APP_NAME, APP_TAGLINE } from '../../lib/appInfo';
import { PillButton } from '../../components/design/PillButton';

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'كلمة المرور الحالية مطلوبة'),
    newPassword: z.string().min(8, 'يجب ألا تقل كلمة المرور الجديدة عن 8 أحرف'),
    confirmPassword: z.string().min(1, 'تأكيد كلمة المرور مطلوب'),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: 'الكلمتان غير متطابقتين',
    path: ['confirmPassword'],
  });

type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;

interface StrengthCheck {
  label: string;
  met: boolean;
}

function evaluateStrength(password: string): { checks: StrengthCheck[]; score: number } {
  const checks: StrengthCheck[] = [
    { label: 'ثمانية أحرف أو أكثر', met: password.length >= 8 },
    { label: 'تحتوي رقمًا واحدًا على الأقل', met: /\d/.test(password) },
    { label: 'تحتوي حرفًا كبيرًا (يُنصح به)', met: /[A-Z]/.test(password) },
  ];
  const score = checks.filter((c) => c.met).length;
  return { checks, score };
}

function strengthLabel(score: number): { text: string; tone: string } {
  if (score <= 1) return { text: 'ضعيفة', tone: 'text-danger' };
  if (score === 2) return { text: 'مقبولة', tone: 'text-accent-ink' };
  return { text: 'قوية — مقبولة', tone: 'text-ok' };
}

// Matches design/"Fuel Control System - Round 2 Screens.dc.html" 3c
// (mobile only — no desktop artboard exists for this screen, a documented
// gap; the outer shell here reuses 3a/3b's login-shell wrapper so desktop
// isn't left in the old plain-slate state, but the two-card body below is
// 3c's own content, drawn 1:1 including the previously-missing Arabic
// password-strength indicator).
export function ChangePasswordPage() {
  const { changePassword, user } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  // Round 14: "it should also be put in the first login password change,
  // and basically any field that contains a password" — LoginPage already
  // has a show/hide toggle on its one password field; these three never
  // did. Independent per field, same reasoning as three separate fields
  // needing three separate answers to "is this one showing right now".
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordFormValues>({ resolver: zodResolver(changePasswordSchema) });

  const newPassword = watch('newPassword') ?? '';
  const confirmPassword = watch('confirmPassword') ?? '';
  const { checks, score } = useMemo(() => evaluateStrength(newPassword), [newPassword]);
  const strength = strengthLabel(score);
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;

  async function onSubmit(values: ChangePasswordFormValues) {
    setServerError(null);
    try {
      await changePassword({ currentPassword: values.currentPassword, newPassword: values.newPassword });
      navigate('/', { replace: true });
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 401) {
        setServerError('كلمة المرور الحالية غير صحيحة.');
      } else {
        setServerError('حدث خطأ غير متوقع. حاول مرة أخرى.');
      }
    }
  }

  // Round 14: the eye-toggle button lives INSIDE this same flex row as a
  // sibling of the <input>, not absolutely positioned over it — same
  // structure LoginPage's own password field already uses. Deliberate:
  // these inputs carry their own `dir="ltr"` (so typed characters read
  // left-to-right regardless of the page's rtl), and CSS logical
  // properties (ps-*/pe-*) resolve against an ELEMENT's OWN direction —
  // an absolutely-positioned icon reserved via pe-* on an ltr-dir'd input
  // would reserve space on the wrong physical side, the exact bug just
  // fixed on DateField's calendar icon. A plain flex row sidesteps the
  // whole class of bug since sibling layout order doesn't depend on either
  // child's own dir.
  const fieldRowClass =
    'mt-2 flex h-[52px] items-center gap-2 rounded-sm border border-line bg-surface-alt px-3.5 focus-within:ring-2 focus-within:ring-primary-dark focus-within:ring-offset-2';
  const fieldInputClass =
    'min-w-0 flex-1 border-0 bg-transparent text-[15px] font-bold text-ink tracking-[0.15em] focus:outline-none';

  // Round 14: this page used to be a bare, unbranded card — a visible
  // downgrade right after LoginPage's polished two-tone shell (same auth
  // flow, same user, jarringly different visual quality). Now shares
  // LoginPage's exact brand mark and mobile header treatment. Also fixed
  // live: the "الخطوة الأولى قبل الاستخدام" badge used to show
  // unconditionally, even for a user voluntarily changing their password
  // from the sidebar long after their first login — now only shown for
  // the actual forced first-login flow, matching the paragraph below it
  // (which already branched on this correctly).
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-0 lg:p-8">
      <div className="w-full max-w-[480px] overflow-hidden bg-surface shadow-lg lg:rounded-lg">
        {/* After review (18 Oct 2026): on a phone the whole screen fits without
            scrolling — a slim brand bar, no boxes around the fields, and the
            notes that repeat what the screen says are kept for the desktop. */}
        <div className="flex items-center justify-center gap-2.5 bg-primary py-3 text-white lg:hidden">
          <BrandMark variant="white" size={28} />
          <p className="text-[16px] font-black">{APP_NAME}</p>
        </div>

        <div className="px-5 py-4 lg:p-10">
          <div className="mb-7 hidden items-center gap-3 lg:flex">
            <BrandMark />
            <div>
              <p className="text-[18px] font-black text-ink">{APP_NAME}</p>
              <p className="text-[13px] lg:text-[12px] font-medium text-ink-soft">{APP_TAGLINE}</p>
            </div>
          </div>

          {user?.mustChangePassword && (
            <div className="mb-2 hidden rounded-full bg-primary-100 px-3 py-1.5 text-[13px] lg:inline-block lg:text-[12px] font-bold text-primary-dark">
              الخطوة الأولى قبل الاستخدام
            </div>
          )}
          <h1 className="text-[22px] font-black text-ink lg:mt-3">اختر كلمة مرور جديدة</h1>
          <p className="mt-1 text-[14px] leading-[1.6] text-ink-soft lg:mt-2 lg:text-[13px] lg:leading-[1.7]">
            {user?.mustChangePassword
              ? 'كلمة المرور المؤقتة التي سلّمك إياها المشرف تُستخدم مرة واحدة فقط.'
              : 'اختر كلمة مرور جديدة لحسابك.'}
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-3 flex flex-col gap-3 lg:mt-6 lg:gap-4">
          <div className="lg:rounded-md lg:border lg:border-line lg:p-4">
            <label htmlFor="cp-current" className="text-[15px] lg:text-[13px] font-bold text-ink">كلمة المرور الحالية</label>
            <div className={fieldRowClass}>
              <input
              id="cp-current"
                type={showCurrent ? 'text' : 'password'}
                {...register('currentPassword')}
                dir="ltr"
                className={fieldInputClass}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowCurrent((s) => !s)}
                className="shrink-0 text-ink-soft"
                aria-label={showCurrent ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              >
                <EyeIcon open={showCurrent} size={17} />
              </button>
            </div>
            {errors.currentPassword && (
              <p className="mt-1.5 text-[13px] lg:text-[12px] text-danger">{errors.currentPassword.message}</p>
            )}
          </div>

          <div className="lg:rounded-md lg:border lg:border-line lg:p-4">
            <label htmlFor="cp-new" className="text-[15px] lg:text-[13px] font-bold text-ink">كلمة المرور الجديدة</label>
            <div className={fieldRowClass}>
              <input
              id="cp-new"
                type={showNew ? 'text' : 'password'}
                {...register('newPassword')}
                dir="ltr"
                className={fieldInputClass}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowNew((s) => !s)}
                className="shrink-0 text-ink-soft"
                aria-label={showNew ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              >
                <EyeIcon open={showNew} size={17} />
              </button>
            </div>
            {errors.newPassword && <p className="mt-1.5 text-[13px] lg:text-[12px] text-danger">{errors.newPassword.message}</p>}

            {/* 4 segments per artboard 3c — the 3 checks below can only
                ever fill 3 of them; the 4th stays empty even at "قوية"
                (matches the artboard's own screenshot: 3 filled + 1 empty
                for the strong state, not a 4th unreachable check). */}
            <div className="mt-2.5 flex gap-1.5 lg:mt-3.5">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={`h-1.5 flex-1 rounded-full ${i < score ? (score >= 3 ? 'bg-ok' : 'bg-accent') : 'bg-surface-alt'}`}
                />
              ))}
            </div>
            {newPassword.length > 0 && (
              <p className={`mt-2 text-[13px] lg:text-[12.5px] font-extrabold ${strength.tone}`}>{strength.text}</p>
            )}

            <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 lg:mt-3 lg:flex-col lg:gap-1.5">
              {checks.map((check) => (
                <li key={check.label} className="flex items-center gap-2 text-[13px] lg:text-[12px] text-ink-soft">
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                      check.met ? 'bg-ok text-white' : 'bg-surface-alt'
                    }`}
                  >
                    {check.met && (
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
                        <path d="M4 12l6 6L20 6" />
                      </svg>
                    )}
                  </span>
                  {check.label}
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:rounded-md lg:border lg:border-line lg:p-4">
            <label htmlFor="cp-confirm" className="text-[15px] lg:text-[13px] font-bold text-ink">تأكيد كلمة المرور</label>
            <div className={fieldRowClass}>
              <input
              id="cp-confirm"
                type={showConfirm ? 'text' : 'password'}
                {...register('confirmPassword')}
                dir="ltr"
                className={fieldInputClass}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirm((s) => !s)}
                className="shrink-0 text-ink-soft"
                aria-label={showConfirm ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              >
                <EyeIcon open={showConfirm} size={17} />
              </button>
            </div>
            {errors.confirmPassword && (
              <p className="mt-1.5 text-[13px] lg:text-[12px] text-danger">{errors.confirmPassword.message}</p>
            )}
            {passwordsMatch && !errors.confirmPassword && (
              <p className="mt-2 flex items-center gap-1.5 text-[13px] lg:text-[12.5px] font-bold text-ok">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
                  <path d="M4 12l6 6L20 6" />
                </svg>
                الكلمتان متطابقتان
              </p>
            )}
          </div>

          <div className="hidden rounded-md bg-accent-100 px-4 py-3 text-[13px] leading-[1.7] text-accent-ink lg:block lg:text-[12px]">
            بعد الحفظ سيُطلب منك الدخول بكلمة المرور الجديدة في المرة القادمة.
          </div>

          {serverError && <p className="text-[15px] lg:text-[13px] text-danger">{serverError}</p>}

          <PillButton type="submit" size="field" disabled={isSubmitting} className="mt-1 w-full">
            {isSubmitting ? 'جارٍ الحفظ…' : 'حفظ والمتابعة'}
          </PillButton>
        </form>
        </div>
      </div>
    </div>
  );
}
