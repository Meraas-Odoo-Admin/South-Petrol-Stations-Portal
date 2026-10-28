import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ADMINISTRATIVE_ID_HELP,
  LIBYAN_MOBILE_HELP,
  NATIONAL_ID_HELP,
  checkArabicPersonName,
  checkLibyanMobile,
  checkOwnerIdentity,
  identityNumberLength,
} from '@fuel-tracking/shared-types';
import { apiClient } from '../../lib/apiClient';
import { identityTypeLabel } from '../../lib/labels';
import { restrictToIdentityNumber, restrictToPhoneNumber } from '../../lib/libyanFormats';
import { identityDigitGroups } from '../../lib/digitBoxGroups';
import { Dialog } from '../../components/design/Dialog';
import { PillButton } from '../../components/design/PillButton';
import { TextAreaField, TextField } from '../../components/design/TextField';
import { DigitBoxInput } from '../../components/DigitBoxInput';
import { Notice } from '../users/parts';
import { registrationErrorMessage } from '../registration/registrationErrors';

// After review (Khalil, 28 Oct 2026): «نقل الملكية» — the vehicle was sold.
// The office manager finds the new owner by identity number (or registers
// them, as on the registration screen), gives the reason, and confirms. The
// server moves the vehicle and cancels its card in one step; the new owner is
// then issued a new card from the card section of this page.

type IdentityType = 'NATIONAL_ID' | 'ADMINISTRATIVE_ID';
interface OwnerRow {
  id: string;
  fullName: string;
  identityType: string;
  identityNumber: string;
  phone: string | null;
}
interface Office {
  id: string;
  name: string;
  status: string;
}

const LABEL = 'mb-1.5 block text-[14px] font-bold text-ink lg:text-[12px]';

export function TransferOwnerDialog({
  vehicleId,
  currentOwnerId,
  currentOwnerName,
  onClose,
}: {
  vehicleId: string;
  currentOwnerId: string | null;
  currentOwnerName: string | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [identityType, setIdentityType] = useState<IdentityType>('NATIONAL_ID');
  const [identityNumber, setIdentityNumber] = useState('');
  const [searched, setSearched] = useState<{ type: IdentityType; number: string } | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [officeId, setOfficeId] = useState('');
  const [reason, setReason] = useState('بيع المركبة');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ ownerName: string; cardNumber: string | null } | null>(null);

  const complete = identityNumber.length === identityNumberLength(identityType) && checkOwnerIdentity(identityType, identityNumber).ok;
  const lookup = useQuery({
    queryKey: ['owners', 'by-identity', searched],
    enabled: Boolean(searched),
    queryFn: async () =>
      (await apiClient.get<OwnerRow[]>('/owners', { params: { identityType: searched!.type, identityNumber: searched!.number } })).data,
  });
  const found = lookup.data?.[0] ?? null;
  const isNew = Boolean(searched) && lookup.isSuccess && !found;
  const sameOwner = Boolean(found && found.id === currentOwnerId);

  // A new owner is registered at one of the manager's offices.
  const offices = useQuery({
    queryKey: ['registration-stations'],
    enabled: isNew,
    queryFn: async () => (await apiClient.get<Office[]>('/registration-stations')).data,
  });
  const officeList = (offices.data ?? []).filter((o) => o.status === 'ACTIVE');
  const office = officeList.length === 1 ? officeList[0]!.id : officeId;

  const nameCheck = name ? checkArabicPersonName(name, 'اسم المالك') : null;
  const phoneCheck = phone ? checkLibyanMobile(phone, { required: true }) : null;
  const newOwnerReady = isNew && nameCheck?.ok === true && phoneCheck?.ok === true && Boolean(office);
  const ready = reason.trim().length >= 3 && ((found && !sameOwner) || newOwnerReady);

  const transfer = useMutation({
    mutationFn: async () => {
      let owner = found;
      if (!owner) {
        owner = (
          await apiClient.post<OwnerRow>('/owners', {
            registrationStationId: office,
            identityType: searched!.type,
            identityNumber: searched!.number,
            fullName: name.trim(),
            phone: phone.trim(),
            address: address.trim() || undefined,
          })
        ).data;
      }
      const res = await apiClient.post<{ cancelledCard: { cardNumber: string } | null }>(`/vehicles/${vehicleId}/transfer-owner`, {
        ownerId: owner.id,
        reason: reason.trim(),
      });
      return { ownerName: owner.fullName, cardNumber: res.data.cancelledCard?.cardNumber ?? null };
    },
    onSuccess: async (result) => {
      setDone(result);
      await queryClient.invalidateQueries({ queryKey: ['vehicles', vehicleId] });
      await queryClient.invalidateQueries({ queryKey: ['vehicle-cards', vehicleId] });
      await queryClient.invalidateQueries({ queryKey: ['owners'] });
    },
    onError: (err) => setError(registrationErrorMessage(err)),
  });

  if (done) {
    return (
      <Dialog
        open
        title="نُقلت الملكية"
        onClose={onClose}
        footer={
          <PillButton size="field" onClick={onClose}>
            تم
          </PillButton>
        }
      >
        <div className="space-y-3" data-testid="transfer-owner-done">
          <Notice kind="success">صارت المركبة باسم {done.ownerName}.</Notice>
          <p className="text-[16px] leading-[1.7] text-ink lg:text-[14px]">
            {done.cardNumber ? (
              <>
                أُلغيت البطاقة <bdi dir="ltr" className="font-mono font-bold">{done.cardNumber}</bdi>، فلم تعد تصلح للتعبئة. أصدر للمالك الجديد بطاقة من قسم «البطاقة» في هذه الصفحة.
              </>
            ) : (
              'لم تكن للمركبة بطاقة فعّالة. أصدر للمالك الجديد بطاقة من قسم «البطاقة» في هذه الصفحة.'
            )}
          </p>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      title="نقل ملكية المركبة"
      busy={transfer.isPending}
      onClose={onClose}
      footer={
        <>
          <PillButton size="field" variant="secondary" disabled={transfer.isPending} onClick={onClose}>
            رجوع
          </PillButton>
          <PillButton
            size="field"
            variant="danger"
            data-testid="transfer-owner-confirm"
            disabled={!ready || transfer.isPending}
            onClick={() => {
              setError(null);
              transfer.mutate();
            }}
          >
            {transfer.isPending ? 'جارٍ النقل…' : 'نقل الملكية وإلغاء البطاقة'}
          </PillButton>
        </>
      }
    >
      <div className="space-y-4" data-testid="transfer-owner-dialog">
        <p className="rounded-md bg-accent-100 p-3 text-[15px] font-bold leading-[1.7] text-ink lg:text-[13px]">
          المالك الحالي: {currentOwnerName ?? '—'}. عند النقل تُلغى بطاقة المركبة الحالية، وتصدر بطاقة جديدة للمالك الجديد.
        </p>

        <div>
          <span className={LABEL}>نوع هوية المالك الجديد</span>
          <div className="flex gap-2">
            {(['NATIONAL_ID', 'ADMINISTRATIVE_ID'] as const).map((type) => (
              <button
                key={type}
                type="button"
                aria-pressed={identityType === type}
                onClick={() => {
                  setIdentityType(type);
                  setIdentityNumber('');
                  setSearched(null);
                }}
                className={`h-11 flex-1 rounded-full text-[15px] font-bold lg:h-10 lg:text-[13px] ${
                  identityType === type ? 'bg-primary text-white' : 'bg-surface-alt text-ink-soft'
                }`}
              >
                {identityTypeLabel(type)}
              </button>
            ))}
          </div>
        </div>
        <div
          onKeyDown={(e) => {
            if (e.key === 'Enter' && complete) {
              e.preventDefault();
              setSearched({ type: identityType, number: identityNumber });
            }
          }}
        >
          <span className={LABEL}>{identityType === 'NATIONAL_ID' ? 'الرقم الوطني' : 'الرقم الإداري'}</span>
          <DigitBoxInput
            key={identityType}
            groups={identityDigitGroups(identityType)}
            value={identityNumber}
            onChange={(v) => {
              setIdentityNumber(restrictToIdentityNumber(v, identityNumberLength(identityType)));
              setSearched(null);
            }}
            data-testid="transfer-owner-identity"
            label={identityType === 'NATIONAL_ID' ? 'الرقم الوطني' : 'الرقم الإداري'}
          />
          <p className="mt-1.5 text-[14px] text-ink-soft lg:text-[12px]">{identityType === 'NATIONAL_ID' ? NATIONAL_ID_HELP : ADMINISTRATIVE_ID_HELP}</p>
        </div>
        {!searched && (
          <PillButton size="field" disabled={!complete} onClick={() => setSearched({ type: identityType, number: identityNumber })} data-testid="transfer-owner-search">
            بحث عن المالك الجديد
          </PillButton>
        )}
        {lookup.isLoading && <p className="text-[15px] text-ink-soft lg:text-[13px]">جارٍ البحث…</p>}

        {found && (
          <div className="rounded-md border border-line p-3" data-testid="transfer-owner-found">
            <p className="text-[16px] font-bold text-ink lg:text-[14px]">{found.fullName}</p>
            <p className="text-[14px] text-ink-soft lg:text-[12px]">مالك مسجّل في المنظومة.</p>
            {sameOwner && <p className="mt-1 text-[14px] font-bold text-danger-dark lg:text-[12px]">هذا هو المالك الحالي للمركبة.</p>}
          </div>
        )}

        {isNew && (
          <div className="space-y-3 rounded-md border border-line p-3" data-testid="transfer-owner-new">
            <p className="text-[15px] font-bold text-ink lg:text-[13px]">لا يوجد مالك بهذا الرقم. سجّله الآن:</p>
            <TextField label="الاسم الكامل" value={name} onChange={(e) => setName(e.target.value)} error={nameCheck && !nameCheck.ok ? nameCheck.message : undefined} />
            <TextField
              label="رقم الهاتف"
              ltr
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(restrictToPhoneNumber(e.target.value))}
              hint={LIBYAN_MOBILE_HELP}
              error={phoneCheck && !phoneCheck.ok ? phoneCheck.message : undefined}
            />
            <TextField label="العنوان (اختياري)" value={address} onChange={(e) => setAddress(e.target.value)} />
            {officeList.length > 1 && (
              <div>
                <label htmlFor="transfer-office" className={LABEL}>
                  مكتب التسجيل
                </label>
                <select
                  id="transfer-office"
                  value={officeId}
                  onChange={(e) => setOfficeId(e.target.value)}
                  className="h-12 w-full rounded-sm border border-line bg-surface-alt px-3 text-[16px] text-ink lg:h-11 lg:text-[14px]"
                >
                  <option value="">اختر المكتب</option>
                  {officeList.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        <TextAreaField label="سبب نقل الملكية" value={reason} onChange={(e) => setReason(e.target.value)} />
        {error && <Notice kind="error">{error}</Notice>}
      </div>
    </Dialog>
  );
}
