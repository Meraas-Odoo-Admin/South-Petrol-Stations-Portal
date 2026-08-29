import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { isAxiosError } from 'axios';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';

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
  if (score === 2) return { text: 'مقبولة', tone: 'text-accent-dark' };
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

  const fieldInputClass =
    'mt-2 h-13 w-full rounded-sm bg-surface-alt px-3.5 text-[15px] font-bold text-ink tracking-[0.15em] focus:outline-none focus:ring-2 focus:ring-accent';

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-0 lg:p-8">
      <div className="w-full max-w-[480px] bg-surface p-6 shadow-lg lg:rounded-lg lg:p-10">
        <div className="mb-2 rounded-full bg-primary-100 px-3 py-1.5 text-[11px] font-bold text-primary-dark inline-block">
          الخطوة الأولى قبل الاستخدام
        </div>
        <h1 className="mt-3 text-[22px] font-black text-ink">اختر كلمة مرور جديدة</h1>
        <p className="mt-2 text-[13px] leading-[1.7] text-ink-soft">
          {user?.mustChangePassword
            ? 'كلمة المرور المؤقتة التي سلّمك إياها المشرف تُستخدم مرة واحدة فقط.'
            : 'اختر كلمة مرور جديدة لحسابك.'}
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4">
          <div className="rounded-md border border-line p-4">
            <label className="text-[13px] font-bold text-ink">كلمة المرور الحالية</label>
            <input
              type="password"
              {...register('currentPassword')}
              dir="ltr"
              className={fieldInputClass}
              autoComplete="current-password"
            />
            {errors.currentPassword && (
              <p className="mt-1.5 text-[12px] text-danger">{errors.currentPassword.message}</p>
            )}
          </div>

          <div className="rounded-md border border-line p-4">
            <label className="text-[13px] font-bold text-ink">كلمة المرور الجديدة</label>
            <input
              type="password"
              {...register('newPassword')}
              dir="ltr"
              className={fieldInputClass}
              autoComplete="new-password"
            />
            {errors.newPassword && <p className="mt-1.5 text-[12px] text-danger">{errors.newPassword.message}</p>}

            {/* 4 segments per artboard 3c — the 3 checks below can only
                ever fill 3 of them; the 4th stays empty even at "قوية"
                (matches the artboard's own screenshot: 3 filled + 1 empty
                for the strong state, not a 4th unreachable check). */}
            <div className="mt-3.5 flex gap-1.5">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={`h-1.5 flex-1 rounded-full ${i < score ? (score >= 3 ? 'bg-ok' : 'bg-accent') : 'bg-surface-alt'}`}
                />
              ))}
            </div>
            {newPassword.length > 0 && (
              <p className={`mt-2 text-[12.5px] font-extrabold ${strength.tone}`}>{strength.text}</p>
            )}

            <ul className="mt-3 flex flex-col gap-1.5">
              {checks.map((check) => (
                <li key={check.label} className="flex items-center gap-2 text-[12px] text-ink-soft">
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                      check.met ? 'bg-ok text-white' : 'border border-line'
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

          <div className="rounded-md border border-line p-4">
            <label className="text-[13px] font-bold text-ink">تأكيد كلمة المرور</label>
            <input
              type="password"
              {...register('confirmPassword')}
              dir="ltr"
              className={fieldInputClass}
              autoComplete="new-password"
            />
            {errors.confirmPassword && (
              <p className="mt-1.5 text-[12px] text-danger">{errors.confirmPassword.message}</p>
            )}
            {passwordsMatch && !errors.confirmPassword && (
              <p className="mt-2 flex items-center gap-1.5 text-[12.5px] font-bold text-ok">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
                  <path d="M4 12l6 6L20 6" />
                </svg>
                الكلمتان متطابقتان
              </p>
            )}
          </div>

          <div className="rounded-md bg-accent-100 px-4 py-3 text-[12px] leading-[1.7] text-accent-dark">
            بعد الحفظ سيُطلب منك الدخول بكلمة المرور الجديدة في المرة القادمة.
          </div>

          {serverError && <p className="text-[13px] text-danger">{serverError}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-1 flex h-13.5 items-center justify-center rounded-full bg-gradient-to-l from-accent to-accent-dark text-[16px] font-extrabold text-white shadow-glow disabled:opacity-50"
            style={{ height: 54 }}
          >
            {isSubmitting ? '...جارٍ الحفظ' : 'حفظ والمتابعة'}
          </button>
        </form>
      </div>
    </div>
  );
}
