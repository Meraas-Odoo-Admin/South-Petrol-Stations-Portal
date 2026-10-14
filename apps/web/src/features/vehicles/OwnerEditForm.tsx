import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { checkArabicPersonName, checkLibyanMobile } from '@fuel-tracking/shared-types';
import { apiClient } from '../../lib/apiClient';
import { PillButton } from '../../components/design/PillButton';
import { TextField } from '../../components/design/TextField';
import { restrictToPhoneNumber } from '../../lib/libyanFormats';

interface OwnerEditFormProps {
  ownerId: string;
  fullName: string;
  phone: string | null;
  onDone: () => void;
}

// Round 20: fullName/phone are typo-fix territory, not quota/fill-status
// data — UpdateOwnerDto accepts them with no approval gate
// (identityType/identityNumber are the ones deliberately excluded, see
// OwnerIdentityChangeRequestForm for the approval-gated side-channel).
// Phase 5A: the name and the phone follow the same shared rules as at
// registration - an Arabic person name and a Libyan mobile number.
export function OwnerEditForm({ ownerId, fullName, phone, onDone }: OwnerEditFormProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(fullName);
  const [phoneValue, setPhoneValue] = useState(phone ?? '');
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  const [failed, setFailed] = useState(false);

  const mutation = useMutation({
    mutationFn: () => {
      const checked = checkLibyanMobile(phoneValue);
      return apiClient.patch(`/owners/${ownerId}`, {
        fullName: name.trim(),
        phone: checked.ok && checked.value ? checked.value : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      onDone();
    },
    onError: () => setFailed(true),
  });

  function save() {
    setFailed(false);
    const found: { name?: string; phone?: string } = {};
    const n = checkArabicPersonName(name, 'اسم المالك');
    if (!n.ok) found.name = n.message;
    const p = checkLibyanMobile(phoneValue);
    if (!p.ok) found.phone = p.message;
    setErrors(found);
    if (!found.name && !found.phone) mutation.mutate();
  }

  return (
    <div className="space-y-4">
      <TextField label="اسم المالك" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
      <TextField
        label="رقم الهاتف"
        value={phoneValue}
        onChange={(e) => setPhoneValue(restrictToPhoneNumber(e.target.value))}
        error={errors.phone}
        placeholder="0912345678"
        inputMode="tel"
        ltr
      />
      <p className="text-[14px] text-ink-soft lg:text-[12px]">
        لتصحيح رقم الهوية أو نوعها، استخدم زر «طلب تصحيح الهوية» أدناه — يتطلب اعتمادًا.
      </p>
      {failed && <p role="alert" className="text-[14px] font-medium text-danger-dark lg:text-[12px]">تعذر حفظ التعديلات. حاول مرة أخرى.</p>}
      <div className="flex gap-2 pt-1">
        <PillButton size="field" onClick={save} disabled={mutation.isPending}>
          {mutation.isPending ? 'جارٍ الحفظ…' : 'حفظ'}
        </PillButton>
        <PillButton size="field" variant="ghost" onClick={onDone}>
          إلغاء
        </PillButton>
      </div>
    </div>
  );
}
