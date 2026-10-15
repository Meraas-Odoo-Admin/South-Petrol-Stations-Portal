import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { isAxiosError } from 'axios';
import { APP_NAME, APP_TAGLINE } from '../../lib/appInfo';
import { BrandMark } from '../../components/BrandMark';
import { EyeIcon } from '../../components/EyeIcon';
import { PillButton } from '../../components/design/PillButton';

const loginSchema = z.object({
  username: z.string().min(1, 'اسم المستخدم مطلوب'),
  password: z.string().min(1, 'كلمة المرور مطلوبة'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

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
    'h-[52px] w-full rounded-sm border border-line bg-surface-alt px-3.5 text-[16px] lg:text-[14px] text-ink focus:outline-none focus:ring-2 focus:ring-primary-dark';

  const form = (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col">
      <h1 className="text-[24px] font-black text-primary-dark">تسجيل الدخول</h1>
      <p className="mt-2 text-[15px] lg:text-[13px] leading-[1.7] text-ink-soft">
        أدخل اسم المستخدم الذي سلّمك إياه مشرف محطتك.
      </p>

      <div className="mt-7 flex flex-col gap-[18px]">
        <div>
          <label htmlFor="login-username" className="text-[15px] lg:text-[13px] font-bold text-ink">اسم المستخدم</label>
          <input
              id="login-username"
            {...register('username')}
            autoComplete="username"
            className={`mt-2 ${inputClass}`}
            style={{ height: 52 }}
          />
          {errors.username && <p role="alert" className="mt-1 text-[13px] lg:text-[12px] text-danger-dark">{errors.username.message}</p>}
        </div>

        <div>
          <label htmlFor="login-password" className="text-[15px] lg:text-[13px] font-bold text-ink">كلمة المرور</label>
          {/* Phase 7 (4.5): one edge — the box's. The input inside has none of its own. */}
          <div className="mt-2 flex h-[52px] items-center gap-2.5 rounded-sm border border-primary bg-primary-100 px-3.5 focus-within:ring-2 focus-within:ring-primary-dark focus-within:ring-offset-2">
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              {...register('password')}
              autoComplete="current-password"
              dir="ltr"
              className="min-w-0 flex-1 border-0 bg-transparent text-[15px] font-bold text-primary-dark tracking-[0.2em] focus:outline-none"
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
          <p className="mt-1.5 text-[13px] lg:text-[12px] text-ink-soft">اضغط العين لعرض ما كتبته والتأكد منه.</p>
          {errors.password && <p role="alert" className="mt-1 text-[13px] lg:text-[12px] text-danger-dark">{errors.password.message}</p>}
        </div>
      </div>

      {serverError && <p role="alert" className="mt-4 text-[15px] lg:text-[13px] text-danger-dark">{serverError}</p>}

      <PillButton type="submit" size="field" disabled={isSubmitting} className="mt-7 w-full">
        {isSubmitting ? 'جارٍ الدخول…' : 'دخول'}
      </PillButton>

      <p className="mt-6 text-[13px] lg:text-[12px] leading-[1.7] text-ink-soft lg:mt-auto lg:pt-6">
        إن نسيت كلمة المرور، راجع مشرف محطتك — لا يمكن استرجاعها من هذه الشاشة.
      </p>
    </form>
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-0 lg:p-8">
      <div className="flex w-full max-w-[1140px] flex-col overflow-hidden bg-surface shadow-lg lg:h-[640px] lg:flex-row lg:rounded-lg">
        {/* Mobile: brand header */}
        <div className="flex flex-col items-center gap-3.5 bg-primary py-9 text-white lg:hidden">
          <BrandMark variant="white" size={44} />
          <div className="text-center">
            <p className="text-[20px] font-black">{APP_NAME}</p>
            <p className="mt-1 text-[13px] lg:text-[12px] font-medium opacity-90">{APP_TAGLINE}</p>
          </div>
        </div>

        {/* Desktop: teal marketing panel (order-2 in RTL = visually start side) */}
        <div className="hidden flex-1 flex-col justify-between bg-gradient-to-br from-primary to-primary-dark p-14 text-white lg:order-2 lg:flex">
          <p className="text-[13px] lg:text-[12px] font-extrabold opacity-70">مديرية أمن سبها</p>
          <div>
            <p className="text-[34px] font-black leading-[1.45]">كل لتر مُسجَّل باسم مركبة ووقت ومن سجّله.</p>
            <p className="mt-[18px] text-[16px] lg:text-[14px] leading-[1.9] opacity-90">
              هذه المنظومة تسجّل ولا تحذف. كل إجراء داخلها موثّق باسم من نفّذه ووقته، بما في ذلك دخولك الآن.
            </p>
          </div>
          <div className="flex items-center gap-2.5 text-[13px] lg:text-[12px] font-medium opacity-75">
            <span className="h-2 w-2 rounded-full bg-accent" />
            استخدام هذه المنظومة مقصور على العاملين المخوَّلين.
          </div>
        </div>

        {/* Form column */}
        <div className="flex flex-1 flex-col rounded-t-lg bg-surface p-6 shadow-lg lg:order-1 lg:rounded-none lg:p-14 lg:shadow-none">
          <div className="mb-11 hidden items-center gap-3 lg:flex">
            <BrandMark />
            <div>
              <p className="text-[18px] font-black text-ink">{APP_NAME}</p>
              <p className="text-[13px] lg:text-[12px] font-medium text-ink-soft">{APP_TAGLINE}</p>
            </div>
          </div>
          {form}
        </div>
      </div>
    </div>
  );
}
