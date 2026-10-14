import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { Card } from '../../components/design/Card';
import { PillButton } from '../../components/design/PillButton';

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
  return (
    <Card className="p-4" data-testid="global-exception-settings">
      <h2 className="text-[16px] font-extrabold text-ink lg:text-[14px]">حدود الاستثناءات (للجميع)</h2>
      <p className="mt-1 text-[13px] leading-[1.7] text-ink-soft lg:text-[12px]">
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
            data-testid="global-exception-strict"
          />
          منع تجاوز حد الاستثناءات (يُرفض الاستخدام بعد الحد اليومي للنوع)
        </label>
        <div>
          <label className="mb-1 block text-[14px] font-bold text-ink-soft lg:text-[12px]" htmlFor="global-exc-threshold">
            عدد الاستثناءات اليومي غير المعقول لمحطة
          </label>
          <input
            id="global-exc-threshold"
            type="number"
            min={1}
            value={threshold}
            onChange={(e) => {
              setThreshold(e.target.value);
              setSaved(false);
            }}
            className="h-11 w-40 rounded-sm bg-surface-alt px-3 text-[15px] text-ink focus:outline-none focus:ring-2 focus:ring-accent lg:h-9 lg:text-[13px]"
            data-testid="global-exception-threshold"
          />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <PillButton size="field" onClick={() => save.mutate()} disabled={save.isPending || Number(threshold) < 1}>
          {save.isPending ? 'جارٍ الحفظ…' : 'حفظ'}
        </PillButton>
        {saved && <span className="text-[15px] font-bold text-ok">تم الحفظ.</span>}
      </div>
    </Card>
  );
}
