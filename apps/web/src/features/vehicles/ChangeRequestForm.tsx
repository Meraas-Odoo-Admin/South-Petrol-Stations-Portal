import { useState } from 'react';
import { LookupSearch, useLookup } from '../../lib/useLookup';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { PillButton } from '../../components/design/PillButton';
import { OwnerSearchSelect } from '../../components/OwnerSearchSelect';
import { DigitBoxInput } from '../../components/DigitBoxInput';
import { LtrText } from '../../components/LtrText';
import { BOOKLET_HELP, REFERENCE_CODE_LABEL, checkBooklet, checkChassis, normalizePlate, referenceCode } from '@fuel-tracking/shared-types';
import { restrictToChassisNumber, restrictToRegistrationBooklet } from '../../lib/libyanFormats';
import { PLATE_DIGIT_GROUPS } from '../../lib/digitBoxGroups';
import { focusField } from '../../lib/focusField';
import { Notice } from '../users/parts';

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
//
// Phase 7: no «رقم/مرجع الإثبات» field — the request gets the system's own
// reference code, shown once it is sent. The new plate is typed in the same
// digit boxes as registration.
export function ChangeRequestForm({ vehicleId, changeType, label, onDone }: ChangeRequestFormProps) {
  const queryClient = useQueryClient();
  const [requestedValue, setRequestedValue] = useState('');
  const [ownerLabel, setOwnerLabel] = useState('');
  const [reason, setReason] = useState('');
  const [chassisNonStandard, setChassisNonStandard] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<{ requiresApproval: boolean; requestId: string | null } | null>(null);

  const typeLookup = useLookup<VehicleTypeOption>('/vehicle-types', 'vehicle-types', changeType === 'VEHICLE_TYPE_CHANGE');
  const vehicleTypes = typeLookup.items;

  const mutation = useMutation({
    mutationFn: () =>
      apiClient.post<{ requiresApproval: boolean; changeRequest?: { id: string } }>(`/vehicles/${vehicleId}/change-requests`, {
        changeType,
        requestedValue,
        ...(changeType === 'CHASSIS_CHANGE' ? { chassisNonStandard } : {}),
        reason,
      }),
    onSuccess: (res) => {
      setApplied({ requiresApproval: res.data.requiresApproval, requestId: res.data.changeRequest?.id ?? null });
      queryClient.invalidateQueries({ queryKey: ['vehicles', vehicleId] });
    },
    // The backend's own message body is English technical text — never
    // shown verbatim in this Arabic UI (code-leak audit finding).
    onError: () => setError('تعذر إرسال الطلب — تحقّق من أن القيمة الجديدة غير مستخدمة لمركبة أخرى.'),
  });

  const inputClass =
    'h-10 w-72 rounded-sm bg-surface-alt px-3 text-[15px] lg:text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary-dark';

  if (applied) {
    return (
      <Notice kind="success">
        <span className="font-bold">
          {applied.requiresApproval
            ? 'تم إرسال الطلب — بانتظار اعتماد المشرف. القيمة الحالية تبقى سارية حتى الاعتماد.'
            : 'تم تحديث القيمة مباشرة (لم تكن موجودة من قبل).'}
        </span>
        {applied.requestId && (
          <span className="mt-1 block" data-testid="change-request-reference">
            {REFERENCE_CODE_LABEL}: <LtrText className="font-mono">{referenceCode('VEHICLE_CHANGE', applied.requestId)}</LtrText>
          </span>
        )}
        <div className="mt-2">
          <PillButton size="sm" variant="secondary" onClick={onDone}>
            إغلاق
          </PillButton>
        </div>
      </Notice>
    );
  }

  return (
    <div className="space-y-3">
      <div data-testid="change-request-value">
        <label className="mb-1 block text-[13px] lg:text-[12px] font-bold text-ink-soft">{label} الجديد</label>
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
          <div>
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
            <LookupSearch id="cr-type-search" q={typeLookup.q} onChange={typeLookup.setQ} capped={typeLookup.capped} />
          </div>
        ) : changeType === 'PLATE_CHANGE' ? (
          <div>
            <DigitBoxInput
              groups={PLATE_DIGIT_GROUPS}
              separator="-"
              value={requestedValue}
              onChange={setRequestedValue}
              data-testid="change-request-plate"
              label="رقم اللوحة الجديد"
            />
            <p className="mt-1.5 text-[14px] text-ink-soft lg:text-[12px]">رمز المدينة (رقم أو رقمان)، ثم رقم المركبة. أرقام فقط.</p>
          </div>
        ) : (
          <input
            inputMode={changeType === 'BOOKLET_CHANGE' ? 'numeric' : undefined}
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
          <label className="mt-2 flex items-center gap-2 text-[13px] lg:text-[12px] text-ink">
            <input
              type="checkbox"
              checked={chassisNonStandard}
              onChange={(e) => setChassisNonStandard(e.target.checked)}
            />
            رقم هيكل غير قياسي (ليس 17 خانة)
          </label>
        )}
        {changeType === 'BOOKLET_CHANGE' && (
          <p className="mt-1.5 text-[14px] text-ink-soft lg:text-[12px]">{BOOKLET_HELP}</p>
        )}
      </div>
      <div>
        <label htmlFor="change-request-reason" className="mb-1 block text-[13px] lg:text-[12px] font-bold text-ink-soft">السبب</label>
        <textarea
          id="change-request-reason"
          data-testid="change-request-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          className={`${inputClass} h-auto w-full py-2`}
        />
      </div>
      {error && (
        <p role="alert" className="text-[13px] lg:text-[12px] text-danger-dark">
          {error}
        </p>
      )}
      <div className="flex gap-2 pt-1">
        <PillButton
          onClick={() => {
            setError(null);
            if (!requestedValue) {
              setError(`${label} الجديد مطلوب.`);
              return focusField('change-request-value');
            }
            // The same rules the API applies (packages/shared-types).
            const checked =
              changeType === 'CHASSIS_CHANGE'
                ? checkChassis(requestedValue, chassisNonStandard)
                : changeType === 'BOOKLET_CHANGE'
                  ? checkBooklet(requestedValue)
                  : changeType === 'PLATE_CHANGE' && !normalizePlate(requestedValue)
                    ? { ok: false as const, message: 'رقم اللوحة غير مكتمل: رمز المدينة ثم رقم المركبة، أرقام فقط.' }
                    : { ok: true as const };
            if (!checked.ok) {
              setError(checked.message);
              return focusField('change-request-value');
            }
            if (!reason.trim()) {
              setError('اكتب سبب التغيير.');
              return focusField('change-request-reason');
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
