import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { apiClient } from '../../lib/apiClient';
import { restrictToIdentityNumber } from '../../lib/libyanFormats';
import { PillButton } from '../../components/design/PillButton';

interface CreatedDriver {
  id: string;
  fullName: string;
}

interface DriverCreateFormProps {
  onCreated: (driver: CreatedDriver) => void;
  onCancel?: () => void;
}

// Item 10: no create/edit form existed anywhere for Driver before this —
// the libyanFormats masking/restriction helpers were built ready-to-wire
// two phases ago and never had a form to attach to until now. A
// station_employee sees the identityNumber value exactly as typed (an
// <input> is never masked — masking only ever applied to an already-
// SAVED value on a display page); it displays masked from then on, same
// as everyone else (lib/masking.ts, unchanged).
export function DriverCreateForm({ onCreated, onCancel }: DriverCreateFormProps) {
  const [identityType, setIdentityType] = useState<'NATIONAL_ID' | 'ADMINISTRATIVE_ID'>('NATIONAL_ID');
  const [identityNumber, setIdentityNumber] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      apiClient.post<CreatedDriver>('/drivers', {
        identityType,
        identityNumber,
        fullName,
        phone: phone || undefined,
      }),
    onSuccess: (res) => onCreated(res.data),
    onError: (err) => {
      setError(
        isAxiosError<{ message?: string | string[] }>(err)
          ? [err.response?.data?.message].flat().filter(Boolean).join(' — ') || 'تعذر إضافة السائق.'
          : 'تعذر إضافة السائق.',
      );
    },
  });

  const inputClass =
    'h-10 rounded-sm bg-surface px-3 text-[13px] text-ink shadow-sm focus:outline-none focus:ring-2 focus:ring-accent';

  return (
    <div className="space-y-3 rounded-sm bg-primary-100 p-3.5">
      <p className="text-[12.5px] font-bold text-primary-dark">إضافة سائق جديد</p>
      <div>
        <label className="mb-1 block text-[11px] font-bold text-ink-soft">نوع الهوية</label>
        <select
          value={identityType}
          onChange={(e) => setIdentityType(e.target.value as typeof identityType)}
          className={inputClass}
        >
          <option value="NATIONAL_ID">رقم وطني</option>
          <option value="ADMINISTRATIVE_ID">رقم إداري</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-bold text-ink-soft">رقم الهوية</label>
        <input
          value={identityNumber}
          onChange={(e) => setIdentityNumber(restrictToIdentityNumber(e.target.value))}
          dir="ltr"
          maxLength={12}
          className={`w-56 ${inputClass} text-end font-mono`}
        />
        <p className="mt-1 text-[11px] text-ink-faint">
          {identityType === 'NATIONAL_ID' ? '12 رقمًا يبدأ بـ 1 أو 2' : '12 رقمًا يبدأ بـ 9'}
        </p>
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-bold text-ink-soft">الاسم الكامل</label>
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={`w-72 ${inputClass}`} />
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-bold text-ink-soft">الهاتف (اختياري)</label>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          dir="ltr"
          className={`w-56 ${inputClass} text-end`}
        />
      </div>
      {error && <p className="text-[12px] text-danger">{error}</p>}
      <div className="flex gap-2 pt-1">
        <PillButton
          onClick={() => {
            setError(null);
            if (!identityNumber || !fullName.trim()) {
              setError('رقم الهوية والاسم مطلوبان.');
              return;
            }
            mutation.mutate();
          }}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? '...جارٍ الحفظ' : 'حفظ السائق'}
        </PillButton>
        {onCancel && (
          <PillButton variant="ghost" onClick={onCancel}>
            إلغاء
          </PillButton>
        )}
      </div>
    </div>
  );
}
