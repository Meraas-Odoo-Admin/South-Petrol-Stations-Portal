import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { apiClient } from '../../lib/apiClient';
import {
  CHASSIS_NUMBER_REGEX,
  LICENSE_PLATE_REGEX,
  LIBYAN_MOBILE_REGEX,
  REGISTRATION_BOOKLET_REGEX,
  formatLicensePlate,
  restrictToChassisNumber,
  restrictToPhoneNumber,
  restrictToRegistrationBooklet,
} from '../../lib/libyanFormats';
import { IDENTITY_DIGIT_GROUPS, PLATE_DIGIT_GROUPS } from '../../lib/digitBoxGroups';
import { identityTypeLabel } from '../../lib/labels';
import { PageHeader } from '../../components/design/PageHeader';
import { Card, CardHeader } from '../../components/design/Card';
import { PillButton } from '../../components/design/PillButton';
import { StatusPill } from '../../components/design/StatusPill';
import { DigitBoxInput } from '../../components/DigitBoxInput';
import { VehicleBrandPicker } from '../../components/VehicleBrandPicker';
import { LtrText } from '../../components/LtrText';
import { registrationErrorMessage } from './registrationErrors';
import { CardIssueFlow } from '../cards/CardIssueFlow';

type IdentityType = 'NATIONAL_ID' | 'ADMINISTRATIVE_ID' | 'DRIVERS_LICENSE';
type DuplicateField = 'currentPlate' | 'chassisNumber' | 'registrationBooklet';

interface RegistrationStationRow {
  id: string;
  internalCode: string;
  name: string;
  status: 'ACTIVE' | 'TEMPORARILY_CLOSED' | 'CLOSED';
  statusNote: string | null;
  municipality: { id: string; name: string; status: 'PREPARING' | 'LIVE' };
}

interface OwnerRow {
  id: string;
  fullName: string;
  identityType: IdentityType;
  identityNumber: string;
  phone: string | null;
}

interface VehicleDuplicate {
  field: DuplicateField;
  vehicle: { id: string; internalCode: string; currentPlate: string };
}

interface RegisteredVehicle {
  id: string;
  internalCode: string;
  currentPlate: string;
}

const REGISTRATION_STATUS_LABELS: Record<RegistrationStationRow['status'], string> = {
  ACTIVE: 'يعمل',
  TEMPORARILY_CLOSED: 'مغلق مؤقتًا',
  CLOSED: 'مغلق',
};

const DUPLICATE_FIELD_LABELS: Record<DuplicateField, string> = {
  currentPlate: 'رقم اللوحة',
  chassisNumber: 'رقم الشاسيه',
  registrationBooklet: 'رقم كتيب المركبة',
};

function canRegisterAt(station: RegistrationStationRow | undefined): boolean {
  return !!station && station.status === 'ACTIVE' && station.municipality.status === 'LIVE';
}

const inputClass =
  'h-10 w-full rounded-sm bg-surface-alt px-3 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent';
const labelClass = 'mb-1 block text-[11px] font-bold text-ink-soft';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      {children}
    </div>
  );
}

function DuplicateWarning({ conflict }: { conflict: VehicleDuplicate | undefined }) {
  if (!conflict) return null;
  return (
    <p className="mt-1.5 text-[11.5px] font-bold text-danger" data-testid={`registration-duplicate-${conflict.field}`}>
      {DUPLICATE_FIELD_LABELS[conflict.field]} مسجّل مسبقًا للمركبة{' '}
      <Link to={`/vehicles/${conflict.vehicle.id}`} className="underline">
        <LtrText>{conflict.vehicle.internalCode}</LtrText>
      </Link>
      {/* No brackets around the plate: a bracket next to left-to-right
          digits at the end of an Arabic sentence renders on the wrong side. */}
      {' — لوحتها '}
      <LtrText>{formatLicensePlate(conflict.vehicle.currentPlate)}</LtrText>
    </p>
  );
}

// Registration pivot, phase 2: the registration employee's workspace — the
// only place a vehicle or owner is created (petrol stations never do).
// Built from what used to be the inline VehicleCreateForm, as a full page:
//   1. which registration station they're working at (fixed if they're
//      scoped to exactly one);
//   2. the owner FIRST, looked up by identity type + number — pick the
//      existing one, or register a new one;
//   3. the vehicle, with plate/chassis/booklet checked for duplicates while
//      typing, each clash naming the vehicle it already belongs to.
// The server re-checks all of it (scope, station open, municipality live,
// duplicates) — this screen only makes those answers visible early.
export function RegistrationPage() {
  const queryClient = useQueryClient();

  // ── 1. Registration station ─────────────────────────────────────────
  const stationsQuery = useQuery({
    queryKey: ['registration-stations'],
    queryFn: async () => (await apiClient.get<RegistrationStationRow[]>('/registration-stations')).data,
  });
  const [chosenStationId, setChosenStationId] = useState('');
  const stations = stationsQuery.data ?? [];
  const stationId = stations.length === 1 ? stations[0]!.id : chosenStationId;
  const station = stations.find((s) => s.id === stationId);
  const stationReady = canRegisterAt(station);

  // ── 2. Owner ────────────────────────────────────────────────────────
  const [identityType, setIdentityType] = useState<IdentityType>('NATIONAL_ID');
  const [identityNumber, setIdentityNumber] = useState('');
  const [searchedIdentity, setSearchedIdentity] = useState<{ type: IdentityType; number: string } | null>(null);
  const [owner, setOwner] = useState<OwnerRow | null>(null);
  const [newOwnerName, setNewOwnerName] = useState('');
  const [newOwnerPhone, setNewOwnerPhone] = useState('');
  const [newOwnerAddress, setNewOwnerAddress] = useState('');
  const [ownerError, setOwnerError] = useState<string | null>(null);

  const identityValid =
    identityType === 'DRIVERS_LICENSE' ? /^[A-Za-z0-9]{4,20}$/.test(identityNumber) : identityNumber.length === 12;

  const ownerLookup = useQuery({
    queryKey: ['owners', 'by-identity', searchedIdentity],
    queryFn: async () =>
      (
        await apiClient.get<OwnerRow[]>('/owners', {
          params: { identityType: searchedIdentity!.type, identityNumber: searchedIdentity!.number },
        })
      ).data,
    enabled: !!searchedIdentity,
  });
  const foundOwner = ownerLookup.data?.[0];

  const createOwner = useMutation({
    mutationFn: async () =>
      (
        await apiClient.post<OwnerRow>('/owners', {
          registrationStationId: stationId,
          identityType: searchedIdentity!.type,
          identityNumber: searchedIdentity!.number,
          fullName: newOwnerName.trim(),
          phone: newOwnerPhone.trim(),
          address: newOwnerAddress.trim() || undefined,
        })
      ).data,
    onSuccess: (created) => {
      setOwner(created);
      queryClient.invalidateQueries({ queryKey: ['owners'] });
    },
    onError: (err) => setOwnerError(registrationErrorMessage(err)),
  });

  function resetOwner() {
    setOwner(null);
    setSearchedIdentity(null);
    setIdentityNumber('');
    setNewOwnerName('');
    setNewOwnerPhone('');
    setNewOwnerAddress('');
    setOwnerError(null);
  }

  // ── 3. Vehicle ──────────────────────────────────────────────────────
  const [plate, setPlate] = useState('');
  const [model, setModel] = useState('');
  const [vehicleTypeId, setVehicleTypeId] = useState('');
  const [color, setColor] = useState('');
  const [manufactureYear, setManufactureYear] = useState('');
  const [chassisNumber, setChassisNumber] = useState('');
  const [registrationBooklet, setRegistrationBooklet] = useState('');
  const [vehicleError, setVehicleError] = useState<string | null>(null);
  const [serverConflicts, setServerConflicts] = useState<VehicleDuplicate[] | null>(null);
  const [registered, setRegistered] = useState<{
    vehicle: RegisteredVehicle;
    ownerName: string;
    registrationStationId: string;
  } | null>(null);

  const { data: vehicleTypes } = useQuery({
    queryKey: ['vehicle-types'],
    queryFn: async () =>
      (await apiClient.get<{ id: string; name: string; isActive: boolean }[]>('/vehicle-types')).data,
  });

  // Live duplicate check — only the fields that are already well-formed,
  // debounced so it doesn't fire per keystroke.
  const [duplicateParams, setDuplicateParams] = useState<Partial<Record<DuplicateField, string>>>({});
  useEffect(() => {
    const timer = setTimeout(() => {
      setDuplicateParams({
        currentPlate: LICENSE_PLATE_REGEX.test(plate) ? plate : undefined,
        chassisNumber: CHASSIS_NUMBER_REGEX.test(chassisNumber) ? chassisNumber : undefined,
        registrationBooklet: REGISTRATION_BOOKLET_REGEX.test(registrationBooklet) ? registrationBooklet : undefined,
      });
      setServerConflicts(null);
    }, 400);
    return () => clearTimeout(timer);
  }, [plate, chassisNumber, registrationBooklet]);
  const hasDuplicateParams = Object.values(duplicateParams).some(Boolean);
  const duplicateQuery = useQuery({
    queryKey: ['vehicles', 'duplicate-check', duplicateParams],
    queryFn: async () =>
      (await apiClient.get<{ conflicts: VehicleDuplicate[] }>('/vehicles/duplicate-check', { params: duplicateParams }))
        .data,
    enabled: hasDuplicateParams,
  });
  const conflicts = serverConflicts ?? (hasDuplicateParams ? (duplicateQuery.data?.conflicts ?? []) : []);
  const conflictFor = (field: DuplicateField) => conflicts.find((c) => c.field === field);

  const registerVehicle = useMutation({
    mutationFn: async () =>
      (
        await apiClient.post<RegisteredVehicle>('/vehicles', {
          registrationStationId: stationId,
          ownerId: owner!.id,
          currentPlate: plate,
          model: model.trim() || undefined,
          vehicleTypeId: vehicleTypeId || undefined,
          color: color.trim() || undefined,
          manufactureYear: manufactureYear ? Number(manufactureYear) : undefined,
          chassisNumber: chassisNumber || undefined,
          registrationBooklet: registrationBooklet || undefined,
        })
      ).data,
    onSuccess: (vehicle) => {
      setRegistered({ vehicle, ownerName: owner!.fullName, registrationStationId: stationId });
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    },
    onError: (err) => {
      if (isAxiosError<{ message?: string; details?: { conflicts?: VehicleDuplicate[] } }>(err)) {
        const details = err.response?.data?.details;
        if (err.response?.data?.message === 'VEHICLE_DUPLICATE' && details?.conflicts) {
          setServerConflicts(details.conflicts);
        }
      }
      setVehicleError(registrationErrorMessage(err));
    },
  });

  function validateVehicle(): string | null {
    if (!LICENSE_PLATE_REGEX.test(plate)) return 'رقم اللوحة مطلوب: رمز البلدية ثم رقم المركبة.';
    if (chassisNumber && !CHASSIS_NUMBER_REGEX.test(chassisNumber))
      return 'رقم الشاسيه يجب أن يكون 17 حرفًا بالضبط، أو اتركه فارغًا.';
    if (registrationBooklet && !REGISTRATION_BOOKLET_REGEX.test(registrationBooklet))
      return 'رقم كتيب المركبة يجب أن يكون بين 6 و12 حرفًا/رقمًا، أو اتركه فارغًا.';
    if (manufactureYear && manufactureYear.length !== 4) return 'سنة الصنع يجب أن تكون 4 أرقام.';
    if (conflicts.length > 0) return 'بعض بيانات المركبة مسجّلة مسبقًا لمركبة أخرى — راجع التنبيهات أسفل الحقول.';
    return null;
  }

  function resetVehicle() {
    setPlate('');
    setModel('');
    setVehicleTypeId('');
    setColor('');
    setManufactureYear('');
    setChassisNumber('');
    setRegistrationBooklet('');
    setVehicleError(null);
    setServerConflicts(null);
    setRegistered(null);
  }

  // ── Render ─────────────────────────────────────────────────────────
  if (registered) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="تسجيل المركبات" />
        <Card className="animate-scale-in p-6 text-center" data-testid="registration-success">
          <p className="text-[17px] font-extrabold text-ok">تم تسجيل المركبة</p>
          <p className="mt-3 text-[26px] font-black text-primary">
            <LtrText>{formatLicensePlate(registered.vehicle.currentPlate)}</LtrText>
          </p>
          <p className="mt-1 text-[12.5px] text-ink-soft">
            الرقم الداخلي <LtrText>{registered.vehicle.internalCode}</LtrText> — المالك {registered.ownerName}
          </p>
          {/* Registration pivot, phase 3: the card is issued and printed
              right here at the desk, straight after registering. */}
          <div className="mt-6 border-t border-line pt-5 text-start">
            <p className="mb-3 text-[13px] font-bold text-primary-dark">بطاقة المركبة</p>
            <CardIssueFlow
              vehicleId={registered.vehicle.id}
              registrationStationId={registered.registrationStationId}
              reason="FIRST_ISSUE"
            />
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-2.5">
            <PillButton
              onClick={() => {
                resetVehicle();
                resetOwner();
              }}
            >
              تسجيل مركبة أخرى
            </PillButton>
            <PillButton variant="secondary" onClick={resetVehicle}>
              مركبة أخرى لنفس المالك
            </PillButton>
            <Link to={`/vehicles/${registered.vehicle.id}`}>
              <PillButton variant="ghost">صفحة المركبة</PillButton>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="تسجيل المركبات" subtitle="تسجيل مالك ومركبة جديدين في مكتب التسجيل" />

      {/* 1 — Registration station */}
      <Card className="mb-4 p-4">
        <p className="mb-2 text-[12.5px] font-bold text-primary-dark">مكتب التسجيل</p>
        {stationsQuery.isLoading && <p className="text-[12px] text-ink-soft">...جارٍ التحميل</p>}
        {stationsQuery.isError && (
          <p className="text-[12.5px] text-danger" data-testid="registration-not-allowed">
            تسجيل المركبات يتم في مكاتب التسجيل فقط، وحسابك لا يملك صلاحية التسجيل.
          </p>
        )}
        {stationsQuery.data && stations.length === 0 && (
          <p className="text-[12.5px] text-danger" data-testid="registration-no-station">
            حسابك غير مرتبط بأي مكتب تسجيل. تواصل مع مسؤول المنظومة.
          </p>
        )}
        {stations.length > 1 && (
          <select
            data-testid="registration-station-select"
            value={chosenStationId}
            onChange={(e) => setChosenStationId(e.target.value)}
            className={`${inputClass} sm:w-96`}
          >
            <option value="">اختر مكتب التسجيل الذي تعمل فيه الآن</option>
            {stations.map((s) => (
              <option key={s.id} value={s.id} disabled={!canRegisterAt(s)}>
                {s.name}
                {canRegisterAt(s) ? '' : ` (${s.status !== 'ACTIVE' ? REGISTRATION_STATUS_LABELS[s.status] : 'البلدية غير مفعّلة'})`}
              </option>
            ))}
          </select>
        )}
        {station && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px]" data-testid="registration-station-current">
            <span className="font-bold text-ink">{station.name}</span>
            <span className="text-ink-faint">— {station.municipality.name}</span>
            <StatusPill variant={station.status === 'ACTIVE' ? 'ok' : 'danger'}>
              {REGISTRATION_STATUS_LABELS[station.status]}
            </StatusPill>
          </div>
        )}
        {station && !stationReady && (
          <p className="mt-2 text-[12px] text-danger">
            {station.status !== 'ACTIVE'
              ? 'مكتب التسجيل هذا مغلق حاليًا، ولا يمكن التسجيل فيه.'
              : 'بلدية مكتب التسجيل هذا لم تُفعَّل في المنظومة بعد، ولا يمكن التسجيل فيه.'}
            {station.statusNote ? ` (${station.statusNote})` : ''}
          </p>
        )}
      </Card>

      {/* 2 — Owner */}
      <Card className={`mb-4 ${stationReady ? '' : 'pointer-events-none opacity-50'}`}>
        <CardHeader title="١. المالك" />
        <div className="space-y-3 p-4">
          {owner ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm bg-ok-100 p-3" data-testid="registration-owner-selected">
              <div>
                <p className="text-[13.5px] font-bold text-ink">{owner.fullName}</p>
                <p className="mt-0.5 text-[11.5px] text-ink-soft">
                  {identityTypeLabel(owner.identityType)} <LtrText>{owner.identityNumber}</LtrText>
                </p>
              </div>
              <PillButton variant="ghost" size="sm" onClick={resetOwner}>
                تغيير المالك
              </PillButton>
            </div>
          ) : (
            <>
              <p className="text-[12px] text-ink-soft">ابحث عن المالك أولًا برقم هويته — ربما هو مسجّل مسبقًا كمالك لمركبة أخرى.</p>
              <Field label="نوع الهوية">
                <div className="flex gap-2 sm:w-[28rem]">
                  {(['NATIONAL_ID', 'ADMINISTRATIVE_ID', 'DRIVERS_LICENSE'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        setIdentityType(type);
                        setIdentityNumber('');
                        setSearchedIdentity(null);
                      }}
                      className={`h-9 flex-1 rounded-sm text-[11.5px] font-bold ${
                        identityType === type ? 'bg-primary text-white' : 'bg-surface-alt text-ink-soft'
                      }`}
                    >
                      {identityTypeLabel(type)}
                    </button>
                  ))}
                </div>
                {identityType === 'DRIVERS_LICENSE' && (
                  <p className="mt-1.5 text-[11px] text-accent-dark">
                    بديل مؤقت — صالح لأول تعبئة فقط لهذه المركبة، ثم يجب إضافة رقم وطني أو إداري.
                  </p>
                )}
              </Field>
              <Field label="رقم الهوية">
                {identityType === 'DRIVERS_LICENSE' ? (
                  <input
                    data-testid="registration-identity-input"
                    value={identityNumber}
                    onChange={(e) => {
                      setIdentityNumber(e.target.value);
                      setSearchedIdentity(null);
                    }}
                    dir="ltr"
                    className={`${inputClass} sm:w-72`}
                  />
                ) : (
                  <DigitBoxInput
                    groups={IDENTITY_DIGIT_GROUPS}
                    value={identityNumber}
                    onChange={(v) => {
                      setIdentityNumber(v);
                      setSearchedIdentity(null);
                    }}
                    data-testid="registration-identity-input"
                  />
                )}
              </Field>
              <PillButton
                size="sm"
                data-testid="registration-owner-search"
                disabled={!identityValid}
                onClick={() => {
                  setOwnerError(null);
                  setSearchedIdentity({ type: identityType, number: identityNumber });
                }}
              >
                بحث عن المالك
              </PillButton>

              {searchedIdentity && ownerLookup.isFetching && <p className="text-[12px] text-ink-soft">...جارٍ البحث</p>}

              {searchedIdentity && !ownerLookup.isFetching && foundOwner && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm bg-surface-alt p-3" data-testid="registration-owner-found">
                  <div>
                    <p className="text-[12px] text-ink-soft">مالك مسجّل بهذه الهوية</p>
                    <p className="text-[13.5px] font-bold text-ink">{foundOwner.fullName}</p>
                  </div>
                  <PillButton size="sm" data-testid="registration-owner-pick" onClick={() => setOwner(foundOwner)}>
                    اختيار هذا المالك
                  </PillButton>
                </div>
              )}

              {searchedIdentity && ownerLookup.data && !foundOwner && (
                <div className="space-y-3 rounded-sm border border-line p-3" data-testid="registration-owner-new">
                  <p className="text-[12.5px] font-bold text-primary-dark">لا يوجد مالك بهذه الهوية — تسجيل مالك جديد</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="اسم المالك">
                      <input
                        data-testid="registration-owner-name"
                        value={newOwnerName}
                        onChange={(e) => setNewOwnerName(e.target.value)}
                        className={inputClass}
                      />
                    </Field>
                    <Field label="رقم هاتف المالك">
                      <input
                        data-testid="registration-owner-phone"
                        value={newOwnerPhone}
                        onChange={(e) => setNewOwnerPhone(restrictToPhoneNumber(e.target.value))}
                        dir="ltr"
                        placeholder="0912345678"
                        className={inputClass}
                      />
                    </Field>
                    <Field label="العنوان (اختياري)">
                      <input value={newOwnerAddress} onChange={(e) => setNewOwnerAddress(e.target.value)} className={inputClass} />
                    </Field>
                  </div>
                  <PillButton
                    size="sm"
                    data-testid="registration-owner-save"
                    disabled={createOwner.isPending}
                    onClick={() => {
                      setOwnerError(null);
                      if (!newOwnerName.trim()) return setOwnerError('اسم المالك مطلوب.');
                      if (!LIBYAN_MOBILE_REGEX.test(newOwnerPhone.trim()))
                        return setOwnerError('رقم هاتف المالك مطلوب، ويجب أن يكون رقم هاتف ليبي صحيح (مثال: 0912345678).');
                      createOwner.mutate();
                    }}
                  >
                    {createOwner.isPending ? '...جارٍ الحفظ' : 'تسجيل المالك'}
                  </PillButton>
                </div>
              )}
              {ownerError && <p className="text-[12px] text-danger">{ownerError}</p>}
            </>
          )}
        </div>
      </Card>

      {/* 3 — Vehicle */}
      <Card className={stationReady && owner ? '' : 'pointer-events-none opacity-50'}>
        <CardHeader title="٢. المركبة" />
        <div className="space-y-4 p-4">
          <Field label="رقم اللوحة">
            <DigitBoxInput
              groups={PLATE_DIGIT_GROUPS}
              separator="-"
              value={plate}
              onChange={setPlate}
              data-testid="registration-plate-input"
            />
            <p className="mt-1 text-[11px] text-ink-faint">رمز البلدية — رقم المركبة</p>
            <DuplicateWarning conflict={conflictFor('currentPlate')} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="الطراز/الماركة (اختياري)">
              <VehicleBrandPicker value={model} onChange={setModel} className={inputClass} />
            </Field>
            <Field label="نوع المركبة (اختياري)">
              <select
                data-testid="registration-vehicle-type"
                value={vehicleTypeId}
                onChange={(e) => setVehicleTypeId(e.target.value)}
                className={inputClass}
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
            </Field>
            <Field label="اللون (اختياري)">
              <input value={color} onChange={(e) => setColor(e.target.value)} className={inputClass} />
            </Field>
            <Field label="سنة الصنع (اختياري)">
              <input
                value={manufactureYear}
                onChange={(e) => setManufactureYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
                inputMode="numeric"
                dir="ltr"
                className={inputClass}
              />
            </Field>
            <Field label="رقم الشاسيه (اختياري)">
              <input
                data-testid="registration-chassis-input"
                value={chassisNumber}
                onChange={(e) => setChassisNumber(restrictToChassisNumber(e.target.value))}
                dir="ltr"
                maxLength={17}
                className={`${inputClass} font-mono`}
              />
              {chassisNumber.length > 0 && chassisNumber.length < 17 && (
                <p className="mt-1 text-[11px] text-ink-faint">{chassisNumber.length}/17 حرفًا</p>
              )}
              <DuplicateWarning conflict={conflictFor('chassisNumber')} />
            </Field>
            <Field label="رقم كتيب المركبة (اختياري)">
              <input
                data-testid="registration-booklet-input"
                value={registrationBooklet}
                onChange={(e) => setRegistrationBooklet(restrictToRegistrationBooklet(e.target.value))}
                dir="ltr"
                maxLength={12}
                className={`${inputClass} font-mono`}
              />
              <DuplicateWarning conflict={conflictFor('registrationBooklet')} />
            </Field>
          </div>

          {vehicleError && (
            <p className="text-[12px] text-danger" data-testid="registration-vehicle-error">
              {vehicleError}
            </p>
          )}
          <PillButton
            data-testid="registration-vehicle-save"
            disabled={registerVehicle.isPending || !owner || !stationReady}
            onClick={() => {
              setVehicleError(null);
              const problem = validateVehicle();
              if (problem) return setVehicleError(problem);
              registerVehicle.mutate();
            }}
          >
            {registerVehicle.isPending ? '...جارٍ الحفظ' : 'تسجيل المركبة'}
          </PillButton>
        </div>
      </Card>
    </div>
  );
}
