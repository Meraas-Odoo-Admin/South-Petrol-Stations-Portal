import { formatDateTime, formatTime } from '../../lib/dateFormat';
import { FillUpPlate } from '../../components/FillUpPlate';
import { useEffect, useRef, useState } from 'react';
import { useForm, type FieldErrors, type UseFormReturn } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { isAxiosError, type AxiosError } from 'axios';
import type {
  CreateFillUpRequest,
  CreateFillUpResult,
  DailyReportResponse,
  ExceptionTypeOption,
  RuleCheckDetail,
  RulePreviewResponse,
  RuleFailureReason,
  RuleTriggerDetail,
} from '@fuel-tracking/shared-types';
import { apiClient } from '../../lib/apiClient';
import { StationSelect } from '../../components/StationSelect';
import { LtrText } from '../../components/LtrText';
import { formatLicensePlate } from '../../lib/libyanFormats';
import {
  MAX_FILLUP_LITERS,
  NO_CARD_REASONS,
  NO_CARD_REASON_LABELS_AR,
  VEHICLE_FUEL_TYPE_LABELS_AR,
  fuelTypeMismatch,
  type NoCardReason,
} from '@fuel-tracking/shared-types';
import { fuelTypeLabel } from '../../lib/labels';
import { describeApiError } from '../../lib/apiError';
import { StockStrip, StockWarning } from '../stock/StockStrip';
import { useAuth } from '../auth/AuthProvider';
import { useStations } from '../stations/useStations';
import { Card } from '../../components/design/Card';
import { PillButton } from '../../components/design/PillButton';
import { CodeText } from '../../components/design/CodeText';
import { KpiCard } from '../../components/design/KpiCard';
import { FillUpStatusPill } from '../../components/FillUpStatusPill';
import { VehiclePreviewCard } from './VehiclePreviewCard';
import { QrScanPanel, type ScannedCard } from '../../components/QrScanPanel';
import { RULE_VIOLATION_MESSAGES, RULE_CHECK_LABELS, describeRuleCheck } from './ruleViolationMessages';
import { useFuelPrices } from './useFuelPrice';
import type { VehicleBasicInfo } from '../vehicles/types';
import { SkeletonRows } from '../../components/design/Skeleton';
import { LIST_PAGE_SIZE } from '../../lib/pageSize';

// Item 8: name the specific prior fill-up that tripped an owner-level rule
// (it can be on a different vehicle than the one being submitted, which
// otherwise looks like a false positive) — shown wherever a rule
// violation is shown, inline here and on the exception-approval screen.
export function TriggerDetail({ trigger }: { trigger: RuleTriggerDetail | null }) {
  if (!trigger) {
    return null;
  }
  return (
    <p className="text-[13px] lg:text-[12px] text-ink-soft">
      بسبب تعبئة سابقة لنفس مالك المركبة{' '}
      <LtrText>
        {trigger.vehicleCurrentPlate ? formatLicensePlate(trigger.vehicleCurrentPlate) : trigger.vehicleInternalCode}
      </LtrText>{' '}
      بتاريخ <LtrText>{formatDateTime(trigger.occurredAt)}</LtrText>
    </p>
  );
}

type Rejection = { reason: RuleFailureReason; trigger: RuleTriggerDetail | null };

// One row of GET /vehicles?search= as the no-card search shows it.
interface VehicleSearchRow {
  id: string;
  currentPlate: string;
  make?: string | null;
  model?: string | null;
  owner?: { fullName: string } | null;
}

// The same per-rule breakdown content, used by both the review step and
// (round 10) the confirmation-adjacent contexts. idSuffix is a round-8
// leftover from when a separate desktop form shared the DOM with the
// mobile wizard and needed disambiguating testids — round 10 removed that
// desktop form, but the wizard's own step still passes idSuffix="-mobile"
// (kept as-is rather than renamed, since the component itself is
// unaffected either way).
function RuleReviewChecks({
  checks,
  isLoading,
  isError,
  errorMessage,
  rejection,
  idSuffix = '',
}: {
  checks: RuleCheckDetail[] | undefined;
  isLoading: boolean;
  isError: boolean;
  // A specific Arabic reason the preview failed (e.g. the station can't
  // take fill-ups) — falls back to the generic line when absent.
  errorMessage?: string | null;
  rejection: Rejection | null;
  idSuffix?: string;
}) {
  return (
    <>
      {rejection ? (
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-danger-100 px-3 py-1.5">
          <span className="h-2 w-2 rounded-full bg-danger" />
          <span className="text-[13px] lg:text-[12px] font-bold text-danger-dark">تعذر تسجيل التعبئة</span>
        </div>
      ) : (
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-ok-100 px-3 py-1.5">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1f7a5c" strokeWidth="3">
            <path d="M20 6L9 17l-5-5" />
          </svg>
          <span className="text-[13px] lg:text-[12px] font-bold text-ok">مراجعة القواعد</span>
        </div>
      )}

      {isLoading && <p className="text-[13px] lg:text-[12.5px] text-ink-soft">...جارٍ فحص القواعد</p>}
      {isError && <p className="text-[13px] lg:text-[12.5px] text-danger">{errorMessage ?? 'تعذر تحميل مراجعة القواعد.'}</p>}

      {checks && (
        <div className="space-y-2">
          {checks.map((check) => {
            // The preview's own pass/fail, UNLESS an actual submission just
            // rejected on this exact rule — that verdict (from the real
            // POST /fillups call, not this snapshot) wins, since a few
            // seconds may have passed since the preview was fetched.
            const failed = rejection?.reason === check.reason || !check.passed;
            return (
              <div
                key={check.reason}
                data-testid={`rule-check-${check.reason}${idSuffix}`}
                className={`rounded-sm px-3 py-2.5 ${failed ? 'bg-danger-100' : 'bg-ok-100'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[13px] lg:text-[12.5px] font-bold ${failed ? 'text-danger-dark' : 'text-ok'}`}>
                    {RULE_CHECK_LABELS[check.reason]}
                  </span>
                  <span className={`text-[13px] lg:text-[12px] font-bold ${failed ? 'text-danger-dark' : 'text-ok'}`}>
                    {failed ? 'مرفوض' : 'مقبول'}
                  </span>
                </div>
                <p className={`mt-0.5 text-[13px] lg:text-[12px] ${failed ? 'text-danger-dark' : 'text-ink-soft'}`}>
                  {describeRuleCheck(check)}
                </p>
                {failed && rejection?.reason === check.reason && (
                  <p className="mt-1 text-[13px] lg:text-[12px] font-semibold text-danger-dark">
                    {RULE_VIOLATION_MESSAGES[check.reason]}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {rejection?.trigger && (
        <div className="mt-2 rounded-sm bg-surface-alt px-3.5 py-2.5">
          <TriggerDetail trigger={rejection.trigger} />
        </div>
      )}
    </>
  );
}

// Also shared — the exception-type/reason fields are identical
// regardless of which screen hosts them (an inline card on desktop, a
// dedicated full screen on mobile per screenshot 02's third panel).
function ExceptionFormFields({
  exceptionForm,
  exceptionTypes,
  selectedExceptionType,
  onSubmit,
  idSuffix = '',
  submitError,
}: {
  exceptionForm: UseFormReturn<ExceptionFormValues>;
  exceptionTypes: ExceptionTypeOption[] | undefined;
  selectedExceptionType: ExceptionTypeOption | null;
  onSubmit: (values: ExceptionFormValues) => void;
  idSuffix?: string;
  submitError?: string | null;
}) {
  const limitState =
    selectedExceptionType &&
    selectedExceptionType.dailyLimitPerStation != null &&
    (selectedExceptionType.usedToday ?? 0) >= selectedExceptionType.dailyLimitPerStation
      ? { strict: Boolean(selectedExceptionType.strictLimit) }
      : null;
  const fieldLabelClass = 'mb-1 block text-[13px] lg:text-[12px] font-bold text-ink-soft';
  const fieldErrorClass = 'mt-1 text-[13px] lg:text-[12px] text-danger';
  const textInputClass =
    'h-11 w-full rounded-sm bg-surface-alt px-3 text-[15px] lg:text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary-dark disabled:opacity-60';

  return (
    <form onSubmit={exceptionForm.handleSubmit(onSubmit)} className="space-y-3">
      <div>
        <label className={fieldLabelClass}>نوع الاستثناء</label>
        <select
          data-testid={`exception-type-select${idSuffix}`}
          {...exceptionForm.register('exceptionTypeId')}
          className={textInputClass}
        >
          <option value="">اختر نوع الاستثناء</option>
          {exceptionTypes?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.dailyLimitPerStation != null ? ` (${t.usedToday ?? 0}/${t.dailyLimitPerStation} اليوم)` : ''}
            </option>
          ))}
        </select>
        {limitState && (
          <p
            role="alert"
            data-testid={limitState.strict ? 'exception-limit-refused' : 'exception-limit-warning'}
            className={`mt-2 rounded-sm p-3 text-[14px] font-bold leading-[1.7] lg:text-[12px] ${limitState.strict ? 'bg-danger-100 text-danger-dark' : 'bg-accent-100 text-ink'}`}
          >
            تجاوزت المحطة الحد اليومي لاستثناء «{selectedExceptionType!.name}» ({selectedExceptionType!.dailyLimitPerStation}).{' '}
            {limitState.strict ? 'لا يُسمح بتجاوز الحد. اطلب من المشرف.' : 'سيتم تسجيله وإبلاغ المشرف ومدير البلدية.'}
          </p>
        )}
        {exceptionForm.formState.errors.exceptionTypeId && (
          <p className={fieldErrorClass}>{exceptionForm.formState.errors.exceptionTypeId.message}</p>
        )}
      </div>

      <div>
        <label className={fieldLabelClass}>السبب</label>
        <textarea
          data-testid={`exception-reason${idSuffix}`}
          {...exceptionForm.register('reason')}
          rows={3}
          className={`${textInputClass} h-auto py-2`}
        />
        {exceptionForm.formState.errors.reason && (
          <p className={fieldErrorClass}>{exceptionForm.formState.errors.reason.message}</p>
        )}
      </div>

      {submitError && <p className="text-[15px] lg:text-[13px] text-danger">{submitError}</p>}

      <div className="flex gap-2 pt-1">
        <PillButton
          type="submit"
          data-testid={`exception-submit${idSuffix}`}
          variant="danger"
          size="field"
          disabled={exceptionForm.formState.isSubmitting || Boolean(limitState?.strict)}
          className="flex-1"
        >
          {exceptionForm.formState.isSubmitting ? '...جارٍ الإرسال' : 'تسجيل كاستثناء'}
        </PillButton>
      </div>
    </form>
  );
}

// Round 8: desktop-only confirmation-screen rail (screenshot 06/07) — live
// tallies + today's fill-ups at this station, the just-recorded one first
// and visually marked. An employee here typically records several
// fill-ups in a row, so a full-screen takeover confirmation (mobile's own
// pattern) would make them re-navigate back in; the rail keeps that
// context beside the confirmation instead.
function DayListRail({
  query,
  visible,
  highlightStationName,
}: {
  query: UseQueryResult<DailyReportResponse>;
  visible: boolean;
  highlightStationName: string;
}) {
  const { data, isLoading } = query;
  if (!visible) return <div />;

  return (
    <Card className="p-4">
      <div className="grid grid-cols-2 gap-2.5">
        <KpiCard label="لترات اليوم" value={data?.totalLiters ?? '—'} />
        <KpiCard label="تعبئات اليوم" value={data?.totalFillUps ?? '—'} />
      </div>
      {highlightStationName && <p className="mt-2 text-[13px] lg:text-[12px] text-ink-faint">{highlightStationName}</p>}

      <div className="mt-3.5 border-t border-line-soft pt-3.5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[13px] lg:text-[12px] font-bold text-ink-soft">تعبئات محطتك اليوم</span>
          <a href="/reports/daily" className="text-[13px] lg:text-[12px] font-bold text-accent-ink hover:underline">
            التقرير الكامل
          </a>
        </div>

        {isLoading && <SkeletonRows rows={2} />}

        {data && (
          <ul className="space-y-2">
            {data.rows.map((row, i) => (
              <li
                key={row.id}
                data-testid={i === 0 ? 'day-list-newest-row' : undefined}
                className={`rounded-sm p-2.5 text-[13px] lg:text-[12px] ${i === 0 ? 'bg-ok-100' : 'bg-surface-alt'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-ink">
                    <FillUpPlate vehicle={row.vehicle} typedPlate={row.typedPlate} />
                  </span>
                  {i === 0 ? (
                    <span className="text-[13px] lg:text-[12px] font-bold text-ok">الآن</span>
                  ) : (
                    <CodeText>{formatTime(row.occurredAt)}</CodeText>
                  )}
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 text-ink-soft">
                  <span>
                    {fuelTypeLabel(row.fuelType)} · <LtrText>{row.quantityLiters}</LtrText> لتر
                  </span>
                  <FillUpStatusPill row={row} />
                </div>
              </li>
            ))}
            {data.rows.length === 0 && <li className="text-[13px] lg:text-[12px] text-ink-soft">لا توجد تعبئات بعد اليوم</li>}
          </ul>
        )}
      </div>
    </Card>
  );
}

// Amounts in LYD, not liters: the amount is what staff actually enter (pay then
// pump); the liter count is derived from it with the fuel's price.
const AMOUNT_QUICK_PICKS = ['5', '10', '20'];

const FUEL_TYPES: { value: CreateFillUpRequest['fuelType']; label: string }[] = [
  { value: 'PETROL_95', label: 'بنزين 95' },
  { value: 'DIESEL', label: 'ديزل' },
  { value: 'KEROSENE', label: 'كاز' },
];

const fillUpSchema = z.object({
  stationId: z.string().min(1, 'اختر المحطة'),
  vehicleId: z.string(),
  fuelType: z.enum(['PETROL_95', 'DIESEL', 'KEROSENE']),
  quantityLiters: z.string().refine(
    (v) => {
      const n = Number(v);
      return v.trim() !== '' && Number.isFinite(n) && n > 0 && n <= MAX_FILLUP_LITERS;
    },
    { message: `يجب أن تكون الكمية رقمًا أكبر من صفر ولا يتجاوز ${MAX_FILLUP_LITERS} لترًا` },
  ),
});
type FillUpFormValues = z.infer<typeof fillUpSchema>;

const exceptionSchema = z.object({
  exceptionTypeId: z.string().min(1, 'اختر نوع الاستثناء'),
  reason: z.string().min(1, 'السبب مطلوب'),
});
type ExceptionFormValues = z.infer<typeof exceptionSchema>;

function isRejected(result: CreateFillUpResult): result is Extract<CreateFillUpResult, { allowed: false }> {
  return 'allowed' in result && result.allowed === false;
}

// crypto.randomUUID() needs a secure context; a plain-HTTP LAN origin throws.
function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // fall through
    }
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

interface ConfirmationSummary {
  vehicleLabel: string;
  ownerLabel: string;
  stationId: string;
  stationName: string;
  fuelType: CreateFillUpRequest['fuelType'];
  quantityLiters: string;
  occurredAt: string;
  isException: boolean;
  isApproved: boolean;
  noCardReason: NoCardReason | null;
  // The exception went past its type's daily limit at this station (flagged).
  overLimit: boolean;
}

// Phase 6: a fill-up is recorded from a CARD SCAN. The journey:
//   scan the card -> confirm the vehicle -> fuel type and amount -> review the
//   rules -> done. (An exception step exists only when a rule is broken.)
// The pump never accepts a typed plate. When the card cannot be used, the
// employee searches a REGISTERED vehicle (plate, owner name or booklet number)
// and says why; it is recorded «بدون بطاقة» and counted in the reports.
type Step = 'scan' | 'match' | 'fuel' | 'review' | 'exception';

const STEP_TITLES: Record<Step, string> = {
  scan: 'مسح بطاقة المركبة',
  match: 'تأكيد المركبة',
  fuel: 'الوقود والكمية',
  review: 'المراجعة وفحص القواعد',
  exception: 'تسجيل استثناء',
};
const STEP_SEGMENT: Record<Step, number> = { scan: 1, match: 1, fuel: 2, review: 3, exception: 3 };

export function RecordFillUpPage() {
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();
  const canViewAllStations = hasPermission('reports:view_all_stations');
  const canViewReports = hasPermission('reports:view');
  const canRecordException = hasPermission('fillups:record_exception');
  const ownStation = user?.stationScope[0] ?? null;
  const { data: stations } = useStations();
  const { data: fuelPrices } = useFuelPrices();

  const [step, setStep] = useState<Step>('scan');
  const [rejection, setRejection] = useState<Rejection | null>(null);
  const [vehicleLabel, setVehicleLabel] = useState('');
  const [amountLyd, setAmountLyd] = useState('');
  const [success, setSuccess] = useState<ConfirmationSummary | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const idempotencyKeyRef = useRef(newIdempotencyKey());
  const [scannedCard, setScannedCard] = useState<ScannedCard | null>(null);
  // The no-card fallback: search a registered vehicle, pick it, say why.
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [pickedVehicle, setPickedVehicle] = useState<VehicleSearchRow | null>(null);
  const [pickedReason, setPickedReason] = useState<NoCardReason | ''>('');
  const [noCard, setNoCard] = useState<{ vehicleId: string; reason: NoCardReason } | null>(null);

  const fillUpForm = useForm<FillUpFormValues>({
    resolver: zodResolver(fillUpSchema),
    defaultValues: {
      stationId: canViewAllStations ? '' : (ownStation?.stationId ?? ''),
      vehicleId: '',
      fuelType: 'PETROL_95',
      quantityLiters: '',
    },
  });
  const exceptionForm = useForm<ExceptionFormValues>({
    resolver: zodResolver(exceptionSchema),
    defaultValues: { exceptionTypeId: '', reason: '' },
  });

  const stationId = fillUpForm.watch('stationId');
  const chosenFuel = fillUpForm.watch('fuelType');

  // Who the fill-up is for, as the server wants it: the scanned card's number
  // (recorded CARD_SCAN) or a registered vehicle with the reason its card could
  // not be used (recorded «بدون بطاقة»).
  const identifiers: Pick<CreateFillUpRequest, 'cardNumber' | 'vehicleId' | 'noCardReason'> = scannedCard
    ? { cardNumber: scannedCard.cardNumber }
    : noCard
      ? { vehicleId: noCard.vehicleId, noCardReason: noCard.reason }
      : {};
  const hasSubject = Boolean(scannedCard || noCard);

  const rulePreviewQuery = useQuery({
    queryKey: ['fillups', 'rule-preview', identifiers, stationId, chosenFuel],
    queryFn: async () =>
      (
        await apiClient.get<RulePreviewResponse>('/fillups/rule-preview', {
          params: { ...identifiers, stationId, fuelType: chosenFuel },
        })
      ).data,
    enabled: hasSubject && !!stationId,
    retry: (failureCount, error) => !(isAxiosError(error) && error.response?.status && error.response.status >= 400 && error.response.status < 500) && failureCount < 3,
  });

  const vehicleId = scannedCard?.vehicle.id ?? noCard?.vehicleId ?? '';
  const { data: selectedVehicle } = useQuery({
    queryKey: ['vehicles', vehicleId, 'preview'],
    queryFn: async () => (await apiClient.get<VehicleBasicInfo>(`/vehicles/${vehicleId}`)).data,
    enabled: !!vehicleId,
  });

  const vehicleFuelType = selectedVehicle?.fuelType ?? rulePreviewQuery.data?.vehicleFuelType ?? null;
  const fuelMismatch = fuelTypeMismatch(vehicleFuelType, chosenFuel);
  const stationOfFillUp = stations?.find((s) => s.id === stationId);
  const soldFuels = (stationOfFillUp?.fuelAvailability ?? []).filter((f) => f.isAvailable).map((f) => f.fuelType);
  const availableFuelTypes = soldFuels.length > 0 ? FUEL_TYPES.filter((ft) => soldFuels.includes(ft.value)) : FUEL_TYPES;
  const chosenIsOffered = availableFuelTypes.some((ft) => ft.value === chosenFuel);
  // After review (15 Oct 2026): the fuel starts as the one the vehicle is
  // registered with (when the station sells it) — once per vehicle, so the
  // employee can still change it.
  const registeredFuel = scannedCard?.vehicle.fuelType ?? vehicleFuelType;
  const registeredPumpFuel = registeredFuel === 'PETROL' ? 'PETROL_95' : registeredFuel === 'DIESEL' ? 'DIESEL' : null;
  const fuelPresetFor = useRef('');
  useEffect(() => {
    if (!vehicleId) {
      fuelPresetFor.current = '';
      return;
    }
    if (!registeredPumpFuel || fuelPresetFor.current === vehicleId) return;
    if (!availableFuelTypes.some((ft) => ft.value === registeredPumpFuel)) return;
    fuelPresetFor.current = vehicleId;
    fillUpForm.setValue('fuelType', registeredPumpFuel, { shouldValidate: true });
  }, [vehicleId, registeredPumpFuel, availableFuelTypes.map((f) => f.value).join(',')]);
  useEffect(() => {
    if (!chosenIsOffered && availableFuelTypes[0]) {
      fillUpForm.setValue('fuelType', availableFuelTypes[0].value, { shouldValidate: true });
    }
  }, [chosenIsOffered, availableFuelTypes.map((f) => f.value).join(',')]);
  const rulePreviewErrorMessage = isAxiosError(rulePreviewQuery.error) ? stationBlockedMessage(rulePreviewQuery.error) : null;

  const previewRejection: Rejection | null = (() => {
    const failed = rulePreviewQuery.data?.checks.find((c) => !c.passed);
    return failed ? { reason: failed.reason, trigger: null } : null;
  })();
  const effectiveRejection = rejection ?? previewRejection;

  const { data: exceptionTypes } = useQuery({
    queryKey: ['fillups', 'exception-types', stationId],
    queryFn: async () =>
      (await apiClient.get<ExceptionTypeOption[]>('/fillups/exception-types', { params: { stationId } })).data,
    enabled: effectiveRejection !== null && canRecordException && !!stationId,
  });

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchText.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchText]);
  const searchQuery = useQuery({
    queryKey: ['vehicles', 'nocard-search', debouncedSearch],
    queryFn: async () =>
      (await apiClient.get<VehicleSearchRow[]>('/vehicles', { params: { search: debouncedSearch, take: 8 } })).data,
    enabled: searchOpen && debouncedSearch.length >= 2,
  });

  const todayIso = new Date().toISOString().slice(0, 10);
  const dayListQuery = useQuery({
    queryKey: ['reports', 'daily', success?.stationId ?? stationId, todayIso],
    queryFn: async () =>
      (
        await apiClient.get<DailyReportResponse>('/reports/daily', {
          params: { stationId: success?.stationId ?? stationId, date: todayIso, take: LIST_PAGE_SIZE },
        })
      ).data,
    enabled: canViewReports && !!(success?.stationId ?? stationId),
  });

  const selectedExceptionTypeId = exceptionForm.watch('exceptionTypeId');
  const selectedExceptionType = exceptionTypes?.find((t) => t.id === selectedExceptionTypeId) ?? null;

  function resetAll() {
    fillUpForm.reset({
      stationId: canViewAllStations ? '' : (ownStation?.stationId ?? ''),
      vehicleId: '',
      fuelType: 'PETROL_95',
      quantityLiters: '',
    });
    exceptionForm.reset({ exceptionTypeId: '', reason: '' });
    setRejection(null);
    setSuccess(null);
    setVehicleLabel('');
    setAmountLyd('');
    setStep('scan');
    setScannedCard(null);
    setNoCard(null);
    setSearchOpen(false);
    setSearchText('');
    setPickedVehicle(null);
    setPickedReason('');
    setSubmitError(null);
    idempotencyKeyRef.current = newIdempotencyKey();
  }

  function applyAmount(amount: string, fuelType: CreateFillUpRequest['fuelType']) {
    setAmountLyd(amount);
    const price = fuelPrices?.[fuelType];
    const parsed = Number(amount);
    if (!price || amount.trim() === '' || !Number.isFinite(parsed) || parsed <= 0) {
      fillUpForm.setValue('quantityLiters', '', { shouldValidate: false });
      return;
    }
    fillUpForm.setValue('quantityLiters', (parsed / price).toFixed(2), { shouldValidate: true });
  }

  async function submitFillUp(payload: CreateFillUpRequest): Promise<CreateFillUpResult> {
    try {
      const res = await apiClient.post<CreateFillUpResult>('/fillups', payload, {
        headers: { 'Idempotency-Key': idempotencyKeyRef.current },
      });
      return res.data;
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 422) {
        return error.response.data as CreateFillUpResult;
      }
      throw error;
    }
  }

  function toBasePayload(values: FillUpFormValues): CreateFillUpRequest {
    return {
      stationId: values.stationId,
      ...identifiers,
      fuelType: values.fuelType,
      quantityLiters: Number(values.quantityLiters),
    };
  }

  function buildConfirmationSummary(values: FillUpFormValues, isException: boolean, isApproved: boolean): ConfirmationSummary {
    return {
      vehicleLabel,
      ownerLabel: selectedVehicle?.owner?.fullName ?? '—',
      stationId: values.stationId,
      stationName: stations?.find((s) => s.id === values.stationId)?.name ?? '',
      fuelType: values.fuelType,
      quantityLiters: values.quantityLiters,
      occurredAt: new Date().toISOString(),
      isApproved,
      isException,
      noCardReason: noCard?.reason ?? null,
      overLimit: false,
    };
  }

  async function onSubmitFillUp(values: FillUpFormValues) {
    setSubmitError(null);
    setSuccess(null);
    if (!hasSubject) {
      setSubmitError('امسح بطاقة المركبة أولًا.');
      setStep('scan');
      return;
    }
    try {
      const result = await submitFillUp(toBasePayload(values));
      if (isRejected(result)) {
        setRejection({ reason: result.reason, trigger: result.trigger });
        return;
      }
      setSuccess({ ...buildConfirmationSummary(values, result.isException, true), overLimit: Boolean(result.exception?.overLimit) });
    } catch (error) {
      setSubmitError(isAxiosError(error) ? formatAxiosError(error) : 'حدث خطأ غير متوقع.');
    }
  }

  function onInvalidFillUp(errors: FieldErrors<FillUpFormValues>) {
    if (errors.stationId) {
      setSubmitError(errors.stationId.message ?? 'اختر المحطة قبل تسجيل التعبئة.');
      setStep('scan');
      return;
    }
    setSubmitError('تعذر إتمام العملية — تحقّق من بيانات التعبئة.');
  }

  async function onSubmitException(exceptionValues: ExceptionFormValues) {
    setSubmitError(null);
    const base = toBasePayload(fillUpForm.getValues());
    if (!base.stationId) {
      setSubmitError('اختر المحطة قبل تسجيل الاستثناء.');
      setStep('scan');
      return;
    }
    try {
      const result = await submitFillUp({ ...base, ...exceptionValues });
      if (isRejected(result)) {
        setSubmitError('تعذر تسجيل الاستثناء.');
        return;
      }
      setSuccess({
        ...buildConfirmationSummary(fillUpForm.getValues(), result.isException, true),
        overLimit: Boolean(result.exception?.overLimit),
      });
    } catch (error) {
      setSubmitError(isAxiosError(error) ? formatAxiosError(error) : 'حدث خطأ غير متوقع.');
    }
  }

  const fieldLabelClass = 'mb-1 block text-[14px] font-bold text-ink-soft lg:text-[12px]';
  const fieldErrorClass = 'mt-1 text-[14px] text-danger-dark lg:text-[12px]';
  const textInputClass =
    'h-12 w-full rounded-sm border border-line bg-surface-alt px-3 text-[16px] text-ink focus:outline-none focus:ring-2 focus:ring-primary-dark disabled:opacity-60 lg:h-11 lg:text-[14px]';

  if (success) {
    return (
      <div data-testid="fillup-success" className="sm:mx-auto sm:grid sm:max-w-3xl sm:grid-cols-[280px_1fr] sm:items-start sm:gap-5">
        <div className="hidden sm:block">
          <DayListRail query={dayListQuery} visible={canViewReports} highlightStationName={success.stationName} />
        </div>
        <div className="mx-auto flex max-w-xl flex-col items-center py-6 text-center sm:mx-0 sm:max-w-none">
          <div className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-ok-100">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#1f7a5c" strokeWidth="2.6">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
          <h1 className="mt-6 text-[24px] font-black text-ink" data-testid="fillup-success-heading">
            {success.isException ? 'سُجِّل كاستثناء' : 'تم تسجيل التعبئة'}
          </h1>
          <p className="mt-2.5 text-[16px] leading-[1.8] text-ink-soft lg:text-[14px]">
            {(success.stationName ? `سُجّلت باسمك في ${success.stationName}، ` : 'سُجّلت باسمك، ') + 'ولا يمكن تعديلها أو حذفها بعد الآن.'}
          </p>
          <Card className="mt-6 w-full p-[18px] text-start sm:mt-0">
            <div className="border-b border-line-soft pb-4 text-center">
              <PlateFigure plate={success.vehicleLabel} />
              <p className="mt-3 text-[28px] font-extrabold text-ink lg:text-[20px]">
                {fuelTypeLabel(success.fuelType)} · <LtrText>{success.quantityLiters}</LtrText> لتر
              </p>
            </div>
            <div className="flex justify-between border-b border-line-soft py-2.5">
              <span className="text-[15px] text-ink-soft lg:text-[13px]">المالك</span>
              <span className="text-[15px] font-bold text-ink lg:text-[13px]">{success.ownerLabel}</span>
            </div>
            <div className="flex justify-between py-2.5">
              <span className="text-[15px] text-ink-soft lg:text-[13px]">الوقت</span>
              <span className="text-[15px] font-bold text-ink lg:text-[13px]">
                <LtrText>{formatDateTime(success.occurredAt)}</LtrText>
              </span>
            </div>
          </Card>
          {success.noCardReason && (
            <p className="mt-4 w-full rounded-sm bg-accent-100 p-3 text-[15px] font-bold text-ink lg:text-[13px]" data-testid="fillup-success-nocard">
              سُجِّلت «بدون بطاقة» — {NO_CARD_REASON_LABELS_AR[success.noCardReason]} — وتُحتسب في التقارير.
            </p>
          )}
          {success.overLimit && (
            <p className="mt-4 w-full rounded-sm bg-danger-100 p-3 text-[15px] font-bold text-danger-dark lg:text-[13px]" data-testid="fillup-success-overlimit">
              تجاوز هذا الاستثناء حدّه اليومي في المحطة. سُجِّل وأُبلغ المشرف ومدير البلدية.
            </p>
          )}
          <ThumbBar>
            <PillButton onClick={resetAll} className="h-14 w-full text-[18px] lg:h-[52px] lg:text-[15px]">
              تعبئة جديدة
            </PillButton>
            {canViewReports && (
              <PillButton variant="ghost" onClick={() => navigate('/reports/daily')} className="mt-1 h-11 w-full text-[15px] lg:text-[13px]">
                عرض تعبئات اليوم
              </PillButton>
            )}
          </ThumbBar>
        </div>
      </div>
    );
  }

  function back() {
    if (step === 'match') {
      setScannedCard(null);
      setNoCard(null);
      setStep('scan');
    } else if (step === 'fuel') setStep('match');
    else if (step === 'review') setStep('fuel');
    else if (step === 'exception') setStep('review');
  }

  const needStationFirst = canViewAllStations && !stationId;

  return (
    <div className="sm:mx-auto sm:grid sm:max-w-3xl sm:grid-cols-[280px_1fr] sm:items-start sm:gap-5">
      <div className="hidden sm:block">
        <DayListRail query={dayListQuery} visible={canViewReports} highlightStationName="" />
      </div>

      <div className="mx-auto w-full max-w-xl" data-testid="fillup-mobile-wizard">
        <div className="mb-3 flex items-center gap-2">
          {step !== 'scan' && (
            <button
              type="button"
              data-testid="fillup-mobile-back"
              onClick={back}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-alt text-ink-soft"
              aria-label="رجوع"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </button>
          )}
          <h1 className="text-[24px] font-extrabold text-ink lg:text-[20px]">{STEP_TITLES[step]}</h1>
        </div>
        <div className="mb-4 flex gap-1.5">
          {[1, 2, 3].map((segment) => (
            <div key={segment} className={`h-1.5 flex-1 rounded-full ${segment <= STEP_SEGMENT[step] ? 'bg-primary' : 'bg-surface-alt'}`} />
          ))}
        </div>

        {step === 'scan' && (
          <Card className="relative p-4">
            {canViewAllStations && (
              <div className="mb-4">
                <label className={fieldLabelClass}>المحطة</label>
                <StationSelect
                  value={stationId}
                  onChange={(v) => fillUpForm.setValue('stationId', v, { shouldValidate: true })}
                  className={textInputClass}
                />
                {fillUpForm.formState.errors.stationId && <p className={fieldErrorClass}>{fillUpForm.formState.errors.stationId.message}</p>}
              </div>
            )}
            {needStationFirst ? (
              <p className="text-center text-[15px] text-ink-soft lg:text-[13px]">اختر المحطة أولًا، ثم امسح بطاقة المركبة.</p>
            ) : (
              <QrScanPanel
                variant="inline"
                autoStart
                onResolved={(card) => {
                  setScannedCard(card);
                  setNoCard(null);
                  fillUpForm.setValue('vehicleId', card.vehicle.id, { shouldValidate: true });
                  setVehicleLabel(formatLicensePlate(card.vehicle.currentPlate));
                  setStep('match');
                }}
                onCancel={() => undefined}
                onCameraUnavailable={() => undefined}
              />
            )}

            {!needStationFirst && (
              <div className="mt-4 border-t border-line pt-3" data-testid="fillup-nocard-area">
                {!searchOpen ? (
                  <button
                    type="button"
                    data-testid="fillup-nocard-open"
                    className="min-h-[44px] text-[15px] font-bold text-primary underline lg:text-[13px]"
                    onClick={() => setSearchOpen(true)}
                  >
                    البطاقة لا تعمل؟ ابحث عن المركبة
                  </button>
                ) : (
                  <div data-testid="fillup-nocard-form" className="space-y-3">
                    <p className="text-[15px] leading-[1.8] text-ink lg:text-[13px]">
                      تعمل هذه الطريقة لمركبة مسجّلة فقط. تبقى الفواصل والحدود سارية، وتُسجَّل التعبئة «بدون بطاقة» باسمك وتُحتسب في التقارير.
                    </p>
                    {!pickedVehicle && (
                      <>
                        <div>
                          <label className={fieldLabelClass} htmlFor="nocard-search">اللوحة أو اسم المالك أو رقم الكتيب</label>
                          <input
                            id="nocard-search"
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                            data-testid="fillup-nocard-search"
                            className={textInputClass}
                            autoComplete="off"
                          />
                        </div>
                        {searchQuery.isFetching && <p className="text-[14px] text-ink-soft">جارٍ البحث…</p>}
                        {searchQuery.data && searchQuery.data.length === 0 && (
                          <p className="rounded-sm bg-accent-100 p-3 text-[15px] font-bold text-ink lg:text-[13px]" data-testid="fillup-nocard-none">
                            لا توجد مركبة مسجّلة بهذا البحث. لا يمكن التعبئة لمركبة غير مسجّلة؛ يسجّلها مكتب التسجيل أولًا.
                          </p>
                        )}
                        <ul className="space-y-2">
                          {(searchQuery.data ?? []).map((row) => (
                            <li key={row.id}>
                              <button
                                type="button"
                                data-testid="fillup-nocard-result"
                                onClick={() => setPickedVehicle(row)}
                                className="flex w-full flex-wrap items-center justify-between gap-2 rounded-sm bg-surface-alt px-3 py-3 text-start"
                              >
                                <span className="text-[17px] font-black text-ink">
                                  <LtrText>{formatLicensePlate(row.currentPlate)}</LtrText>
                                </span>
                                <span className="text-[14px] text-ink-soft">
                                  {[row.make, row.model].filter(Boolean).join(' ')}
                                  {row.owner?.fullName ? ` — ${row.owner.fullName}` : ''}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                    {pickedVehicle && (
                      <div className="space-y-3">
                        <div className="rounded-sm bg-ok-100 p-3" data-testid="fillup-nocard-picked">
                          <p className="text-[18px] font-black text-ink">
                            <LtrText>{formatLicensePlate(pickedVehicle.currentPlate)}</LtrText>
                          </p>
                          <button type="button" className="mt-1 text-[14px] font-bold text-primary underline" onClick={() => { setPickedVehicle(null); setPickedReason(''); }}>
                            اختيار مركبة أخرى
                          </button>
                        </div>
                        <fieldset>
                          <legend className={fieldLabelClass}>لماذا لا تُستخدم البطاقة؟</legend>
                          <div className="space-y-2">
                            {NO_CARD_REASONS.map((reason) => (
                              <label key={reason} className="flex min-h-[44px] items-center gap-3 rounded-sm bg-surface-alt px-3 text-[16px] font-bold text-ink lg:text-[14px]">
                                <input
                                  type="radio"
                                  name="nocard-reason"
                                  value={reason}
                                  checked={pickedReason === reason}
                                  data-testid={`fillup-nocard-reason-${reason}`}
                                  onChange={() => setPickedReason(reason)}
                                />
                                {NO_CARD_REASON_LABELS_AR[reason]}
                              </label>
                            ))}
                          </div>
                        </fieldset>
                        <PillButton
                          data-testid="fillup-nocard-confirm"
                          className="h-12 w-full"
                          disabled={pickedReason === ''}
                          onClick={() => {
                            if (pickedReason === '') return;
                            setScannedCard(null);
                            setNoCard({ vehicleId: pickedVehicle.id, reason: pickedReason });
                            fillUpForm.setValue('vehicleId', pickedVehicle.id, { shouldValidate: true });
                            setVehicleLabel(formatLicensePlate(pickedVehicle.currentPlate));
                            setStep('match');
                          }}
                        >
                          متابعة
                        </PillButton>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </Card>
        )}

        {step === 'scan' && (
          <div className="mt-3">
            <StockStrip stationId={stationId || undefined} title="مخزون المحطة الآن" />
          </div>
        )}

        {step === 'match' && scannedCard && (
          <ScanConfirmView
            card={scannedCard}
            onConfirm={() => setStep('fuel')}
            onReject={() => {
              fillUpForm.setValue('vehicleId', '', { shouldValidate: false });
              setScannedCard(null);
              setStep('scan');
            }}
          />
        )}

        {step === 'match' && noCard && (
          <>
            <Card className="p-5 text-center" data-testid="fillup-nocard-confirm-vehicle">
              <p className="text-[16px] font-bold text-ink-soft lg:text-[14px]">هل هذه هي المركبة التي أمامك؟</p>
              {rulePreviewQuery.isError && (
                <p role="alert" className="mt-3 rounded-sm bg-danger-100 p-3 text-[15px] font-bold text-danger-dark" data-testid="fillup-nocard-error">
                  {rulePreviewErrorMessage ?? 'هذه المركبة غير مسجّلة في المنظومة. لا يمكن التعبئة لمركبة غير مسجّلة.'}
                </p>
              )}
              {selectedVehicle && (
                <>
                  <PlateFigure plate={formatLicensePlate(selectedVehicle.currentPlate)} />
                  <div className="mt-4">
                    <VehiclePreviewCard vehicleId={selectedVehicle.id} idSuffix="-nocard" />
                  </div>
                </>
              )}
              <p className="mt-4 rounded-sm bg-accent-100 p-2.5 text-[15px] font-bold text-ink lg:text-[13px]" data-testid="fillup-nocard-active">
                بدون بطاقة — {NO_CARD_REASON_LABELS_AR[noCard.reason]}
              </p>
            </Card>
            <ThumbBar>
              <PillButton
                data-testid="fillup-mobile-continue-to-fuel"
                className="h-14 w-full text-[18px] lg:h-12 lg:text-[14px]"
                disabled={!selectedVehicle || rulePreviewQuery.isError}
                onClick={() => setStep('fuel')}
              >
                نعم، متابعة إلى الوقود
              </PillButton>
              <button
                type="button"
                onClick={() => {
                  setNoCard(null);
                  setPickedVehicle(null);
                  setPickedReason('');
                  setStep('scan');
                }}
                className="mt-1 block h-11 w-full text-center text-[16px] font-bold text-ink-soft lg:text-[13px]"
              >
                ليست هذه المركبة
              </button>
            </ThumbBar>
          </>
        )}

        {step === 'fuel' && (
          <Card className="p-4">
            <p id="fillup-fuel-label" className={fieldLabelClass}>نوع الوقود</p>
            <div className="flex gap-2" role="group" aria-labelledby="fillup-fuel-label">
              {availableFuelTypes.map((ft) => {
                const selected = chosenFuel === ft.value;
                return (
                  <button
                    key={ft.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      fillUpForm.setValue('fuelType', ft.value, { shouldValidate: true });
                      applyAmount(amountLyd, ft.value);
                    }}
                    className={`h-12 flex-1 rounded-sm border-2 text-[16px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-dark focus-visible:ring-offset-2 lg:h-11 lg:text-[14px] ${
                      selected ? 'border-primary bg-primary text-white' : 'border-line bg-surface text-ink'
                    }`}
                  >
                    {selected && <span aria-hidden="true">✓ </span>}
                    {ft.label}
                  </button>
                );
              })}
            </div>
            <div className="mt-3">
              <StockWarning stationId={stationId || undefined} fuelType={chosenFuel} />
            </div>
            {fuelMismatch && vehicleFuelType && (
              <div role="alert" data-testid="fillup-fuel-mismatch" className="mt-3 rounded-md bg-accent-100 p-3.5 text-[16px] font-bold leading-[1.7] text-ink">
                تنبيه: هذه المركبة تعمل بـ {VEHICLE_FUEL_TYPE_LABELS_AR[vehicleFuelType]}، والوقود المختار مختلف. راجع نوع الوقود قبل المتابعة — يمكنك المتابعة، وسيُسجَّل التنبيه للمشرف.
              </div>
            )}

            <label htmlFor="fillup-amount" className={`${fieldLabelClass} mt-4`}>المبلغ المدفوع (د.ل)</label>
            {(() => {
              const price = fuelPrices?.[chosenFuel];
              return (
                <>
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-3">
                    <input
                      id="fillup-amount"
                      type="number"
                      step="0.01"
                      data-testid="fillup-amount-input-mobile"
                      data-figure="large"
                      value={amountLyd}
                      onChange={(e) => applyAmount(e.target.value, chosenFuel)}
                      dir="ltr"
                      disabled={!price}
                      className="w-full rounded-sm bg-transparent text-center font-mono text-[48px] font-extrabold leading-tight text-primary-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-dark disabled:opacity-50 lg:w-28 lg:text-start lg:text-[30px]"
                    />
                    <div className="flex flex-1 justify-center gap-2 lg:justify-end lg:gap-1.5">
                      {AMOUNT_QUICK_PICKS.map((amount) => (
                        <button
                          key={amount}
                          type="button"
                          onClick={() => applyAmount(amount, chosenFuel)}
                          aria-pressed={amountLyd === amount}
                          aria-label={`${amount} دينار`}
                          className={`h-12 w-14 rounded-sm border-2 font-mono text-[18px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-dark lg:h-10 lg:w-12 lg:text-[14px] ${
                            amountLyd === amount ? 'border-primary bg-primary text-white' : 'border-line bg-surface text-ink'
                          }`}
                        >
                          {amount}
                        </button>
                      ))}
                    </div>
                  </div>
                  {!price && <p className="mt-1.5 text-[14px] text-ink-soft lg:text-[12px]">جارٍ تحميل سعر الوقود…</p>}
                </>
              );
            })()}
            {fillUpForm.formState.errors.quantityLiters && <p className={fieldErrorClass}>{fillUpForm.formState.errors.quantityLiters.message}</p>}
            {fillUpForm.watch('quantityLiters') && (
              <div className="mt-3 flex items-center justify-between rounded-sm bg-surface-alt px-3 py-3">
                <span className="text-[16px] font-bold text-ink-soft lg:text-[13px]">الكمية المقدَّرة</span>
                <span className="text-[26px] font-extrabold text-ink lg:text-[16px]" data-testid="fillup-estimated-liters-mobile">
                  <LtrText>{fillUpForm.watch('quantityLiters')}</LtrText> لتر
                </span>
              </div>
            )}
          </Card>
        )}

        {step === 'fuel' && (
          <ThumbBar>
            <PillButton
              data-testid="fillup-mobile-continue-to-review"
              className="h-14 w-full text-[18px] lg:h-12 lg:text-[14px]"
              disabled={!fillUpForm.watch('quantityLiters') || !!fillUpForm.formState.errors.quantityLiters}
              onClick={() => setStep('review')}
            >
              متابعة إلى المراجعة
            </PillButton>
          </ThumbBar>
        )}

        {step === 'review' && (
          <>
            <form onSubmit={fillUpForm.handleSubmit(onSubmitFillUp, onInvalidFillUp)} className="space-y-3">
              <Card data-testid="rule-review-card-mobile" className={`p-3.5 ${effectiveRejection ? 'ring-2 ring-inset ring-danger' : ''}`}>
                <div className="mb-3 border-b border-line-soft pb-3" data-testid="fillup-review-summary">
                  {vehicleLabel && <PlateFigure plate={vehicleLabel} />}
                  <p className="mt-2 text-center text-[24px] font-extrabold text-ink lg:text-[18px]">
                    {fuelTypeLabel(chosenFuel)} · <LtrText>{fillUpForm.watch('quantityLiters')}</LtrText> لتر
                  </p>
                  {amountLyd && (
                    <p className="text-center text-[18px] font-bold text-ink-soft lg:text-[14px]">
                      <LtrText>{amountLyd}</LtrText> د.ل
                    </p>
                  )}
                </div>
                <RuleReviewChecks
                  checks={rulePreviewQuery.data?.checks}
                  isLoading={rulePreviewQuery.isLoading}
                  isError={rulePreviewQuery.isError}
                  errorMessage={rulePreviewErrorMessage}
                  rejection={effectiveRejection}
                  idSuffix="-mobile"
                />
                {fuelMismatch && vehicleFuelType && (
                  <p role="alert" className="mt-3 rounded-sm bg-accent-100 p-3 text-[16px] font-bold leading-[1.7] text-ink lg:text-[14px]" data-testid="fillup-fuel-mismatch-review">
                    تنبيه: المركبة تعمل بـ {VEHICLE_FUEL_TYPE_LABELS_AR[vehicleFuelType]} والوقود المختار مختلف. سيُسجَّل التنبيه للمشرف.
                  </p>
                )}
                {rulePreviewQuery.data && (rulePreviewQuery.data.disabledRules?.length ?? 0) > 0 && (
                  <p className="mt-3 text-[15px] leading-[1.7] text-ink-soft lg:text-[13px]" data-testid="fillup-disabled-rules">
                    قواعد غير مفعّلة حاليًا ولا تُطبَّق: {rulePreviewQuery.data.disabledRules!.map((r) => RULE_CHECK_LABELS[r]).join('، ')}.
                  </p>
                )}
              </Card>

              {submitError && (
                <p role="alert" className="text-[16px] font-bold text-danger-dark lg:text-[14px]">
                  {submitError}
                </p>
              )}

              {!rejection && (
                <ThumbBar>
                  <PillButton
                    type="submit"
                    data-testid="fillup-submit-mobile"
                    disabled={fillUpForm.formState.isSubmitting || rulePreviewQuery.isLoading}
                    size="md"
                    className="h-14 w-full text-[18px] lg:text-[15px]"
                  >
                    {fillUpForm.formState.isSubmitting ? 'جارٍ التسجيل…' : 'تسجيل التعبئة'}
                  </PillButton>
                </ThumbBar>
              )}
            </form>

            {effectiveRejection && canRecordException && (
              <PillButton
                data-testid="fillup-mobile-record-exception"
                variant="danger"
                size="field"
                className="mt-3 w-full"
                onClick={() => setStep('exception')}
              >
                تسجيلها كاستثناء
              </PillButton>
            )}
          </>
        )}

        {step === 'exception' && (
          <Card className="p-4" data-testid="fillup-rejection-mobile">
            <p className="mb-3 text-[16px] font-bold text-ink lg:text-[14px]">تسجيل استثناء لهذه التعبئة</p>
            <ExceptionFormFields
              exceptionForm={exceptionForm}
              exceptionTypes={exceptionTypes}
              selectedExceptionType={selectedExceptionType}
              onSubmit={onSubmitException}
              idSuffix="-mobile"
              submitError={submitError}
            />
          </Card>
        )}
      </div>
    </div>
  );
}

// The one action of a step sits at the bottom of the phone, just above the
// navigation bar, where a thumb already is. On a desktop it is the next block.
function ThumbBar({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="h-28 lg:hidden" aria-hidden="true" />
      <div className="fixed inset-x-0 bottom-[calc(58px+env(safe-area-inset-bottom))] z-20 border-t border-line bg-paper/95 px-3.5 pb-2.5 pt-2.5 backdrop-blur lg:static lg:z-auto lg:mt-3 lg:border-0 lg:bg-transparent lg:p-0">
        <div className="mx-auto w-full max-w-xl">{children}</div>
      </div>
    </>
  );
}

// The plate the person is about to fill for: the biggest thing on the screen.
function PlateFigure({ plate, caption }: { plate: string; caption?: string }) {
  return (
    <div className="text-center" data-testid="fillup-plate-figure">
      {caption && <p className="text-[16px] font-bold text-ink-soft lg:text-[14px]">{caption}</p>}
      <p className="mt-1 text-[44px] font-black leading-none text-ink lg:text-[36px]">
        <LtrText>{plate}</LtrText>
      </p>
    </div>
  );
}

// The fuel a vehicle is registered with, in words (the card's own wording).
const VEHICLE_FUEL_WORDS: Record<string, string> = { PETROL: 'بنزين', DIESEL: 'ديزل' };

// After a card scan, the employee compares the card's vehicle with the car in
// front of them before anything is recorded, and must tap the confirm button.
function ScanConfirmView({ card, onConfirm, onReject }: { card: ScannedCard; onConfirm: () => void; onReject: () => void }) {
  const v = card.vehicle;
  const makeModel = [v.make, v.model].filter(Boolean).join(' ');
  // The same details as the printed card (after review, 15 Oct 2026), and the
  // owner's name, so the employee checks the car against them.
  const details: Array<{ label: string; value: string | null | undefined; ltr?: boolean; wide?: boolean; testId: string }> = [
    { label: 'المالك', value: v.owner?.fullName, wide: true, testId: 'owner' },
    { label: 'الماركة والطراز', value: makeModel, testId: 'make' },
    { label: 'اللون', value: v.color, testId: 'color' },
    { label: 'سنة الصنع', value: v.manufactureYear ? String(v.manufactureYear) : null, ltr: true, testId: 'year' },
    { label: 'نوع الوقود', value: v.fuelType ? VEHICLE_FUEL_WORDS[v.fuelType] : null, testId: 'fuel' },
    { label: 'رقم الهيكل', value: v.chassisNumber, ltr: true, wide: true, testId: 'chassis' },
    { label: 'رقم دفتر السيارة', value: v.registrationBooklet, ltr: true, testId: 'booklet' },
    { label: 'رقم البطاقة', value: card.cardNumber, ltr: true, testId: 'card' },
  ];
  return (
    <Card className="p-5 text-center" data-testid="fillup-scan-confirm">
      <p className="text-[16px] font-bold text-ink-soft lg:text-[14px]">هل هذه هي المركبة التي أمامك؟</p>
      <p className="mt-3 text-[44px] font-black leading-none text-ink" data-testid="fillup-scan-confirm-plate">
        <LtrText>{formatLicensePlate(v.currentPlate)}</LtrText>
      </p>
      {v.vehicleType && <p className="mt-2 text-[15px] text-ink-soft lg:text-[13px]">{v.vehicleType.name}</p>}
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-sm bg-surface-alt p-4 text-start" data-testid="fillup-scan-confirm-details">
        {details.map((d) => (
          <div key={d.testId} className={d.wide ? 'col-span-2' : ''} data-testid={`fillup-scan-confirm-${d.testId}`}>
            <dt className="text-[14px] font-bold text-ink-soft lg:text-[12px]">{d.label}</dt>
            <dd className="mt-0.5 break-words text-[18px] font-extrabold text-ink lg:text-[15px]">
              {d.value ? d.ltr ? <LtrText>{d.value}</LtrText> : d.value : '—'}
            </dd>
          </div>
        ))}
      </dl>
      {card.needsReissue && (
        <div className="mt-4 rounded-sm bg-accent-100 p-3" data-testid="fillup-scan-needs-reissue">
          <p className="text-[16px] font-bold text-ink lg:text-[14px]">يجب تجديد هذه البطاقة</p>
          <p className="mt-1 text-[15px] text-ink lg:text-[13px]">
            تغيّرت بيانات المركبة منذ طباعتها. التعبئة مسموحة، واطلب من المالك مراجعة مكتب التسجيل لاستلام بطاقة محدَّثة.
          </p>
        </div>
      )}
      <ThumbBar>
        <PillButton data-testid="fillup-scan-confirm-yes" className="h-14 w-full text-[18px] lg:text-[16px]" onClick={onConfirm}>
          نعم، هذه هي المركبة
        </PillButton>
        <button type="button" onClick={onReject} className="mt-1 block h-11 w-full text-center text-[16px] font-bold text-ink-soft lg:text-[13px]">
          ليست هذه المركبة — مسح مرة أخرى
        </button>
      </ThumbBar>
    </Card>
  );
}

// The server's refusals that the employee can't fix themselves, with who can.
function stationBlockedMessage(error: AxiosError<{ message?: string | string[] }>): string | null {
  if (error.response?.status !== 409) return null;
  switch (error.response.data?.message) {
    case 'STATION_HAS_NO_MUNICIPALITY':
      return 'لا يمكن تسجيل تعبئة في هذه المحطة لأن البلدية التابعة لها غير محددة. يرجى التواصل مع مسؤول المنظومة لتحديد بلدية المحطة.';
    case 'STATION_ARCHIVED':
      return 'هذه المحطة مؤرشفة ولا تقبل تعبئات جديدة. تواصل مع مدير البلدية.';
    case 'MUNICIPALITY_ARCHIVED':
      return 'بلدية هذه المحطة مؤرشفة ولا تقبل تعبئات جديدة.';
    default:
      return null;
  }
}

function formatAxiosError(error: AxiosError<{ message?: string | string[] }>): string {
  const stationBlocked = stationBlockedMessage(error);
  if (stationBlocked) return stationBlocked;
  const marker = error.response?.data?.message;
  const status = error.response?.status;
  if (status === 409 && marker === 'CARD_REQUIRED') {
    return 'لا تُسجَّل التعبئة إلا بمسح بطاقة المركبة. امسح البطاقة، أو اطلب من صاحب المركبة مراجعة مكتب التسجيل.';
  }
  if (status === 404 && marker === 'CARD_NOT_FOUND') {
    return 'تعذّرت قراءة البطاقة: هذا الرمز ليس بطاقة من هذه المنظومة. امسح البطاقة مرة أخرى.';
  }
  if (status === 409 && marker === 'CARD_REVOKED') {
    return 'هذه البطاقة ملغاة. اطلب من صاحب المركبة مراجعة مكتب التسجيل لاستلام بطاقة جديدة.';
  }
  if (status === 409 && marker === 'NO_CARD_NOT_NEEDED') {
    return 'تمّ مسح البطاقة، فلا حاجة لسبب «بدون بطاقة».';
  }
  if (status === 409 && marker === 'EXCEPTION_TYPE_NOT_FOR_RULE') {
    return 'نوع الاستثناء هذا لا يشمل القاعدة التي منعت التعبئة. اختر نوعًا آخر.';
  }
  if (status === 409 && marker === 'EXCEPTION_TYPE_NOT_FOR_MUNICIPALITY') {
    return 'نوع الاستثناء هذا غير متاح في بلدية هذه المحطة.';
  }
  if (status === 409 && marker === 'EXCEPTION_LIMIT_REACHED') {
    return 'تجاوزت المحطة الحد اليومي لهذا النوع من الاستثناءات، ولا يُسمح بتجاوزه. اطلب من المشرف.';
  }
  if (status === 404 && marker === 'VEHICLE_NOT_REGISTERED') {
    return 'هذه اللوحة غير مسجّلة في المنظومة. يسجّلها مكتب التسجيل أولًا.';
  }
  if (status === 403) return 'لا تملك صلاحية هذا الإجراء. تواصل مع المشرف.';
  return describeApiError(error).message;
}
