import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { Card, CardHeader } from '../../components/design/Card';
import { PillButton } from '../../components/design/PillButton';
import { settingValueText } from '../../lib/labels';

interface SettingsResponse {
  global: { strictLimit: boolean; stationDailyThreshold: number };
}

// The general value of the two exception limits; a municipality manager may
// override either for their own municipality (its value wins). Audited.
export function GlobalExceptionSettingsCard() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['exceptions', 'settings', 'global'],
    queryFn: async () => (await apiClient.get<SettingsResponse>('/exceptions/settings')).data,
  });
  const [strict, setStrict] = useState(false);
  const [threshold, setThreshold] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!query.data) return;
    setStrict(query.data.global.strictLimit);
    setThreshold(String(query.data.global.stationDailyThreshold));
  }, [query.data]);

  const save = useMutation({
    mutationFn: async () =>
      apiClient.patch('/exceptions/settings', { strictLimit: strict, stationDailyThreshold: Number(threshold) }),
    onSuccess: async () => {
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: ['exceptions', 'settings'] });
    },
  });

  if (query.isError) return null;
  const dirty =
    !!query.data &&
    (strict !== query.data.global.strictLimit || Number(threshold) !== query.data.global.stationDailyThreshold);
  return (
    <Card data-testid="global-exception-settings">
      <CardHeader title="حدود الاستثناءات (للجميع)" />
      <div className="p-4">
        <p className="text-[15px] leading-[1.7] text-ink-soft lg:text-[13px]">
          مدير كل بلدية يستطيع تغيير القيمتين لبلديته، وتغلب قيمة البلدية على القيمة العامة.
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <label className="flex min-h-[44px] items-center gap-3 text-[15px] font-bold text-ink lg:text-[13px]">
            <input
              type="checkbox"
              checked={strict}
              onChange={(e) => {
                setStrict(e.target.checked);
                setSaved(false);
              }}
              className="h-5 w-5"
              data-testid="global-exception-strict"
            />
            منع تجاوز حد الاستثناءات (يُرفض الاستخدام بعد الحد اليومي للنوع)
          </label>
          <div>
            <label className="mb-1 block text-[14px] font-bold text-ink-soft lg:text-[12px]" htmlFor="global-exc-threshold">
              عدد الاستثناءات اليومي غير المعقول لمحطة
            </label>
            <div className="flex items-center gap-2">
              <input
                id="global-exc-threshold"
                type="number"
                min={1}
                inputMode="numeric"
                value={threshold}
                onChange={(e) => {
                  setThreshold(e.target.value);
                  setSaved(false);
                }}
                className="h-11 w-28 rounded-sm bg-surface-alt px-3 text-center text-[15px] text-ink focus:outline-none focus:ring-2 focus:ring-primary-dark lg:h-9 lg:text-[13px]"
                data-testid="global-exception-threshold"
              />
              <span className="text-[15px] font-bold text-primary-dark lg:text-[13px]">استثناء في اليوم</span>
            </div>
            {Number(threshold) >= 1 && (
              <p className="mt-1 text-[14px] text-ink-soft lg:text-[12px]">
                تُعلَّم المحطة للمراجعة بعد {settingValueText('exceptions.station_daily_threshold', threshold)}.
              </p>
            )}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <PillButton variant="brand" size="sm" onClick={() => save.mutate()} disabled={save.isPending || !dirty || Number(threshold) < 1}>
            {save.isPending ? 'جارٍ الحفظ…' : 'حفظ'}
          </PillButton>
          {saved ? (
            <span role="status" className="text-[14px] font-bold text-ok lg:text-[12px]">✓ تم الحفظ</span>
          ) : (
            !dirty && <span className="text-[14px] text-ink-soft lg:text-[12px]">غيّر القيمة أولًا ليُفعَّل الحفظ.</span>
          )}
        </div>
      </div>
    </Card>
  );
}
