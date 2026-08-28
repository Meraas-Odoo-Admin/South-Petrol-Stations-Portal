import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { apiClient } from '../../lib/apiClient';
import { PillButton } from '../../components/design/PillButton';
import {
  blockChassisForbiddenKeys,
  restrictToChassisNumber,
} from '../../lib/libyanFormats';

interface ChangeRequestFormProps {
  vehicleId: string;
  changeType: 'CHASSIS_CHANGE' | 'BOOKLET_CHANGE';
  label: string;
  onDone: () => void;
}

// POST /vehicles/:id/change-requests already exists from the earlier
// phase (backend was fully built then) — this is the first UI ever built
// against it. A first-time null -> value set applies immediately
// (requiresApproval: false); displacing an already-set value creates a
// pending request instead (requiresApproval: true) — both outcomes are
// handled here since the caller can't know in advance which one applies.
export function ChangeRequestForm({ vehicleId, changeType, label, onDone }: ChangeRequestFormProps) {
  const queryClient = useQueryClient();
  const [requestedValue, setRequestedValue] = useState('');
  const [reason, setReason] = useState('');
  const [proofReference, setProofReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<{ requiresApproval: boolean } | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      apiClient.post<{ requiresApproval: boolean }>(`/vehicles/${vehicleId}/change-requests`, {
        changeType,
        requestedValue,
        reason,
        proofReference,
      }),
    onSuccess: (res) => {
      setApplied({ requiresApproval: res.data.requiresApproval });
      queryClient.invalidateQueries({ queryKey: ['vehicles', vehicleId] });
    },
    onError: (err) => {
      setError(
        isAxiosError<{ message?: string | string[] }>(err)
          ? [err.response?.data?.message].flat().filter(Boolean).join(' — ') || 'تعذر إرسال الطلب.'
          : 'تعذر إرسال الطلب.',
      );
    },
  });

  const inputClass =
    'h-10 w-72 rounded-sm bg-surface-alt px-3 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent';

  if (applied) {
    return (
      <div className="rounded-sm border-s-4 border-ok bg-ok-100 p-3.5 text-[13px] font-bold text-ok">
        {applied.requiresApproval
          ? 'تم إرسال الطلب — بانتظار اعتماد المشرف. القيمة الحالية تبقى سارية حتى الاعتماد.'
          : 'تم تحديث القيمة مباشرة (لم تكن موجودة من قبل).'}
        <button type="button" onClick={onDone} className="ms-3 underline">
          إغلاق
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-[11px] font-bold text-ink-soft">{label} الجديد</label>
        <input
          value={requestedValue}
          onChange={(e) =>
            setRequestedValue(
              changeType === 'CHASSIS_CHANGE' ? restrictToChassisNumber(e.target.value) : e.target.value,
            )
          }
          onKeyDown={changeType === 'CHASSIS_CHANGE' ? blockChassisForbiddenKeys : undefined}
          dir="ltr"
          maxLength={changeType === 'CHASSIS_CHANGE' ? 17 : 12}
          className={`${inputClass} text-end font-mono`}
        />
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-bold text-ink-soft">السبب</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          className={`${inputClass} h-auto w-full py-2`}
        />
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-bold text-ink-soft">
          رقم/مرجع الإثبات <span className="text-danger">*</span>
        </label>
        <input value={proofReference} onChange={(e) => setProofReference(e.target.value)} className={inputClass} />
      </div>
      {error && <p className="text-[12px] text-danger">{error}</p>}
      <div className="flex gap-2 pt-1">
        <PillButton
          onClick={() => {
            setError(null);
            if (!requestedValue || !reason.trim() || !proofReference.trim()) {
              setError('كل الحقول مطلوبة.');
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
