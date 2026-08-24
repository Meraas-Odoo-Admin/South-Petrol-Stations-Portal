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

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

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

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 ps-4 pe-4">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="w-full max-w-sm rounded-lg bg-white p-6 shadow"
      >
        <h1 className="mb-6 text-xl font-bold text-slate-900">تسجيل الدخول</h1>

        <label className="mb-1 block text-sm font-medium text-slate-700">اسم المستخدم</label>
        <input
          {...register('username')}
          className="mb-1 w-full rounded border border-slate-300 px-3 py-2"
          autoComplete="username"
        />
        {errors.username && <p className="mb-2 text-sm text-red-600">{errors.username.message}</p>}

        <label className="mb-1 mt-3 block text-sm font-medium text-slate-700">كلمة المرور</label>
        <input
          type="password"
          {...register('password')}
          className="mb-1 w-full rounded border border-slate-300 px-3 py-2"
          autoComplete="current-password"
        />
        {errors.password && <p className="mb-2 text-sm text-red-600">{errors.password.message}</p>}

        {serverError && <p className="mt-3 text-sm text-red-600">{serverError}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-5 w-full rounded bg-slate-900 py-2 font-medium text-white disabled:opacity-50"
        >
          {isSubmitting ? '...جارٍ الدخول' : 'دخول'}
        </button>
      </form>
    </div>
  );
}
