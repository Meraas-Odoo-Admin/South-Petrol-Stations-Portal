import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { apiClient } from '../../lib/apiClient';
import {
  normalizePlateSearchTerm,
  restrictToChassisNumber,
  restrictToRegistrationBooklet,
  restrictToPhoneNumber,
  CHASSIS_NUMBER_REGEX,
  REGISTRATION_BOOKLET_REGEX,
  LIBYAN_MOBILE_REGEX,
} from '../../lib/libyanFormats';
import { PillButton } from '../../components/design/PillButton';
import { VehicleBrandPicker } from '../../components/VehicleBrandPicker';
import { DigitBoxInput } from '../../components/DigitBoxInput';
import { PLATE_DIGIT_GROUPS, IDENTITY_DIGIT_GROUPS } from '../../lib/digitBoxGroups';
import { identityTypeLabel } from '../../lib/labels';
import { useAuth } from '../auth/AuthProvider';

interface VehicleTypeOption {
  id: string;
  name: string;
  isActive: boolean;
}

interface CreatedVehicle {
  id: string;
  internalCode: string;
  currentPlate: string;
}

// Round 20: the caller (RecordFillUpPage) needs the owner's phone to offer
// a direct WhatsApp share on the success screen for a vehicle created
// inline during that same transaction — threaded through here rather than
// re-fetched, since this form already has it in hand.
interface CreatedVehicleWithOwnerPhone extends CreatedVehicle {
  ownerPhone: string;
}

interface VehicleCreateFormProps {
  onCreated: (vehicle: CreatedVehicleWithOwnerPhone) => void;
  onCancel?: () => void;
  // Round 4 feedback: if the plate typed here already belongs to a
  // registered vehicle, don't fail with a bare "already in use" error —
  // resolve and select that existing vehicle instead, so staff never end
  // up trying (and failing) to register the same plate twice.
  onDuplicateFound?: (vehicle: CreatedVehicle) => void;
  initialPlate?: string;
}

type IdentityType = 'NATIONAL_ID' | 'ADMINISTRATIVE_ID' | 'DRIVERS_LICENSE';

// Verification-fix item 3: artboards 4a/4b show a "مركبة جديدة" button
// beside the plate field — mirrors the shape/minimalism of the old
// driver-side inline-creation flow (now removed, see
// docs/DESIGN_owner_based_fillups.md) rather than exposing every
// CreateVehicleDto field. chassis/booklet are still edited from the
// vehicle detail page once it exists.
//
// Round 7 item 2 added an optional owner-identity section. Round 11 item
// 1: the client confirmed owner information is now MANDATORY — no more
// toggle-to-reveal, the fields are always shown and required, matching
// CreateVehicleDto's now-required ownerId. A driver's license
// (DRIVERS_LICENSE) is a deliberate one-time fallback when the real
// national/administrative ID isn't on hand — FillUpsService.create hard-
// blocks any fill-up on this vehicle past the first one until a real ID
// replaces it (see docs/DESIGN_owner_based_fillups.md and
// docs/OPEN_ITEMS.md for the still-unconfirmed license number format).
//
// This section is still gated on owners:manage (unchanged from round 7) —
// which means a user WITHOUT that permission now has no way to satisfy a
// mandatory field this form requires. Rather than silently letting them
// hit a 400 from the backend, the save button is disabled with an
// explanation. Whether such a user should be able to create a vehicle at
// all now (e.g. via a lighter owners:create-adjacent permission) is a
// real product question this round didn't resolve — flagged in
// docs/OPEN_ITEMS.md rather than picked unilaterally.
//
// Round 12: client feedback — "it only takes the plate number, car brand,
// car type, and the owner information, and the vehicle card contains more
// fields than that, so I need the new vehicle entry to fill all of the
// vehicle information." chassisNumber/registrationBooklet/color/
// manufactureYear/vehicleTypeId were already accepted by CreateVehicleDto
// but never surfaced here — added below, all still optional at creation
// (only currentPlate and the owner fields are actually required), matching
// the DTO's own optionality rather than inventing new requirements.
export function VehicleCreateForm({ onCreated, onCancel, onDuplicateFound, initialPlate }: VehicleCreateFormProps) {
  const { hasPermission } = useAuth();
  const canManageOwners = hasPermission('owners:manage');

  const [plate, setPlate] = useState(initialPlate ?? '');
  const [model, setModel] = useState('');
  const [vehicleTypeId, setVehicleTypeId] = useState('');
  const [chassisNumber, setChassisNumber] = useState('');
  const [registrationBooklet, setRegistrationBooklet] = useState('');
  const [color, setColor] = useState('');
  const [manufactureYear, setManufactureYear] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: vehicleTypes } = useQuery({
    queryKey: ['vehicle-types'],
    queryFn: async () => (await apiClient.get<VehicleTypeOption[]>('/vehicle-types')).data,
  });

  const [ownerIdentityType, setOwnerIdentityType] = useState<IdentityType>('NATIONAL_ID');
  const [ownerIdentityNumber, setOwnerIdentityNumber] = useState('');
  const [ownerFullName, setOwnerFullName] = useState('');
  // Round 20: required going forward — see CreateOwnerDto.phone's own
  // comment. The vehicle-detail QR "send via WhatsApp" button opens a chat
  // with this number directly, so a vehicle onboarded without one has no
  // working share target at all.
  const [ownerPhone, setOwnerPhone] = useState('');

  const mutation = useMutation({
    mutationFn: async () => {
      // Bug found live: this used to always POST a new owner, every time.
      // If the SUBSEQUENT vehicle-creation call below failed for any
      // reason (e.g. an invalid chassis/booklet value — see those fields'
      // own comments), the owner had already been created successfully,
      // and every retry with the same real identity number then failed
      // AGAIN, this time on "an owner with this identity already exists" —
      // a permanent-feeling dead end for a real owner's real ID. Now
      // checks for an existing owner with this exact identityType +
      // identityNumber first and reuses it instead of erroring — also
      // just more correct in general, since the same person can genuinely
      // already be registered as another vehicle's owner.
      const existing = (
        await apiClient.get<{ id: string; identityType: string; identityNumber: string }[]>('/owners', {
          params: { search: ownerIdentityNumber, take: 5 },
        })
      ).data.find((o) => o.identityType === ownerIdentityType && o.identityNumber === ownerIdentityNumber);
      const ownerId =
        existing?.id ??
        (
          await apiClient.post<{ id: string }>('/owners', {
            identityType: ownerIdentityType,
            identityNumber: ownerIdentityNumber,
            fullName: ownerFullName.trim(),
            phone: ownerPhone.trim(),
          })
        ).data.id;
      // internalCode intentionally omitted — round 5 feedback: this was a
      // blank manual text field, which the client flagged as something a
      // station employee shouldn't be typing. VehiclesService.create()
      // now auto-assigns the next "V-######" code when it's left out.
      return apiClient.post<CreatedVehicle>('/vehicles', {
        currentPlate: plate,
        model: model.trim() || undefined,
        vehicleTypeId: vehicleTypeId || undefined,
        chassisNumber: chassisNumber.trim() || undefined,
        registrationBooklet: registrationBooklet.trim() || undefined,
        color: color.trim() || undefined,
        manufactureYear: manufactureYear.trim() ? Number(manufactureYear) : undefined,
        ownerId,
      });
    },
    onSuccess: (res) => onCreated({ ...res.data, ownerPhone: ownerPhone.trim() }),
    onError: async (err) => {
      // A 409 here can genuinely mean "this exact plate is already
      // registered" (currentPlate is unique) — rather than surface a bare
      // error, look the vehicle up and hand it back as a normal selection.
      if (onDuplicateFound && isAxiosError(err) && err.response?.status === 409) {
        try {
          const term = normalizePlateSearchTerm(plate);
          const matches = (
            await apiClient.get<CreatedVehicle[]>('/vehicles', { params: { search: term, take: 5 } })
          ).data;
          const exact = matches.find((v) => normalizePlateSearchTerm(v.currentPlate) === term);
          if (exact) {
            onDuplicateFound(exact);
            return;
          }
        } catch {
          // fall through to the generic message below
        }
      }
      // The backend's own message body is English technical text — never
      // shown verbatim in this Arabic UI (same code-leak-audit reasoning
      // elsewhere in this app).
      setError('تعذر إضافة المركبة — تحقّق من عدم تكرار رقم اللوحة، ومن عدم وجود مالك بنفس رقم الهوية مسبقًا.');
    },
  });

  const inputClass =
    'h-10 rounded-sm bg-surface px-3 text-[13px] text-ink shadow-sm focus:outline-none focus:ring-2 focus:ring-accent';

  return (
    <div className="space-y-3 rounded-sm bg-primary-100 p-3.5">
      <p className="text-[12.5px] font-bold text-primary-dark">إضافة مركبة جديدة</p>
      <div>
        <label className="mb-1 block text-[11px] font-bold text-ink-soft">الرمز الداخلي</label>
        <input value="سيُحدَّد تلقائيًا عند الحفظ" disabled className={`w-56 ${inputClass} opacity-60`} />
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-bold text-ink-soft">رقم اللوحة</label>
        <DigitBoxInput
          groups={PLATE_DIGIT_GROUPS}
          separator="-"
          value={plate}
          onChange={setPlate}
          showKeypad
          data-testid="new-vehicle-plate-input"
        />
        <p className="mt-1 text-center text-[11px] text-ink-faint">رمز البلدية — رقم المركبة</p>
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-bold text-ink-soft">الطراز/الماركة (اختياري)</label>
        <VehicleBrandPicker value={model} onChange={setModel} className={`w-56 ${inputClass}`} />
      </div>
      {/* Round 14: this used to also have a "نوع الاستخدام" select right
          next to this one — the client flagged the two "type" fields as
          confusing when creating a vehicle and asked for only one, the
          Settings-managed one. usageType is no longer collected anywhere
          in the UI (still nullable in the DB for old rows). */}
      <div>
        <label className="mb-1 block text-[11px] font-bold text-ink-soft">نوع المركبة (اختياري)</label>
        <select
          data-testid="new-vehicle-type-select"
          value={vehicleTypeId}
          onChange={(e) => setVehicleTypeId(e.target.value)}
          className={`w-56 ${inputClass}`}
        >
          <option value="">— غير محدَّد —</option>
          {vehicleTypes
            ?.filter((t) => t.isActive)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-bold text-ink-soft">اللون (اختياري)</label>
        <input value={color} onChange={(e) => setColor(e.target.value)} className={`w-56 ${inputClass}`} />
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-bold text-ink-soft">سنة الصنع (اختياري)</label>
        <input
          value={manufactureYear}
          onChange={(e) => setManufactureYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
          inputMode="numeric"
          dir="ltr"
          className={`w-56 ${inputClass}`}
        />
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-bold text-ink-soft">رقم الشاسيه (اختياري)</label>
        <input
          value={chassisNumber}
          onChange={(e) => setChassisNumber(restrictToChassisNumber(e.target.value))}
          dir="ltr"
          maxLength={17}
          className={`w-56 font-mono ${inputClass}`}
        />
        {/* Bug found live: this field had no format restriction at all — a
            short/partial value passed the (missing) client-side check,
            reached the backend as a 400 "must be exactly 17 characters",
            and the generic catch-all error hid the real cause. Worse, by
            then the owner had ALREADY been created in the separate POST
            /owners call above (see the mutationFn's own comment) — every
            retry with the same real identity number then failed AGAIN,
            this time on "owner already exists". Restricting input to valid
            characters and only enabling save once it's the full 17 (or
            empty) prevents the round-trip that caused this entirely. */}
        {chassisNumber.length > 0 && chassisNumber.length < 17 && (
          <p className="mt-1 text-[11px] text-ink-faint">{chassisNumber.length}/17 حرفًا — اترك الحقل فارغًا إذا لم يكن متوفرًا</p>
        )}
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-bold text-ink-soft">رقم كتيب المركبة (اختياري)</label>
        <input
          value={registrationBooklet}
          onChange={(e) => setRegistrationBooklet(restrictToRegistrationBooklet(e.target.value))}
          dir="ltr"
          maxLength={12}
          className={`w-56 font-mono ${inputClass}`}
        />
        {registrationBooklet.length > 0 && registrationBooklet.length < 6 && (
          <p className="mt-1 text-[11px] text-ink-faint">{registrationBooklet.length}/6-12 حرفًا — اترك الحقل فارغًا إذا لم يكن متوفرًا</p>
        )}
      </div>

      {canManageOwners ? (
        <div className="space-y-3 border-t border-primary-dark/10 pt-3">
          <p className="text-[12.5px] font-bold text-primary-dark">
            بيانات المالك <span className="text-danger">*</span>
          </p>
          <div>
            <label className="mb-1 block text-[11px] font-bold text-ink-soft">اسم المالك</label>
            <input
              data-testid="new-owner-fullname-input"
              value={ownerFullName}
              onChange={(e) => setOwnerFullName(e.target.value)}
              className={`w-56 ${inputClass}`}
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold text-ink-soft">نوع الهوية</label>
            <div className="flex gap-2">
              {(['NATIONAL_ID', 'ADMINISTRATIVE_ID', 'DRIVERS_LICENSE'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    setOwnerIdentityType(type);
                    setOwnerIdentityNumber('');
                  }}
                  className={`h-9 flex-1 rounded-sm text-[11.5px] font-bold ${
                    ownerIdentityType === type ? 'bg-primary text-white' : 'bg-surface text-ink-soft'
                  }`}
                >
                  {identityTypeLabel(type)}
                </button>
              ))}
            </div>
            {ownerIdentityType === 'DRIVERS_LICENSE' && (
              <p className="mt-1.5 text-[11px] text-accent-dark">
                بديل مؤقت — صالح لأول تعبئة فقط لهذه المركبة، ثم يجب إضافة رقم وطني أو إداري.
              </p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold text-ink-soft">رقم الهوية</label>
            {ownerIdentityType === 'DRIVERS_LICENSE' ? (
              // Boxed exact-count entry doesn't fit here — no confirmed
              // digit format exists yet (see docs/OPEN_ITEMS.md), so this
              // is a plain permissive text field, not a DigitBoxInput.
              <input
                data-testid="new-owner-identity-input"
                value={ownerIdentityNumber}
                onChange={(e) => setOwnerIdentityNumber(e.target.value)}
                dir="ltr"
                className={`w-56 ${inputClass}`}
              />
            ) : (
              <DigitBoxInput
                groups={IDENTITY_DIGIT_GROUPS}
                value={ownerIdentityNumber}
                onChange={setOwnerIdentityNumber}
                showKeypad
                data-testid="new-owner-identity-input"
              />
            )}
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold text-ink-soft">رقم هاتف المالك (واتساب)</label>
            <input
              data-testid="new-owner-phone-input"
              value={ownerPhone}
              onChange={(e) => setOwnerPhone(restrictToPhoneNumber(e.target.value))}
              dir="ltr"
              placeholder="0912345678"
              className={`w-56 ${inputClass}`}
            />
            <p className="mt-1 text-[11px] text-ink-faint">
              رقم يحمل تطبيق واتساب — يُستخدم لإرسال رمز المركبة إلى المالك مباشرة.
            </p>
          </div>
        </div>
      ) : (
        <p className="border-t border-primary-dark/10 pt-3 text-[11.5px] text-danger">
          بيانات المالك مطلوبة لإضافة مركبة، وحسابك لا يملك صلاحية إدخالها.
        </p>
      )}

      {error && <p className="text-[12px] text-danger">{error}</p>}
      <div className="flex gap-2 pt-1">
        <PillButton
          data-testid="new-vehicle-save"
          onClick={() => {
            setError(null);
            if (!plate.trim()) {
              setError('رقم اللوحة مطلوب.');
              return;
            }
            if (chassisNumber && !CHASSIS_NUMBER_REGEX.test(chassisNumber)) {
              setError('رقم الشاسيه يجب أن يكون 17 حرفًا بالضبط، أو اتركه فارغًا.');
              return;
            }
            if (registrationBooklet && !REGISTRATION_BOOKLET_REGEX.test(registrationBooklet)) {
              setError('رقم كتيب المركبة يجب أن يكون بين 6 و12 حرفًا/رقمًا، أو اتركه فارغًا.');
              return;
            }
            if (!canManageOwners) {
              setError('بيانات المالك مطلوبة، وحسابك لا يملك صلاحية إدخالها.');
              return;
            }
            if (!ownerFullName.trim()) {
              setError('اسم المالك مطلوب.');
              return;
            }
            const identityNumberValid =
              ownerIdentityType === 'DRIVERS_LICENSE'
                ? /^[A-Za-z0-9]{4,20}$/.test(ownerIdentityNumber)
                : ownerIdentityNumber.length === 12;
            if (!identityNumberValid) {
              setError(
                ownerIdentityType === 'DRIVERS_LICENSE'
                  ? 'رقم الرخصة يجب أن يكون بين 4 و20 حرفًا/رقمًا.'
                  : 'رقم الهوية يجب أن يكون 12 رقمًا.',
              );
              return;
            }
            if (!LIBYAN_MOBILE_REGEX.test(ownerPhone.trim())) {
              setError('رقم هاتف المالك مطلوب، ويجب أن يكون رقم هاتف ليبي صحيح (مثال: 0912345678).');
              return;
            }
            mutation.mutate();
          }}
          disabled={mutation.isPending || !canManageOwners}
        >
          {mutation.isPending ? '...جارٍ الحفظ' : 'حفظ المركبة'}
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
