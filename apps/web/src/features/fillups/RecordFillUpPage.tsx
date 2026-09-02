import { useEffect, useRef, useState } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
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
import { DigitBoxInput } from '../../components/DigitBoxInput';
import { PLATE_DIGIT_GROUPS } from '../../lib/digitBoxGroups';
import { formatLicensePlate, LICENSE_PLATE_REGEX, normalizePlateSearchTerm } from '../../lib/libyanFormats';
import { fuelTypeLabel } from '../../lib/labels';
import { useAuth } from '../auth/AuthProvider';
import { useStations } from '../stations/useStations';
import { Card } from '../../components/design/Card';
import { PillButton } from '../../components/design/PillButton';
import { KpiCard } from '../../components/design/KpiCard';
import { CodeText } from '../../components/design/CodeText';
import { FillUpStatusPill } from '../../components/FillUpStatusPill';
import { VehicleSearchSelect } from './VehicleSearchSelect';
import { VehicleCreateForm } from '../vehicles/VehicleCreateForm';
import { VehiclePreviewCard } from './VehiclePreviewCard';
import { RULE_VIOLATION_MESSAGES, RULE_CHECK_LABELS, describeRuleCheck } from './ruleViolationMessages';
import { useFuelPrices } from './useFuelPrice';
import type { VehicleBasicInfo } from '../vehicles/types';

// Item 8: name the specific prior fill-up that tripped an owner-level rule
// (it can be on a different vehicle than the one being submitted, which
// otherwise looks like a false positive) — shown wherever a rule
// violation is shown, inline here and on the exception-approval screen.
export function TriggerDetail({ trigger }: { trigger: RuleTriggerDetail | null }) {
  if (!trigger) {
    return null;
  }
  return (
    <p className="text-[12px] text-ink-soft">
      بسبب تعبئة سابقة لنفس مالك المركبة{' '}
      <LtrText>
        {trigger.vehicleCurrentPlate ? formatLicensePlate(trigger.vehicleCurrentPlate) : trigger.vehicleInternalCode}
      </LtrText>{' '}
      بتاريخ <LtrText>{new Date(trigger.occurredAt).toLocaleString('ar')}</LtrText>
    </p>
  );
}

type Rejection = { reason: RuleFailureReason; trigger: RuleTriggerDetail | null };

// Shared by both layouts (round 8) — the exact same per-rule breakdown
// content, just wrapped in a differently-placed Card by each. idSuffix
// keeps the two layouts' testids from colliding, since both can exist in
// the DOM at once (CSS hides whichever doesn't match the viewport, it
// doesn't unmount it).
function RuleReviewChecks({
  checks,
  isLoading,
  isError,
  rejection,
  idSuffix = '',
}: {
  checks: RuleCheckDetail[] | undefined;
  isLoading: boolean;
  isError: boolean;
  rejection: Rejection | null;
  idSuffix?: string;
}) {
  return (
    <>
      {rejection ? (
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-danger-100 px-3 py-1.5">
          <span className="h-2 w-2 rounded-full bg-danger" />
          <span className="text-[11px] font-bold text-danger-dark">تعذر تسجيل التعبئة</span>
        </div>
      ) : (
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-ok-100 px-3 py-1.5">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1f7a5c" strokeWidth="3">
            <path d="M20 6L9 17l-5-5" />
          </svg>
          <span className="text-[11px] font-bold text-ok">مراجعة القواعد</span>
        </div>
      )}

      {isLoading && <p className="text-[12.5px] text-ink-soft">...جارٍ فحص القواعد</p>}
      {isError && <p className="text-[12.5px] text-danger">تعذر تحميل مراجعة القواعد.</p>}

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
                  <span className={`text-[12.5px] font-bold ${failed ? 'text-danger-dark' : 'text-ok'}`}>
                    {RULE_CHECK_LABELS[check.reason]}
                  </span>
                  <span className={`text-[11px] font-bold ${failed ? 'text-danger-dark' : 'text-ok'}`}>
                    {failed ? 'مرفوض' : 'مقبول'}
                  </span>
                </div>
                <p className={`mt-0.5 text-[11.5px] ${failed ? 'text-danger-dark' : 'text-ink-soft'}`}>
                  {describeRuleCheck(check)}
                </p>
                {failed && rejection?.reason === check.reason && (
                  <p className="mt-1 text-[12px] font-semibold text-danger-dark">
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

// Also shared — the exception-type/reason/proof fields are identical
// regardless of which screen hosts them (an inline card on desktop, a
// dedicated full screen on mobile per screenshot 02's third panel).
function ExceptionFormFields({
  exceptionForm,
  exceptionTypes,
  selectedExceptionType,
  onSubmit,
  idSuffix = '',
}: {
  exceptionForm: UseFormReturn<ExceptionFormValues>;
  exceptionTypes: ExceptionTypeOption[] | undefined;
  selectedExceptionType: ExceptionTypeOption | null;
  onSubmit: (values: ExceptionFormValues) => void;
  idSuffix?: string;
}) {
  const fieldLabelClass = 'mb-1 block text-[11px] font-bold text-ink-soft';
  const fieldErrorClass = 'mt-1 text-[12px] text-danger';
  const textInputClass =
    'h-11 w-full rounded-sm bg-surface-alt px-3 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-60';

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
            </option>
          ))}
        </select>
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

      {selectedExceptionType?.requiresProof && (
        <div>
          <label className={fieldLabelClass}>
            رقم/مرجع الإثبات <span className="text-danger">*</span>
          </label>
          <input
            data-testid={`exception-proof${idSuffix}`}
            {...exceptionForm.register('proofReference', {
              validate: (value) => !!value?.trim() || 'الإثبات مطلوب لهذا النوع من الاستثناءات',
            })}
            className={textInputClass}
          />
          {exceptionForm.formState.errors.proofReference && (
            <p className={fieldErrorClass}>{exceptionForm.formState.errors.proofReference.message}</p>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <PillButton
          type="submit"
          data-testid={`exception-submit${idSuffix}`}
          variant="danger"
          disabled={exceptionForm.formState.isSubmitting}
          className="!bg-danger !text-white !border-0 flex-1"
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
      {highlightStationName && <p className="mt-2 text-[11px] text-ink-faint">{highlightStationName}</p>}

      <div className="mt-3.5 border-t border-surface-alt pt-3.5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-bold text-ink-soft">تعبئات محطتك اليوم</span>
          <a href="/reports/daily" className="text-[11px] font-bold text-accent-dark hover:underline">
            التقرير الكامل
          </a>
        </div>

        {isLoading && <p className="text-[12px] text-ink-soft">...جارٍ التحميل</p>}

        {data && (
          <ul className="space-y-2">
            {data.rows.map((row, i) => (
              <li
                key={row.id}
                data-testid={i === 0 ? 'day-list-newest-row' : undefined}
                className={`rounded-sm p-2.5 text-[11.5px] ${i === 0 ? 'bg-ok-100' : 'bg-surface-alt'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-ink">
                    <LtrText>{formatLicensePlate(row.vehicle.currentPlate)}</LtrText>
                  </span>
                  {i === 0 ? (
                    <span className="text-[10.5px] font-bold text-ok">الآن</span>
                  ) : (
                    <CodeText>{new Date(row.occurredAt).toLocaleTimeString('en-GB')}</CodeText>
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
            {data.rows.length === 0 && <li className="text-[12px] text-ink-soft">لا توجد تعبئات بعد اليوم</li>}
          </ul>
        )}
      </div>
    </Card>
  );
}

// Amounts in LYD, not liters — the amount is what staff actually enters
// (client feedback: pay-then-pump is how it works at the pump, the liter
// count is a downstream number, not what anyone types), so these presets
// are round LYD figures, not round liter figures.
const AMOUNT_QUICK_PICKS = ['5', '10', '20'];

const FUEL_TYPES: { value: CreateFillUpRequest['fuelType']; label: string }[] = [
  { value: 'PETROL_95', label: 'بنزين 95' },
  { value: 'DIESEL', label: 'ديزل' },
  { value: 'KEROSENE', label: 'كاز' },
];

const fillUpSchema = z.object({
  stationId: z.string().min(1, 'اختر المحطة'),
  vehicleId: z.string().min(1, 'اختر المركبة'),
  fuelType: z.enum(['PETROL_95', 'DIESEL', 'KEROSENE']),
  // Kept as a string field (not z.coerce.number()) to sidestep RHF/zod's
  // input-vs-output generic mismatch for coerced schemas — converted to a
  // number just before it's sent (see toFillUpPayload).
  quantityLiters: z.string().refine(
    (v) => {
      const n = Number(v);
      return v.trim() !== '' && Number.isFinite(n) && n > 0 && n <= 1000;
    },
    { message: 'يجب أن تكون الكمية رقمًا أكبر من صفر ولا يتجاوز 1000' },
  ),
});

type FillUpFormValues = z.infer<typeof fillUpSchema>;

const exceptionSchema = z.object({
  exceptionTypeId: z.string().min(1, 'اختر نوع الاستثناء'),
  reason: z.string().min(1, 'السبب مطلوب'),
  proofReference: z.string().optional(),
});

type ExceptionFormValues = z.infer<typeof exceptionSchema>;

function isRejected(result: CreateFillUpResult): result is Extract<CreateFillUpResult, { allowed: false }> {
  return 'allowed' in result && result.allowed === false;
}

function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

// Captured at the moment of a successful submission, before resetAll()
// clears the form — FillUpTransactionRaw itself only carries IDs
// (vehicleId/stationId), not the display labels the confirmation screen
// needs (artboard 4d's summary card: vehicle+plate, owner, fuel+quantity,
// time).
interface ConfirmationSummary {
  vehicleLabel: string;
  ownerLabel: string;
  stationId: string;
  stationName: string;
  fuelType: CreateFillUpRequest['fuelType'];
  quantityLiters: string;
  occurredAt: string;
  isException: boolean;
}

// Round 8: the client's own words — "the journey screens are not as I
// told you last time" — round 7 added the rule-preview breakdown but
// never actually restructured this page into the guided step sequence
// from design/feedback-2026-08-31/01-*.png/02-*.png. That was a real gap
// in what got asked for across rounds 6-7, not a regression (see
// docs/OPEN_ITEMS.md #31's round 7 note, which flagged the flow redesign
// itself as not started). This round builds it for real, but ONLY for
// narrow viewports (`sm:hidden`, matching the `sm` breakpoint convention
// VehicleDetailPage already uses for its own mobile-tabs/desktop split) —
// desktop keeps the single-page-with-everything-visible form round 6
// originally called for (04-06 in the same folder), now confirmed still
// correct since the client's complaint was specifically about the phone
// screenshot.
type MobileStep = 'plate' | 'match' | 'fuel' | 'review' | 'exception';

const MOBILE_STEP_TITLES: Record<MobileStep, string> = {
  plate: 'رقم اللوحة',
  match: 'مطابقة فورية',
  fuel: 'الوقود والكمية',
  review: 'المراجعة وفحص القواعد',
  exception: 'تسجيل استثناء',
};

// 3-segment progress bar per screenshot 01 — vehicle identification
// (plate+match) is one segment, fuel/quantity the second, rule review the
// third. Confirmation is its own full-screen state outside the bar (same
// as the existing success screen, which already renders identically at
// both widths).
const MOBILE_STEP_SEGMENT: Record<MobileStep, number> = {
  plate: 1,
  match: 1,
  fuel: 2,
  review: 3,
  exception: 3,
};

// The one screen every prior phase has been leading up to (docs/
// IMPLEMENTATION_PLAN.md never actually scheduled this as its own phase —
// M3 built the rule engine + backend endpoint, M4 built reporting; this
// closes the gap). Station-scoping is enforced server-side exactly like
// every other endpoint (FillUpsService.create checks the caller's
// UserStationScope against dto.stationId) — the StationSelect below is
// scoped the same way it is everywhere else it appears, not a separate
// mechanism.
export function RecordFillUpPage() {
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();
  const canViewAllStations = hasPermission('reports:view_all_stations');
  const canViewReports = hasPermission('reports:view');
  const ownStation = user?.stationScope[0] ?? null;
  const { data: stations } = useStations();
  const { data: fuelPrices } = useFuelPrices();

  const [rejection, setRejection] = useState<Rejection | null>(null);
  const [showNewVehicleForm, setShowNewVehicleForm] = useState(false);
  const [showNewVehicleFormMobile, setShowNewVehicleFormMobile] = useState(false);
  const [newlyCreatedVehicleLabel, setNewlyCreatedVehicleLabel] = useState<string | undefined>(undefined);
  const [vehicleQuery, setVehicleQuery] = useState('');
  const canCreateVehicle = hasPermission('vehicles:manage');
  // Display label for the currently-selected vehicle — the form only ever
  // stores its ID (fillUpForm's vehicleId), and FillUpTransactionRaw's
  // response doesn't carry names either, so this is the only source for
  // the 4d confirmation screen's summary card. The owner label comes
  // straight from the fetched vehicle instead (see selectedVehicle below).
  const [selectedVehicleLabel, setSelectedVehicleLabel] = useState('');
  // The amount in LYD is what staff actually types — quantityLiters (the
  // field the backend/rule-engine actually consumes) is derived from it,
  // not the other way around, per client correction: enter the amount
  // paid, the liter count is computed automatically.
  const [amountLyd, setAmountLyd] = useState('');
  const [success, setSuccess] = useState<ConfirmationSummary | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const idempotencyKeyRef = useRef(newIdempotencyKey());

  // ── Mobile wizard state ──────────────────────────────────────────────
  const [mobileStep, setMobileStep] = useState<MobileStep>('plate');
  const [plateValue, setPlateValue] = useState('');
  const [showManualSearchMobile, setShowManualSearchMobile] = useState(false);

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
    defaultValues: { exceptionTypeId: '', reason: '', proofReference: '' },
  });

  const { data: exceptionTypes } = useQuery({
    queryKey: ['fillups', 'exception-types'],
    queryFn: async () => (await apiClient.get<ExceptionTypeOption[]>('/fillups/exception-types')).data,
    enabled: rejection !== null,
  });

  const selectedVehicleId = fillUpForm.watch('vehicleId');
  // Round 6: fill-ups no longer need driver identity — this fetch now
  // exists purely to read the vehicle's owner for the confirmation
  // screen's summary card. Same queryKey VehiclePreviewCard uses for the
  // same vehicle — react-query dedupes the two into one request rather
  // than fetching the vehicle twice.
  const { data: selectedVehicle } = useQuery({
    queryKey: ['vehicles', selectedVehicleId, 'preview'],
    queryFn: async () => (await apiClient.get<VehicleBasicInfo>(`/vehicles/${selectedVehicleId}`)).data,
    enabled: !!selectedVehicleId,
  });

  // Round 7 item 1: the pre-submit rule-review breakdown — every
  // applicable rule's real actual/limit numbers, computed by the SAME
  // rule engine POST /fillups itself runs (GET /fillups/rule-preview ->
  // FillUpRuleEngine.evaluateWithChecks), never a separate client-side
  // estimate. Re-fetched whenever the vehicle changes; the submit button
  // stays disabled until this has loaded at least once for the selected
  // vehicle, so the employee always sees the breakdown before they can
  // submit — not a rule gate itself (actual enforcement is still POST
  // /fillups's 422 path below). Round 8: this is now what the mobile
  // wizard's 'review' step actually renders, per the client's complaint
  // that it wasn't reachable as its own guided step.
  const rulePreviewQuery = useQuery({
    queryKey: ['fillups', 'rule-preview', selectedVehicleId],
    queryFn: async () =>
      (await apiClient.get<RulePreviewResponse>('/fillups/rule-preview', { params: { vehicleId: selectedVehicleId } }))
        .data,
    enabled: !!selectedVehicleId,
  });

  // Round 8: desktop's confirmation screen needs the live day-list rail
  // from screenshot 06/07 (round 6's original desktop description, not
  // built until now — see the reconciliation note in this file's own
  // round-8 header comment) — same GET /reports/daily endpoint
  // DailyReportPage already uses, scoped to the station just used and
  // today's date. Gated on reports:view since that's the same permission
  // DailyReportPage itself requires; without it desktop just skips the
  // rail rather than firing a request that would 403.
  const todayIso = new Date().toISOString().slice(0, 10);
  const dayListQuery = useQuery({
    queryKey: ['reports', 'daily', success?.stationId, todayIso],
    queryFn: async () =>
      (
        await apiClient.get<DailyReportResponse>('/reports/daily', {
          params: { stationId: success?.stationId, date: todayIso },
        })
      ).data,
    enabled: !!success && canViewReports && !!success.stationId,
  });

  // ── Mobile plate-entry lookup ────────────────────────────────────────
  // Round 8: the wizard's first screen is a NARROWER, plate-only entry
  // step (01-*.png screen 1) — not the same broad plate/chassis/
  // internalCode search field the desktop form and this page's own
  // fallback link use. Boxed exact-entry is safe here specifically
  // because it's only ever matched against currentPlate, not partial-
  // matched against three different fields the way VehicleSearchSelect's
  // free-text field is (round 7 deliberately kept THAT field free-text
  // for exactly this reason — this is a different, narrower field, not a
  // reversal of that call).
  const plateComplete = LICENSE_PLATE_REGEX.test(plateValue);
  const plateLookupQuery = useQuery({
    queryKey: ['vehicles', 'plate-lookup', plateValue],
    queryFn: async () =>
      (
        await apiClient.get<{ id: string; internalCode: string; currentPlate: string }[]>('/vehicles', {
          params: { search: normalizePlateSearchTerm(plateValue), take: 5 },
        })
      ).data,
    enabled: plateComplete,
  });
  const matchedVehicle = plateLookupQuery.data?.find(
    (v) => normalizePlateSearchTerm(v.currentPlate) === normalizePlateSearchTerm(plateValue),
  );

  // Auto-advance once an exact plate match is found — only while still on
  // the 'plate' step, so re-running this effect after the user has
  // already moved on (e.g. they go back to double check) doesn't yank
  // them forward again.
  useEffect(() => {
    if (matchedVehicle && mobileStep === 'plate') {
      fillUpForm.setValue('vehicleId', matchedVehicle.id, { shouldValidate: true });
      setSelectedVehicleLabel(formatLicensePlate(matchedVehicle.currentPlate));
      setMobileStep('match');
    }
  }, [matchedVehicle?.id]);

  const selectedExceptionTypeId = exceptionForm.watch('exceptionTypeId');
  const selectedExceptionType = exceptionTypes?.find((t) => t.id === selectedExceptionTypeId) ?? null;

  function resetAll() {
    fillUpForm.reset({
      stationId: canViewAllStations ? '' : (ownStation?.stationId ?? ''),
      vehicleId: '',
      fuelType: 'PETROL_95',
      quantityLiters: '',
    });
    exceptionForm.reset({ exceptionTypeId: '', reason: '', proofReference: '' });
    setRejection(null);
    setSuccess(null);
    setSelectedVehicleLabel('');
    setNewlyCreatedVehicleLabel(undefined);
    setAmountLyd('');
    setMobileStep('plate');
    setPlateValue('');
    setShowManualSearchMobile(false);
    setShowNewVehicleFormMobile(false);
    idempotencyKeyRef.current = newIdempotencyKey();
  }

  // Recomputes quantityLiters (amount ÷ price-per-liter for the currently
  // selected fuel type) whenever the amount or the fuel type changes —
  // called from both the amount input's onChange and the fuel-type
  // buttons' onClick, since the same LYD amount means a different liter
  // count once the price changes. Leaves quantityLiters blank (and thus
  // invalid per fillUpSchema) rather than 0 or a stale value when the
  // price isn't loaded yet or the amount isn't a usable number.
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
      // A rule-engine rejection is a genuine HTTP 422, not a 2xx body with
      // allowed: false — axios rejects the promise for it by default (only
      // 2xx resolves), so it has to be unwrapped here rather than assumed
      // to arrive via the success path.
      if (isAxiosError(error) && error.response?.status === 422) {
        return error.response.data as CreateFillUpResult;
      }
      throw error;
    }
  }

  function toBasePayload(values: FillUpFormValues): CreateFillUpRequest {
    return {
      stationId: values.stationId,
      vehicleId: values.vehicleId,
      fuelType: values.fuelType,
      quantityLiters: Number(values.quantityLiters),
    };
  }

  function buildConfirmationSummary(values: FillUpFormValues, isException: boolean): ConfirmationSummary {
    const stationName = stations?.find((s) => s.id === values.stationId)?.name ?? '';
    return {
      vehicleLabel: selectedVehicleLabel,
      ownerLabel: selectedVehicle?.owner?.fullName ?? '—',
      stationId: values.stationId,
      stationName,
      fuelType: values.fuelType,
      quantityLiters: values.quantityLiters,
      occurredAt: new Date().toISOString(),
      isException,
    };
  }

  async function onSubmitFillUp(values: FillUpFormValues) {
    setSubmitError(null);
    setSuccess(null);
    try {
      const result = await submitFillUp(toBasePayload(values));
      if (isRejected(result)) {
        setRejection({ reason: result.reason, trigger: result.trigger });
        return;
      }
      setSuccess(buildConfirmationSummary(values, result.isException));
    } catch (error) {
      setSubmitError(isAxiosError(error) ? formatAxiosError(error) : 'حدث خطأ غير متوقع.');
    }
  }

  async function onSubmitException(exceptionValues: ExceptionFormValues) {
    setSubmitError(null);
    const base = toBasePayload(fillUpForm.getValues());
    try {
      const result = await submitFillUp({ ...base, ...exceptionValues });
      if (isRejected(result)) {
        // Shouldn't happen — exception mode bypasses the rule engine — but
        // handle it rather than assume.
        setSubmitError('تعذر تسجيل الاستثناء.');
        return;
      }
      setSuccess(buildConfirmationSummary(fillUpForm.getValues(), result.isException));
    } catch (error) {
      setSubmitError(isAxiosError(error) ? formatAxiosError(error) : 'حدث خطأ غير متوقع.');
    }
  }

  const fieldLabelClass = 'mb-1 block text-[11px] font-bold text-ink-soft';
  const fieldErrorClass = 'mt-1 text-[12px] text-danger';
  const textInputClass =
    'h-11 w-full rounded-sm bg-surface-alt px-3 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-60';

  // Artboard 4d: a dedicated confirmation screen (checkmark, headline,
  // immutability note, transaction-summary card, "تعبئة جديدة"/"عرض
  // تعبئات اليوم" actions) — replacing the small inline success banner
  // that used to sit above the still-rendered, auto-reset-after-3s form.
  // No desktop artboard exists for this either (4d is mobile-only, same
  // gap as 3c) — this renders the same way at both widths, centered in
  // the page's existing max-w-xl column.
  if (success) {
    return (
      // Round 8: a live day-list rail on desktop only (round 6's original
      // description, screenshot 06/07 — not built until now, see this
      // file's round-8 header comment). Everything else here — heading,
      // card, actions — renders exactly ONCE regardless of viewport
      // (unlike the rest of this page, which deliberately mounts both a
      // mobile and a desktop copy of each field with distinct testids).
      // Duplicating the success content the same way briefly caused a
      // strict-mode-violation regression (two elements per testid) during
      // this round's own e2e run — fixed by keeping this screen singular
      // and only conditionally showing the rail alongside it via CSS, not
      // by duplicating the content itself.
      <div
        data-testid="fillup-success"
        className="sm:mx-auto sm:grid sm:max-w-3xl sm:grid-cols-[280px_1fr] sm:items-start sm:gap-5"
      >
        <div className="hidden sm:block">
          <DayListRail query={dayListQuery} visible={canViewReports} highlightStationName={success.stationName} />
        </div>

        <div className="mx-auto flex max-w-xl flex-col items-center py-6 text-center sm:mx-0 sm:max-w-none">
          <div
            className={`flex h-[88px] w-[88px] items-center justify-center rounded-full ${
              success.isException ? 'bg-accent-100' : 'bg-ok-100'
            }`}
          >
            {success.isException ? (
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#a8681c" strokeWidth="2.2">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3.5 2" />
              </svg>
            ) : (
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#1f7a5c" strokeWidth="2.6">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            )}
          </div>
          <h1 className="mt-6 text-[24px] font-black text-ink" data-testid="fillup-success-heading">
            {success.isException ? 'سُجِّل كاستثناء — بانتظار اعتماد المشرف' : 'تم تسجيل التعبئة'}
          </h1>
          <p className="mt-2.5 text-[13px] leading-[1.8] text-ink-soft">
            {success.isException ? (
              'لا يمكنك تعديلها أو حذفها بعد الآن — لن تحتسب ضمن التعبئات المعتمدة حتى يوافق عليها المشرف.'
            ) : (
              <>
                {success.stationName ? `سُجّلت باسمك في ${success.stationName}، ` : 'سُجّلت باسمك، '}
                ولا يمكن تعديلها أو حذفها بعد الآن.
              </>
            )}
          </p>

          <Card className="mt-6 w-full p-[18px] text-start sm:mt-0">
            <div className="flex justify-between border-b border-surface-alt py-2.5">
              <span className="text-[12.5px] text-ink-soft">المركبة</span>
              <span className="text-[12.5px] font-bold text-ink">
                <LtrText>{success.vehicleLabel}</LtrText>
              </span>
            </div>
            <div className="flex justify-between border-b border-surface-alt py-2.5">
              <span className="text-[12.5px] text-ink-soft">المالك</span>
              <span className="text-[12.5px] font-bold text-ink">{success.ownerLabel}</span>
            </div>
            <div className="flex justify-between border-b border-surface-alt py-2.5">
              <span className="text-[12.5px] text-ink-soft">الوقود والكمية</span>
              <span className="text-[12.5px] font-bold text-ink">
                {fuelTypeLabel(success.fuelType)} · <LtrText>{success.quantityLiters}</LtrText> لتر
              </span>
            </div>
            <div className="flex justify-between py-2.5">
              <span className="text-[12.5px] text-ink-soft">الوقت</span>
              <span className="text-[12.5px] font-bold text-ink">
                <LtrText>{new Date(success.occurredAt).toLocaleString('ar')}</LtrText>
              </span>
            </div>
          </Card>

          <div className="mt-6 flex w-full flex-col gap-2.5">
            <PillButton onClick={resetAll} className="h-[52px] w-full text-[15px]">
              تعبئة جديدة
            </PillButton>
            {canViewReports && (
              <PillButton variant="ghost" onClick={() => navigate('/reports/daily')} className="h-11 w-full text-[13px]">
                عرض تعبئات اليوم
              </PillButton>
            )}
          </div>
        </div>
      </div>
    );
  }

  function mobileBack() {
    if (mobileStep === 'match') setMobileStep('plate');
    else if (mobileStep === 'fuel') setMobileStep('match');
    else if (mobileStep === 'review') setMobileStep('fuel');
    else if (mobileStep === 'exception') setMobileStep('review');
  }

  const vehicleSelected = fillUpForm.watch('vehicleId');

  return (
    <div className="mx-auto max-w-xl">
      {/* ── Mobile guided wizard (round 8) ──────────────────────────── */}
      <div className="sm:hidden" data-testid="fillup-mobile-wizard">
        <div className="mb-3 flex items-center gap-2">
          {mobileStep !== 'plate' && (
            <button
              type="button"
              data-testid="fillup-mobile-back"
              onClick={mobileBack}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-alt text-ink-soft"
              aria-label="رجوع"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </button>
          )}
          <h1 className="text-[15px] font-extrabold text-ink">{MOBILE_STEP_TITLES[mobileStep]}</h1>
        </div>
        <div className="mb-4 flex gap-1.5">
          {[1, 2, 3].map((segment) => (
            <div
              key={segment}
              className={`h-1.5 flex-1 rounded-full ${
                segment <= MOBILE_STEP_SEGMENT[mobileStep] ? 'bg-primary' : 'bg-surface-alt'
              }`}
            />
          ))}
        </div>

        {mobileStep === 'plate' && (
          <Card className="p-4">
            {showNewVehicleFormMobile ? (
              <VehicleCreateForm
                initialPlate={plateValue}
                onCreated={(vehicle) => {
                  fillUpForm.setValue('vehicleId', vehicle.id, { shouldValidate: true });
                  setSelectedVehicleLabel(formatLicensePlate(vehicle.currentPlate));
                  setShowNewVehicleFormMobile(false);
                  setMobileStep('match');
                }}
                onDuplicateFound={(vehicle) => {
                  fillUpForm.setValue('vehicleId', vehicle.id, { shouldValidate: true });
                  setSelectedVehicleLabel(formatLicensePlate(vehicle.currentPlate));
                  setShowNewVehicleFormMobile(false);
                  setMobileStep('match');
                }}
                onCancel={() => setShowNewVehicleFormMobile(false)}
              />
            ) : !showManualSearchMobile ? (
              <>
                <p className="mb-3 text-center text-[12px] text-ink-soft">اقرأ رقم اللوحة واكتبه</p>
                <DigitBoxInput
                  groups={PLATE_DIGIT_GROUPS}
                  separator="-"
                  value={plateValue}
                  onChange={setPlateValue}
                  showKeypad
                  data-testid="fillup-mobile-plate-input"
                />
                {plateComplete && plateLookupQuery.isFetching && (
                  <p className="mt-3 text-center text-[12px] text-ink-soft">...جارٍ البحث</p>
                )}
                {plateComplete && !plateLookupQuery.isFetching && !matchedVehicle && (
                  <div className="mt-3 rounded-sm bg-surface-alt p-3 text-center" data-testid="fillup-mobile-no-match">
                    <p className="text-[12.5px] text-ink-soft">لا توجد مركبة بهذا الرقم في المنظومة</p>
                    {canCreateVehicle && (
                      <PillButton
                        size="sm"
                        className="mt-2"
                        data-testid="fillup-mobile-add-vehicle"
                        onClick={() => setShowNewVehicleFormMobile(true)}
                      >
                        إضافة كمركبة جديدة
                      </PillButton>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  data-testid="fillup-mobile-manual-search-toggle"
                  onClick={() => setShowManualSearchMobile(true)}
                  className="mt-4 block w-full text-center text-[11.5px] font-bold text-accent-dark"
                >
                  أو ابحث برقم الكتيب أو الشاسيه
                </button>
              </>
            ) : (
              <>
                <VehicleSearchSelect
                  value={fillUpForm.watch('vehicleId')}
                  onChange={(id, label) => {
                    fillUpForm.setValue('vehicleId', id, { shouldValidate: true });
                    setSelectedVehicleLabel(formatLicensePlate(label));
                    setMobileStep('match');
                  }}
                  onQueryChange={setVehicleQuery}
                  onCreateNew={canCreateVehicle ? () => setShowNewVehicleFormMobile(true) : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowManualSearchMobile(false)}
                  className="mt-3 block w-full text-center text-[11.5px] font-bold text-ink-soft"
                >
                  الرجوع لإدخال رقم اللوحة
                </button>
              </>
            )}
          </Card>
        )}

        {mobileStep === 'match' && vehicleSelected && (
          <Card className="p-4">
            <VehiclePreviewCard vehicleId={vehicleSelected} idSuffix="-mobile" />
            <PillButton
              data-testid="fillup-mobile-continue-to-fuel"
              className="mt-4 h-12 w-full text-[14px]"
              onClick={() => setMobileStep('fuel')}
            >
              متابعة إلى الوقود
            </PillButton>
            <button
              type="button"
              onClick={() => {
                fillUpForm.setValue('vehicleId', '', { shouldValidate: false });
                setPlateValue('');
                setMobileStep('plate');
              }}
              className="mt-2 block w-full text-center text-[11.5px] font-bold text-ink-soft"
            >
              تصحيح الرقم
            </button>
          </Card>
        )}

        {mobileStep === 'fuel' && (
          <Card className="p-4">
            <label className={fieldLabelClass}>نوع الوقود</label>
            <div className="flex gap-2">
              {FUEL_TYPES.map((ft) => {
                const selected = fillUpForm.watch('fuelType') === ft.value;
                return (
                  <button
                    key={ft.value}
                    type="button"
                    onClick={() => {
                      fillUpForm.setValue('fuelType', ft.value, { shouldValidate: true });
                      applyAmount(amountLyd, ft.value);
                    }}
                    className={`h-11 flex-1 rounded-sm text-[13px] font-bold transition ${
                      selected
                        ? 'bg-accent text-white shadow-[0_6px_16px_-6px_rgba(232,165,61,.6)]'
                        : 'bg-surface-alt text-ink-soft'
                    }`}
                  >
                    {ft.label}
                  </button>
                );
              })}
            </div>

            <label className={`${fieldLabelClass} mt-4`}>المبلغ المدفوع (د.ل)</label>
            {(() => {
              const fuelType = fillUpForm.watch('fuelType');
              const price = fuelPrices?.[fuelType];
              return (
                <>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      step="0.01"
                      data-testid="fillup-amount-input-mobile"
                      value={amountLyd}
                      onChange={(e) => applyAmount(e.target.value, fuelType)}
                      dir="ltr"
                      disabled={!price}
                      className="w-28 rounded-sm bg-transparent font-mono text-[30px] font-extrabold text-primary-dark focus:outline-none disabled:opacity-50"
                    />
                    <div className="flex flex-1 justify-end gap-1.5">
                      {AMOUNT_QUICK_PICKS.map((amount) => {
                        const selected = amountLyd === amount;
                        return (
                          <button
                            key={amount}
                            type="button"
                            onClick={() => applyAmount(amount, fuelType)}
                            className={`h-10 w-12 rounded-sm font-mono text-[13px] font-bold ${
                              selected ? 'bg-primary text-white' : 'bg-surface-alt text-ink-soft'
                            }`}
                          >
                            {amount}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {!price && <p className="mt-1.5 text-[11px] text-ink-faint">...جارٍ تحميل سعر الوقود</p>}
                </>
              );
            })()}
            {fillUpForm.formState.errors.quantityLiters && (
              <p className={fieldErrorClass}>{fillUpForm.formState.errors.quantityLiters.message}</p>
            )}
            {(() => {
              const quantity = fillUpForm.watch('quantityLiters');
              if (!quantity) return null;
              return (
                <div className="mt-3 flex items-center justify-between rounded-sm bg-surface-alt px-3 py-2.5">
                  <span className="text-[11px] font-bold text-ink-soft">الكمية المقدَّرة</span>
                  <span className="text-[14px] font-extrabold text-ink" data-testid="fillup-estimated-liters-mobile">
                    <LtrText>{quantity}</LtrText> لتر
                  </span>
                </div>
              );
            })()}

            <PillButton
              data-testid="fillup-mobile-continue-to-review"
              className="mt-4 h-12 w-full text-[14px]"
              disabled={!fillUpForm.watch('quantityLiters') || !!fillUpForm.formState.errors.quantityLiters}
              onClick={() => setMobileStep('review')}
            >
              متابعة إلى المراجعة
            </PillButton>
          </Card>
        )}

        {mobileStep === 'review' && (
          <>
            <form onSubmit={fillUpForm.handleSubmit(onSubmitFillUp)} className="space-y-3">
              <Card data-testid="rule-review-card-mobile" className={`p-3.5 ${rejection ? 'border-t-4 border-danger' : ''}`}>
                <RuleReviewChecks
                  checks={rulePreviewQuery.data?.checks}
                  isLoading={rulePreviewQuery.isLoading}
                  isError={rulePreviewQuery.isError}
                  rejection={rejection}
                  idSuffix="-mobile"
                />
              </Card>

              {submitError && <p className="text-[13px] text-danger">{submitError}</p>}

              {!rejection && (
                <PillButton
                  type="submit"
                  data-testid="fillup-submit-mobile"
                  disabled={fillUpForm.formState.isSubmitting || rulePreviewQuery.isLoading}
                  size="md"
                  className="h-14 w-full text-[15px]"
                >
                  {fillUpForm.formState.isSubmitting ? '...جارٍ التسجيل' : 'تسجيل التعبئة'}
                </PillButton>
              )}
            </form>

            {rejection && (
              <PillButton
                data-testid="fillup-mobile-record-exception"
                variant="danger"
                className="mt-3 h-12 w-full !border-0 !bg-danger !text-white"
                onClick={() => setMobileStep('exception')}
              >
                تسجيلها كاستثناء
              </PillButton>
            )}
          </>
        )}

        {mobileStep === 'exception' && (
          <Card className="p-4" data-testid="fillup-rejection-mobile">
            <p className="mb-3 text-[13px] font-bold text-ink">تسجيل استثناء لهذه التعبئة</p>
            <ExceptionFormFields
              exceptionForm={exceptionForm}
              exceptionTypes={exceptionTypes}
              selectedExceptionType={selectedExceptionType}
              onSubmit={onSubmitException}
              idSuffix="-mobile"
            />
          </Card>
        )}
      </div>

      {/* ── Desktop single-page form (unchanged from round 6/7) ─────── */}
      <div className="hidden sm:block">
        <h1 className="mb-4 text-lg font-extrabold text-ink">تسجيل تعبئة وقود</h1>

        <form onSubmit={fillUpForm.handleSubmit(onSubmitFillUp)} className="space-y-3">
          <Card className="p-3.5">
            <label className={fieldLabelClass}>المحطة</label>
            <StationSelect
              value={fillUpForm.watch('stationId')}
              onChange={(v) => fillUpForm.setValue('stationId', v, { shouldValidate: true })}
              disabled={!canViewAllStations}
              className={textInputClass}
            />
            {fillUpForm.formState.errors.stationId && (
              <p className={fieldErrorClass}>{fillUpForm.formState.errors.stationId.message}</p>
            )}
          </Card>

          <Card className="p-3.5">
            <label className={fieldLabelClass}>المركبة</label>
            {showNewVehicleForm ? (
              <VehicleCreateForm
                initialPlate={vehicleQuery}
                onCreated={(vehicle) => {
                  fillUpForm.setValue('vehicleId', vehicle.id, { shouldValidate: true });
                  setNewlyCreatedVehicleLabel(vehicle.currentPlate);
                  setSelectedVehicleLabel(formatLicensePlate(vehicle.currentPlate));
                  setShowNewVehicleForm(false);
                }}
                onDuplicateFound={(vehicle) => {
                  fillUpForm.setValue('vehicleId', vehicle.id, { shouldValidate: true });
                  setNewlyCreatedVehicleLabel(vehicle.currentPlate);
                  setSelectedVehicleLabel(formatLicensePlate(vehicle.currentPlate));
                  setShowNewVehicleForm(false);
                }}
                onCancel={() => setShowNewVehicleForm(false)}
              />
            ) : (
              <>
                <VehicleSearchSelect
                  value={fillUpForm.watch('vehicleId')}
                  onChange={(id, label) => {
                    fillUpForm.setValue('vehicleId', id, { shouldValidate: true });
                    setSelectedVehicleLabel(formatLicensePlate(label));
                  }}
                  initialLabel={newlyCreatedVehicleLabel}
                  onQueryChange={setVehicleQuery}
                  onCreateNew={canCreateVehicle ? () => setShowNewVehicleForm(true) : undefined}
                />
                {canCreateVehicle && (
                  <button
                    type="button"
                    disabled={vehicleQuery.replace(/\D/g, '').length === 0}
                    onClick={() => setShowNewVehicleForm(true)}
                    className="mt-1.5 text-[11.5px] font-bold text-accent-dark disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    مركبة جديدة؟ إضافة مركبة جديدة
                  </button>
                )}
                {fillUpForm.watch('vehicleId') && <VehiclePreviewCard vehicleId={fillUpForm.watch('vehicleId')} />}
              </>
            )}
            {fillUpForm.formState.errors.vehicleId && (
              <p className={fieldErrorClass}>{fillUpForm.formState.errors.vehicleId.message}</p>
            )}
          </Card>

          <Card className="p-3.5">
            <label className={fieldLabelClass}>نوع الوقود</label>
            <div className="flex gap-2">
              {FUEL_TYPES.map((ft) => {
                const selected = fillUpForm.watch('fuelType') === ft.value;
                return (
                  <button
                    key={ft.value}
                    type="button"
                    onClick={() => {
                      fillUpForm.setValue('fuelType', ft.value, { shouldValidate: true });
                      applyAmount(amountLyd, ft.value);
                    }}
                    className={`h-11 flex-1 rounded-sm text-[13px] font-bold transition ${
                      selected
                        ? 'bg-accent text-white shadow-[0_6px_16px_-6px_rgba(232,165,61,.6)]'
                        : 'bg-surface-alt text-ink-soft'
                    }`}
                  >
                    {ft.label}
                  </button>
                );
              })}
            </div>
          </Card>

          <Card className="p-3.5">
            <label className={fieldLabelClass}>المبلغ المدفوع (د.ل)</label>
            {(() => {
              const fuelType = fillUpForm.watch('fuelType');
              const price = fuelPrices?.[fuelType];
              return (
                <>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      step="0.01"
                      data-testid="fillup-amount-input"
                      value={amountLyd}
                      onChange={(e) => applyAmount(e.target.value, fuelType)}
                      dir="ltr"
                      disabled={!price}
                      className="w-28 rounded-sm bg-transparent font-mono text-[30px] font-extrabold text-primary-dark focus:outline-none disabled:opacity-50"
                    />
                    <div className="flex flex-1 justify-end gap-1.5">
                      {AMOUNT_QUICK_PICKS.map((amount) => {
                        const selected = amountLyd === amount;
                        return (
                          <button
                            key={amount}
                            type="button"
                            onClick={() => applyAmount(amount, fuelType)}
                            className={`h-10 w-12 rounded-sm font-mono text-[13px] font-bold ${
                              selected ? 'bg-primary text-white' : 'bg-surface-alt text-ink-soft'
                            }`}
                          >
                            {amount}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {!price && (
                    <p className="mt-1.5 text-[11px] text-ink-faint">...جارٍ تحميل سعر الوقود</p>
                  )}
                </>
              );
            })()}
            {fillUpForm.formState.errors.quantityLiters && (
              <p className={fieldErrorClass}>{fillUpForm.formState.errors.quantityLiters.message}</p>
            )}
            {(() => {
              const quantity = fillUpForm.watch('quantityLiters');
              if (!quantity) return null;
              return (
                <div className="mt-3 flex items-center justify-between rounded-sm bg-surface-alt px-3 py-2.5">
                  <span className="text-[11px] font-bold text-ink-soft">الكمية المقدَّرة</span>
                  <span className="text-[14px] font-extrabold text-ink" data-testid="fillup-estimated-liters">
                    <LtrText>{quantity}</LtrText> لتر
                  </span>
                </div>
              );
            })()}
          </Card>

          {selectedVehicleId && (
            <Card data-testid="rule-review-card" className={`p-3.5 ${rejection ? 'border-t-4 border-danger' : ''}`}>
              <RuleReviewChecks
                checks={rulePreviewQuery.data?.checks}
                isLoading={rulePreviewQuery.isLoading}
                isError={rulePreviewQuery.isError}
                rejection={rejection}
              />
            </Card>
          )}

          {submitError && <p className="text-[13px] text-danger">{submitError}</p>}

          <PillButton
            type="submit"
            data-testid="fillup-submit"
            disabled={fillUpForm.formState.isSubmitting || (!!selectedVehicleId && rulePreviewQuery.isLoading)}
            size="md"
            className="h-14 w-full text-[15px]"
          >
            {fillUpForm.formState.isSubmitting ? '...جارٍ التسجيل' : 'تسجيل التعبئة'}
          </PillButton>
          <p className="text-center text-[11px] text-ink-faint">تُفحص القواعد عند التسجيل</p>
        </form>

        {rejection && (
          <Card data-testid="fillup-rejection" className="mt-4 p-5">
            <p className="mb-3 text-[13px] font-bold text-ink">تسجيلها كاستثناء</p>
            <ExceptionFormFields
              exceptionForm={exceptionForm}
              exceptionTypes={exceptionTypes}
              selectedExceptionType={selectedExceptionType}
              onSubmit={onSubmitException}
            />
          </Card>
        )}
      </div>
    </div>
  );
}

// The global ValidationPipe/AllExceptionsFilter shape is
// { statusCode, error, message }, where `message` is either a plain string
// (thrown NestJS exceptions) or a string[] (class-validator failures) — both
// always in English. Normal rule-violation rejections never reach this: they
// come back as a 422 body handled by isRejected()/RULE_VIOLATION_MESSAGES
// above, which is the real Arabic path. This only fires for a genuinely
// unexpected error, and per the code-leak audit it must not surface the raw
// English message in this Arabic UI even then.
function formatAxiosError(_error: AxiosError<{ message?: string | string[] }>): string {
  return 'تعذر إتمام العملية. حاول مرة أخرى.';
}
