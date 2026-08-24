import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { isAxiosError } from 'axios';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'كلمة المرور الحالية مطلوبة'),
  newPassword: z.string().min(8, 'يجب ألا تقل كلمة المرور الجديدة عن 8 أحرف'),
});

type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;

export function ChangePasswordPage() {
  const { changePassword, user } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordFormValues>({ resolver: zodResolver(changePasswordSchema) });

  async function onSubmit(values: ChangePasswordFormValues) {
    setServerError(null);
    try {
      await changePassword(values);
      navigate('/', { replace: true });
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 401) {
        setServerError('كلمة المرور الحالية غير صحيحة.');
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
        <h1 className="mb-2 text-xl font-bold text-slate-900">تغيير كلمة المرور</h1>
        {user?.mustChangePassword && (
          <p className="mb-4 text-sm text-amber-700">
            يجب تغيير كلمة المرور قبل متابعة استخدام النظام.
          </p>
        )}

        <label className="mb-1 block text-sm font-medium text-slate-700">كلمة المرور الحالية</label>
        <input
          type="password"
          {...register('currentPassword')}
          className="mb-1 w-full rounded border border-slate-300 px-3 py-2"
          autoComplete="current-password"
        />
        {errors.currentPassword && (
          <p className="mb-2 text-sm text-red-600">{errors.currentPassword.message}</p>
        )}

        <label className="mb-1 mt-3 block text-sm font-medium text-slate-700">كلمة المرور الجديدة</label>
        <input
          type="password"
          {...register('newPassword')}
          className="mb-1 w-full rounded border border-slate-300 px-3 py-2"
          autoComplete="new-password"
        />
        {errors.newPassword && (
          <p className="mb-2 text-sm text-red-600">{errors.newPassword.message}</p>
        )}

        {serverError && <p className="mt-3 text-sm text-red-600">{serverError}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-5 w-full rounded bg-slate-900 py-2 font-medium text-white disabled:opacity-50"
        >
          {isSubmitting ? '...جارٍ الحفظ' : 'حفظ'}
        </button>
      </form>
    </div>
  );
}
