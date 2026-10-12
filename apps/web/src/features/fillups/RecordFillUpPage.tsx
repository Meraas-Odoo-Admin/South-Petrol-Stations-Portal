import { PrintRegistrationSheetButton } from '../../components/PrintRegistrationSheetButton';
import { FillUpPlate } from '../../components/FillUpPlate';
import { useEffect, useRef, useState } from 'react';
import { useForm, type FieldErrors, type UseFormReturn } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { isAxiosError, type AxiosError } from 'axios';
import type {
  AwarenessNotice,
  RegistrationStationInfo,
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
import { PLATE_DIGIT_GROUPS, isAllComplete, splitToGroups } from '../../lib/digitBoxGroups';
import { formatLicensePlate } from '../../lib/libyanFormats';
import {
  MAX_FILLUP_LITERS,
  VEHICLE_FUEL_TYPE_LABELS_AR,
  fuelTypeMismatch,
  normalizePlate,
  platesMatch,
  plateSearchTerm,
} from '@fuel-tracking/shared-types';
import { fuelTypeLabel } from '../../lib/labels';
import { useAuth } from '../auth/AuthProvider';
import { useStations } from '../stations/useStations';
import { Card } from '../../components/design/Card';
import { PillButton } from '../../components/design/PillButton';
import { KpiCard } from '../../components/design/KpiCard';
import { CodeText } from '../../components/design/CodeText';
import { FillUpStatusPill } from '../../components/FillUpStatusPill';
import { VehicleSearchSelect } from './VehicleSearchSelect';
import { VehiclePreviewCard } from './VehiclePreviewCard';
import { VehicleBrandLogo } from '../../components/VehicleBrandLogo';
import { QrScanPanel, type ScannedCard } from '../../components/QrScanPanel';
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
      {isError && <p className="text-[12.5px] text-danger">{errorMessage ?? 'تعذر تحميل مراجعة القواعد.'}</p>}

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
  submitError,
}: {
  exceptionForm: UseFormReturn<ExceptionFormValues>;
  exceptionTypes: ExceptionTypeOption[] | undefined;
  selectedExceptionType: ExceptionTypeOption | null;
  onSubmit: (values: ExceptionFormValues) => void;
  idSuffix?: string;
  submitError?: string | null;
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

      {submitError && <p className="text-[13px] text-danger">{submitError}</p>}

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
                    <FillUpPlate vehicle={row.vehicle} typedPlate={row.typedPlate} />
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
  // Empty for an unregistered plate (Phase 4a) — onSubmit checks that SOME
  // way of identifying the vehicle exists.
  vehicleId: z.string(),
  fuelType: z.enum(['PETROL_95', 'DIESEL', 'KEROSENE']),
  // Kept as a string field (not z.coerce.number()) to sidestep RHF/zod's
  // input-vs-output generic mismatch for coerced schemas — converted to a
  // number just before it's sent (see toFillUpPayload).
  quantityLiters: z.string().refine(
    (v) => {
      const n = Number(v);
      // The same ceiling the API applies (MAX_FILLUP_LITERS, shared-types).
      return v.trim() !== '' && Number.isFinite(n) && n > 0 && n <= MAX_FILLUP_LITERS;
    },
    { message: `يجب أن تكون الكمية رقمًا أكبر من صفر ولا يتجاوز ${MAX_FILLUP_LITERS} لترًا` },
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

// crypto.randomUUID() is restricted to secure contexts (HTTPS or
// localhost) by spec — throws on a plain-HTTP LAN origin (e.g. a phone
// testing against the dev server over http://<lan-ip>), which crashed this
// whole page with no error boundary to catch it. crypto.getRandomValues
// has no such restriction, so build a UUID v4 from it instead; the
// Math.random fallback only matters for a crypto-less environment, which
// shouldn't happen in a real browser, but the key just needs to be unique
// per submission, not cryptographically strong, so it's an acceptable
// last resort.
function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // Fall through to the getRandomValues-based UUID below.
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
  // Round 12: a holder of fillups:record_exception is auto-approved at
  // creation (see FillUpsService.create) — always true for a non-exception
  // fill-up, but for an exception it now genuinely varies, so the
  // confirmation screen can no longer assume every exception is pending.
  isApproved: boolean;
  // Phase 4a: no vehicle record, so no owner; and the awareness notice the
  // server returns after a no-card-scan fill-up in the awareness stage.
  unregistered: boolean;
  isOverride: boolean;
  awareness: AwarenessNotice | null;
}

// Round 8 built the guided step sequence from design/feedback-2026-08-31/
// 01-*.png/02-*.png, but only for narrow viewports (`sm:hidden`) — desktop
// kept the old single-page-with-everything-visible form, on the reading
// that round 6 had asked for that split. Round 10: the client confirmed
// directly they want the SAME step-by-step journey at every screen size,
// not a separate desktop form — that reading is now explicitly overridden.
// The desktop-only form (station select, all fields visible at once, the
// always-shown rule-review card) is removed outright, not hidden. What
// doesn't just disappear: the desktop-only day-list rail from screenshots
// 06/07 — it becomes a persistent sidebar beside the step column on wide
// screens (still one step at a time in the main column), rather than only
// appearing on the post-submit confirmation screen the way it did before.
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
  // Round 12: recording an exception is now its own permission, grantable
  // per-user independent of role (see UserPermission on the backend) — the
  // client wants this offered only to specific employees, not everyone who
  // can record a normal fill-up. Hiding the button for anyone without it
  // avoids the confusing "I clicked it and nothing happened" report this
  // round started with — that one was a missing error-render bug (see
  // ExceptionFormFields' submitError prop), but a 403 on submit for someone
  // who was never supposed to see this option in the first place is worse.
  const canRecordException = hasPermission('fillups:record_exception');
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
  // Phase 5A: a plate may end in N (part of the plate's identity, so 5-123N is
  // not 5-123). The toggle sits beside the two digit groups; every MATCH and
  // the unregistered record use the full plate with the N.
  const [plateN, setPlateN] = useState(false);
  const plateFull = plateValue ? `${plateValue}${plateN ? 'N' : ''}` : '';
  // Round 11 item 4: whether the user has actually finished typing the
  // plate (moved focus away from the box row) since the last keystroke —
  // needed because the sequence group's `minFilled: 1` makes isAllComplete
  // go true after just the FIRST sequence digit (a 1-digit sequence is a
  // genuinely valid plate), long before a longer real plate is actually
  // finished. Reset to false on every keystroke so re-editing after
  // finalizing re-arms the gate; set true by DigitBoxInput's onFocusLeave.
  const [plateBlurred, setPlateBlurred] = useState(false);
  // Client feedback: typing a genuinely SHORT plate (fewer than 7
  // sequence digits — a real, valid case, not everyone's plate is 7
  // digits long) correctly hid the "no vehicle — add new" panel while
  // still typing (that's the round 11 fix working as intended), but then
  // required an extra, unintuitive click OUTSIDE the box row before the
  // panel would show at all — even though the user was already done and
  // just sitting in the next (empty, focused) box because that's simply
  // where auto-advance left them. Fix: treat a pause in typing the same
  // way DigitBoxInput's onFocusLeave already does (sets plateBlurred) —
  // if no new digit lands within ~900ms, the user has very likely
  // stopped, not just paused mid-keystroke, so finalize the same way an
  // explicit blur would. Continuous typing (any real gap under ~900ms
  // between keystrokes) keeps resetting this timer, so it can't
  // reintroduce the original premature-verdict bug — it only fires once
  // input has genuinely gone quiet.
  useEffect(() => {
    const timer = setTimeout(() => setPlateBlurred(true), 900);
    return () => clearTimeout(timer);
  }, [plateValue]);
  // Round 12: live search-as-you-type — matches should surface before the
  // plate is fully typed, not just once it's complete. Debounced
  // separately from `plateValue` itself so a lookup doesn't fire on every
  // single box's keystroke while the user is still mid-entry (same 250ms
  // pattern VehicleSearchSelect already uses for its own free-text field).
  const [debouncedPlateValue, setDebouncedPlateValue] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedPlateValue(plateValue), 250);
    return () => clearTimeout(timer);
  }, [plateValue]);
  const [showManualSearchMobile, setShowManualSearchMobile] = useState(false);
  // Round 15 (scan-in): a second identification route inside this same
  // 'plate' step, offered next to the digit-box entry — not a new
  // MobileStep, not a 4th progress segment. The offer itself is only ever
  // rendered when a camera could plausibly open at all (secure context +
  // getUserMedia present); a runtime failure AFTER tapping it is the
  // separate 'denied' state QrScanPanel itself handles.
  //
  // Registration pivot, phase 3: the plate step is SCAN-FIRST — it opens
  // straight into the camera to read the vehicle's printed card; typing the
  // plate is the small secondary route, for a damaged or missing card.
  const qrScanSupported =
    typeof window !== 'undefined' && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;
  const [plateEntryMode, setPlateEntryMode] = useState<'scan' | 'type'>(qrScanSupported ? 'scan' : 'type');
  const [cameraUnavailableHint, setCameraUnavailableHint] = useState(false);
  // Set only by a card scan: the match step then shows the big "is this the
  // vehicle?" confirmation instead of the typed-plate preview.
  const [scannedCard, setScannedCard] = useState<ScannedCard | null>(null);
  // Phase 4a: a plate typed at the pump that matched no vehicle, confirmed
  // by the employee as "record it as unregistered".
  const [unregisteredPlate, setUnregisteredPlate] = useState<string | null>(null);
  // Set when the server refuses with CARD_REQUIRED (from the preview or the
  // submit): the stations to send the owner to.
  const [cardRequired, setCardRequired] = useState<CardRequiredInfo | null>(null);
  const [overrideOn, setOverrideOn] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const canOverride = hasPermission('fillups:emergency_override');

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
  //
  // Registration pivot, phase 1: allowances are counted per municipality,
  // and the station decides which one — so the preview is per
  // (vehicle, station) and waits until both are chosen.
  const previewStationId = fillUpForm.watch('stationId');
  // Who the fill-up is for, as the server wants it: the card number when the
  // card was scanned (so the server records CARD_SCAN), else the vehicle, else
  // the unregistered plate as typed. The server re-resolves all of it.
  const identifiers: Pick<CreateFillUpRequest, 'vehicleId' | 'cardNumber' | 'plate'> =
    scannedCard && scannedCard.vehicle.id === selectedVehicleId
      ? { vehicleId: selectedVehicleId, cardNumber: scannedCard.cardNumber }
      : selectedVehicleId
        ? { vehicleId: selectedVehicleId }
        : unregisteredPlate
          ? { plate: unregisteredPlate }
          : {};
  const hasSubject = !!selectedVehicleId || !!unregisteredPlate;
  const overrideParams = overrideOn ? { emergencyOverride: true, overrideReason: overrideReason.trim() } : {};
  const rulePreviewQuery = useQuery({
    queryKey: ['fillups', 'rule-preview', identifiers, previewStationId, overrideOn, overrideReason.trim()],
    queryFn: async () =>
      (
        await apiClient.get<RulePreviewResponse>('/fillups/rule-preview', {
          params: { ...identifiers, stationId: previewStationId, ...overrideParams },
        })
      ).data,
    enabled: hasSubject && !!previewStationId && (!overrideOn || overrideReason.trim().length > 0),
    // A station that can't take fill-ups (no municipality / not live) is
    // a definitive answer, not a transient failure — don't retry it.
    retry: (failureCount, error) => !(isAxiosError(error) && error.response?.status === 409) && failureCount < 3,
  });
  // Phase 5A: the fuel chosen is not the fuel the vehicle runs on. A clear
  // warning, never a block - the server records it on the fill-up too.
  const chosenFuel = fillUpForm.watch('fuelType');
  const vehicleFuelType = selectedVehicle?.fuelType ?? rulePreviewQuery.data?.vehicleFuelType ?? null;
  const fuelMismatch = fuelTypeMismatch(vehicleFuelType, chosenFuel);
  const previewCardRequired = isAxiosError(rulePreviewQuery.error) ? cardRequiredFrom(rulePreviewQuery.error) : null;
  const activeCardRequired = cardRequired ?? previewCardRequired;
  const rulePreviewErrorMessage = isAxiosError(rulePreviewQuery.error)
    ? stationBlockedMessage(rulePreviewQuery.error)
    : null;

  // Round 11 item 7: confirmed live (docs/screenshots/verify/round11/
  // 05-item7-before-submit.png) that this is genuinely the state the
  // client's screenshot shows — two checks already failing in the
  // PREVIEW, yet no exception path, because `rejection` (below) was only
  // ever set by a REAL submit attempt's 422 response, never by the
  // preview data the review step already has in hand. Round 7's original
  // spec was "failing rule → red block ... plus a record-as-exception
  // screen" — nothing said the user has to click "تسجيل التعبئة" once,
  // watch it fail, and only THEN get the exception option, when the
  // screen already knows it's going to fail. `checks` is in the same
  // fixed precedence order `FillUpRuleEngine.computeChecks` builds it in
  // (vehicle gap → vehicle cap → owner gap → owner cap → owner liters),
  // so the first failing entry here is the same `reason` a real 422 from
  // this exact vehicle would return RIGHT NOW — with one caveat: the
  // preview endpoint (`GET /fillups/rule-preview`) deliberately doesn't
  // expose whether a StandingException would auto-allow it (it only ever
  // returns the raw per-rule `checks`, not `resolveViolations`'s final
  // verdict — see `FillUpsService.previewRules`), so this can be
  // optimistic-wrong in the rare case a standing exception covers the
  // failing rule. That's why the plain "تسجيل التعبئة" button stays
  // visible alongside the exception option below rather than being
  // replaced by it — a real submit is still the authoritative check, this
  // just stops making the user run it once, pointlessly, before the
  // exception path they can already see is coming becomes available.
  const previewRejection: Rejection | null = (() => {
    const failed = rulePreviewQuery.data?.checks.find((c) => !c.passed);
    return failed ? { reason: failed.reason, trigger: null } : null;
  })();
  const effectiveRejection = rejection ?? previewRejection;

  // Bug found live: this used to be gated on `rejection !== null` alone —
  // but round 11 item 7 (above) made the exception path reachable via
  // `previewRejection` too, without `rejection` ever being set (that's now
  // the COMMON path: the exception button is the first option offered once
  // a rule fails, not a fallback reached only after an attempted submit).
  // Reaching the exception form that way left this query permanently
  // disabled — the dropdown rendered with only the placeholder option and
  // zero network requests ever fired for /fillups/exception-types, even
  // though the backend had real active types to return. Gated on
  // `effectiveRejection` instead, which covers both paths.
  const { data: exceptionTypes } = useQuery({
    queryKey: ['fillups', 'exception-types'],
    queryFn: async () => (await apiClient.get<ExceptionTypeOption[]>('/fillups/exception-types')).data,
    enabled: effectiveRejection !== null && canRecordException,
  });

  // Round 8: the confirmation screen's live day-list rail from screenshot
  // 06/07 — same GET /reports/daily endpoint DailyReportPage already
  // uses, scoped to the station just used and today's date. Gated on
  // reports:view since that's the same permission DailyReportPage itself
  // requires; without it this just skips the rail rather than firing a
  // request that would 403.
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

  // Round 10: the SAME rail, but for the duration of the wizard itself
  // (not just the post-submit confirmation) — the client didn't ask to
  // lose the day-list just because the desktop-only form it lived in is
  // going away, so it becomes a persistent sidebar next to the step
  // column on wide screens. Scoped to whichever station the fill-up is
  // actually being recorded at right now, not to a completed submission.
  const currentStationId = fillUpForm.watch('stationId');
  const wizardDayListQuery = useQuery({
    queryKey: ['reports', 'daily', currentStationId, todayIso],
    queryFn: async () =>
      (
        await apiClient.get<DailyReportResponse>('/reports/daily', {
          params: { stationId: currentStationId, date: todayIso },
        })
      ).data,
    enabled: !success && canViewReports && !!currentStationId,
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
  // Round 11 item 4 — TWO real, distinct bugs behind one client complaint,
  // both confirmed live before fixing either:
  //
  // (a) This used to be `LICENSE_PLATE_REGEX.test(plateValue)`. The
  // regex's separator is optional (`[-\s]?`), so once the city-code group
  // has 2 digits and NOTHING has been typed into the sequence group yet,
  // `joinGroups` (deliberately, by its own design — no dangling dash while
  // a later group is still empty) emits an unseparated string like "84"
  // with no dash at all. The regex then backtracks and happily reads that
  // as "8" (1-digit code) + "4" (1-digit sequence) — a false "complete"
  // match on a plate that's genuinely still mid-typing.
  //
  // (b) Deeper, and the actual cause of the client's specific screenshot
  // (city code done, 4 of 7 sequence digits typed, "not found" already
  // showing): PLATE_DIGIT_GROUPS' sequence group has `minFilled: 1` — a
  // real format rule (a 1-digit sequence number is a genuinely valid
  // plate), so `isAllComplete` alone goes true the instant the FIRST
  // sequence digit lands, not just once all 7 are typed. Every keystroke
  // after that first sequence digit was firing a real lookup against a
  // too-short, not-actually-final value — the "not found" message wasn't
  // wrong for THAT value, it was just showing for a value the user hadn't
  // finished typing yet, repeatedly, on every keystroke.
  //
  // Fixed: `plateComplete` now requires isAllComplete (every group has at
  // least reached its own minFilled) PLUS the LAST group specifically
  // being either fully filled or the user having demonstrably stopped
  // typing (blurred away). Only the LAST group's fill state is actually
  // ambiguous while typing is still in progress — natural typing moves
  // strictly forward group-by-group, so by the time the sequence group
  // has ANY content at all, the city-code group is already behind the
  // user and its own minFilled is trustworthy as final (this was the
  // first version of this fix's own bug, caught live: requiring EVERY
  // group fully filled wrongly stayed incomplete forever for a genuinely
  // valid 1-digit city code, since that group's second box was never
  // going to fill).
  const plateGroupValues = splitToGroups(plateValue, PLATE_DIGIT_GROUPS, '-');
  const lastPlateGroupIndex = PLATE_DIGIT_GROUPS.length - 1;
  const lastPlateGroup = PLATE_DIGIT_GROUPS[lastPlateGroupIndex]!;
  const lastPlateGroupFilled = (plateGroupValues[lastPlateGroupIndex] ?? '').length === lastPlateGroup.boxes;
  const plateComplete =
    isAllComplete(plateGroupValues, PLATE_DIGIT_GROUPS) && (lastPlateGroupFilled || plateBlurred);

  // Round 12 (client testing found this started too late — confirmed
  // live): the client wants candidate matches from the very FIRST digit
  // typed anywhere in the plate, including the city-code digits before
  // the dash — not gated on isAllComplete (which requires BOTH groups to
  // have content, so nothing showed until the user crossed into the
  // sequence group). "Worth searching" is now just "any digit typed at
  // all." This single query still serves both the live list below and
  // the definitive match/no-match verdict once plateComplete — no second
  // query needed, and the exact-match auto-advance effect below still
  // only ever fires on a genuine full-string match, so firing the search
  // earlier can't cause a premature auto-advance.
  const debouncedPlateGroupValues = splitToGroups(debouncedPlateValue, PLATE_DIGIT_GROUPS, '-');
  const plateSearchWorthwhile = debouncedPlateGroupValues.some((g) => g.length > 0);
  const plateLookupQuery = useQuery({
    queryKey: ['vehicles', 'plate-lookup', debouncedPlateValue],
    queryFn: async () =>
      (
        await apiClient.get<{ id: string; internalCode: string; currentPlate: string; model: string | null }[]>('/vehicles', {
          params: { search: plateSearchTerm(debouncedPlateValue), take: 5 },
        })
      ).data,
    enabled: plateSearchWorthwhile,
  });
  const matchedVehicle = plateLookupQuery.data?.find(
    (v) => platesMatch(v.currentPlate, plateFull),
  );
  // Live-search candidates shown below the keypad WHILE still typing —
  // distinct from matchedVehicle (exact match, drives auto-advance).
  //
  // Bug found live (client report): this used to be gated on
  // `!plateComplete`, which sounds right but isn't — `plateComplete` is
  // idle-timer-inclusive (see the 900ms effect above), so ~650ms after
  // results first rendered, the idle timer alone flips `plateBlurred`
  // true, `plateComplete` follows (isAllComplete was already satisfied
  // by the sequence group's `minFilled: 1`), and this ternary zeroed the
  // list — matches vanished on their own with no click and no further
  // typing. That idle timer exists to finalize the "not found / add new
  // vehicle" verdict for a genuinely short, already-typed plate (see
  // below); it was never meant to control whether currently-fetched
  // candidates stay on screen, and conflating the two is exactly what
  // caused the disappearing act. The live list now depends only on
  // whether the query actually has results and there's no exact match
  // yet — never on the idle/blur approximation.
  // With the N toggled on, only plates that end in N can be the vehicle.
  const plateLiveCandidates = !matchedVehicle
    ? (plateLookupQuery.data ?? []).filter((v) => !plateN || /N$/i.test(v.currentPlate.trim()))
    : [];
  const plateHasNoCandidates =
    plateSearchWorthwhile && !plateLookupQuery.isFetching && !matchedVehicle && plateLiveCandidates.length === 0;

  // Auto-advance once an exact plate match is found — only while still on
  // the 'plate' step, so re-running this effect after the user has
  // already moved on (e.g. they go back to double check) doesn't yank
  // them forward again.
  //
  // Bug found live: a multi-station (canViewAllStations) user who typed a
  // plate that matched an ALREADY-CREATED vehicle (e.g. one they'd just
  // added inline) but hadn't picked a station yet would auto-advance to
  // 'match' immediately regardless — then fail at the final submit with
  // "no station chosen" and get sent back to 'plate' by onInvalidFillUp/
  // onSubmitException. Once back there, this effect's old dependency array
  // (`[matchedVehicle?.id]` only) would never fire again, since the SAME
  // vehicle was already matched before — nothing else ever changed to
  // re-trigger it. The user was stuck on 'plate' with no way forward
  // short of retyping the plate to force a change, which read as "my data
  // disappeared" even though the vehicle itself was already saved
  // server-side. Fixed by also watching stationId and requiring it to be
  // set (for canViewAllStations users only — a scoped employee's stationId
  // defaults from their own station and never blocks this) before
  // advancing — plate and station can now be filled in either order, and
  // picking the station after being sent back is itself what unblocks
  // progress again.
  const watchedStationIdForAutoAdvance = fillUpForm.watch('stationId');
  useEffect(() => {
    if (
      matchedVehicle &&
      mobileStep === 'plate' &&
      (!canViewAllStations || watchedStationIdForAutoAdvance)
    ) {
      fillUpForm.setValue('vehicleId', matchedVehicle.id, { shouldValidate: true });
      setSelectedVehicleLabel(formatLicensePlate(matchedVehicle.currentPlate));
      setMobileStep('match');
    }
  }, [matchedVehicle?.id, watchedStationIdForAutoAdvance]);

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
    setAmountLyd('');
    setMobileStep('plate');
    setPlateValue('');
    setShowManualSearchMobile(false);
    setScannedCard(null);
    setUnregisteredPlate(null);
    setCardRequired(null);
    setOverrideOn(false);
    setOverrideReason('');
    setPlateEntryMode(qrScanSupported ? 'scan' : 'type');
    setCameraUnavailableHint(false);
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
      ...identifiers,
      ...(overrideOn ? { emergencyOverride: true, overrideReason: overrideReason.trim() } : {}),
      fuelType: values.fuelType,
      quantityLiters: Number(values.quantityLiters),
    };
  }

  function buildConfirmationSummary(
    values: FillUpFormValues,
    isException: boolean,
    isApproved: boolean,
    awareness: AwarenessNotice | null,
  ): ConfirmationSummary {
    const stationName = stations?.find((s) => s.id === values.stationId)?.name ?? '';
    return {
      vehicleLabel: selectedVehicleLabel || (unregisteredPlate ? formatLicensePlate(unregisteredPlate) : ''),
      ownerLabel: selectedVehicle?.owner?.fullName ?? '—',
      stationId: values.stationId,
      stationName,
      fuelType: values.fuelType,
      quantityLiters: values.quantityLiters,
      occurredAt: new Date().toISOString(),
      isApproved,
      isException,
      unregistered: !values.vehicleId,
      isOverride: overrideOn,
      awareness,
    };
  }

  async function onSubmitFillUp(values: FillUpFormValues) {
    setSubmitError(null);
    setSuccess(null);
    if (!hasSubject) {
      setSubmitError('اختر المركبة أو اكتب رقم اللوحة أولًا.');
      setMobileStep('plate');
      return;
    }
    try {
      const result = await submitFillUp(toBasePayload(values));
      if (isRejected(result)) {
        setRejection({ reason: result.reason, trigger: result.trigger });
        return;
      }
      setSuccess(
        buildConfirmationSummary(
          values,
          result.isException,
          !result.isException || result.exception?.approvedById != null,
          result.awareness ?? null,
        ),
      );
    } catch (error) {
      const required = isAxiosError(error) ? cardRequiredFrom(error) : null;
      if (required) {
        setCardRequired(required);
        setMobileStep('match');
        return;
      }
      setSubmitError(isAxiosError(error) ? formatAxiosError(error) : 'حدث خطأ غير متوقع.');
    }
  }

  // Bug found live: clicking "تسجيل التعبئة" did NOTHING — no error, no
  // navigation, nothing — for a multi-station (canViewAllStations) user
  // who reached the review step without picking a station. Root cause:
  // react-hook-form's handleSubmit silently no-ops on a validation
  // failure unless a second (invalid) callback is passed — it was never
  // wired here, so a failing stationId check (the field lives on the
  // 'plate' step, whose own error text the user had long since navigated
  // past by the time they clicked submit on 'review') just vanished into
  // formState.errors with nothing on screen ever pointing at it. This
  // sends the user back to the step that actually holds the invalid
  // field (today, only stationId can be empty by the time review is
  // reachable — vehicleId/quantityLiters are already enforced by their
  // own steps' "متابعة" buttons) and surfaces a real Arabic message
  // instead of a click that does nothing.
  function onInvalidFillUp(errors: FieldErrors<FillUpFormValues>) {
    if (errors.stationId) {
      setSubmitError(errors.stationId.message ?? 'اختر المحطة قبل تسجيل التعبئة.');
      setMobileStep('plate');
      return;
    }
    setSubmitError('تعذر إتمام العملية — تحقّق من بيانات التعبئة.');
  }

  async function onSubmitException(exceptionValues: ExceptionFormValues) {
    setSubmitError(null);
    const base = toBasePayload(fillUpForm.getValues());
    // Bug found live: this path posts straight to the API with no
    // client-side validation at all (unlike onSubmitFillUp, which at least
    // goes through react-hook-form's zod schema) — a missing stationId
    // reached the backend as a 404 "Station not found", which
    // formatAxiosError has no special case for, so it fell through to the
    // generic "تعذر إتمام العملية" with no hint of the actual cause.
    if (!base.stationId) {
      setSubmitError('اختر المحطة قبل تسجيل الاستثناء.');
      setMobileStep('plate');
      return;
    }
    try {
      const result = await submitFillUp({ ...base, ...exceptionValues });
      if (isRejected(result)) {
        // Shouldn't happen — exception mode bypasses the rule engine — but
        // handle it rather than assume.
        setSubmitError('تعذر تسجيل الاستثناء.');
        return;
      }
      setSuccess(
        buildConfirmationSummary(
          fillUpForm.getValues(),
          result.isException,
          !result.isException || result.exception?.approvedById != null,
          result.awareness ?? null,
        ),
      );
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
              success.isException && !success.isApproved ? 'bg-accent-100' : 'bg-ok-100'
            }`}
          >
            {success.isException && !success.isApproved ? (
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
            {/* Round 12: a fillups:record_exception holder's exception is
                auto-approved at creation (see FillUpsService.create) — the
                old copy unconditionally said "awaiting supervisor approval"
                for every exception, which is now simply false for most of
                them. Only the genuinely-still-pending case (a legacy row,
                or a caller somehow without auto-approval) shows that text. */}
            {success.isException
              ? success.isApproved
                ? 'سُجِّل كاستثناء — معتمدة'
                : 'سُجِّل كاستثناء — بانتظار اعتماد المشرف'
              : 'تم تسجيل التعبئة'}
          </h1>
          <p className="mt-2.5 text-[13px] leading-[1.8] text-ink-soft">
            {success.isException ? (
              success.isApproved ? (
                'اعتُمدت هذه التعبئة تلقائيًا عند تسجيلها — لا يمكن تعديلها أو حذفها بعد الآن.'
              ) : (
                'لا يمكنك تعديلها أو حذفها بعد الآن — لن تحتسب ضمن التعبئات المعتمدة حتى يوافق عليها المشرف.'
              )
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

          {success.unregistered && (
            <p className="mt-4 w-full rounded-sm bg-accent-100 p-3 text-[12.5px] font-bold text-accent-dark" data-testid="fillup-success-unregistered">
              سُجِّلت على لوحة غير مسجلة. ستُربط بالمركبة تلقائيًا عند تسجيلها.
            </p>
          )}
          {success.isOverride && (
            <p className="mt-4 w-full rounded-sm bg-danger-100 p-3 text-[12.5px] font-bold text-danger" data-testid="fillup-success-override">
              سُجِّلت بتفويض طارئ وستظهر كاستثناء في التقارير.
            </p>
          )}
          {success.awareness && <AwarenessBlock awareness={success.awareness} />}
          <PrintRegistrationSheetButton stationId={success.stationId} className="mt-3" />

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
    // Round 10: the guided journey is now the ONLY fill-up experience at
    // every width — the sm:hidden/hidden-sm:block split that gated it to
    // narrow viewports is gone. The day-list rail that used to live only
    // in the desktop form's own layout becomes a sidebar here, visible
    // beside the step column on wide screens; the step column itself
    // still shows exactly one step at a time regardless of viewport width
    // — the client asked for the SAME journey everywhere, not a wider
    // version of it.
    <div className="sm:mx-auto sm:grid sm:max-w-3xl sm:grid-cols-[280px_1fr] sm:items-start sm:gap-5">
      <div className="hidden sm:block">
        <DayListRail query={wizardDayListQuery} visible={canViewReports} highlightStationName="" />
      </div>

      <div className="mx-auto w-full max-w-xl" data-testid="fillup-mobile-wizard">
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
          <Card className="relative p-4">
            {canViewAllStations && (
              <div className="mb-4">
                <label className={fieldLabelClass}>المحطة</label>
                <StationSelect
                  value={fillUpForm.watch('stationId')}
                  onChange={(v) => fillUpForm.setValue('stationId', v, { shouldValidate: true })}
                  className={textInputClass}
                />
                {fillUpForm.formState.errors.stationId && (
                  <p className={fieldErrorClass}>{fillUpForm.formState.errors.stationId.message}</p>
                )}
              </div>
            )}
            {plateEntryMode === 'scan' ? (
              canViewAllStations && !fillUpForm.watch('stationId') ? (
                <p className="text-center text-[12.5px] text-ink-soft">اختر المحطة أولًا، ثم امسح بطاقة المركبة.</p>
              ) : (
                <QrScanPanel
                  variant="inline"
                  autoStart
                  onResolved={(card) => {
                    setCameraUnavailableHint(false);
                    setScannedCard(card);
                    fillUpForm.setValue('vehicleId', card.vehicle.id, { shouldValidate: true });
                    setSelectedVehicleLabel(formatLicensePlate(card.vehicle.currentPlate));
                    setMobileStep('match');
                  }}
                  onCancel={() => setPlateEntryMode('type')}
                  onCameraUnavailable={() => setCameraUnavailableHint(true)}
                />
              )
            ) : !showManualSearchMobile ? (
              <>
                <p className="mb-3 text-center text-[12px] text-ink-soft">اقرأ رقم اللوحة واكتبه</p>
                <DigitBoxInput
                  groups={PLATE_DIGIT_GROUPS}
                  separator="-"
                  value={plateValue}
                  onChange={(v) => {
                    setPlateValue(v);
                    setPlateBlurred(false);
                  }}
                  onFocusLeave={() => setPlateBlurred(true)}
                  showKeypad
                  data-testid="fillup-mobile-plate-input"
                />
                <label className="mt-3 flex min-h-[48px] items-center justify-center gap-3 text-[16px] font-bold text-ink">
                  <input
                    type="checkbox"
                    data-testid="fillup-mobile-plate-n"
                    checked={plateN}
                    onChange={(e) => {
                      setPlateN(e.target.checked);
                      setPlateBlurred(true);
                    }}
                    className="h-6 w-6"
                  />
                  تنتهي اللوحة بحرف N
                </label>
                {/* Round 12: candidate matches while still typing — the
                    client asked not to require the entire plate before
                    the system finds it. Shown whenever the search has
                    results and there's no exact match yet, independent
                    of plateComplete (see plateLiveCandidates' own
                    comment for why that used to make results vanish
                    mid-typing). */}
                {plateSearchWorthwhile && plateLookupQuery.isFetching && !matchedVehicle && (
                  <p className="mt-3 text-center text-[12px] text-ink-soft">...جارٍ البحث</p>
                )}
                {plateLiveCandidates.length > 0 && (
                  <div className="mt-3 overflow-hidden rounded-sm border border-line" data-testid="fillup-mobile-plate-live-results">
                    <ul>
                      {plateLiveCandidates.map((vehicle) => (
                        <li key={vehicle.id} className="border-b border-line last:border-0">
                          <button
                            type="button"
                            data-testid="fillup-mobile-plate-live-result"
                            // Round 12 (client testing found this — confirmed
                            // the mechanism live): without this, a real
                            // click/tap first fires `mousedown` on this
                            // button, which blurs the currently-focused
                            // digit box BEFORE the `click` event fires.
                            // That blur runs DigitBoxInput's onFocusLeave →
                            // setPlateBlurred(true) → plateComplete flips
                            // true (isAllComplete was already satisfied) →
                            // plateLiveCandidates goes empty → this button
                            // unmounts mid-click, so the click never
                            // reaches it — "the suggestion just
                            // disappears," exactly the client's report.
                            // Same guard VehicleSearchSelect's own dropdown
                            // options already use for identical reasons.
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              fillUpForm.setValue('vehicleId', vehicle.id, { shouldValidate: true });
                              setSelectedVehicleLabel(formatLicensePlate(vehicle.currentPlate));
                              setMobileStep('match');
                            }}
                            className="flex w-full items-center gap-2.5 bg-surface-alt px-3 py-2.5 text-start text-[13px] font-bold text-ink hover:bg-surface"
                          >
                            {/* Round 18: "helps the person make sure it's
                                the same vehicle they're looking for" — the
                                real brand logo (or the generic glyph
                                fallback), same component the vehicle
                                detail/list pages already use. */}
                            <VehicleBrandLogo model={vehicle.model} size={28} />
                            <span className="min-w-0">
                              <LtrText>{formatLicensePlate(vehicle.currentPlate)}</LtrText>
                              <span className="ms-1.5 text-[11px] font-normal text-ink-faint">{vehicle.internalCode}</span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {/* "Not found" only finalizes once the search has
                    genuinely returned zero candidates AND the user has
                    gone idle or filled every box — a real, stable
                    signal (a query that already matched nothing won't
                    start matching from more of the same prefix), unlike
                    the live list above which no longer depends on the
                    idle timer at all. */}
                {/* Registration pivot, phase 2: petrol stations never
                    register vehicles — registration happens only at a
                    registration station. An unknown plate is simply
                    "not registered", with no way to create it here. Phase 4a:
                    during grace and awareness the fill-up can still be
                    recorded against the plate as an unregistered vehicle. */}
                {plateHasNoCandidates && plateComplete && (
                  <NotRegisteredNotice
                    onRecord={
                      (canViewAllStations && !fillUpForm.watch('stationId')) || normalizePlate(plateFull) === null
                        ? undefined
                        : () => {
                            fillUpForm.setValue('vehicleId', '', { shouldValidate: false });
                            setSelectedVehicleLabel('');
                            setUnregisteredPlate(plateFull);
                            setCardRequired(null);
                            setMobileStep('match');
                          }
                    }
                  />
                )}
                {qrScanSupported && (
                  <PillButton
                    variant="secondary"
                    className="mt-4 w-full justify-center"
                    data-testid="fillup-back-to-scan"
                    onClick={() => setPlateEntryMode('scan')}
                  >
                    العودة إلى مسح البطاقة
                  </PillButton>
                )}
                {cameraUnavailableHint && (
                  <p className="mt-1.5 text-center text-[11px] font-bold text-accent-dark">
                    يمكنك تجربة المسح مرة أخرى بعد السماح بإذن الكاميرا من إعدادات الجهاز.
                  </p>
                )}
                <div className="mt-3 text-center">
                  <PrintRegistrationSheetButton stationId={fillUpForm.watch('stationId') || undefined} />
                </div>
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

        {mobileStep === 'match' && vehicleSelected && scannedCard?.vehicle.id === vehicleSelected && (
          <ScanConfirmView
            card={scannedCard}
            onConfirm={() => setMobileStep('fuel')}
            onReject={() => {
              fillUpForm.setValue('vehicleId', '', { shouldValidate: false });
              setScannedCard(null);
              setPlateEntryMode('scan');
              setMobileStep('plate');
            }}
          />
        )}

        {mobileStep === 'match' && !vehicleSelected && unregisteredPlate && (
          <Card className="p-5 text-center" data-testid="fillup-unregistered-confirm">
            <p className="text-[12px] font-bold text-ink-soft">هل هذه هي اللوحة التي أمامك؟</p>
            <p className="mt-3 text-[44px] font-black leading-none text-ink" data-testid="fillup-unregistered-plate">
              <LtrText>{formatLicensePlate(unregisteredPlate)}</LtrText>
            </p>
            <p className="mt-3 inline-block rounded-sm bg-accent-100 px-3 py-1 text-[13px] font-bold text-accent-dark">
              مركبة غير مسجلة
            </p>
            <p className="mt-2 text-[12px] leading-[1.8] text-ink-soft">
              تُسجَّل التعبئة على اللوحة كما كُتبت، وتُحتسب الفواصل والحدود الأسبوعية على هذه اللوحة في هذه البلدية. لا
              يوجد مالك لتطبيق قواعد المالك.
            </p>
            {activeCardRequired && !overrideOn && (
              <CardRequiredPanel
                info={activeCardRequired}
                canOverride={canOverride}
                onOverride={(reason) => {
                  setOverrideReason(reason);
                  setOverrideOn(true);
                  setCardRequired(null);
                }}
              />
            )}
            {overrideOn && <OverrideNotice onCancel={() => setOverrideOn(false)} />}
            <PillButton
              data-testid="fillup-unregistered-confirm-yes"
              className="mt-5 h-14 w-full text-[16px]"
              disabled={!!activeCardRequired && !overrideOn}
              onClick={() => setMobileStep('fuel')}
            >
              نعم، هذه هي اللوحة
            </PillButton>
            <button
              type="button"
              onClick={() => {
                setUnregisteredPlate(null);
                setCardRequired(null);
                setOverrideOn(false);
                setPlateValue('');
                setMobileStep('plate');
              }}
              className="mt-3 block w-full text-center text-[12px] font-bold text-ink-soft"
            >
              تصحيح الرقم
            </button>
          </Card>
        )}

        {mobileStep === 'match' && vehicleSelected && scannedCard?.vehicle.id !== vehicleSelected && (
          <Card className="p-4">
            <VehiclePreviewCard vehicleId={vehicleSelected} idSuffix="-mobile" />
            {activeCardRequired && !overrideOn && (
              <CardRequiredPanel
                info={activeCardRequired}
                canOverride={canOverride}
                onOverride={(reason) => {
                  setOverrideReason(reason);
                  setOverrideOn(true);
                  setCardRequired(null);
                }}
              />
            )}
            {overrideOn && <OverrideNotice onCancel={() => setOverrideOn(false)} />}
            <PillButton
              data-testid="fillup-mobile-continue-to-fuel"
              className="mt-4 h-12 w-full text-[14px]"
              disabled={!!activeCardRequired && !overrideOn}
              onClick={() => setMobileStep('fuel')}
            >
              متابعة إلى الوقود
            </PillButton>
            <button
              type="button"
              onClick={() => {
                fillUpForm.setValue('vehicleId', '', { shouldValidate: false });
                setCardRequired(null);
                setOverrideOn(false);
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
            {fuelMismatch && vehicleFuelType && (
              <div
                role="alert"
                data-testid="fillup-fuel-mismatch"
                className="mt-3 rounded-md bg-accent-100 p-3.5 text-[16px] font-bold leading-[1.7] text-ink"
              >
                تنبيه: هذه المركبة تعمل بـ {VEHICLE_FUEL_TYPE_LABELS_AR[vehicleFuelType]}، والوقود المختار مختلف.
                راجع نوع الوقود قبل المتابعة — يمكنك المتابعة، وسيُسجَّل التنبيه للمشرف.
              </div>
            )}

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
            <form onSubmit={fillUpForm.handleSubmit(onSubmitFillUp, onInvalidFillUp)} className="space-y-3">
              <Card
                data-testid="rule-review-card-mobile"
                className={`p-3.5 ${effectiveRejection ? 'border-t-4 border-danger' : ''}`}
              >
                <RuleReviewChecks
                  checks={rulePreviewQuery.data?.checks}
                  isLoading={rulePreviewQuery.isLoading}
                  isError={rulePreviewQuery.isError}
                  errorMessage={rulePreviewErrorMessage}
                  rejection={effectiveRejection}
                  idSuffix="-mobile"
                />
                {rulePreviewQuery.data && rulePreviewQuery.data.skippedRules.length > 0 && (
                  <p className="mt-3 rounded-sm bg-accent-100 p-3 text-[14px] leading-[1.7] text-accent-dark" data-testid="fillup-skipped-rules">
                    {rulePreviewQuery.data.skippedReason === 'INSTITUTION_OWNER'
                      ? 'مركبة تابعة لجهة أو مؤسسة — تُطبَّق عليها قواعد المركبة وحدها، ولا تُجمع مع مركبات الجهة الأخرى'
                      : 'مركبة غير مسجلة — لا يوجد مالك، فلا تُطبَّق قواعد المالك'}{' '}
                    ({rulePreviewQuery.data.skippedRules.map((r) => RULE_CHECK_LABELS[r]).join('، ')}).
                  </p>
                )}
                {fuelMismatch && vehicleFuelType && (
                  <p role="alert" className="mt-3 rounded-sm bg-accent-100 p-3 text-[14px] font-bold leading-[1.7] text-ink" data-testid="fillup-fuel-mismatch-review">
                    تنبيه: المركبة تعمل بـ {VEHICLE_FUEL_TYPE_LABELS_AR[vehicleFuelType]} والوقود المختار مختلف. سيُسجَّل التنبيه للمشرف.
                  </p>
                )}
                {rulePreviewQuery.data && (rulePreviewQuery.data.disabledRules?.length ?? 0) > 0 && (
                  <p className="mt-3 text-[13px] leading-[1.7] text-ink-soft" data-testid="fillup-disabled-rules">
                    قواعد غير مفعّلة حاليًا ولا تُطبَّق: {rulePreviewQuery.data.disabledRules!.map((r) => RULE_CHECK_LABELS[r]).join('، ')}.
                  </p>
                )}
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

            {effectiveRejection && canRecordException && (
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
              submitError={submitError}
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
// English message in this Arabic UI even then — EXCEPT the one
// machine-checkable marker below, which is deliberately not prose.
// Registration pivot, phase 3: after a card scan, the employee compares the
// card's vehicle with the car in front of them before anything is recorded
// — plate very large, then make/model and colour — and must tap the big
// confirm button. No fill-up is recorded without that tap.
function ScanConfirmView({ card, onConfirm, onReject }: { card: ScannedCard; onConfirm: () => void; onReject: () => void }) {
  const makeLine = [[card.vehicle.make, card.vehicle.model].filter(Boolean).join(' '), card.vehicle.color]
    .filter(Boolean)
    .join(' — ');
  return (
    <Card className="p-5 text-center" data-testid="fillup-scan-confirm">
      <p className="text-[12px] font-bold text-ink-soft">هل هذه هي المركبة التي أمامك؟</p>
      <p className="mt-3 text-[44px] font-black leading-none text-ink" data-testid="fillup-scan-confirm-plate">
        <LtrText>{formatLicensePlate(card.vehicle.currentPlate)}</LtrText>
      </p>
      {makeLine && <p className="mt-3 text-[18px] font-bold text-ink">{makeLine}</p>}
      {card.vehicle.vehicleType && <p className="mt-1 text-[12.5px] text-ink-soft">{card.vehicle.vehicleType.name}</p>}
      {card.needsReissue && (
        <div className="mt-4 rounded-sm bg-accent-100 p-3" data-testid="fillup-scan-needs-reissue">
          <p className="text-[13px] font-bold text-accent-dark">يجب تجديد هذه البطاقة</p>
          <p className="mt-1 text-[12px] text-ink-soft">
            تغيّرت بيانات المركبة منذ طباعتها. التعبئة مسموحة، واطلب من المالك مراجعة مكتب التسجيل لاستلام بطاقة محدَّثة.
          </p>
        </div>
      )}
      <PillButton data-testid="fillup-scan-confirm-yes" className="mt-5 h-14 w-full text-[16px]" onClick={onConfirm}>
        نعم، هذه هي المركبة
      </PillButton>
      <button type="button" onClick={onReject} className="mt-3 block w-full text-center text-[12px] font-bold text-ink-soft">
        ليست هذه المركبة — مسح مرة أخرى
      </button>
    </Card>
  );
}

// Registration pivot, phase 2: what the pump screen shows for a plate the
// registry doesn't have. Shared by the plate step and the manual search.
//
// Phase 4a: during grace and awareness the plate can still be recorded as an
// unregistered vehicle (onRecord); after the deadline the server refuses it
// and the refusal panel takes over. Where onRecord is absent (the manual
// search) the notice is informational only.
export function NotRegisteredNotice({ onRecord }: { onRecord?: () => void }) {
  return (
    <div className="mt-3 rounded-sm bg-accent-100 p-3 text-center" data-testid="fillup-not-registered">
      <p className="text-[13px] font-bold text-accent-dark">هذه المركبة غير مسجّلة في المنظومة</p>
      <p className="mt-1 text-[12px] text-ink-soft">
        لا يمكن تسجيل المركبة من محطة الوقود — يتم ذلك في أحد مكاتب التسجيل.
      </p>
      {onRecord && (
        <PillButton
          data-testid="fillup-record-unregistered"
          className="mt-3 h-11 w-full text-[13px]"
          onClick={onRecord}
        >
          تسجيل التعبئة كمركبة غير مسجلة
        </PillButton>
      )}
    </div>
  );
}

// The server's 409 CARD_REQUIRED refusal (details.registrationStations is the
// live list of active registration stations in the municipality).
export interface CardRequiredInfo {
  cardRequiredFromDate: string | null;
  registrationStations: RegistrationStationInfo[];
}

function cardRequiredFrom(error: AxiosError<unknown>): CardRequiredInfo | null {
  const data = error.response?.data as
    | { message?: string; details?: { cardRequiredFromDate?: string | null; registrationStations?: RegistrationStationInfo[] } }
    | undefined;
  if (error.response?.status !== 409 || data?.message !== 'CARD_REQUIRED') return null;
  return {
    cardRequiredFromDate: data.details?.cardRequiredFromDate ?? null,
    registrationStations: data.details?.registrationStations ?? [],
  };
}

function RegistrationStationList({ stations }: { stations: RegistrationStationInfo[] }) {
  if (stations.length === 0) {
    return <p className="mt-2 text-[12px] text-ink-soft">لا توجد مكاتب تسجيل فعّالة حاليًا — راجع المشرف.</p>;
  }
  return (
    <ul className="mt-2 space-y-2 text-start" data-testid="registration-stations-list">
      {stations.map((st) => (
        <li key={st.id} className="rounded-sm bg-surface p-2.5 text-[12.5px]">
          <p className="font-bold text-ink">{st.name}</p>
          {st.address && <p className="text-ink-soft">{st.address}</p>}
          {st.workingHours && <p className="text-ink-soft">{st.workingHours}</p>}
        </li>
      ))}
    </ul>
  );
}

// After the deadline: no active card, no fill-up. Says so in Arabic and
// lists where to get one. A holder of fillups:emergency_override can waive
// the card (and only the card) with a written reason.
function CardRequiredPanel({
  info,
  canOverride,
  onOverride,
}: {
  info: CardRequiredInfo;
  canOverride: boolean;
  onOverride: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4 rounded-sm border-t-4 border-danger bg-danger-100 p-3 text-start" data-testid="fillup-card-required">
      <p className="text-[14px] font-extrabold text-danger">لا يمكن تعبئة هذه المركبة بدون بطاقة فعّالة</p>
      <p className="mt-1.5 text-[12.5px] leading-[1.8] text-ink">
        يجب على المالك استلام بطاقته من أحد مكاتب التسجيل التالية:
      </p>
      <RegistrationStationList stations={info.registrationStations} />
      {canOverride && (
        <div className="mt-3">
          {!open ? (
            <button
              type="button"
              data-testid="fillup-override-open"
              className="text-[12px] font-bold text-danger underline"
              onClick={() => setOpen(true)}
            >
              تفويض طارئ (للمشرف فقط)
            </button>
          ) : (
            <div data-testid="fillup-override-form">
              <p className="text-[11.5px] leading-[1.7] text-ink-soft">
                يتجاوز التفويض شرط البطاقة فقط — تبقى الفواصل والحدود الأسبوعية سارية، وتُسجَّل التعبئة كاستثناء باسمك.
              </p>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="سبب التفويض (إلزامي)"
                data-testid="fillup-override-reason"
                className="mt-2 w-full rounded-sm bg-surface p-2 text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <PillButton
                variant="danger"
                data-testid="fillup-override-confirm"
                className="mt-2 h-10 w-full text-[13px] !border-0 !bg-danger !text-white"
                disabled={reason.trim().length === 0}
                onClick={() => onOverride(reason.trim())}
              >
                تأكيد التفويض الطارئ
              </PillButton>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OverrideNotice({ onCancel }: { onCancel: () => void }) {
  return (
    <div className="mt-4 rounded-sm bg-danger-100 p-2.5 text-[12px] font-bold text-danger" data-testid="fillup-override-active">
      تفويض طارئ فعّال — شرط البطاقة متجاوَز لهذه التعبئة فقط.
      <button type="button" onClick={onCancel} className="ms-2 underline">
        إلغاء
      </button>
    </div>
  );
}

// Awareness stage, after every fill-up that did not scan a card: tells the
// employee what to say and hand over, with the live station list.
function AwarenessBlock({ awareness }: { awareness: AwarenessNotice }) {
  // The deadline is a calendar day, not an instant — format it as UTC so the
  // viewer's timezone can never shift it by a day.
  const date = new Date(`${awareness.cardRequiredFromDate}T00:00:00Z`).toLocaleDateString('ar', { timeZone: 'UTC' });
  return (
    <div className="mt-4 w-full rounded-sm bg-accent-100 p-4 text-start" data-testid="fillup-awareness">
      <p className="text-[13px] font-bold leading-[1.9] text-accent-dark">
        ابتداءً من {date} لن تتم تعبئة أي مركبة بدون بطاقة. استلم بطاقتك من أحد مكاتب التسجيل التالية:
      </p>
      <RegistrationStationList stations={awareness.registrationStations} />
      <p className="mt-3 text-[13px] font-extrabold text-ink" data-testid="fillup-awareness-flyer">
        سلّم السائق نشرة التوعية
      </p>
    </div>
  );
}

// Registration pivot, phase 1: FillUpsService refuses a fill-up (and its
// rule preview) at a station that isn't in a live municipality — a 409
// with one of these markers, which the employee can't fix themselves, so
// the message says who can.
function stationBlockedMessage(error: AxiosError<{ message?: string | string[] }>): string | null {
  if (error.response?.status !== 409) return null;
  switch (error.response.data?.message) {
    case 'STATION_HAS_NO_MUNICIPALITY':
      return 'لا يمكن تسجيل تعبئة في هذه المحطة لأن البلدية التابعة لها غير محددة. يرجى التواصل مع مسؤول المنظومة لتحديد بلدية المحطة.';
    case 'MUNICIPALITY_NOT_LIVE':
      return 'لا يمكن تسجيل تعبئة في هذه المحطة لأن بلديتها لم تُفعَّل في المنظومة بعد.';
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
  if (stationBlocked) {
    return stationBlocked;
  }
  // Phase 4a plate markers.
  const marker = error.response?.data?.message;
  if (error.response?.status === 400 && marker === 'PLATE_INVALID') {
    return 'رقم اللوحة غير صالح: يجب أن يتكوّن من رمز المدينة ورقم اللوحة يفصل بينهما فاصل.';
  }
  if (error.response?.status === 409 && marker === 'PLATE_AMBIGUOUS') {
    return 'تطابق هذه اللوحة أكثر من مركبة مسجّلة. اطلب من مكتب التسجيل مراجعتها.';
  }
  if (error.response?.status === 409 && marker === 'PLATE_NOW_REGISTERED') {
    return 'سُجِّلت هذه المركبة للتو في مكتب التسجيل. أعد إدخال اللوحة للمتابعة.';
  }
  return 'تعذر إتمام العملية. حاول مرة أخرى.';
}
