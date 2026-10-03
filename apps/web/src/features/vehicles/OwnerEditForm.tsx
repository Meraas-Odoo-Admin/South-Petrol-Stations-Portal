import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { PillButton } from '../../components/design/PillButton';
import { restrictToPhoneNumber, LIBYAN_MOBILE_REGEX } from '../../lib/libyanFormats';

interface OwnerEditFormProps {
  ownerId: string;
  fullName: string;
  phone: string | null;
  onDone: () => void;
}

// Round 20: fullName/phone are typo-fix territory, not quota/fill-status
// data — UpdateOwnerDto already accepts them with no approval gate
// (identityType/identityNumber are the ones deliberately excluded from it,
// see that DTO's own comment — OwnerIdentityChangeRequestForm is the
// approval-gated side-channel for those). Mirrors VehicleEditForm.tsx's
// save-immediately pattern for the vehicle's own non-rule-affecting fields.
export function OwnerEditForm({ ownerId, fullName, phone, onDone }: OwnerEditFormProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(fullName);
  const [phoneValue, setPhoneValue] = useState(phone ?? '');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      apiClient.patch(`/owners/${ownerId}`, {
        fullName: name.trim(),
        phone: phoneValue.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      onDone();
    },
    onError: () => setError('تعذر حفظ التعديلات.'),
  });

  const inputClass =
    'h-10 w-56 rounded-sm bg-surface-alt px-3 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent';

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-[11px] font-bold text-ink-soft">اسم المالك</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-bold text-ink-soft">رقم الهاتف</label>
        <input
          value={phoneValue}
          onChange={(e) => setPhoneValue(restrictToPhoneNumber(e.target.value))}
          dir="ltr"
          placeholder="0912345678"
          className={inputClass}
        />
      </div>
      <p className="text-[11px] text-ink-faint">
        لتصحيح رقم الهوية أو نوعها، استخدم زر «طلب تصحيح الهوية» أدناه — يتطلب اعتمادًا.
      </p>
      {error && <p className="text-[12px] text-danger">{error}</p>}
      <div className="flex gap-2 pt-1">
        <PillButton
          onClick={() => {
            setError(null);
            if (!name.trim()) {
              setError('اسم المالك مطلوب.');
              return;
            }
            if (phoneValue.trim() && !LIBYAN_MOBILE_REGEX.test(phoneValue.trim())) {
              setError('رقم الهاتف غير صحيح (مثال: 0912345678).');
              return;
            }
            mutation.mutate();
          }}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? '...جارٍ الحفظ' : 'حفظ'}
        </PillButton>
        <PillButton variant="ghost" onClick={onDone}>
          إلغاء
        </PillButton>
      </div>
    </div>
  );
}
