import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  VEHICLE_COLORS,
  VEHICLE_COLOR_OTHER,
  VEHICLE_FUEL_TYPES,
  VEHICLE_FUEL_TYPE_LABELS_AR,
  checkColor,
  checkMakeOrModel,
  checkManufactureYear,
  type VehicleFuelTypeKey,
} from '@fuel-tracking/shared-types';
import { apiClient } from '../../lib/apiClient';
import { PillButton } from '../../components/design/PillButton';
import { TextField } from '../../components/design/TextField';
import type { VehicleBasicInfo } from './types';

interface VehicleEditFormProps {
  vehicle: VehicleBasicInfo;
  onDone: () => void;
}

const SELECT_CLASS =
  'h-[52px] w-full rounded-sm border border-line bg-surface-alt px-3 text-[16px] text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface lg:h-11 lg:text-[14px]';

// Round 12: edits split by whether they affect fill-up rule eligibility.
// Make, model, colour, manufacturing year and (phase 5A) fuel type don't feed
// the rule engine, so they save immediately via PATCH /vehicles/:id, with the
// same rules as at registration (packages/shared-types). Plate, chassis,
// booklet, owner and vehicle type go through approved change requests.
export function VehicleEditForm({ vehicle, onDone }: VehicleEditFormProps) {
  const queryClient = useQueryClient();
  const [make, setMake] = useState(vehicle.make ?? '');
  const [model, setModel] = useState(vehicle.model ?? '');
  const startColor = vehicle.color ?? '';
  const known = (VEHICLE_COLORS as readonly string[]).includes(startColor);
  const [colorChoice, setColorChoice] = useState(startColor === '' ? '' : known ? startColor : VEHICLE_COLOR_OTHER);
  const [colorOther, setColorOther] = useState(known ? '' : startColor);
  const [manufactureYear, setManufactureYear] = useState(vehicle.manufactureYear?.toString() ?? '');
  const [fuelType, setFuelType] = useState<VehicleFuelTypeKey | ''>(vehicle.fuelType ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState(false);

  const color = colorChoice === VEHICLE_COLOR_OTHER ? colorOther : colorChoice;

  const mutation = useMutation({
    mutationFn: () =>
      apiClient.patch(`/vehicles/${vehicle.id}`, {
        make: make.trim(),
        model: model.trim(),
        color: color.trim(),
        manufactureYear: Number(manufactureYear),
        fuelType: fuelType || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles', vehicle.id] });
      onDone();
    },
    onError: () => setFailed(true),
  });

  function save() {
    setFailed(false);
    const found: Record<string, string> = {};
    const m = checkMakeOrModel(make, 'الصانع');
    if (!m.ok) found.make = m.message;
    const md = checkMakeOrModel(model, 'الطراز');
    if (!md.ok) found.model = md.message;
    const c = checkColor(color);
    if (!c.ok) found.color = c.message;
    const y = checkManufactureYear(manufactureYear);
    if (!y.ok) found.manufactureYear = y.message;
    if (!fuelType) found.fuelType = 'اختر نوع وقود المركبة.';
    setErrors(found);
    if (Object.keys(found).length === 0) mutation.mutate();
  }

  return (
    <div className="space-y-4">
      <TextField label="الصانع (كما في الدفتر)" value={make} onChange={(e) => setMake(e.target.value)} error={errors.make} />
      <TextField label="الطراز (كما في الدفتر)" value={model} onChange={(e) => setModel(e.target.value)} error={errors.model} />
      <div>
        <label htmlFor="edit-color" className="mb-1.5 block text-[14px] font-bold text-ink lg:text-[12px]">
          اللون
        </label>
        <select id="edit-color" value={colorChoice} onChange={(e) => setColorChoice(e.target.value)} className={SELECT_CLASS}>
          <option value="">— اختر —</option>
          {VEHICLE_COLORS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
          <option value={VEHICLE_COLOR_OTHER}>{VEHICLE_COLOR_OTHER}</option>
        </select>
        {colorChoice === VEHICLE_COLOR_OTHER && (
          <div className="mt-2">
            <TextField label="اكتب اللون" value={colorOther} onChange={(e) => setColorOther(e.target.value)} />
          </div>
        )}
        {errors.color && <p role="alert" className="mt-1.5 text-[14px] font-medium text-danger-dark lg:text-[12px]">{errors.color}</p>}
      </div>
      <TextField
        label="سنة الصنع"
        value={manufactureYear}
        onChange={(e) => setManufactureYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
        inputMode="numeric"
        ltr
        error={errors.manufactureYear}
      />
      <div>
        <label htmlFor="edit-fuel" className="mb-1.5 block text-[14px] font-bold text-ink lg:text-[12px]">
          نوع وقود المركبة
        </label>
        <select
          id="edit-fuel"
          value={fuelType}
          onChange={(e) => setFuelType(e.target.value as VehicleFuelTypeKey | '')}
          className={SELECT_CLASS}
        >
          <option value="">— اختر —</option>
          {VEHICLE_FUEL_TYPES.map((f) => (
            <option key={f} value={f}>
              {VEHICLE_FUEL_TYPE_LABELS_AR[f]}
            </option>
          ))}
        </select>
        {errors.fuelType && <p role="alert" className="mt-1.5 text-[14px] font-medium text-danger-dark lg:text-[12px]">{errors.fuelType}</p>}
      </div>
      <p className="text-[14px] text-ink-soft lg:text-[12px]">
        لتغيير نوع المركبة أو رقم اللوحة أو رقم الهيكل أو المالك، استخدم أزرار «طلب تغيير» أدناه — تتطلب اعتمادًا.
      </p>
      {failed && <p role="alert" className="text-[14px] font-medium text-danger-dark lg:text-[12px]">تعذر حفظ التعديلات. حاول مرة أخرى.</p>}
      <div className="flex gap-2 pt-1">
        <PillButton size="field" onClick={save} disabled={mutation.isPending}>
          {mutation.isPending ? 'جارٍ الحفظ…' : 'حفظ'}
        </PillButton>
        <PillButton size="field" variant="ghost" onClick={onDone}>
          إلغاء
        </PillButton>
      </div>
    </div>
  );
}
