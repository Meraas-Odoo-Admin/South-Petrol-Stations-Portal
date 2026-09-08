import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { PillButton } from '../../components/design/PillButton';
import { VehicleBrandPicker } from '../../components/VehicleBrandPicker';
import type { VehicleBasicInfo } from './types';

interface VehicleEditFormProps {
  vehicle: VehicleBasicInfo;
  onDone: () => void;
}

// Round 12: the client wants vehicle edits split by whether they affect
// fill-up rule eligibility — model/color/manufactureYear don't
// (FillUpRuleEngine keys strictly off vehicleId + ownerId), so they save
// immediately here via a single PATCH /vehicles/:id, no approval.
// ownerId/usageType were already excluded from UpdateVehicleDto (they go
// through ChangeRequestForm's OWNER_CHANGE instead — usageType itself is
// no longer collected anywhere, see round 14's schema comment). Round 14
// also moved vehicleTypeId OFF this cosmetic form and onto the same
// approval-gated flow (VEHICLE_TYPE_CHANGE) — the client asked that
// changing a vehicle's type require the same approval as chassis/plate/
// owner, so it's requested from VehicleDetailPage's change-request
// buttons now, not edited here directly.
export function VehicleEditForm({ vehicle, onDone }: VehicleEditFormProps) {
  const queryClient = useQueryClient();
  const [model, setModel] = useState(vehicle.model ?? '');
  const [color, setColor] = useState(vehicle.color ?? '');
  const [manufactureYear, setManufactureYear] = useState(vehicle.manufactureYear?.toString() ?? '');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      apiClient.patch(`/vehicles/${vehicle.id}`, {
        model: model.trim() || undefined,
        color: color.trim() || undefined,
        manufactureYear: manufactureYear.trim() ? Number(manufactureYear) : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles', vehicle.id] });
      onDone();
    },
    onError: () => setError('تعذر حفظ التعديلات.'),
  });

  const inputClass =
    'h-10 w-56 rounded-sm bg-surface-alt px-3 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent';

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-[11px] font-bold text-ink-soft">الطراز/الماركة</label>
        <VehicleBrandPicker value={model} onChange={setModel} className={inputClass} />
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-bold text-ink-soft">اللون</label>
        <input value={color} onChange={(e) => setColor(e.target.value)} className={inputClass} />
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-bold text-ink-soft">سنة الصنع</label>
        <input
          value={manufactureYear}
          onChange={(e) => setManufactureYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
          inputMode="numeric"
          dir="ltr"
          className={inputClass}
        />
      </div>
      <p className="text-[11px] text-ink-faint">
        لتغيير نوع المركبة أو رقم اللوحة أو الشاصي أو المالك، استخدم أزرار «طلب تغيير» أدناه — تتطلب اعتمادًا.
      </p>
      {error && <p className="text-[12px] text-danger">{error}</p>}
      <div className="flex gap-2 pt-1">
        <PillButton onClick={() => { setError(null); mutation.mutate(); }} disabled={mutation.isPending}>
          {mutation.isPending ? '...جارٍ الحفظ' : 'حفظ'}
        </PillButton>
        <PillButton variant="ghost" onClick={onDone}>
          إلغاء
        </PillButton>
      </div>
    </div>
  );
}
