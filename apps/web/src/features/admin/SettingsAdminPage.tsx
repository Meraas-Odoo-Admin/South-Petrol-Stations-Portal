import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { Card } from '../../components/design/Card';
import { PillButton } from '../../components/design/PillButton';
import { systemSettingLabel, FUEL_TYPE_LABELS, fuelTypeLabel, USAGE_TYPE_LABELS, usageTypeLabel } from '../../lib/labels';
import { RuleSwitchesCard } from './RuleSwitchesCard';
import type { SystemSettingRow } from './types';

const WEEK_WINDOW_MODES: { value: string; label: string; hint: string }[] = [
  { value: 'rolling', label: 'متجدد', hint: 'آخر 7 أيام من كل تعبئة' },
  { value: 'fixed', label: 'ثابت', hint: 'من يوم محدَّد كل أسبوع' },
];

const WEEK_START_DAYS: { value: string; label: string }[] = [
  { value: '6', label: 'السبت' },
  { value: '0', label: 'الأحد' },
  { value: '1', label: 'الاثنين' },
];

// Keys this page renders as a +/- stepper instead of a raw text field.
// Price settings step by 0.01 (currency), everything else by whole units.
const STEPPER_KEYS: Record<string, { step: number; decimals: number }> = {
  'fillup.max_per_week': { step: 1, decimals: 0 },
  'fillup.min_gap_days': { step: 1, decimals: 0 },
  'fillup.max_per_week_per_owner': { step: 1, decimals: 0 },
  'fillup.min_gap_days_per_owner': { step: 1, decimals: 0 },
  'fillup.max_liters_per_week_per_owner': { step: 10, decimals: 0 },
  'stock.low_threshold_liters': { step: 100, decimals: 0 },
  'fillup.price_per_liter.PETROL_95': { step: 0.01, decimals: 2 },
  'fillup.price_per_liter.DIESEL': { step: 0.01, decimals: 2 },
  'fillup.price_per_liter.KEROSENE': { step: 0.01, decimals: 2 },
};

// Only these two keys have a real, DB-computed before/after impact
// available (see SystemSettingsService.computeWeeklyCapImpact) — every
// other setting shows a plain save button with no banner, rather than a
// generic warning pretending to be a computed one.
const IMPACT_KEYS = new Set(['fillup.max_per_week', 'fillup.max_per_week_per_owner']);

// Round 4 feedback item 1 — full redesign matching design/feedback-2026-08-29/
// 11-design-target-settings-rich.png: +/- steppers with a centered value,
// a real DB-computed before/after impact banner (not generic text), a
// button-group for week-start-day instead of a raw number, and week-window
// mode as two labeled pills instead of the DB value ('rolling'/'fixed')
// shown verbatim — that literal-value leak was 01-settings-week-calc-issue.png's
// specific complaint.
export function SettingsAdminPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: async () => (await apiClient.get<SystemSettingRow[]>('/system-settings')).data,
  });

  const mutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      apiClient.patch(`/system-settings/${key}`, { value }),
    onSuccess: (_res, { key }) => {
      setError(null);
      setSavedKey(key);
      setTimeout(() => setSavedKey((cur) => (cur === key ? null : cur)), 2000);
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
    },
    // The backend's own message body is English technical text — never
    // shown verbatim in this Arabic UI (code-leak audit finding).
    onError: () => setError('تعذر حفظ القيمة.'),
  });

  function stage(key: string, value: string) {
    setEditing((s) => ({ ...s, [key]: value }));
  }

  const byKey = new Map(data?.map((s) => [s.key, s]) ?? []);
  const weekWindowMode = editing['fillup.week_window_mode'] ?? byKey.get('fillup.week_window_mode')?.value;
  const weekStartDay = editing['fillup.week_start_day'] ?? byKey.get('fillup.week_start_day')?.value;

  const numericSettings = data?.filter((s) => STEPPER_KEYS[s.key]) ?? [];
  const priceSettings = numericSettings.filter((s) => s.key.startsWith('fillup.price_per_liter.'));
  const otherNumericSettings = numericSettings.filter((s) => !s.key.startsWith('fillup.price_per_liter.'));

  return (
    <div>
      <div className="mb-4">
        <div className="text-[15px] font-extrabold text-ink">إعدادات المنظومة</div>
        <div className="mt-1 text-[13px] lg:text-[12px] text-ink-soft">تُنفَّذ هذه الأرقام على التعبئات القادمة فقط — لا يوجد أي تخزين مؤقت للقيم.</div>
      </div>

      {isLoading && <p className="text-sm text-ink-soft">...جارٍ التحميل</p>}
      {isError && <p className="text-sm text-danger">تعذر تحميل إعدادات النظام.</p>}
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {data && (
        <div className="flex flex-col gap-4">
          <RuleSwitchesCard settings={data} />
          {byKey.get('fillup.week_window_mode') && (
            <Card className="p-4">
              <span className="text-[13px] lg:text-[12.5px] font-bold text-ink">{systemSettingLabel('fillup.week_window_mode').label}</span>
              <p className="mt-1 text-[13px] lg:text-[12px] leading-[1.6] text-ink-soft">
                {systemSettingLabel('fillup.week_window_mode').description}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {WEEK_WINDOW_MODES.map((mode) => (
                  <button
                    key={mode.value}
                    type="button"
                    onClick={() => stage('fillup.week_window_mode', mode.value)}
                    className={`rounded-sm px-3 py-2.5 text-center ${
                      weekWindowMode === mode.value ? 'border-2 border-primary bg-primary-100' : 'bg-surface-alt'
                    }`}
                  >
                    <div
                      className={`text-[15px] lg:text-[13px] font-extrabold ${
                        weekWindowMode === mode.value ? 'text-primary-dark' : 'text-ink-soft'
                      }`}
                    >
                      {mode.label}
                    </div>
                    <div className="text-[13px] lg:text-[12px] text-ink-faint">{mode.hint}</div>
                  </button>
                ))}
              </div>
              <SaveRow
                settingKey="fillup.week_window_mode"
                dirty={editing['fillup.week_window_mode'] !== undefined && editing['fillup.week_window_mode'] !== byKey.get('fillup.week_window_mode')?.value}
                pending={mutation.isPending}
                saved={savedKey === 'fillup.week_window_mode'}
                onSave={() => mutation.mutate({ key: 'fillup.week_window_mode', value: weekWindowMode! })}
              />
            </Card>
          )}

          {byKey.get('fillup.week_start_day') && (
            <Card className="p-4">
              <span className="text-[13px] lg:text-[12.5px] font-bold text-ink">{systemSettingLabel('fillup.week_start_day').label}</span>
              <p className="mt-1 text-[13px] lg:text-[12px] leading-[1.6] text-ink-soft">
                {systemSettingLabel('fillup.week_start_day').description}
              </p>
              {weekWindowMode !== 'fixed' && (
                <p className="mt-1.5 text-[13px] lg:text-[12px] font-bold text-accent-ink">
                  غير مُستخدم حاليًا — طريقة الحساب الحالية "متجدد" تتجاهل هذا الإعداد.
                </p>
              )}
              <div className="mt-3 grid grid-cols-3 gap-2">
                {WEEK_START_DAYS.map((day) => (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => stage('fillup.week_start_day', day.value)}
                    className={`rounded-sm py-2.5 text-center text-[15px] lg:text-[13px] font-bold ${
                      weekStartDay === day.value ? 'bg-primary text-white' : 'bg-surface-alt text-ink-soft'
                    }`}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
              <SaveRow
                settingKey="fillup.week_start_day"
                dirty={editing['fillup.week_start_day'] !== undefined && editing['fillup.week_start_day'] !== byKey.get('fillup.week_start_day')?.value}
                pending={mutation.isPending}
                saved={savedKey === 'fillup.week_start_day'}
                onSave={() => mutation.mutate({ key: 'fillup.week_start_day', value: weekStartDay! })}
              />
            </Card>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {otherNumericSettings.map((setting) => (
              <StepperSettingCard
                key={setting.key}
                setting={setting}
                staged={editing[setting.key]}
                onStage={(v) => stage(setting.key, v)}
                onSave={(value) => mutation.mutate({ key: setting.key, value })}
                pending={mutation.isPending}
                saved={savedKey === setting.key}
                showImpact={IMPACT_KEYS.has(setting.key)}
              />
            ))}
          </div>

          {priceSettings.length > 0 && (
            <div>
              <p className="mb-2 text-[13px] lg:text-[12.5px] font-bold text-ink">أسعار الوقود (لكل لتر)</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {priceSettings.map((setting) => (
                  <StepperSettingCard
                    key={setting.key}
                    setting={setting}
                    staged={editing[setting.key]}
                    onStage={(v) => stage(setting.key, v)}
                    onSave={(value) => mutation.mutate({ key: setting.key, value })}
                    pending={mutation.isPending}
                    saved={savedKey === setting.key}
                    showImpact={false}
                  />
                ))}
              </div>
            </div>
          )}

          <AddSettingCard
            existingKeys={new Set(data.map((s) => s.key))}
            open={showAddForm}
            onOpen={() => setShowAddForm(true)}
            onClose={() => setShowAddForm(false)}
            onCreated={() => {
              setShowAddForm(false);
              queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
            }}
          />
        </div>
      )}
    </div>
  );
}

function SaveRow({
  settingKey,
  dirty,
  pending,
  saved,
  onSave,
}: {
  settingKey: string;
  dirty: boolean;
  pending: boolean;
  saved: boolean;
  onSave: () => void;
}) {
  return (
    <div className="mt-3 flex items-center gap-2" data-testid={`save-row-${settingKey}`}>
      <PillButton size="sm" disabled={!dirty || pending} onClick={onSave}>
        حفظ
      </PillButton>
      {saved && <span className="text-[13px] lg:text-[12px] font-bold text-ok">تم الحفظ</span>}
    </div>
  );
}

function StepperSettingCard({
  setting,
  staged,
  onStage,
  onSave,
  pending,
  saved,
  showImpact,
}: {
  setting: SystemSettingRow;
  staged: string | undefined;
  onStage: (value: string) => void;
  onSave: (value: string) => void;
  pending: boolean;
  saved: boolean;
  showImpact: boolean;
}) {
  const { label, description } = systemSettingLabel(setting.key);
  const config = STEPPER_KEYS[setting.key] ?? { step: 1, decimals: 0 };
  const current = staged ?? setting.value;
  const dirty = current !== setting.value;
  const numericValue = Number(current);

  const impactQuery = useQuery({
    queryKey: ['admin', 'settings', setting.key, 'impact', current],
    queryFn: async () =>
      (
        await apiClient.get<{ noLongerViolating: number | null }>(`/system-settings/${setting.key}/impact`, {
          params: { value: current },
        })
      ).data,
    enabled: showImpact && dirty && Number.isFinite(numericValue),
  });

  function step(delta: number) {
    const next = Math.max(0, numericValue + delta);
    onStage(next.toFixed(config.decimals));
  }

  return (
    <Card className="p-4">
      <span className="text-[13px] lg:text-[12.5px] font-bold text-ink">{label}</span>
      {description && <p className="mt-1 text-[13px] lg:text-[12px] leading-[1.6] text-ink-soft">{description}</p>}

      <div className="mt-3 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => step(config.step)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-[18px] font-bold text-white"
          aria-label="زيادة"
        >
          +
        </button>
        <span className="min-w-[64px] text-center font-mono text-[24px] font-extrabold text-ink" dir="ltr">
          {current}
        </span>
        <button
          type="button"
          onClick={() => step(-config.step)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-alt text-[18px] font-bold text-ink-soft"
          aria-label="إنقاص"
        >
          −
        </button>
      </div>

      {showImpact && dirty && impactQuery.data?.noLongerViolating != null && (
        <div className="mt-3 rounded-sm bg-accent-100 px-3 py-2.5 text-[13px] lg:text-[12px] font-semibold leading-[1.7] text-accent-ink">
          القيمة الحالية {setting.value}، رفعها إلى {current} يعني أن {impactQuery.data.noLongerViolating} تعبئة كانت
          ستحتاج استثناءً بسبب هذه القاعدة لن تحتاجه بعد الآن.
        </div>
      )}

      <div className="mt-3 flex items-center justify-center gap-2">
        <PillButton size="sm" disabled={!dirty || pending} onClick={() => onSave(current)}>
          حفظ
        </PillButton>
        {saved && <span className="text-[13px] lg:text-[12px] font-bold text-ok">تم الحفظ</span>}
      </div>
    </Card>
  );
}

// Round 5 feedback item 6: the previous version of this card was a plain
// free-text key/value/description form — the client flagged it as too
// close to raw config entry for their (non-technical) users. Every
// genuinely NEW setting this app plausibly needs falls into one of two
// concrete shapes — a per-fuel-type price, or a per-usage-type quantity
// cap (the exact thing docs/OPEN_ITEMS.md #22 flags as not yet built) —
// so those are offered as real dropdown+stepper templates, matching the
// visual language the rest of this page already established
// (StepperSettingCard's +/- buttons, not a bare number input). A genuinely
// novel key that fits neither shape still has an escape hatch
// ("إعداد آخر") but it's the last option, not the default, and still
// carries the same before/after ineffectiveness warning as before.
type TemplateKind = 'fuel_price' | 'usage_max_liters' | 'custom';

const TEMPLATE_LABELS: Record<TemplateKind, string> = {
  fuel_price: 'سعر وقود جديد (لكل لتر)',
  usage_max_liters: 'حد أقصى لكمية التعبئة الواحدة — حسب نوع الاستخدام',
  custom: 'إعداد رقمي آخر (متقدّم)',
};

function AddSettingCard({
  existingKeys,
  open,
  onOpen,
  onClose,
  onCreated,
}: {
  existingKeys: Set<string>;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onCreated: () => void;
}) {
  const fuelTypeOptions = Object.keys(FUEL_TYPE_LABELS).filter(
    (ft) => !existingKeys.has(`fillup.price_per_liter.${ft}`),
  );
  const usageTypeOptions = Object.keys(USAGE_TYPE_LABELS).filter(
    (ut) => !existingKeys.has(`fillup.max_liters_per_fillup.${ut}`),
  );
  const availableKinds: TemplateKind[] = [
    ...(fuelTypeOptions.length > 0 ? (['fuel_price'] as const) : []),
    ...(usageTypeOptions.length > 0 ? (['usage_max_liters'] as const) : []),
    'custom',
  ];

  const [kind, setKind] = useState<TemplateKind>(availableKinds[0] ?? 'custom');
  const [fuelType, setFuelType] = useState(fuelTypeOptions[0] ?? '');
  const [usageType, setUsageType] = useState(usageTypeOptions[0] ?? '');
  const [numericValue, setNumericValue] = useState(0);
  const [customKey, setCustomKey] = useState('');
  const [customValue, setCustomValue] = useState('');
  const [customDescription, setCustomDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const step = kind === 'fuel_price' ? 0.01 : 10;
  const decimals = kind === 'fuel_price' ? 2 : 0;

  const derivedKey =
    kind === 'fuel_price'
      ? `fillup.price_per_liter.${fuelType}`
      : kind === 'usage_max_liters'
        ? `fillup.max_liters_per_fillup.${usageType}`
        : customKey.trim();
  const derivedValue = kind === 'custom' ? customValue.trim() : numericValue.toFixed(decimals);
  const derivedDescription =
    kind === 'fuel_price'
      ? `سعر لتر ${fuelTypeLabel(fuelType)} — أُضيف من شاشة الإعدادات.`
      : kind === 'usage_max_liters'
        ? `الحد الأقصى لكمية التعبئة الواحدة لمركبات ${usageTypeLabel(usageType)} — أُضيف من شاشة الإعدادات؛ يتطلب ربطًا في محرك القواعد قبل أن يصبح فعّالًا (انظر التنبيه أدناه).`
        : customDescription.trim() || undefined;

  const mutation = useMutation({
    mutationFn: () =>
      apiClient.post('/system-settings', { key: derivedKey, value: derivedValue, description: derivedDescription }),
    onSuccess: () => {
      setNumericValue(0);
      setCustomKey('');
      setCustomValue('');
      setCustomDescription('');
      onCreated();
    },
    onError: () => setError('تعذر إضافة الإعداد — تحقّق من عدم تكرار المفتاح.'),
  });

  const inputClass =
    'h-10 w-full rounded-sm bg-surface-alt px-3 text-[15px] lg:text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent';

  if (!open) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="flex h-16 w-full items-center justify-center rounded-md border-2 border-dashed border-line text-[15px] lg:text-[13px] font-bold text-ink-soft hover:border-accent hover:text-accent-ink"
      >
        + إضافة قاعدة رقمية جديدة
      </button>
    );
  }

  const canSave =
    kind === 'fuel_price'
      ? !!fuelType
      : kind === 'usage_max_liters'
        ? !!usageType
        : !!customKey.trim() && !!customValue.trim();

  return (
    <Card className="p-4">
      <p className="mb-3 text-[13px] lg:text-[12.5px] font-bold text-ink">إضافة قاعدة رقمية جديدة</p>

      <div className="mb-3">
        <label className="mb-1 block text-[13px] lg:text-[12px] font-bold text-ink-soft">نوع القاعدة</label>
        <select value={kind} onChange={(e) => setKind(e.target.value as TemplateKind)} className={inputClass}>
          {availableKinds.map((k) => (
            <option key={k} value={k}>
              {TEMPLATE_LABELS[k]}
            </option>
          ))}
        </select>
      </div>

      {kind === 'fuel_price' && (
        <div className="mb-3">
          <label className="mb-1 block text-[13px] lg:text-[12px] font-bold text-ink-soft">نوع الوقود</label>
          <select value={fuelType} onChange={(e) => setFuelType(e.target.value)} className={inputClass}>
            {fuelTypeOptions.map((ft) => (
              <option key={ft} value={ft}>
                {fuelTypeLabel(ft)}
              </option>
            ))}
          </select>
        </div>
      )}

      {kind === 'usage_max_liters' && (
        <div className="mb-3">
          <label className="mb-1 block text-[13px] lg:text-[12px] font-bold text-ink-soft">نوع استخدام المركبة</label>
          <select value={usageType} onChange={(e) => setUsageType(e.target.value)} className={inputClass}>
            {usageTypeOptions.map((ut) => (
              <option key={ut} value={ut}>
                {usageTypeLabel(ut)}
              </option>
            ))}
          </select>
        </div>
      )}

      {kind !== 'custom' ? (
        <div className="mb-3">
          <label className="mb-1 block text-[13px] lg:text-[12px] font-bold text-ink-soft">القيمة</label>
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setNumericValue((v) => Math.max(0, v + step))}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-[18px] font-bold text-white"
              aria-label="زيادة"
            >
              +
            </button>
            <span className="min-w-[64px] text-center font-mono text-[22px] font-extrabold text-ink" dir="ltr">
              {numericValue.toFixed(decimals)}
            </span>
            <button
              type="button"
              onClick={() => setNumericValue((v) => Math.max(0, v - step))}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-alt text-[18px] font-bold text-ink-soft"
              aria-label="إنقاص"
            >
              −
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          <p className="rounded-sm bg-accent-100 px-3 py-2 text-[13px] lg:text-[12px] leading-[1.6] text-accent-ink">
            هذا المسار مخصَّص لحالات لا يغطّيها القالبان أعلاه — يتطلب معرفة بصيغة مفاتيح الإعدادات.
          </p>
          <div>
            <label className="mb-1 block text-[13px] lg:text-[12px] font-bold text-ink-soft">المفتاح (مثال: fillup.new_rule)</label>
            <input value={customKey} onChange={(e) => setCustomKey(e.target.value)} dir="ltr" className={inputClass} />
          </div>
          <div>
            <label className="mb-1 block text-[13px] lg:text-[12px] font-bold text-ink-soft">القيمة</label>
            <input value={customValue} onChange={(e) => setCustomValue(e.target.value)} dir="ltr" className={inputClass} />
          </div>
          <div>
            <label className="mb-1 block text-[13px] lg:text-[12px] font-bold text-ink-soft">الوصف (اختياري)</label>
            <input value={customDescription} onChange={(e) => setCustomDescription(e.target.value)} className={inputClass} />
          </div>
        </div>
      )}

      <p className="mt-3 rounded-sm bg-accent-100 px-3 py-2 text-[13px] lg:text-[12px] leading-[1.6] text-accent-ink">
        تنبيه: هذا يُنشئ الصف في قاعدة البيانات فقط — لا يبدأ بالتأثير على قواعد التعبئة إلا بعد ربطه برمجيًا في محرك
        القواعد (ليس تلقائيًا).
      </p>

      {error && <p className="mt-2 text-[13px] lg:text-[12px] text-danger">{error}</p>}
      <div className="mt-3 flex gap-2">
        <PillButton
          size="sm"
          disabled={!canSave || mutation.isPending}
          onClick={() => {
            setError(null);
            mutation.mutate();
          }}
        >
          {mutation.isPending ? '...جارٍ الحفظ' : 'حفظ الإعداد'}
        </PillButton>
        <PillButton size="sm" variant="ghost" onClick={onClose}>
          إلغاء
        </PillButton>
      </div>
    </Card>
  );
}
