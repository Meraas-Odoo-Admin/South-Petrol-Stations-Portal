import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { PillButton } from '../../components/design/PillButton';
import { restrictToIdentityNumber } from '../../lib/libyanFormats';
import { identityTypeLabel } from '../../lib/labels';
import {
  ADMINISTRATIVE_ID_HELP,
  NATIONAL_ID_HELP,
  checkOwnerIdentity,
} from '@fuel-tracking/shared-types';

type IdentityType = 'NATIONAL_ID' | 'ADMINISTRATIVE_ID';

interface OwnerIdentityChangeRequestFormProps {
  ownerId: string;
  currentIdentityType: string;
  onDone: () => void;
}

// POST /owners/:id/change-requests — always creates a PENDING request, no
// "first value ever set" bypass (identityType/identityNumber are required
// at owner creation, so there's no null state to skip approval for, unlike
// ChangeRequestForm's vehicle chassis/booklet case). Mirrors
// ChangeRequestForm.tsx's shape but with two fields that change together
// (identityType + identityNumber, compound-unique on VehicleOwner) instead
// of one.
export function OwnerIdentityChangeRequestForm({
  ownerId,
  currentIdentityType,
  onDone,
}: OwnerIdentityChangeRequestFormProps) {
  const queryClient = useQueryClient();
  const [identityType, setIdentityType] = useState<IdentityType>(currentIdentityType === 'ADMINISTRATIVE_ID' ? 'ADMINISTRATIVE_ID' : 'NATIONAL_ID');
  const [identityNumber, setIdentityNumber] = useState('');
  const [reason, setReason] = useState('');
  const [proofReference, setProofReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  const idLive = identityNumber ? checkOwnerIdentity(identityType, identityNumber, { partial: true }) : null;
  const [submitted, setSubmitted] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      apiClient.post(`/owners/${ownerId}/change-requests`, {
        identityType,
        identityNumber,
        reason,
        proofReference,
      }),
    onSuccess: () => {
      setSubmitted(true);
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    },
    // The backend's own message is English technical text — never shown
    // verbatim in this Arabic UI (same policy as ChangeRequestForm).
    onError: () => setError('تعذر إرسال الطلب — تحقّق من أن الرقم غير مستخدم من قبل مالك آخر.'),
  });

  const inputClass =
    'h-10 w-72 rounded-sm bg-surface-alt px-3 text-[15px] lg:text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent';

  if (submitted) {
    return (
      <div className="rounded-sm border-s-4 border-ok bg-ok-100 p-3.5 text-[15px] lg:text-[13px] font-bold text-ok">
        تم إرسال طلب تصحيح الهوية — بانتظار اعتماد المشرف. الرقم الحالي يبقى ساريًا حتى الاعتماد.
        <button type="button" onClick={onDone} className="ms-3 underline">
          إغلاق
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-[13px] lg:text-[12px] font-bold text-ink-soft">نوع الهوية الجديد</label>
        <select
          value={identityType}
          onChange={(e) => setIdentityType(e.target.value as IdentityType)}
          className={inputClass}
        >
          <option value="NATIONAL_ID">{identityTypeLabel('NATIONAL_ID')}</option>
          <option value="ADMINISTRATIVE_ID">{identityTypeLabel('ADMINISTRATIVE_ID')}</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-[13px] lg:text-[12px] font-bold text-ink-soft">الرقم الجديد</label>
        <input
          value={identityNumber}
          onChange={(e) => setIdentityNumber(restrictToIdentityNumber(e.target.value))}
          dir="ltr"
          maxLength={12}
          className={`${inputClass} text-end font-mono`}
        />
        {idLive && !idLive.ok ? (
          <p role="alert" className="mt-1 text-[13px] lg:text-[12px] font-medium text-danger-dark">{idLive.message}</p>
        ) : (
          <p className="mt-1 text-[13px] lg:text-[12px] text-ink-faint">
            {identityType === 'NATIONAL_ID' ? NATIONAL_ID_HELP : ADMINISTRATIVE_ID_HELP}
          </p>
        )}
      </div>
      <div>
        <label className="mb-1 block text-[13px] lg:text-[12px] font-bold text-ink-soft">السبب</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          className={`${inputClass} h-auto w-full py-2`}
        />
      </div>
      <div>
        <label className="mb-1 block text-[13px] lg:text-[12px] font-bold text-ink-soft">
          رقم/مرجع الإثبات <span className="text-danger">*</span>
        </label>
        <input value={proofReference} onChange={(e) => setProofReference(e.target.value)} className={inputClass} />
      </div>
      {error && <p className="text-[13px] lg:text-[12px] text-danger">{error}</p>}
      <div className="flex gap-2 pt-1">
        <PillButton
          onClick={() => {
            setError(null);
            if (!identityNumber || !reason.trim() || !proofReference.trim()) {
              setError('كل الحقول مطلوبة.');
              return;
            }
            const checked = checkOwnerIdentity(identityType, identityNumber);
            if (!checked.ok) {
              setError(checked.message);
              return;
            }
            mutation.mutate();
          }}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? '...جارٍ الإرسال' : 'إرسال الطلب'}
        </PillButton>
        <PillButton variant="ghost" onClick={onDone}>
          إلغاء
        </PillButton>
      </div>
    </div>
  );
}
