import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { restrictToLicensePlate } from '../../lib/libyanFormats';
import { PillButton } from '../../components/design/PillButton';
import { USAGE_TYPE_LABELS } from '../../lib/labels';

interface CreatedVehicle {
  id: string;
  internalCode: string;
  currentPlate: string;
}

interface VehicleCreateFormProps {
  onCreated: (vehicle: CreatedVehicle) => void;
  onCancel?: () => void;
}

// Verification-fix item 3: artboards 4a/4b show a "مركبة جديدة" button
// beside the plate field, parallel to the driver side's inline-creation
// flow (DriverCreateForm) — but no UI path to POST /vehicles existed
// anywhere in the frontend before this. Mirrors DriverCreateForm's shape
// and minimalism (required fields only, plus the one optional field
// worth surfacing inline) rather than exposing every CreateVehicleDto
// field — chassis/booklet/owner are edited from the vehicle detail page
// once it exists, same division of labor as the driver form leaving
// phone as the only optional field.
export function VehicleCreateForm({ onCreated, onCancel }: VehicleCreateFormProps) {
  const [internalCode, setInternalCode] = useState('');
  const [currentPlate, setCurrentPlate] = useState('');
  const [usageType, setUsageType] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      apiClient.post<CreatedVehicle>('/vehicles', {
        internalCode,
        currentPlate,
        usageType: usageType || undefined,
      }),
    onSuccess: (res) => onCreated(res.data),
    // The backend's own message body is English technical text — never
    // shown verbatim in this Arabic UI (same code-leak-audit reasoning as
    // DriverCreateForm/StationsAdminPage/etc.).
    onError: () => setError('تعذر إضافة المركبة — تحقّق من عدم تكرار الرمز الداخلي أو رقم اللوحة.'),
  });

  const inputClass =
    'h-10 rounded-sm bg-surface px-3 text-[13px] text-ink shadow-sm focus:outline-none focus:ring-2 focus:ring-accent';

  return (
    <div className="space-y-3 rounded-sm bg-primary-100 p-3.5">
      <p className="text-[12.5px] font-bold text-primary-dark">إضافة مركبة جديدة</p>
      <div>
        <label className="mb-1 block text-[11px] font-bold text-ink-soft">الرمز الداخلي</label>
        <input value={internalCode} onChange={(e) => setInternalCode(e.target.value)} className={`w-56 ${inputClass}`} />
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-bold text-ink-soft">رقم اللوحة</label>
        <input
          value={currentPlate}
          onChange={(e) => setCurrentPlate(restrictToLicensePlate(e.target.value))}
          dir="ltr"
          maxLength={10}
          className={`w-56 ${inputClass} text-end font-mono`}
        />
        <p className="mt-1 text-[11px] text-ink-faint">الرقم قبل الخط رمز البلدية، وبعده رقم المركبة</p>
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
      {error && <p className="text-[12px] text-danger">{error}</p>}
      <div className="flex gap-2 pt-1">
        <PillButton
          onClick={() => {
            setError(null);
            if (!internalCode.trim() || !currentPlate.trim()) {
              setError('الرمز الداخلي ورقم اللوحة مطلوبان.');
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
