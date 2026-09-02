import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { apiClient } from '../../lib/apiClient';
import { normalizePlateSearchTerm } from '../../lib/libyanFormats';
import { PillButton } from '../../components/design/PillButton';
import { VehicleBrandPicker } from '../../components/VehicleBrandPicker';
import { DigitBoxInput } from '../../components/DigitBoxInput';
import { PLATE_DIGIT_GROUPS, IDENTITY_DIGIT_GROUPS } from '../../lib/digitBoxGroups';
import { USAGE_TYPE_LABELS, identityTypeLabel } from '../../lib/labels';
import { useAuth } from '../auth/AuthProvider';

interface CreatedVehicle {
  id: string;
  internalCode: string;
  currentPlate: string;
}

interface VehicleCreateFormProps {
  onCreated: (vehicle: CreatedVehicle) => void;
  onCancel?: () => void;
  // Round 4 feedback: if the plate typed here already belongs to a
  // registered vehicle, don't fail with a bare "already in use" error —
  // resolve and select that existing vehicle instead, so staff never end
  // up trying (and failing) to register the same plate twice.
  onDuplicateFound?: (vehicle: CreatedVehicle) => void;
  initialPlate?: string;
}

type IdentityType = 'NATIONAL_ID' | 'ADMINISTRATIVE_ID';

// Verification-fix item 3: artboards 4a/4b show a "مركبة جديدة" button
// beside the plate field — mirrors the shape/minimalism of the old
// driver-side inline-creation flow (now removed, see
// docs/DESIGN_owner_based_fillups.md) rather than exposing every
// CreateVehicleDto field. chassis/booklet are still edited from the
// vehicle detail page once it exists.
//
// Round 7 item 2: adds an optional owner-identity section (identityType +
// boxed identityNumber + fullName) — the new-vehicle flow's screenshots
// show owner data collected at creation time, and CreateOwnerDto already
// has exactly this shape (no new schema needed). Left fully optional since
// Vehicle.ownerId itself is nullable — a station employee who doesn't have
// the owner's ID on hand yet can still register the vehicle.
export function VehicleCreateForm({ onCreated, onCancel, onDuplicateFound, initialPlate }: VehicleCreateFormProps) {
  const { hasPermission } = useAuth();
  const canManageOwners = hasPermission('owners:manage');

  const [plate, setPlate] = useState(initialPlate ?? '');
  const [usageType, setUsageType] = useState('');
  const [model, setModel] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [addOwner, setAddOwner] = useState(false);
  const [ownerIdentityType, setOwnerIdentityType] = useState<IdentityType>('NATIONAL_ID');
  const [ownerIdentityNumber, setOwnerIdentityNumber] = useState('');
  const [ownerFullName, setOwnerFullName] = useState('');

  const mutation = useMutation({
    mutationFn: async () => {
      let ownerId: string | undefined;
      if (addOwner) {
        const ownerRes = await apiClient.post<{ id: string }>('/owners', {
          identityType: ownerIdentityType,
          identityNumber: ownerIdentityNumber,
          fullName: ownerFullName.trim(),
        });
        ownerId = ownerRes.data.id;
      }
      // internalCode intentionally omitted — round 5 feedback: this was a
      // blank manual text field, which the client flagged as something a
      // station employee shouldn't be typing. VehiclesService.create()
      // now auto-assigns the next "V-######" code when it's left out.
      return apiClient.post<CreatedVehicle>('/vehicles', {
        currentPlate: plate,
        usageType: usageType || undefined,
        model: model.trim() || undefined,
        ownerId,
      });
    },
    onSuccess: (res) => onCreated(res.data),
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
      <div>
        <label className="mb-1 block text-[11px] font-bold text-ink-soft">نوع الاستخدام (اختياري)</label>
        <select value={usageType} onChange={(e) => setUsageType(e.target.value)} className={`w-56 ${inputClass}`}>
          <option value="">— غير محدَّد —</option>
          {Object.entries(USAGE_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {canManageOwners && (
        <div className="border-t border-primary-dark/10 pt-3">
          {!addOwner ? (
            <button
              type="button"
              data-testid="new-vehicle-add-owner-toggle"
              onClick={() => setAddOwner(true)}
              className="text-[11.5px] font-bold text-accent-dark"
            >
              + إضافة بيانات المالك (اختياري)
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[12.5px] font-bold text-primary-dark">بيانات المالك</p>
                <button
                  type="button"
                  onClick={() => {
                    setAddOwner(false);
                    setOwnerIdentityNumber('');
                    setOwnerFullName('');
                  }}
                  className="text-[11px] font-bold text-ink-soft"
                >
                  إلغاء
                </button>
              </div>
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
                  {(['NATIONAL_ID', 'ADMINISTRATIVE_ID'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setOwnerIdentityType(type)}
                      className={`h-9 flex-1 rounded-sm text-[12px] font-bold ${
                        ownerIdentityType === type ? 'bg-primary text-white' : 'bg-surface text-ink-soft'
                      }`}
                    >
                      {identityTypeLabel(type)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold text-ink-soft">رقم الهوية</label>
                <DigitBoxInput
                  groups={IDENTITY_DIGIT_GROUPS}
                  value={ownerIdentityNumber}
                  onChange={setOwnerIdentityNumber}
                  showKeypad
                  data-testid="new-owner-identity-input"
                />
              </div>
            </div>
          )}
        </div>
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
            if (addOwner && (!ownerFullName.trim() || ownerIdentityNumber.length !== 12)) {
              setError('اسم المالك ورقم الهوية (12 رقمًا) مطلوبان لإضافة مالك.');
              return;
            }
            mutation.mutate();
          }}
          disabled={mutation.isPending}
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
