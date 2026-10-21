import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { Card, CardHeader } from '../../components/design/Card';
import { PillButton } from '../../components/design/PillButton';
import { SkeletonRows } from '../../components/design/Skeleton';
import { settingUnitWord, settingValueText, systemSettingLabel } from '../../lib/labels';
import { Notice } from '../users/parts';
import { RuleSwitchesCard } from './RuleSwitchesCard';
import { GlobalExceptionSettingsCard } from './GlobalExceptionSettingsCard';
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

// Keys this page renders as a +/- stepper. Price settings step by 0.01
// (currency), everything else by whole units.
const STEPPER_KEYS: Record<string, { step: number; decimals: number }> = {
  'fillup.max_per_week': { step: 1, decimals: 0 },
  'fillup.min_gap_days': { step: 1, decimals: 0 },
  'fillup.max_per_week_per_owner': { step: 1, decimals: 0 },
  'fillup.min_gap_days_per_owner': { step: 1, decimals: 0 },
  'fillup.max_liters_per_week_per_owner': { step: 10, decimals: 0 },
  'registration.max_vehicles_per_owner': { step: 1, decimals: 0 },
  'stock.low_threshold_liters': { step: 100, decimals: 0 },
  'fillup.fixed_amount_lyd': { step: 0.5, decimals: 2 },
  'fillup.price_per_liter.PETROL_95': { step: 0.01, decimals: 2 },
  'fillup.price_per_liter.DIESEL': { step: 0.01, decimals: 2 },
  'fillup.price_per_liter.KEROSENE': { step: 0.01, decimals: 2 },
};

// Only these two keys have a real, DB-computed before/after impact
// available (see SystemSettingsService.computeWeeklyCapImpact) — every
// other setting shows a plain save button with no banner, rather than a
// generic warning pretending to be a computed one.
const IMPACT_KEYS = new Set(['fillup.max_per_week', 'fillup.max_per_week_per_owner']);

// After review (19 Oct 2026): «ضوابط المالك» — what one owner may have and
// fill up across all their vehicles, together in one section.
const OWNER_KEYS = [
  'registration.max_vehicles_per_owner',
  'fillup.max_per_week_per_owner',
  'fillup.min_gap_days_per_owner',
  'fillup.max_liters_per_week_per_owner',
];

// «الإعدادات وقواعد التعبئة». Phase 7 (section 6), clear and simple:
//  - no «+ إضافة قاعدة رقمية جديدة»: adding raw numeric rules was too
//    technical for the people who use this page (rows added before stay in
//    the database, untouched);
//  - every number is shown with its unit, beside the figure and in a sentence
//    («الحالي: 3 تعبئات في الأسبوع»);
//  - no «رقم مبدئي بانتظار تأكيد العميل» notes (listed in OPEN_ITEMS #66);
//  - a setting that does not apply is not shown: «يوم بداية الأسبوع» only
//    appears when the week is counted from a fixed day;
//  - each card's «حفظ» is the teal confirm button, and says why it is
//    disabled while nothing has changed.
export function SettingsAdminPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: async () => (await apiClient.get<SystemSettingRow[]>('/system-settings')).data,
  });

  const mutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) => apiClient.patch(`/system-settings/${key}`, { value }),
    onSuccess: (_res, { key }) => {
      setError(null);
      setSavedKey(key);
      setEditing((s) => {
        const next = { ...s };
        delete next[key];
        return next;
      });
      setTimeout(() => setSavedKey((cur) => (cur === key ? null : cur)), 2500);
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
    },
    // The backend's own message body is English technical text — never
    // shown verbatim in this Arabic UI (code-leak audit finding).
    onError: () => setError('تعذر حفظ القيمة. تأكد من الاتصال ثم أعد المحاولة.'),
  });

  function stage(key: string, value: string) {
    setEditing((s) => ({ ...s, [key]: value }));
  }

  const byKey = new Map(data?.map((s) => [s.key, s]) ?? []);
  const weekWindowMode = editing['fillup.week_window_mode'] ?? byKey.get('fillup.week_window_mode')?.value;
  const savedWeekWindowMode = byKey.get('fillup.week_window_mode')?.value;
  const weekStartDay = editing['fillup.week_start_day'] ?? byKey.get('fillup.week_start_day')?.value;

  const numericSettings = data?.filter((s) => STEPPER_KEYS[s.key]) ?? [];
  // After review (21 Oct 2026): the fixed amount of every fill-up sits with the prices.
  const isPrice = (key: string) => key.startsWith('fillup.price_per_liter.') || key === 'fillup.fixed_amount_lyd';
  const priceSettings = numericSettings.filter((s) => isPrice(s.key)).sort((a, b) => Number(b.key === 'fillup.fixed_amount_lyd') - Number(a.key === 'fillup.fixed_amount_lyd'));
  const ownerSettings = OWNER_KEYS.map((key) => numericSettings.find((s) => s.key === key)).filter((s): s is SystemSettingRow => Boolean(s));
  const otherNumericSettings = numericSettings.filter((s) => !isPrice(s.key) && !OWNER_KEYS.includes(s.key));
  const isDirty = (key: string) => editing[key] !== undefined && editing[key] !== byKey.get(key)?.value;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[18px] font-extrabold text-primary-dark lg:text-[15px]">إعدادات المنظومة</h2>
        <p className="mt-1 text-[15px] text-ink-soft lg:text-[13px]">تُطبَّق هذه القيم على التعبئات القادمة فور حفظها.</p>
      </div>

      {isLoading && (
        <Card>
          <SkeletonRows rows={6} label="جارٍ تحميل الإعدادات" />
        </Card>
      )}
      {isError && <Notice kind="error">تعذر تحميل إعدادات المنظومة. أعد تحميل الصفحة.</Notice>}
      {error && <Notice kind="error">{error}</Notice>}

      {data && (
        <div className="flex flex-col gap-4">
          <RuleSwitchesCard settings={data} />
          <GlobalExceptionSettingsCard />

          {byKey.get('fillup.week_window_mode') && (
            <SettingCard settingKey="fillup.week_window_mode">
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={systemSettingLabel('fillup.week_window_mode').label}>
                {WEEK_WINDOW_MODES.map((mode) => {
                  const chosen = weekWindowMode === mode.value;
                  return (
                    <button
                      key={mode.value}
                      type="button"
                      role="radio"
                      aria-checked={chosen}
                      onClick={() => stage('fillup.week_window_mode', mode.value)}
                      className={`min-h-[56px] rounded-sm border-2 px-3 py-2.5 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-dark ${
                        chosen ? 'border-primary bg-primary-100' : 'border-line-soft bg-surface hover:border-primary/50'
                      }`}
                    >
                      <div className={`text-[16px] font-extrabold lg:text-[14px] ${chosen ? 'text-primary-dark' : 'text-ink'}`}>
                        {chosen && <span aria-hidden="true">✓ </span>}
                        {mode.label}
                      </div>
                      <div className="text-[14px] text-ink-soft lg:text-[12px]">{mode.hint}</div>
                    </button>
                  );
                })}
              </div>
              <SaveRow
                settingKey="fillup.week_window_mode"
                dirty={isDirty('fillup.week_window_mode')}
                pending={mutation.isPending}
                saved={savedKey === 'fillup.week_window_mode'}
                onSave={() => mutation.mutate({ key: 'fillup.week_window_mode', value: weekWindowMode! })}
              />
            </SettingCard>
          )}

          {/* Shown only when it is used: a «ثابت» week (saved, or being chosen now). */}
          {byKey.get('fillup.week_start_day') && (weekWindowMode === 'fixed' || savedWeekWindowMode === 'fixed') && (
            <SettingCard settingKey="fillup.week_start_day">
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={systemSettingLabel('fillup.week_start_day').label}>
                {WEEK_START_DAYS.map((day) => {
                  const chosen = weekStartDay === day.value;
                  return (
                    <button
                      key={day.value}
                      type="button"
                      role="radio"
                      aria-checked={chosen}
                      onClick={() => stage('fillup.week_start_day', day.value)}
                      className={`min-h-[48px] rounded-sm border-2 py-2.5 text-center text-[16px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-dark lg:text-[14px] ${
                        chosen ? 'border-primary bg-primary text-white' : 'border-line-soft bg-surface text-ink hover:border-primary/50'
                      }`}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
              <SaveRow
                settingKey="fillup.week_start_day"
                dirty={isDirty('fillup.week_start_day')}
                pending={mutation.isPending}
                saved={savedKey === 'fillup.week_start_day'}
                onSave={() => mutation.mutate({ key: 'fillup.week_start_day', value: weekStartDay! })}
              />
            </SettingCard>
          )}

          <section aria-labelledby="settings-limits" className="space-y-3">
            <h3 id="settings-limits" className="text-[17px] font-extrabold text-primary-dark lg:text-[14px]">
              حدود التعبئة والتنبيهات
            </h3>
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
          </section>

          {ownerSettings.length > 0 && (
            <section aria-labelledby="settings-owner" className="space-y-3" data-testid="settings-owner">
              <h3 id="settings-owner" className="text-[17px] font-extrabold text-primary-dark lg:text-[14px]">
                ضوابط المالك
              </h3>
              <p className="text-[15px] text-ink-soft lg:text-[13px]">
                لكل مالك على جميع مركباته معًا. قواعد التعبئة الثلاث تُطبَّق فقط عندما تكون مفعّلة في «قواعد التعبئة» أعلاه.
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {ownerSettings.map((setting) => (
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
            </section>
          )}

          {priceSettings.length > 0 && (
            <section aria-labelledby="settings-prices" className="space-y-3">
              <h3 id="settings-prices" className="text-[17px] font-extrabold text-primary-dark lg:text-[14px]">
                مبلغ التعبئة وأسعار الوقود
              </h3>
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
            </section>
          )}
        </div>
      )}
    </div>
  );
}

// A setting card: its name on the teal band, what it does under it.
function SettingCard({ settingKey, children }: { settingKey: string; children: ReactNode }) {
  const { label, description } = systemSettingLabel(settingKey);
  return (
    <Card data-testid={`setting-${settingKey}`}>
      <CardHeader title={label} />
      <div className="p-4">
        {description && <p className="mb-3 text-[15px] leading-[1.7] text-ink-soft lg:text-[13px]">{description}</p>}
        {children}
      </div>
    </Card>
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
    <div className="mt-4 flex flex-wrap items-center gap-3" data-testid={`save-row-${settingKey}`}>
      <PillButton variant="brand" size="sm" disabled={!dirty || pending} onClick={onSave}>
        حفظ
      </PillButton>
      {saved ? (
        <span role="status" className="text-[14px] font-bold text-ok lg:text-[12px]">
          ✓ تم الحفظ
        </span>
      ) : (
        !dirty && <span className="text-[14px] text-ink-soft lg:text-[12px]">غيّر القيمة أولًا ليُفعَّل الحفظ.</span>
      )}
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
  const config = STEPPER_KEYS[setting.key] ?? { step: 1, decimals: 0 };
  const current = staged ?? setting.value;
  const dirty = current !== setting.value;
  const numericValue = Number(current);
  const unitWord = settingUnitWord(setting.key);

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
    <SettingCard settingKey={setting.key}>
      <div className="flex items-center justify-center gap-3">
        <PillButton variant="secondary" className="!h-11 !w-11 !px-0 text-[20px]" onClick={() => step(config.step)} aria-label="زيادة">
          +
        </PillButton>
        <div className="min-w-[96px] text-center">
          {/* Typed, or stepped with + / − (a price moves 0.01 a tap). */}
          <input
            dir="ltr"
            inputMode={config.decimals > 0 ? 'decimal' : 'numeric'}
            data-figure="large"
            value={current}
            onChange={(e) => onStage(e.target.value.replace(/[^\d.]/g, ''))}
            aria-label={`${systemSettingLabel(setting.key).label}${unitWord ? ` (${unitWord})` : ''}`}
            data-testid={`setting-input-${setting.key}`}
            className="w-28 rounded-sm bg-surface-alt px-2 py-1 text-center font-mono text-[28px] font-extrabold leading-none text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-dark"
          />
          {unitWord && <p className="mt-1 text-[14px] font-bold text-primary-dark lg:text-[12px]">{unitWord}</p>}
        </div>
        <PillButton variant="secondary" className="!h-11 !w-11 !px-0 text-[20px]" onClick={() => step(-config.step)} aria-label="إنقاص">
          −
        </PillButton>
      </div>
      <p className="mt-3 text-center text-[14px] text-ink-soft lg:text-[12px]" data-testid={`setting-value-${setting.key}`}>
        {dirty ? (
          <>
            المحفوظ: {settingValueText(setting.key, setting.value)} — الجديد: <strong className="text-ink">{settingValueText(setting.key, current)}</strong>
          </>
        ) : (
          <>الحالي: {settingValueText(setting.key, setting.value)}</>
        )}
      </p>

      {showImpact && dirty && impactQuery.data?.noLongerViolating != null && (
        <div className="mt-3 rounded-sm bg-accent-100 px-3 py-2.5 text-[14px] font-semibold leading-[1.7] text-accent-ink lg:text-[12px]">
          من {settingValueText(setting.key, setting.value)} إلى {settingValueText(setting.key, current)}:{' '}
          {impactQuery.data.noLongerViolating} تعبئة كانت ستحتاج استثناءً بسبب هذه القاعدة لن تحتاجه بعد الآن.
        </div>
      )}

      <SaveRow settingKey={setting.key} dirty={dirty} pending={pending} saved={saved} onSave={() => onSave(current)} />
    </SettingCard>
  );
}
