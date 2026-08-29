import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { isAxiosError } from 'axios';

const loginSchema = z.object({
  username: z.string().min(1, 'اسم المستخدم مطلوب'),
  password: z.string().min(1, 'كلمة المرور مطلوبة'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  ) : (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 3l18 18M10.6 10.6a2.6 2.6 0 0 0 3.6 3.6M9.4 5.5A10.6 10.6 0 0 1 12 5c6.5 0 10 6 10 6a13.6 13.6 0 0 1-3.1 3.7M6.6 6.6C4 8.3 2 11 2 11s3.5 6 10 6c1 0 1.9-.14 2.8-.4" />
    </svg>
  );
}

function BrandMark() {
  return (
    <svg width="34" height="34" viewBox="0 0 56 56" fill="none">
      <circle cx="28" cy="28" r="20" stroke="#0d5c52" strokeWidth="4" />
      <line x1="28" y1="9" x2="28" y2="17" stroke="#0d5c52" strokeWidth="4" strokeLinecap="round" />
      <line x1="28" y1="28" x2="39" y2="20" stroke="#e8a53d" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

// Matches design/"Fuel Control System - Round 2 Screens.dc.html" 3a
// (desktop 1440 — two-column: form + a teal marketing panel) and 3b
// (mobile 390 — stacked: brand centered up top, form sheet below). One
// component, Tailwind `lg:` breakpoint switches the layout rather than
// two separate files, matching the pattern already used elsewhere in
// this pass (e.g. StationsListPage's mobile-card/desktop-table split).
export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginFormValues) {
    setServerError(null);
    try {
      const result = await login(values);
      navigate(result.mustChangePassword ? '/change-password' : '/', { replace: true });
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 401) {
        setServerError('اسم المستخدم أو كلمة المرور غير صحيحة.');
      } else {
        setServerError('حدث خطأ غير متوقع. حاول مرة أخرى.');
      }
    }
  }

  const inputClass =
    'h-13 w-full rounded-sm border border-line bg-surface-alt px-3.5 text-[14px] text-ink focus:outline-none focus:ring-2 focus:ring-accent';

  const form = (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col">
      <h1 className="text-[27px] font-black text-ink lg:text-[27px]">تسجيل الدخول</h1>
      <p className="mt-2 text-[13px] leading-[1.7] text-ink-soft">
        أدخل اسم المستخدم الذي سلّمك إياه مشرف محطتك.
      </p>

      <div className="mt-7 flex flex-col gap-4.5">
        <div>
          <label className="text-[13px] font-bold text-ink">اسم المستخدم</label>
          <input
            {...register('username')}
            autoComplete="username"
            className={`mt-2 ${inputClass}`}
            style={{ height: 52 }}
          />
          {errors.username && <p className="mt-1 text-[12px] text-danger">{errors.username.message}</p>}
        </div>

        <div>
          <label className="text-[13px] font-bold text-ink">كلمة المرور</label>
          <div className="mt-2 flex h-13 items-center gap-2.5 rounded-sm border border-primary bg-primary-100 px-3.5" style={{ height: 52 }}>
            <input
              type={showPassword ? 'text' : 'password'}
              {...register('password')}
              autoComplete="current-password"
              dir="ltr"
              className="min-w-0 flex-1 bg-transparent text-[15px] font-bold text-primary-dark tracking-[0.2em] focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="shrink-0 text-primary-dark"
              aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
            >
              <EyeIcon open={showPassword} />
            </button>
          </div>
          <p className="mt-1.5 text-[11.5px] text-ink-soft">اضغط العين لعرض ما كتبته والتأكد منه.</p>
          {errors.password && <p className="mt-1 text-[12px] text-danger">{errors.password.message}</p>}
        </div>
      </div>

      {serverError && <p className="mt-4 text-[13px] text-danger">{serverError}</p>}

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-7 flex h-13.5 items-center justify-center rounded-full bg-gradient-to-l from-accent to-accent-dark text-[16px] font-extrabold text-white shadow-glow disabled:opacity-50"
        style={{ height: 54 }}
      >
        {isSubmitting ? '...جارٍ الدخول' : 'دخول'}
      </button>

      <p className="mt-6 text-[11.5px] leading-[1.7] text-ink-soft lg:mt-auto lg:pt-6">
        إن نسيت كلمة المرور، راجع مشرف محطتك — لا يمكن استرجاعها من هذه الشاشة.
      </p>
    </form>
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-0 lg:p-8">
      <div className="flex w-full max-w-[1140px] flex-col overflow-hidden bg-surface shadow-lg lg:h-[640px] lg:flex-row lg:rounded-lg">
        {/* Mobile: brand header */}
        <div className="flex flex-col items-center gap-3.5 bg-primary py-9 text-white lg:hidden">
          <BrandMark />
          <div className="text-center">
            <p className="text-[21px] font-black">ضابط</p>
            <p className="mt-1 text-[12px] font-medium opacity-90">منظومة ضبط تعبئة الوقود</p>
          </div>
        </div>

        {/* Desktop: teal marketing panel (order-2 in RTL = visually start side) */}
        <div className="hidden flex-1 flex-col justify-between bg-gradient-to-br from-primary to-primary-dark p-14 text-white lg:order-2 lg:flex">
          <p className="text-[12px] font-extrabold tracking-[0.14em] opacity-70">مديرية أمن سبها</p>
          <div>
            <p className="text-[34px] font-black leading-[1.45]">كل لتر مُسجَّل باسم مركبة وسائق ووقت.</p>
            <p className="mt-4.5 text-[14px] leading-[1.9] opacity-90">
              هذه المنظومة تسجّل ولا تحذف. كل إجراء داخلها موثّق باسم من نفّذه ووقته، بما في ذلك دخولك الآن.
            </p>
          </div>
          <div className="flex items-center gap-2.5 text-[11.5px] font-medium opacity-75">
            <span className="h-2 w-2 rounded-full bg-accent" />
            استخدام هذه المنظومة مقصور على العاملين المخوَّلين.
          </div>
        </div>

        {/* Form column */}
        <div className="flex flex-1 flex-col rounded-t-lg bg-surface p-6 shadow-lg lg:order-1 lg:rounded-none lg:p-14 lg:shadow-none">
          <div className="mb-11 hidden items-center gap-3 lg:flex">
            <BrandMark />
            <div>
              <p className="text-[18px] font-black text-ink">ضابط</p>
              <p className="text-[11px] font-medium text-ink-soft">منظومة ضبط تعبئة الوقود</p>
            </div>
          </div>
          {form}
        </div>
      </div>
    </div>
  );
}
