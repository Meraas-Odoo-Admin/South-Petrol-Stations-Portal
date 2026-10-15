import { useEffect, useMemo, useState } from 'react';
import { LookupSearch, useLookup } from '../../lib/useLookup';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import {
  ADMINISTRATIVE_ID_HELP,
  BOOKLET_HELP,
  NATIONAL_ID_HELP,
  LIBYAN_MOBILE_HELP,
  VEHICLE_COLORS,
  VEHICLE_COLOR_OTHER,
  VEHICLE_FUEL_TYPES,
  VEHICLE_FUEL_TYPE_LABELS_AR,
  checkArabicPersonName,
  checkBooklet,
  checkChassis,
  checkColor,
  checkLibyanMobile,
  checkMakeOrModel,
  checkManufactureYear,
  checkOwnerIdentity,
  identityNumberLength,
  manufactureYearOptions,
  normalizeChassis,
  normalizePlate,
  type FieldCheck,
  type VehicleFuelTypeKey,
} from '@fuel-tracking/shared-types';
import { apiClient } from '../../lib/apiClient';
import {
  formatLicensePlate,
  restrictToChassisNumber,
  restrictToIdentityNumber,
  restrictToPhoneNumber,
  restrictToRegistrationBooklet,
} from '../../lib/libyanFormats';
import { PLATE_DIGIT_GROUPS, identityDigitGroups } from '../../lib/digitBoxGroups';
import { focusField } from '../../lib/focusField';
import { identityTypeLabel } from '../../lib/labels';
import { PageHeader } from '../../components/design/PageHeader';
import { PillButton } from '../../components/design/PillButton';
import { StatusPill } from '../../components/design/StatusPill';
import { TextField } from '../../components/design/TextField';
import { DigitBoxInput } from '../../components/DigitBoxInput';
import { LtrText } from '../../components/LtrText';
import { Notice, SectionCard } from '../users/parts';
import { registrationErrorMessage } from './registrationErrors';
import { CardIssueFlow } from '../cards/CardIssueFlow';
import { SkeletonRows } from '../../components/design/Skeleton';

type IdentityType = 'NATIONAL_ID' | 'ADMINISTRATIVE_ID';
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
  identityType: IdentityType | 'INSTITUTION' | 'DRIVERS_LICENSE'; // older rows can carry these
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
  // Phase 4a: earlier fill-ups on this plate that were recorded as
  // "unregistered" and are now linked to this vehicle.
  linkedFillUps?: number;
}

const REGISTRATION_STATUS_LABELS: Record<RegistrationStationRow['status'], string> = {
  ACTIVE: 'يعمل',
  TEMPORARILY_CLOSED: 'مغلق مؤقتًا',
  CLOSED: 'مغلق',
};

const DUPLICATE_FIELD_LABELS: Record<DuplicateField, string> = {
  currentPlate: 'رقم اللوحة',
  chassisNumber: 'رقم الهيكل',
  registrationBooklet: 'رقم الدفتر',
};

function canRegisterAt(station: RegistrationStationRow | undefined): boolean {
  // Phase 6: the municipality's activation switch gates nothing.
  return !!station && station.status === 'ACTIVE';
}

const SELECT_CLASS =
  'h-[52px] w-full rounded-sm border border-line bg-surface-alt px-3 text-[16px] text-ink focus:outline-none focus:ring-2 focus:ring-primary-dark focus:ring-offset-2 focus:ring-offset-surface lg:h-11 lg:text-[14px]';

function Label({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[14px] font-bold text-ink lg:text-[12px]">
      {children}
    </label>
  );
}

// Live help under a field: the rule while it is fine, the broken rule the
// moment it applies.
function FieldHelp({ check, help, testId }: { check: FieldCheck | null; help?: string; testId?: string }) {
  if (check && !check.ok) {
    return (
      <p role="alert" data-testid={testId} className="mt-1.5 text-[14px] font-medium text-danger-dark lg:text-[12px]">
        {check.message}
      </p>
    );
  }
  return help ? <p className="mt-1.5 text-[14px] text-ink-soft lg:text-[12px]">{help}</p> : null;
}

function DuplicateWarning({ conflict }: { conflict: VehicleDuplicate | undefined }) {
  if (!conflict) return null;
  return (
    <p
      role="alert"
      className="mt-1.5 text-[14px] font-bold text-danger-dark lg:text-[12px]"
      data-testid={`registration-duplicate-${conflict.field}`}
    >
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

// Registration employee's workspace — the only place a vehicle or owner is
// created (petrol stations never do):
//   1. which registration office they are working at;
//   2. the owner FIRST - an individual (national / administrative number,
//      checked with the shared rules, live);
//   3. the vehicle: its identity (plate, chassis, booklet) before its
//      details (make, model, colour, year, fuel), duplicates named while
//      typing.
// Every rule here is the one the API applies (packages/shared-types).
export function RegistrationPage() {
  const queryClient = useQueryClient();

  // ── 1. Registration office ──────────────────────────────────────────
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
  const [ownerTouched, setOwnerTouched] = useState(false);

  const identityLive = identityNumber
    ? checkOwnerIdentity(identityType, identityNumber, { partial: true })
    : null;
  const identityComplete =
    identityNumber.length === identityNumberLength(identityType) && checkOwnerIdentity(identityType, identityNumber).ok;

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

  const createIndividual = useMutation({
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
    setOwnerTouched(false);
  }

  function saveIndividual() {
    setOwnerError(null);
    setOwnerTouched(true);
    const name = checkArabicPersonName(newOwnerName, 'اسم المالك');
    const phone = checkLibyanMobile(newOwnerPhone, { required: true });
    if (!name.ok) return focusField('registration-owner-name');
    if (!phone.ok) return focusField('registration-owner-phone');
    createIndividual.mutate();
  }

  const individualNameCheck = newOwnerName ? checkArabicPersonName(newOwnerName, 'اسم المالك') : null;
  const individualPhoneCheck = newOwnerPhone ? checkLibyanMobile(newOwnerPhone, { required: true }) : null;

  // ── 3. Vehicle ──────────────────────────────────────────────────────
  const [plate, setPlate] = useState('');
  const [chassisNumber, setChassisNumber] = useState('');
  const [chassisNonStandard, setChassisNonStandard] = useState(false);
  const [registrationBooklet, setRegistrationBooklet] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [colorChoice, setColorChoice] = useState('');
  const [colorOther, setColorOther] = useState('');
  const [manufactureYear, setManufactureYear] = useState('');
  const [fuelType, setFuelType] = useState<VehicleFuelTypeKey | ''>('');
  const [vehicleTypeId, setVehicleTypeId] = useState('');
  const [vehicleTouched, setVehicleTouched] = useState(false);
  const [vehicleError, setVehicleError] = useState<string | null>(null);
  const [serverConflicts, setServerConflicts] = useState<VehicleDuplicate[] | null>(null);
  const [registered, setRegistered] = useState<{
    vehicle: RegisteredVehicle;
    ownerName: string;
    registrationStationId: string;
  } | null>(null);

  const fullPlate = plate;
  const yearOptions = useMemo(() => manufactureYearOptions(), []);
  const color = colorChoice === VEHICLE_COLOR_OTHER ? colorOther : colorChoice;

  const typeLookup = useLookup<{ id: string; name: string; isActive: boolean }>('/vehicle-types', 'vehicle-types');
  const vehicleTypes = typeLookup.items;

  const checks = useMemo(
    () => ({
      plate: plate ? (normalizePlate(fullPlate) ? null : ({ ok: false, code: 'PLATE', message: 'رقم اللوحة غير مكتمل: رمز المدينة ثم رقم اللوحة.' } as FieldCheck)) : null,
      chassis: chassisNumber ? checkChassis(chassisNumber, chassisNonStandard) : null,
      booklet: registrationBooklet ? checkBooklet(registrationBooklet) : null,
      make: make ? checkMakeOrModel(make, 'الصانع') : null,
      model: model ? checkMakeOrModel(model, 'الطراز') : null,
      color: color ? checkColor(color) : null,
      year: manufactureYear ? checkManufactureYear(manufactureYear) : null,
    }),
    [plate, fullPlate, chassisNumber, chassisNonStandard, registrationBooklet, make, model, color, manufactureYear],
  );

  // Live duplicate check — only fields that are already well-formed,
  // debounced so it does not fire per keystroke.
  const [duplicateParams, setDuplicateParams] = useState<Partial<Record<DuplicateField, string>>>({});
  useEffect(() => {
    const timer = setTimeout(() => {
      setDuplicateParams({
        currentPlate: normalizePlate(fullPlate) ? fullPlate : undefined,
        chassisNumber: chassisNumber && checkChassis(chassisNumber, chassisNonStandard).ok ? normalizeChassis(chassisNumber) : undefined,
        registrationBooklet: registrationBooklet && checkBooklet(registrationBooklet).ok ? registrationBooklet : undefined,
      });
      setServerConflicts(null);
    }, 400);
    return () => clearTimeout(timer);
  }, [fullPlate, chassisNumber, chassisNonStandard, registrationBooklet]);
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
          currentPlate: fullPlate,
          chassisNumber: normalizeChassis(chassisNumber),
          chassisNonStandard,
          registrationBooklet,
          make: make.trim(),
          model: model.trim(),
          color: color.trim(),
          manufactureYear: Number(manufactureYear),
          fuelType,
          vehicleTypeId: vehicleTypeId || undefined,
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

  // The first problem in the order a person fills the form in, and the field
  // to put the cursor on.
  function firstVehicleProblem(): { message: string; field: string } | null {
    if (!normalizePlate(fullPlate)) return { message: 'رقم اللوحة مطلوب: رمز المدينة ثم رقم اللوحة.', field: 'registration-plate-input' };
    const chassis = checkChassis(chassisNumber, chassisNonStandard);
    if (!chassis.ok) return { message: chassis.message, field: 'registration-chassis-input' };
    const booklet = checkBooklet(registrationBooklet);
    if (!booklet.ok) return { message: booklet.message, field: 'registration-booklet-input' };
    const m = checkMakeOrModel(make, 'الصانع');
    if (!m.ok) return { message: m.message, field: 'registration-make' };
    const md = checkMakeOrModel(model, 'الطراز');
    if (!md.ok) return { message: md.message, field: 'registration-model' };
    const c = checkColor(color);
    if (!c.ok) return { message: c.message, field: colorChoice === VEHICLE_COLOR_OTHER ? 'registration-color-other' : 'registration-color' };
    const y = checkManufactureYear(manufactureYear);
    if (!y.ok) return { message: y.message, field: 'registration-year' };
    if (!fuelType) return { message: 'نوع وقود المركبة مطلوب: بنزين أو ديزل.', field: 'registration-fuel' };
    const conflict = conflicts[0];
    if (conflict) {
      const field = { currentPlate: 'registration-plate-input', chassisNumber: 'registration-chassis-input', registrationBooklet: 'registration-booklet-input' }[conflict.field];
      return { message: 'بعض بيانات المركبة مسجّلة مسبقًا لمركبة أخرى — راجع التنبيهات أسفل الحقول.', field };
    }
    return null;
  }

  function resetVehicle() {
    setPlate('');
    setChassisNumber('');
    setChassisNonStandard(false);
    setRegistrationBooklet('');
    setMake('');
    setModel('');
    setColorChoice('');
    setColorOther('');
    setManufactureYear('');
    setFuelType('');
    setVehicleTypeId('');
    setVehicleError(null);
    setVehicleTouched(false);
    setServerConflicts(null);
    setRegistered(null);
  }

  // ── Render ─────────────────────────────────────────────────────────
  if (registered) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="تسجيل المركبات" />
        <div className="animate-scale-in rounded-md bg-surface p-6 text-center shadow-sm" data-testid="registration-success">
          <p className="text-[20px] font-extrabold text-ok lg:text-[17px]">تم تسجيل المركبة</p>
          <p className="mt-3 text-[28px] font-black text-primary lg:text-[26px]">
            <LtrText>{formatLicensePlate(registered.vehicle.currentPlate)}</LtrText>
          </p>
          <p className="mt-1 text-[16px] text-ink-soft lg:text-[13px]">
            الرقم الداخلي <LtrText>{registered.vehicle.internalCode}</LtrText> — المالك {registered.ownerName}
          </p>
          {!!registered.vehicle.linkedFillUps && registered.vehicle.linkedFillUps > 0 && (
            <p className="mt-3 rounded-sm bg-accent-100 p-3 text-[15px] font-bold text-accent-ink lg:text-[13px]" data-testid="registration-linked-fillups">
              تم العثور على {registered.vehicle.linkedFillUps} تعبئة سابقة لهذه اللوحة وربطها بالمركبة.
            </p>
          )}
          {/* The card is issued and printed right here at the desk. */}
          <div className="mt-6 border-t border-line pt-5 text-start">
            <p className="mb-3 text-[16px] font-bold text-primary-dark lg:text-[13px]">بطاقة المركبة</p>
            <CardIssueFlow
              vehicleId={registered.vehicle.id}
              registrationStationId={registered.registrationStationId}
              reason="FIRST_ISSUE"
              showPrinterSettings={false}
            />
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-2.5">
            <PillButton
              size="field"
              onClick={() => {
                resetVehicle();
                resetOwner();
              }}
            >
              تسجيل مركبة أخرى
            </PillButton>
            <PillButton size="field" variant="secondary" onClick={resetVehicle}>
              مركبة أخرى لنفس المالك
            </PillButton>
            <Link to={`/vehicles/${registered.vehicle.id}`}>
              <PillButton size="field" variant="ghost">
                صفحة المركبة
              </PillButton>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="تسجيل المركبات" subtitle="تسجيل مالك ومركبة جديدين في مكتب التسجيل" />

      {/* 1 — Registration office */}
      <SectionCard title="مكتب التسجيل">
        {stationsQuery.isLoading && <SkeletonRows rows={1} />}
        {stationsQuery.isError && (
          <p className="text-[15px] text-danger lg:text-[13px]" data-testid="registration-not-allowed">
            تسجيل المركبات يتم في مكاتب التسجيل فقط، وحسابك لا يملك صلاحية التسجيل.
          </p>
        )}
        {stationsQuery.data && stations.length === 0 && (
          <p className="text-[15px] text-danger lg:text-[13px]" data-testid="registration-no-station">
            حسابك غير مرتبط بأي مكتب تسجيل. تواصل مع مدير مكتبك.
          </p>
        )}
        {stations.length > 1 && (
          <select
            data-testid="registration-station-select"
            value={chosenStationId}
            onChange={(e) => setChosenStationId(e.target.value)}
            aria-label="مكتب التسجيل"
            className={`${SELECT_CLASS} sm:w-96`}
          >
            <option value="">اختر مكتب التسجيل الذي تعمل فيه الآن</option>
            {stations.map((s) => (
              <option key={s.id} value={s.id} disabled={!canRegisterAt(s)}>
                {s.name}
                {canRegisterAt(s) ? '' : ` (${REGISTRATION_STATUS_LABELS[s.status]})`}
              </option>
            ))}
          </select>
        )}
        {station && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[15px] lg:text-[13px]" data-testid="registration-station-current">
            <span className="font-bold text-ink">{station.name}</span>
            <span className="text-ink-faint">— {station.municipality.name}</span>
            <StatusPill variant={station.status === 'ACTIVE' ? 'ok' : 'danger'}>
              {REGISTRATION_STATUS_LABELS[station.status]}
            </StatusPill>
          </div>
        )}
        {station && !stationReady && (
          <p className="mt-2 text-[15px] text-danger lg:text-[13px]">
            مكتب التسجيل هذا مغلق حاليًا، ولا يمكن التسجيل فيه.
            {station.statusNote ? ` (${station.statusNote})` : ''}
          </p>
        )}
      </SectionCard>

      {/* 2 — Owner */}
      <div className={stationReady ? '' : 'pointer-events-none opacity-50'}>
        <SectionCard step={1} title="المالك">
          <div className="space-y-4">
            {owner ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-ok-100 p-4" data-testid="registration-owner-selected">
                <div>
                  <p className="text-[17px] font-bold text-ink lg:text-[14px]">{owner.fullName}</p>
                  <p className="mt-0.5 text-[15px] text-ink-soft lg:text-[12px]">
                    {identityTypeLabel(owner.identityType)} <LtrText>{owner.identityNumber}</LtrText>
                  </p>
                </div>
                <PillButton size="field" variant="ghost" onClick={resetOwner}>
                  تغيير المالك
                </PillButton>
              </div>
            ) : (
              <>
                <>
                    <p className="text-[15px] text-ink-soft lg:text-[13px]">
                      ابحث عن المالك أولًا برقم هويته — ربما هو مسجّل مسبقًا كمالك لمركبة أخرى.
                    </p>
                    <div>
                      <Label>نوع الهوية</Label>
                      <div className="flex gap-2 sm:w-[28rem]">
                        {(['NATIONAL_ID', 'ADMINISTRATIVE_ID'] as const).map((type) => (
                          <button
                            key={type}
                            type="button"
                            aria-pressed={identityType === type}
                            onClick={() => {
                              setIdentityType(type);
                              setIdentityNumber('');
                              setSearchedIdentity(null);
                            }}
                            className={`h-12 flex-1 rounded-full text-[16px] font-bold lg:h-10 lg:text-[14px] ${
                              identityType === type ? 'bg-primary text-white' : 'bg-surface-alt text-ink-soft'
                            }`}
                          >
                            {identityTypeLabel(type)}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Enter searches, so the form can be filled without the mouse. */}
                    <div
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && identityComplete) {
                          e.preventDefault();
                          setOwnerError(null);
                          setSearchedIdentity({ type: identityType, number: identityNumber });
                        }
                      }}
                    >
                      <Label>{identityType === 'NATIONAL_ID' ? 'الرقم الوطني' : 'الرقم الإداري'}</Label>
                      <DigitBoxInput
                        key={identityType}
                        groups={identityDigitGroups(identityType)}
                        value={identityNumber}
                        onChange={(v) => {
                          setIdentityNumber(restrictToIdentityNumber(v, identityNumberLength(identityType)));
                          setSearchedIdentity(null);
                        }}
                        data-testid="registration-identity-input"
                        label={identityType === 'NATIONAL_ID' ? 'الرقم الوطني' : 'الرقم الإداري'}
                      />
                      <FieldHelp
                        check={identityLive}
                        help={identityType === 'NATIONAL_ID' ? NATIONAL_ID_HELP : ADMINISTRATIVE_ID_HELP}
                        testId="registration-identity-error"
                      />
                    </div>
                    <PillButton
                      size="field"
                      data-testid="registration-owner-search"
                      disabled={!identityComplete}
                      onClick={() => {
                        setOwnerError(null);
                        setSearchedIdentity({ type: identityType, number: identityNumber });
                      }}
                    >
                      بحث عن المالك
                    </PillButton>

                    {searchedIdentity && ownerLookup.isFetching && <p className="text-[15px] text-ink-soft lg:text-[13px]">جارٍ البحث…</p>}

                    {searchedIdentity && !ownerLookup.isFetching && foundOwner && (
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-surface-alt p-4" data-testid="registration-owner-found">
                        <div>
                          <p className="text-[14px] text-ink-soft lg:text-[12px]">مالك مسجّل بهذه الهوية</p>
                          <p className="text-[17px] font-bold text-ink lg:text-[14px]">{foundOwner.fullName}</p>
                        </div>
                        <PillButton size="field" data-testid="registration-owner-pick" onClick={() => setOwner(foundOwner)}>
                          اختيار هذا المالك
                        </PillButton>
                      </div>
                    )}

                    {searchedIdentity && ownerLookup.data && !foundOwner && (
                      <div className="space-y-4 rounded-md border border-line p-4" data-testid="registration-owner-new">
                        <p className="text-[16px] font-bold text-primary-dark lg:text-[14px]">لا يوجد مالك بهذه الهوية — تسجيل مالك جديد</p>
                        <TextField
                          label="اسم المالك (بحروف عربية)"
                          data-testid="registration-owner-name"
                          value={newOwnerName}
                          onChange={(e) => setNewOwnerName(e.target.value)}
                          error={individualNameCheck && !individualNameCheck.ok && (ownerTouched || newOwnerName.length > 2) ? individualNameCheck.message : null}
                        />
                        <TextField
                          label="رقم هاتف المالك"
                          data-testid="registration-owner-phone"
                          value={newOwnerPhone}
                          onChange={(e) => setNewOwnerPhone(restrictToPhoneNumber(e.target.value))}
                          error={individualPhoneCheck && !individualPhoneCheck.ok && (ownerTouched || newOwnerPhone.length >= 10) ? individualPhoneCheck.message : null}
                          hint={LIBYAN_MOBILE_HELP}
                          placeholder="0912345678"
                          inputMode="tel"
                          ltr
                        />
                        <TextField label="العنوان (اختياري)" value={newOwnerAddress} onChange={(e) => setNewOwnerAddress(e.target.value)} />
                        <PillButton size="field" data-testid="registration-owner-save" disabled={createIndividual.isPending} onClick={saveIndividual}>
                          {createIndividual.isPending ? 'جارٍ الحفظ…' : 'تسجيل المالك'}
                        </PillButton>
                      </div>
                    )}
                </>
                {ownerError && (
                  <p role="alert" className="text-[15px] font-medium text-danger-dark lg:text-[13px]" data-testid="registration-owner-error">
                    {ownerError}
                  </p>
                )}
              </>
            )}
          </div>
        </SectionCard>
      </div>

      {/* 3 — Vehicle */}
      <div className={stationReady && owner ? '' : 'pointer-events-none opacity-50'}>
        {/* Phase 7 (critique): a locked step says why. */}
        <SectionCard step={2} title="المركبة" description={owner ? undefined : 'تُفتح بعد اختيار المالك أو تسجيله في الخطوة 1.'}>
          <div className="space-y-5">
            <div>
              <Label>رقم اللوحة</Label>
              <DigitBoxInput
                groups={PLATE_DIGIT_GROUPS}
                separator="-"
                value={plate}
                onChange={setPlate}
                data-testid="registration-plate-input"
                label="رقم اللوحة"
              />
              <FieldHelp check={vehicleTouched ? checks.plate : null} help="رمز المدينة (رقم أو رقمان)، ثم رقم المركبة. أرقام فقط." />
              <DuplicateWarning conflict={conflictFor('currentPlate')} />
            </div>

            <div>
              <Label htmlFor="reg-chassis">رقم الهيكل</Label>
              <input
                id="reg-chassis"
                data-testid="registration-chassis-input"
                value={chassisNumber}
                onChange={(e) => setChassisNumber(restrictToChassisNumber(e.target.value))}
                dir="ltr"
                maxLength={20}
                autoCapitalize="characters"
                aria-invalid={checks.chassis && !checks.chassis.ok ? true : undefined}
                className={`h-[52px] w-full rounded-sm border bg-surface-alt px-3.5 text-end font-mono text-[16px] text-ink focus:outline-none focus:ring-2 focus:ring-primary-dark lg:h-11 lg:text-[14px] ${
                  checks.chassis && !checks.chassis.ok ? 'border-danger' : 'border-line'
                }`}
              />
              <label className="mt-2 flex min-h-[44px] items-center gap-2 text-[15px] text-ink lg:text-[13px]">
                <input
                  type="checkbox"
                  data-testid="registration-chassis-nonstandard"
                  checked={chassisNonStandard}
                  onChange={(e) => setChassisNonStandard(e.target.checked)}
                  className="h-5 w-5"
                />
                رقم هيكل غير قياسي (ليس 17 خانة في الدفتر)
              </label>
              <FieldHelp
                check={checks.chassis}
                help={
                  chassisNonStandard
                    ? 'يُقبل من 6 إلى 20 خانة. يُسجَّل أن الرقم غير قياسي ويظهر في بيانات المركبة.'
                    : `17 خانة بالضبط${chassisNumber ? ` — كتبت ${chassisNumber.length}` : ''}.`
                }
              />
              <DuplicateWarning conflict={conflictFor('chassisNumber')} />
            </div>

            <div>
              <Label htmlFor="reg-booklet">رقم الدفتر</Label>
              <input
                id="reg-booklet"
                data-testid="registration-booklet-input"
                value={registrationBooklet}
                onChange={(e) => setRegistrationBooklet(restrictToRegistrationBooklet(e.target.value))}
                dir="ltr"
                maxLength={12}
                inputMode="numeric"
                aria-invalid={checks.booklet && !checks.booklet.ok ? true : undefined}
                className={`h-[52px] w-full rounded-sm border bg-surface-alt px-3.5 text-end font-mono text-[16px] text-ink focus:outline-none focus:ring-2 focus:ring-primary-dark lg:h-11 lg:text-[14px] ${
                  checks.booklet && !checks.booklet.ok ? 'border-danger' : 'border-line'
                }`}
              />
              <FieldHelp check={checks.booklet} help={BOOKLET_HELP} />
              <DuplicateWarning conflict={conflictFor('registrationBooklet')} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="الصانع (كما في الدفتر)"
                data-testid="registration-make"
                value={make}
                onChange={(e) => setMake(e.target.value)}
                error={checks.make && !checks.make.ok ? checks.make.message : null}
                placeholder="مثال: تويوتا"
              />
              <TextField
                label="الطراز (كما في الدفتر)"
                data-testid="registration-model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                error={checks.model && !checks.model.ok ? checks.model.message : null}
                placeholder="مثال: كامري"
              />
              <div>
                <Label htmlFor="reg-color">اللون</Label>
                <select
                  id="reg-color"
                  data-testid="registration-color"
                  value={colorChoice}
                  onChange={(e) => setColorChoice(e.target.value)}
                  className={SELECT_CLASS}
                >
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
                    <TextField label="اكتب اللون" data-testid="registration-color-other" value={colorOther} onChange={(e) => setColorOther(e.target.value)} />
                  </div>
                )}
              </div>
              <div>
                <Label htmlFor="reg-year">سنة الصنع</Label>
                <select
                  id="reg-year"
                  data-testid="registration-year"
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
              </div>
              <div>
                <Label htmlFor="reg-fuel">نوع وقود المركبة</Label>
                <select
                  id="reg-fuel"
                  data-testid="registration-fuel"
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
                <p className="mt-1.5 text-[14px] text-ink-soft lg:text-[12px]">يُنبَّه موظف المحطة إن اختلف الوقود المصروف عن هذا النوع.</p>
              </div>
              <div>
                <Label htmlFor="reg-type">نوع المركبة (اختياري)</Label>
                <select
                  id="reg-type"
                  data-testid="registration-vehicle-type"
                  value={vehicleTypeId}
                  onChange={(e) => setVehicleTypeId(e.target.value)}
                  className={SELECT_CLASS}
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
                <LookupSearch id="reg-type-search" q={typeLookup.q} onChange={typeLookup.setQ} capped={typeLookup.capped} />
              </div>
            </div>

            {vehicleError && (
              <Notice kind="error">
                <span data-testid="registration-vehicle-error">{vehicleError}</span>
              </Notice>
            )}
            <PillButton
              size="field"
              data-testid="registration-vehicle-save"
              disabled={registerVehicle.isPending || !owner || !stationReady}
              onClick={() => {
                setVehicleError(null);
                setVehicleTouched(true);
                const problem = firstVehicleProblem();
                if (problem) {
                  setVehicleError(problem.message);
                  return focusField(problem.field);
                }
                registerVehicle.mutate();
              }}
            >
              {registerVehicle.isPending ? 'جارٍ الحفظ…' : 'تسجيل المركبة'}
            </PillButton>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
