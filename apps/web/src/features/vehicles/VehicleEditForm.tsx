import { useState } from 'react';
import { isAxiosError } from 'axios';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BOOKLET_HELP,
  VEHICLE_COLORS,
  VEHICLE_COLOR_OTHER,
  VEHICLE_FUEL_TYPES,
  VEHICLE_FUEL_TYPE_LABELS_AR,
  checkBooklet,
  checkChassis,
  checkColor,
  checkMakeOrModel,
  checkManufactureYear,
  manufactureYearOptions,
  normalizeBooklet,
  normalizeChassis,
  normalizePlate,
  type VehicleFuelTypeKey,
} from '@fuel-tracking/shared-types';
import { apiClient } from '../../lib/apiClient';
import { PillButton } from '../../components/design/PillButton';
import { TextField } from '../../components/design/TextField';
import { Dialog } from '../../components/design/Dialog';
import { DigitBoxInput } from '../../components/DigitBoxInput';
import { OwnerSearchSelect } from '../../components/OwnerSearchSelect';
import { LtrText } from '../../components/LtrText';
import { LookupSearch, useLookup } from '../../lib/useLookup';
import { PLATE_DIGIT_GROUPS } from '../../lib/digitBoxGroups';
import { formatLicensePlate, restrictToChassisNumber, restrictToRegistrationBooklet } from '../../lib/libyanFormats';
import { focusField } from '../../lib/focusField';
import type { VehicleBasicInfo } from './types';

interface VehicleEditFormProps {
  vehicle: VehicleBasicInfo;
  // vehicles:approve_change — the plate, chassis, booklet, type and owner too.
  canEditIdentity: boolean;
  // vehicles:manage — make, model, colour, year and fuel.
  canEditDetails: boolean;
  onDone: () => void;
}

const SELECT_CLASS =
  'h-[52px] w-full rounded-sm border border-line bg-surface-alt px-3 text-[16px] text-ink focus:outline-none focus:ring-2 focus:ring-primary-dark focus:ring-offset-2 focus:ring-offset-surface lg:h-11 lg:text-[14px]';
const LABEL = 'mb-1.5 block text-[14px] font-bold text-ink lg:text-[12px]';
const ERROR = 'mt-1.5 text-[14px] font-medium text-danger-dark lg:text-[12px]';

interface Change {
  key: string;
  label: string;
  from: string;
  to: string;
  ltr?: boolean;
}

// One «تعديل» for every field (after review, 18 Oct 2026). The plate, chassis,
// booklet, vehicle type and owner — which used to go through approved change
// requests — are changed directly by whoever may approve such changes
// (vehicles:approve_change), with their history kept by the API; the make,
// model, colour, year and fuel by whoever manages vehicles. Same rules as at
// registration (packages/shared-types). Nothing is saved before the person
// confirms the list of changes.
export function VehicleEditForm({ vehicle, canEditIdentity, canEditDetails, onDone }: VehicleEditFormProps) {
  const queryClient = useQueryClient();

  // Identity
  const [plate, setPlate] = useState(normalizePlate(vehicle.currentPlate) ?? '');
  const [chassis, setChassis] = useState(vehicle.chassisNumber ?? '');
  const [chassisNonStandard, setChassisNonStandard] = useState(vehicle.chassisNonStandard);
  const [booklet, setBooklet] = useState(vehicle.registrationBooklet ?? '');
  const [vehicleTypeId, setVehicleTypeId] = useState(vehicle.vehicleTypeId ?? '');
  const [ownerId, setOwnerId] = useState(vehicle.owner?.id ?? '');
  const [ownerName, setOwnerName] = useState(vehicle.owner?.fullName ?? '');
  const typeLookup = useLookup<{ id: string; name: string; isActive: boolean }>('/vehicle-types', 'vehicle-types', canEditIdentity);

  // Details
  const [make, setMake] = useState(vehicle.make ?? '');
  const [model, setModel] = useState(vehicle.model ?? '');
  const startColor = vehicle.color ?? '';
  const known = (VEHICLE_COLORS as readonly string[]).includes(startColor);
  const [colorChoice, setColorChoice] = useState(startColor === '' ? '' : known ? startColor : VEHICLE_COLOR_OTHER);
  const [colorOther, setColorOther] = useState(known ? '' : startColor);
  const [manufactureYear, setManufactureYear] = useState(vehicle.manufactureYear?.toString() ?? '');
  const [fuelType, setFuelType] = useState<VehicleFuelTypeKey | ''>(vehicle.fuelType ?? '');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [nothingChanged, setNothingChanged] = useState(false);
  const [confirming, setConfirming] = useState<Change[] | null>(null);

  // Phase 7: the year is picked from a list, newest first. A year stored
  // before the list existed is offered too, so the form never drops it.
  const yearOptions = manufactureYearOptions();
  if (vehicle.manufactureYear && !yearOptions.includes(vehicle.manufactureYear)) yearOptions.push(vehicle.manufactureYear);
  const color = colorChoice === VEHICLE_COLOR_OTHER ? colorOther : colorChoice;
  const typeName = (id: string) =>
    typeLookup.items?.find((t) => t.id === id)?.name ?? (id === vehicle.vehicleTypeId ? vehicle.vehicleType?.name : undefined) ?? '—';

  // What changed, in the order of the form.
  function changesOf(): { list: Change[]; identity: Record<string, unknown>; details: boolean } {
    const list: Change[] = [];
    const identity: Record<string, unknown> = {};
    if (canEditIdentity) {
      if (normalizePlate(plate) !== normalizePlate(vehicle.currentPlate)) {
        identity.currentPlate = plate;
        list.push({ key: 'plate', label: 'رقم اللوحة', from: formatLicensePlate(vehicle.currentPlate), to: formatLicensePlate(plate), ltr: true });
      }
      if (normalizeChassis(chassis) !== (vehicle.chassisNumber ?? '')) {
        identity.chassisNumber = normalizeChassis(chassis);
        identity.chassisNonStandard = chassisNonStandard;
        list.push({ key: 'chassis', label: 'رقم الشاصي', from: vehicle.chassisNumber ?? '—', to: normalizeChassis(chassis), ltr: true });
      }
      if (normalizeBooklet(booklet) !== (vehicle.registrationBooklet ?? '')) {
        identity.registrationBooklet = normalizeBooklet(booklet);
        list.push({ key: 'booklet', label: 'رقم كتيب المركبة', from: vehicle.registrationBooklet ?? '—', to: normalizeBooklet(booklet), ltr: true });
      }
      if (vehicleTypeId && vehicleTypeId !== (vehicle.vehicleTypeId ?? '')) {
        identity.vehicleTypeId = vehicleTypeId;
        list.push({ key: 'type', label: 'نوع المركبة', from: vehicle.vehicleType?.name ?? '—', to: typeName(vehicleTypeId) });
      }
      if (ownerId && ownerId !== (vehicle.owner?.id ?? '')) {
        identity.ownerId = ownerId;
        list.push({ key: 'owner', label: 'المالك', from: vehicle.owner?.fullName ?? '—', to: ownerName || '—' });
      }
    }
    let details = false;
    if (canEditDetails) {
      const pairs: Array<[string, string, string]> = [
        ['الصانع', vehicle.make ?? '', make.trim()],
        ['الطراز', vehicle.model ?? '', model.trim()],
        ['اللون', vehicle.color ?? '', color.trim()],
        ['سنة الصنع', vehicle.manufactureYear?.toString() ?? '', manufactureYear],
        ['نوع الوقود', vehicle.fuelType ? VEHICLE_FUEL_TYPE_LABELS_AR[vehicle.fuelType] : '', fuelType ? VEHICLE_FUEL_TYPE_LABELS_AR[fuelType] : ''],
      ];
      for (const [label, from, to] of pairs) {
        if (from !== to) {
          details = true;
          list.push({ key: label, label, from: from || '—', to: to || '—' });
        }
      }
    }
    return { list, identity, details };
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const { identity, details } = changesOf();
      if (Object.keys(identity).length) await apiClient.patch(`/vehicles/${vehicle.id}/identity`, identity);
      if (details) {
        await apiClient.patch(`/vehicles/${vehicle.id}`, {
          make: make.trim(),
          model: model.trim(),
          color: color.trim(),
          manufactureYear: Number(manufactureYear),
          fuelType: fuelType || undefined,
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
      const body = isAxiosError(err) ? (err.response?.data as { message?: unknown; details?: { field?: string } } | undefined) : undefined;
      const field = body?.details?.field;
      setFailure(
        body?.message === 'IDENTITY_IN_USE'
          ? `${field === 'currentPlate' ? 'رقم اللوحة' : field === 'chassisNumber' ? 'رقم الشاصي' : 'رقم الكتيب'} مستخدم لمركبة أخرى. راجع الرقم.`
          : 'تعذر حفظ التعديلات. حاول مرة أخرى.',
      );
    },
  });

  function save() {
    setFailure(null);
    setNothingChanged(false);
    const found: Record<string, string> = {};
    if (canEditIdentity) {
      if (!normalizePlate(plate)) found.plate = 'رقم اللوحة غير مكتمل: رمز المدينة ثم رقم المركبة، أرقام فقط.';
      if (normalizeChassis(chassis) !== (vehicle.chassisNumber ?? '')) {
        const c = checkChassis(chassis, chassisNonStandard);
        if (!c.ok) found.chassis = c.message;
      }
      if (normalizeBooklet(booklet) !== (vehicle.registrationBooklet ?? '')) {
        const b = checkBooklet(booklet);
        if (!b.ok) found.booklet = b.message;
      }
    }
    if (canEditDetails) {
      const m = checkMakeOrModel(make, 'الصانع');
      if (!m.ok) found.make = m.message;
      const md = checkMakeOrModel(model, 'الطراز');
      if (!md.ok) found.model = md.message;
      const c = checkColor(color);
      if (!c.ok) found.color = c.message;
      const y = checkManufactureYear(manufactureYear);
      if (!y.ok) found.manufactureYear = y.message;
      if (!fuelType) found.fuelType = 'اختر نوع وقود المركبة.';
    }
    setErrors(found);
    // First-error focus, in the order of the form.
    const first = ['plate', 'chassis', 'booklet', 'make', 'model', 'color', 'manufactureYear', 'fuelType'].find((field) => found[field]);
    if (first) return focusField(`vehicle-edit-${first}`);
    const { list } = changesOf();
    if (list.length === 0) return setNothingChanged(true);
    setConfirming(list);
  }

  return (
    <div className="space-y-4">
      {canEditIdentity && (
        <>
          <div data-testid="vehicle-edit-plate">
            <DigitBoxInput groups={PLATE_DIGIT_GROUPS} separator="-" value={plate} onChange={setPlate} label="رقم اللوحة" />
            {errors.plate && <p role="alert" className={ERROR}>{errors.plate}</p>}
          </div>
          <div data-testid="vehicle-edit-chassis">
            <TextField
              label="رقم الشاصي"
              value={chassis}
              onChange={(e) => setChassis(restrictToChassisNumber(e.target.value))}
              maxLength={20}
              ltr
              error={errors.chassis}
            />
            <label className="mt-2 flex min-h-[44px] items-center gap-2 text-[15px] text-ink lg:min-h-0 lg:text-[13px]">
              <input type="checkbox" className="h-5 w-5" checked={chassisNonStandard} onChange={(e) => setChassisNonStandard(e.target.checked)} />
              رقم هيكل غير قياسي (ليس 17 خانة)
            </label>
          </div>
          <div data-testid="vehicle-edit-booklet">
            <TextField
              label="رقم كتيب المركبة"
              value={booklet}
              onChange={(e) => setBooklet(restrictToRegistrationBooklet(e.target.value))}
              inputMode="numeric"
              maxLength={12}
              ltr
              hint={BOOKLET_HELP}
              error={errors.booklet}
            />
          </div>
          <div>
            <label htmlFor="edit-type" className={LABEL}>
              نوع المركبة
            </label>
            <select id="edit-type" data-testid="vehicle-edit-type" value={vehicleTypeId} onChange={(e) => setVehicleTypeId(e.target.value)} className={SELECT_CLASS}>
              {!vehicle.vehicleTypeId && <option value="">— اختر —</option>}
              {vehicle.vehicleType && !typeLookup.items?.some((t) => t.id === vehicle.vehicleType!.id) && (
                <option value={vehicle.vehicleType.id}>{vehicle.vehicleType.name}</option>
              )}
              {typeLookup.items
                ?.filter((t) => t.isActive || t.id === vehicle.vehicleTypeId)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
            <LookupSearch id="edit-type-search" q={typeLookup.q} onChange={typeLookup.setQ} capped={typeLookup.capped} />
          </div>
          <div data-testid="vehicle-edit-owner">
            <span className={LABEL}>المالك</span>
            <OwnerSearchSelect
              value={ownerId}
              onChange={(id, name) => {
                setOwnerId(id);
                setOwnerName(name);
              }}
              initialLabel={ownerName}
              className={SELECT_CLASS}
            />
          </div>
          {canEditDetails && <hr className="border-line-soft" />}
        </>
      )}

      {canEditDetails && (
        <>
          <TextField label="الصانع (كما في الدفتر)" data-testid="vehicle-edit-make" placeholder="مثال: تويوتا" value={make} onChange={(e) => setMake(e.target.value)} error={errors.make} />
          <TextField label="الطراز (كما في الدفتر)" data-testid="vehicle-edit-model" placeholder="مثال: كامري" value={model} onChange={(e) => setModel(e.target.value)} error={errors.model} />
          <div>
            <label htmlFor="edit-color" className={LABEL}>
              اللون
            </label>
            <select id="edit-color" data-testid="vehicle-edit-color" value={colorChoice} onChange={(e) => setColorChoice(e.target.value)} className={SELECT_CLASS}>
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
            {errors.color && <p role="alert" className={ERROR}>{errors.color}</p>}
          </div>
          <div>
            <label htmlFor="edit-year" className={LABEL}>
              سنة الصنع
            </label>
            <select
              id="edit-year"
              data-testid="vehicle-edit-manufactureYear"
              value={manufactureYear}
              onChange={(e) => setManufactureYear(e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="">— اختر —</option>
              {yearOptions.map((year) => (
                <option key={year} value={String(year)}>
                  {year}
                </option>
              ))}
            </select>
            {errors.manufactureYear && <p role="alert" className={ERROR}>{errors.manufactureYear}</p>}
          </div>
          <div>
            <label htmlFor="edit-fuel" className={LABEL}>
              نوع وقود المركبة
            </label>
            <select
              id="edit-fuel"
              data-testid="vehicle-edit-fuelType"
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
            {errors.fuelType && <p role="alert" className={ERROR}>{errors.fuelType}</p>}
          </div>
        </>
      )}

      {nothingChanged && <p role="status" className="text-[14px] font-medium text-ink-soft lg:text-[12px]">لم تُغيّر أي حقل.</p>}
      {failure && <p role="alert" className="text-[14px] font-medium text-danger-dark lg:text-[12px]">{failure}</p>}
      <div className="flex gap-2 pt-1">
        <PillButton size="field" onClick={save} disabled={mutation.isPending} data-testid="vehicle-edit-save">
          حفظ
        </PillButton>
        <PillButton size="field" variant="ghost" onClick={onDone}>
          إلغاء
        </PillButton>
      </div>

      <Dialog
        open={confirming !== null}
        title="تأكيد التعديل"
        busy={mutation.isPending}
        onClose={() => !mutation.isPending && setConfirming(null)}
        footer={
          <div className="flex gap-2">
            <PillButton size="field" onClick={() => mutation.mutate()} disabled={mutation.isPending} data-testid="vehicle-edit-confirm">
              {mutation.isPending ? 'جارٍ الحفظ…' : 'تأكيد الحفظ'}
            </PillButton>
            <PillButton size="field" variant="ghost" onClick={() => setConfirming(null)} disabled={mutation.isPending}>
              رجوع
            </PillButton>
          </div>
        }
      >
        <p className="text-[15px] text-ink lg:text-[13px]">ستُحفظ هذه التغييرات مباشرة وتُسجَّل في سجل التدقيق باسمك:</p>
        <ul className="mt-3 divide-y divide-line-soft rounded-sm border border-line-soft" data-testid="vehicle-edit-changes">
          {confirming?.map((c) => (
            <li key={c.key} className="px-3 py-2.5 text-[15px] lg:text-[13px]">
              <p className="font-bold text-ink-soft">{c.label}</p>
              <p className="mt-0.5">
                <span className="text-ink-soft line-through decoration-ink-faint">{c.ltr ? <LtrText>{c.from}</LtrText> : c.from}</span>
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
