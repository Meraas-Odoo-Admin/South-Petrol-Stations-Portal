import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { PillButton } from '../../components/design/PillButton';
import { OwnerSearchSelect } from '../../components/OwnerSearchSelect';
import { checkBooklet, checkChassis, normalizePlate } from '@fuel-tracking/shared-types';
import { restrictToChassisNumber, restrictToLicensePlate, restrictToRegistrationBooklet } from '../../lib/libyanFormats';

interface VehicleTypeOption {
  id: string;
  name: string;
  isActive: boolean;
}

type VehicleChangeType = 'CHASSIS_CHANGE' | 'BOOKLET_CHANGE' | 'OWNER_CHANGE' | 'PLATE_CHANGE' | 'VEHICLE_TYPE_CHANGE';

interface ChangeRequestFormProps {
  vehicleId: string;
  changeType: VehicleChangeType;
  label: string;
  onDone: () => void;
}

// POST /vehicles/:id/change-requests already exists from the earlier
// phase (backend was fully built then) — this is the first UI ever built
// against it. A first-time null -> value set applies immediately
// (requiresApproval: false); displacing an already-set value creates a
// pending request instead (requiresApproval: true) — both outcomes are
// handled here since the caller can't know in advance which one applies
// (currentPlate is a partial exception — see PLATE_CHANGE below).
//
// Round 12 added OWNER_CHANGE (owner search-select). Round 14: dropped
// USAGE_TYPE_CHANGE from this form entirely — the client asked that
// "نوع المركبة" and "نوع الاستخدام" not both be collected, keeping only
// the Settings-managed one — and added PLATE_CHANGE (a restricted plate
// text field, always approval-gated since currentPlate is never null) and
// VEHICLE_TYPE_CHANGE (a <select> over GET /vehicle-types, replacing
// USAGE_TYPE_CHANGE's old select as the one remaining "type" field).
export function ChangeRequestForm({ vehicleId, changeType, label, onDone }: ChangeRequestFormProps) {
  const queryClient = useQueryClient();
  const [requestedValue, setRequestedValue] = useState('');
  const [ownerLabel, setOwnerLabel] = useState('');
  const [reason, setReason] = useState('');
  const [chassisNonStandard, setChassisNonStandard] = useState(false);
  const [proofReference, setProofReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<{ requiresApproval: boolean } | null>(null);

  const { data: vehicleTypes } = useQuery({
    queryKey: ['vehicle-types'],
    queryFn: async () => (await apiClient.get<VehicleTypeOption[]>('/vehicle-types')).data,
    enabled: changeType === 'VEHICLE_TYPE_CHANGE',
  });

  const mutation = useMutation({
    mutationFn: () =>
      apiClient.post<{ requiresApproval: boolean }>(`/vehicles/${vehicleId}/change-requests`, {
        changeType,
        requestedValue,
        ...(changeType === 'CHASSIS_CHANGE' ? { chassisNonStandard } : {}),
        reason,
        proofReference,
      }),
    onSuccess: (res) => {
      setApplied({ requiresApproval: res.data.requiresApproval });
      queryClient.invalidateQueries({ queryKey: ['vehicles', vehicleId] });
    },
    // The backend's own message body is English technical text — never
    // shown verbatim in this Arabic UI (code-leak audit finding).
    onError: () => setError('تعذر إرسال الطلب — تحقّق من أن القيمة الجديدة غير مستخدمة لمركبة أخرى.'),
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
        {changeType === 'OWNER_CHANGE' ? (
          <OwnerSearchSelect
            value={requestedValue}
            onChange={(ownerId, ownerFullName) => {
              setRequestedValue(ownerId);
              setOwnerLabel(ownerFullName);
            }}
            initialLabel={ownerLabel}
            className={inputClass}
          />
        ) : changeType === 'VEHICLE_TYPE_CHANGE' ? (
          <select value={requestedValue} onChange={(e) => setRequestedValue(e.target.value)} className={inputClass}>
            <option value="">— اختر —</option>
            {vehicleTypes
              ?.filter((t) => t.isActive)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
        ) : changeType === 'PLATE_CHANGE' ? (
          <input
            value={requestedValue}
            onChange={(e) => setRequestedValue(restrictToLicensePlate(e.target.value))}
            dir="ltr"
            className={`${inputClass} text-end font-mono`}
          />
        ) : (
          <input
            value={requestedValue}
            onChange={(e) =>
              setRequestedValue(
                changeType === 'CHASSIS_CHANGE'
                  ? restrictToChassisNumber(e.target.value)
                  : restrictToRegistrationBooklet(e.target.value),
              )
            }
            dir="ltr"
            maxLength={changeType === 'CHASSIS_CHANGE' ? 20 : 12}
            className={`${inputClass} text-end font-mono`}
          />
        )}
        {changeType === 'CHASSIS_CHANGE' && (
          <label className="mt-2 flex items-center gap-2 text-[12px] text-ink">
            <input
              type="checkbox"
              checked={chassisNonStandard}
              onChange={(e) => setChassisNonStandard(e.target.checked)}
            />
            رقم هيكل غير قياسي (ليس 17 خانة)
          </label>
        )}
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
            // The same rules the API applies (packages/shared-types).
            const checked =
              changeType === 'CHASSIS_CHANGE'
                ? checkChassis(requestedValue, chassisNonStandard)
                : changeType === 'BOOKLET_CHANGE'
                  ? checkBooklet(requestedValue)
                  : changeType === 'PLATE_CHANGE' && !normalizePlate(requestedValue)
                    ? { ok: false as const, message: 'رقم اللوحة غير صالح: رمز المدينة ثم رقم اللوحة يفصل بينهما فاصل، ويجوز حرف N في آخره.' }
                    : { ok: true as const };
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
