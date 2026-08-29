import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { isAxiosError, type AxiosError } from 'axios';
import type {
  CreateFillUpRequest,
  CreateFillUpResult,
  ExceptionTypeOption,
  RuleFailureReason,
  RuleTriggerDetail,
} from '@fuel-tracking/shared-types';
import { apiClient } from '../../lib/apiClient';
import { StationSelect } from '../../components/StationSelect';
import { LtrText } from '../../components/LtrText';
import { formatLicensePlate } from '../../lib/libyanFormats';
import { fuelTypeLabel } from '../../lib/labels';
import { useAuth } from '../auth/AuthProvider';
import { useStations } from '../stations/useStations';
import { Card } from '../../components/design/Card';
import { PillButton } from '../../components/design/PillButton';
import { VehicleSearchSelect } from './VehicleSearchSelect';
import { DriverSearchSelect } from './DriverSearchSelect';
import { DriverCreateForm } from '../drivers/DriverCreateForm';
import { VehicleCreateForm } from '../vehicles/VehicleCreateForm';
import { RULE_VIOLATION_MESSAGES } from './ruleViolationMessages';

// Item 8: name the specific prior fill-up that tripped a driver-level rule
// (it can be on a different vehicle than the one being submitted, which
// otherwise looks like a false positive) — shown wherever a rule
// violation is shown, inline here and on the exception-approval screen.
export function TriggerDetail({ trigger }: { trigger: RuleTriggerDetail | null }) {
  if (!trigger) {
    return null;
  }
  return (
    <p className="text-[12px] text-ink-soft">
      بسبب تعبئة سابقة لنفس السائق على المركبة{' '}
      <LtrText>
        {trigger.vehicleCurrentPlate ? formatLicensePlate(trigger.vehicleCurrentPlate) : trigger.vehicleInternalCode}
      </LtrText>{' '}
      بتاريخ <LtrText>{new Date(trigger.occurredAt).toLocaleString('ar')}</LtrText>
    </p>
  );
}

const QUANTITY_QUICK_PICKS = ['20', '40', '60'];

const FUEL_TYPES: { value: CreateFillUpRequest['fuelType']; label: string }[] = [
  { value: 'PETROL_95', label: 'بنزين 95' },
  { value: 'DIESEL', label: 'ديزل' },
  { value: 'KEROSENE', label: 'كاز' },
];

const fillUpSchema = z.object({
  stationId: z.string().min(1, 'اختر المحطة'),
  vehicleId: z.string().min(1, 'اختر المركبة'),
  driverId: z.string().min(1, 'اختر السائق'),
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
// (vehicleId/driverId/stationId), not the display labels the confirmation
// screen needs (artboard 4d's summary card: vehicle+plate, driver, fuel+
// quantity, time).
interface ConfirmationSummary {
  vehicleLabel: string;
  driverLabel: string;
  stationName: string;
  fuelType: CreateFillUpRequest['fuelType'];
  quantityLiters: string;
  occurredAt: string;
  isException: boolean;
}

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

  const [rejection, setRejection] = useState<{ reason: RuleFailureReason; trigger: RuleTriggerDetail | null } | null>(
    null,
  );
  const [showNewDriverForm, setShowNewDriverForm] = useState(false);
  const [newlyCreatedDriverLabel, setNewlyCreatedDriverLabel] = useState<string | undefined>(undefined);
  const [showNewVehicleForm, setShowNewVehicleForm] = useState(false);
  const [newlyCreatedVehicleLabel, setNewlyCreatedVehicleLabel] = useState<string | undefined>(undefined);
  const canCreateVehicle = hasPermission('vehicles:manage');
  // Display labels for the currently-selected vehicle/driver — the form
  // only ever stores their IDs (fillUpForm's vehicleId/driverId), and
  // FillUpTransactionRaw's response doesn't carry names either, so these
  // are the only source for the 4d confirmation screen's summary card.
  const [selectedVehicleLabel, setSelectedVehicleLabel] = useState('');
  const [selectedDriverLabel, setSelectedDriverLabel] = useState('');
  const [success, setSuccess] = useState<ConfirmationSummary | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const idempotencyKeyRef = useRef(newIdempotencyKey());

  const fillUpForm = useForm<FillUpFormValues>({
    resolver: zodResolver(fillUpSchema),
    defaultValues: {
      stationId: canViewAllStations ? '' : (ownStation?.stationId ?? ''),
      vehicleId: '',
      driverId: '',
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

  const selectedExceptionTypeId = exceptionForm.watch('exceptionTypeId');
  const selectedExceptionType = exceptionTypes?.find((t) => t.id === selectedExceptionTypeId) ?? null;

  function resetAll() {
    fillUpForm.reset({
      stationId: canViewAllStations ? '' : (ownStation?.stationId ?? ''),
      vehicleId: '',
      driverId: '',
      fuelType: 'PETROL_95',
      quantityLiters: '',
    });
    exceptionForm.reset({ exceptionTypeId: '', reason: '', proofReference: '' });
    setRejection(null);
    setSuccess(null);
    setSelectedVehicleLabel('');
    setSelectedDriverLabel('');
    setNewlyCreatedVehicleLabel(undefined);
    setNewlyCreatedDriverLabel(undefined);
    idempotencyKeyRef.current = newIdempotencyKey();
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
      driverId: values.driverId,
      fuelType: values.fuelType,
      quantityLiters: Number(values.quantityLiters),
    };
  }

  function buildConfirmationSummary(values: FillUpFormValues, isException: boolean): ConfirmationSummary {
    const stationName = stations?.find((s) => s.id === values.stationId)?.name ?? '';
    return {
      vehicleLabel: selectedVehicleLabel,
      driverLabel: selectedDriverLabel,
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
      <div className="mx-auto flex max-w-xl flex-col items-center py-6 text-center" data-testid="fillup-success">
        <div className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-ok-100">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#1f7a5c" strokeWidth="2.6">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>
        <h1 className="mt-6 text-[24px] font-black text-ink">تم تسجيل التعبئة</h1>
        <p className="mt-2.5 text-[13px] leading-[1.8] text-ink-soft">
          {success.stationName ? `سُجّلت باسمك في ${success.stationName}، ` : 'سُجّلت باسمك، '}
          ولا يمكن تعديلها أو حذفها بعد الآن.
          {success.isException && ' (كاستثناء، بانتظار اعتماد المشرف)'}
        </p>

        <Card className="mt-6 w-full p-4.5 text-start">
          <div className="flex justify-between border-b border-surface-alt py-2.5">
            <span className="text-[12.5px] text-ink-soft">المركبة</span>
            <span className="text-[12.5px] font-bold text-ink">
              <LtrText>{success.vehicleLabel}</LtrText>
            </span>
          </div>
          <div className="flex justify-between border-b border-surface-alt py-2.5">
            <span className="text-[12.5px] text-ink-soft">السائق</span>
            <span className="text-[12.5px] font-bold text-ink">{success.driverLabel}</span>
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
          <PillButton onClick={resetAll} className="h-13 w-full text-[15px]">
            تعبئة جديدة
          </PillButton>
          {canViewReports && (
            <PillButton variant="ghost" onClick={() => navigate('/reports/daily')} className="h-11 w-full text-[13px]">
              عرض تعبئات اليوم
            </PillButton>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
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
              onCreated={(vehicle) => {
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
              />
              {canCreateVehicle && (
                <button
                  type="button"
                  onClick={() => setShowNewVehicleForm(true)}
                  className="mt-1.5 text-[11.5px] font-bold text-accent-dark"
                >
                  مركبة جديدة؟ إضافة مركبة جديدة
                </button>
              )}
            </>
          )}
          {fillUpForm.formState.errors.vehicleId && (
            <p className={fieldErrorClass}>{fillUpForm.formState.errors.vehicleId.message}</p>
          )}
        </Card>

        <Card className="p-3.5">
          <label className={fieldLabelClass}>السائق</label>
          {showNewDriverForm ? (
            <DriverCreateForm
              onCreated={(driver) => {
                fillUpForm.setValue('driverId', driver.id, { shouldValidate: true });
                setNewlyCreatedDriverLabel(driver.fullName);
                setSelectedDriverLabel(driver.fullName);
                setShowNewDriverForm(false);
              }}
              onCancel={() => setShowNewDriverForm(false)}
            />
          ) : (
            <>
              <DriverSearchSelect
                value={fillUpForm.watch('driverId')}
                onChange={(id, label) => {
                  fillUpForm.setValue('driverId', id, { shouldValidate: true });
                  setSelectedDriverLabel(label);
                }}
                initialLabel={newlyCreatedDriverLabel}
              />
              {hasPermission('drivers:create') && (
                <button
                  type="button"
                  onClick={() => setShowNewDriverForm(true)}
                  className="mt-1.5 text-[11.5px] font-bold text-accent-dark"
                >
                  السائق غير موجود؟ إضافة سائق جديد
                </button>
              )}
            </>
          )}
          {fillUpForm.formState.errors.driverId && (
            <p className={fieldErrorClass}>{fillUpForm.formState.errors.driverId.message}</p>
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
                  onClick={() => fillUpForm.setValue('fuelType', ft.value, { shouldValidate: true })}
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
          <label className={fieldLabelClass}>الكمية (لتر)</label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              step="0.01"
              {...fillUpForm.register('quantityLiters')}
              dir="ltr"
              className="w-24 rounded-sm bg-transparent font-mono text-[30px] font-extrabold text-primary-dark focus:outline-none"
            />
            <div className="flex flex-1 justify-end gap-1.5">
              {QUANTITY_QUICK_PICKS.map((q) => {
                const selected = fillUpForm.watch('quantityLiters') === q;
                return (
                  <button
                    key={q}
                    type="button"
                    onClick={() => fillUpForm.setValue('quantityLiters', q, { shouldValidate: true })}
                    className={`h-10 w-12 rounded-sm font-mono text-[13px] font-bold ${
                      selected ? 'bg-primary text-white' : 'bg-surface-alt text-ink-soft'
                    }`}
                  >
                    {q}
                  </button>
                );
              })}
            </div>
          </div>
          {fillUpForm.formState.errors.quantityLiters && (
            <p className={fieldErrorClass}>{fillUpForm.formState.errors.quantityLiters.message}</p>
          )}
        </Card>

        {submitError && <p className="text-[13px] text-danger">{submitError}</p>}

        <PillButton
          type="submit"
          data-testid="fillup-submit"
          disabled={fillUpForm.formState.isSubmitting}
          size="md"
          className="h-14 w-full text-[15px]"
        >
          {fillUpForm.formState.isSubmitting ? '...جارٍ التسجيل' : 'تسجيل التعبئة'}
        </PillButton>
        <p className="text-center text-[11px] text-ink-faint">تُفحص القواعد عند التسجيل</p>
      </form>

      {rejection && (
        <Card data-testid="fillup-rejection" className="mt-4 border-t-4 border-danger p-5">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-danger-100 px-3 py-1.5">
            <span className="h-2 w-2 rounded-full bg-danger" />
            <span className="text-[11px] font-bold text-danger-dark">تعذر تسجيل التعبئة</span>
          </div>
          <p className="text-[16px] font-bold text-ink">
            {RULE_VIOLATION_MESSAGES[rejection.reason] ?? rejection.reason}
          </p>
          {rejection.trigger && (
            <div className="mt-2 rounded-sm bg-surface-alt px-3.5 py-2.5">
              <TriggerDetail trigger={rejection.trigger} />
            </div>
          )}

          <p className="mb-3 mt-4 text-[13px] font-bold text-ink">تسجيلها كاستثناء</p>

          <form onSubmit={exceptionForm.handleSubmit(onSubmitException)} className="space-y-3">
            <div>
              <label className={fieldLabelClass}>نوع الاستثناء</label>
              <select
                data-testid="exception-type-select"
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
                data-testid="exception-reason"
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
                  data-testid="exception-proof"
                  {...exceptionForm.register('proofReference', {
                    validate: (value) =>
                      !!value?.trim() || 'الإثبات مطلوب لهذا النوع من الاستثناءات',
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
                data-testid="exception-submit"
                variant="danger"
                disabled={exceptionForm.formState.isSubmitting}
                className="!bg-danger !text-white !border-0 flex-1"
              >
                {exceptionForm.formState.isSubmitting ? '...جارٍ الإرسال' : 'تسجيل كاستثناء'}
              </PillButton>
            </div>
          </form>
        </Card>
      )}
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
