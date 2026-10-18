import { useState } from 'react';
import { isAxiosError } from 'axios';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { checkArabicPersonName, checkLibyanMobile, checkOwnerIdentity, cleanDigits, identityNumberLength } from '@fuel-tracking/shared-types';
import { apiClient } from '../../lib/apiClient';
import { PillButton } from '../../components/design/PillButton';
import { TextField } from '../../components/design/TextField';
import { Dialog } from '../../components/design/Dialog';
import { LtrText } from '../../components/LtrText';
import { restrictToPhoneNumber } from '../../lib/libyanFormats';
import { identityTypeLabel } from '../../lib/labels';
import { focusFirstInvalid } from '../../lib/focusField';

type EditableIdentity = 'NATIONAL_ID' | 'ADMINISTRATIVE_ID';

interface OwnerEditFormProps {
  ownerId: string;
  fullName: string;
  phone: string | null;
  identityType: string;
  // owners:manage — the name and the phone.
  canEditDetails: boolean;
  // owners:approve_change — the identity type and number too.
  canEditIdentity: boolean;
  onDone: () => void;
}

// The phone as it would be saved ('' when empty or not valid).
function savedPhone(raw: string): string {
  const checked = checkLibyanMobile(raw);
  return checked.ok ? checked.value : '';
}

const SELECT_CLASS =
  'h-[52px] w-full rounded-sm border border-line bg-surface-alt px-3 text-[16px] text-ink focus:outline-none focus:ring-2 focus:ring-primary-dark focus:ring-offset-2 focus:ring-offset-surface lg:h-11 lg:text-[14px]';

// The owner's «تعديل» (after review, 18 Oct 2026): the name and the phone
// (shared registration rules), and — for whoever may approve identity
// corrections (owners:approve_change) — the identity type and number, which
// used to need a correction request. The number field starts empty (the
// stored number is not shown in full); empty keeps it. Nothing is saved
// before the person confirms the list of changes.
export function OwnerEditForm({ ownerId, fullName, phone, identityType, canEditDetails, canEditIdentity, onDone }: OwnerEditFormProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(fullName);
  const [phoneValue, setPhoneValue] = useState(phone ?? '');
  const startType: EditableIdentity = identityType === 'ADMINISTRATIVE_ID' ? 'ADMINISTRATIVE_ID' : 'NATIONAL_ID';
  const [idType, setIdType] = useState<EditableIdentity>(startType);
  const [idNumber, setIdNumber] = useState('');
  const [errors, setErrors] = useState<{ name?: string; phone?: string; idNumber?: string }>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [nothingChanged, setNothingChanged] = useState(false);
  const [confirming, setConfirming] = useState<Array<{ label: string; from: string; to: string; ltr?: boolean }> | null>(null);

  const newNumber = cleanDigits(idNumber);
  const identityChanged = canEditIdentity && (newNumber !== '' || idType !== startType);
  const detailsChanged = canEditDetails && (name.trim() !== fullName || savedPhone(phoneValue) !== (phone ?? ''));

  const mutation = useMutation({
    mutationFn: async () => {
      if (identityChanged) await apiClient.patch(`/owners/${ownerId}/identity`, { identityType: idType, identityNumber: newNumber });
      if (detailsChanged) {
        const checked = checkLibyanMobile(phoneValue);
        await apiClient.patch(`/owners/${ownerId}`, {
          fullName: name.trim(),
          phone: checked.ok && checked.value ? checked.value : undefined,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      setConfirming(null);
      onDone();
    },
    onError: (err) => {
      setConfirming(null);
      const message = isAxiosError(err) ? (err.response?.data as { message?: unknown } | undefined)?.message : undefined;
      setFailure(message === 'IDENTITY_IN_USE' ? 'رقم الهوية هذا مسجّل لمالك آخر.' : 'تعذر حفظ التعديلات. حاول مرة أخرى.');
    },
  });

  function save() {
    setFailure(null);
    setNothingChanged(false);
    const found: { name?: string; phone?: string; idNumber?: string } = {};
    if (canEditDetails) {
      const n = checkArabicPersonName(name, 'اسم المالك');
      if (!n.ok) found.name = n.message;
      const p = checkLibyanMobile(phoneValue);
      if (!p.ok) found.phone = p.message;
    }
    if (identityChanged) {
      if (newNumber === '') found.idNumber = 'اكتب رقم الهوية للنوع الجديد.';
      else {
        const c = checkOwnerIdentity(idType, newNumber);
        if (!c.ok) found.idNumber = c.message;
      }
    }
    setErrors(found);
    if (found.name || found.phone || found.idNumber) return focusFirstInvalid();

    const list: Array<{ label: string; from: string; to: string; ltr?: boolean }> = [];
    if (identityChanged) {
      if (idType !== startType) list.push({ label: 'نوع الهوية', from: identityTypeLabel(startType), to: identityTypeLabel(idType) });
      list.push({ label: 'رقم الهوية', from: 'الرقم الحالي', to: newNumber, ltr: true });
    }
    if (canEditDetails && name.trim() !== fullName) list.push({ label: 'اسم المالك', from: fullName, to: name.trim() });
    const newPhone = savedPhone(phoneValue);
    if (canEditDetails && newPhone !== (phone ?? '')) list.push({ label: 'رقم الهاتف', from: phone ?? '—', to: newPhone || '—', ltr: true });
    if (list.length === 0) return setNothingChanged(true);
    setConfirming(list);
  }

  return (
    <div className="space-y-4">
      {canEditDetails && (
        <>
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
        </>
      )}
      {canEditIdentity && (
        <>
          <div>
            <label htmlFor="owner-edit-id-type" className="mb-1.5 block text-[14px] font-bold text-ink lg:text-[12px]">
              نوع الهوية
            </label>
            <select
              id="owner-edit-id-type"
              data-testid="owner-edit-id-type"
              value={idType}
              onChange={(e) => setIdType(e.target.value as EditableIdentity)}
              className={SELECT_CLASS}
            >
              <option value="NATIONAL_ID">{identityTypeLabel('NATIONAL_ID')}</option>
              <option value="ADMINISTRATIVE_ID">{identityTypeLabel('ADMINISTRATIVE_ID')}</option>
            </select>
          </div>
          <TextField
            label="رقم الهوية الجديد"
            data-testid="owner-edit-id-number"
            value={idNumber}
            onChange={(e) => setIdNumber(cleanDigits(e.target.value).slice(0, identityNumberLength(idType)))}
            inputMode="numeric"
            ltr
            hint={`${identityNumberLength(idType)} رقمًا. اتركه فارغًا لإبقاء الرقم الحالي.`}
            error={errors.idNumber}
          />
        </>
      )}
      {nothingChanged && <p role="status" className="text-[14px] font-medium text-ink-soft lg:text-[12px]">لم تُغيّر أي حقل.</p>}
      {failure && <p role="alert" className="text-[14px] font-medium text-danger-dark lg:text-[12px]">{failure}</p>}
      <div className="flex gap-2 pt-1">
        <PillButton size="field" onClick={save} disabled={mutation.isPending} data-testid="owner-edit-save">
          حفظ
        </PillButton>
        <PillButton size="field" variant="ghost" onClick={onDone}>
          إلغاء
        </PillButton>
      </div>

      <Dialog
        open={confirming !== null}
        title="تأكيد تعديل المالك"
        busy={mutation.isPending}
        onClose={() => !mutation.isPending && setConfirming(null)}
        footer={
          <div className="flex gap-2">
            <PillButton size="field" onClick={() => mutation.mutate()} disabled={mutation.isPending} data-testid="owner-edit-confirm">
              {mutation.isPending ? 'جارٍ الحفظ…' : 'تأكيد الحفظ'}
            </PillButton>
            <PillButton size="field" variant="ghost" onClick={() => setConfirming(null)} disabled={mutation.isPending}>
              رجوع
            </PillButton>
          </div>
        }
      >
        <p className="text-[15px] text-ink lg:text-[13px]">ستُحفظ هذه التغييرات مباشرة وتُسجَّل في سجل التدقيق باسمك:</p>
        <ul className="mt-3 divide-y divide-line-soft rounded-sm border border-line-soft">
          {confirming?.map((c) => (
            <li key={c.label} className="px-3 py-2.5 text-[15px] lg:text-[13px]">
              <p className="font-bold text-ink-soft">{c.label}</p>
              <p className="mt-0.5">
                <span className="text-ink-soft line-through decoration-ink-faint">{c.from}</span>
                <span className="mx-2 text-ink-faint">←</span>
                <span className="font-extrabold text-ink">{c.ltr ? <LtrText>{c.to}</LtrText> : c.to}</span>
              </p>
            </li>
          ))}
        </ul>
      </Dialog>
    </div>
  );
}
