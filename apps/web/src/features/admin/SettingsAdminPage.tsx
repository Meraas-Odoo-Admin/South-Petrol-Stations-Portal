import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { apiClient } from '../../lib/apiClient';
import { Card } from '../../components/design/Card';
import { PillButton } from '../../components/design/PillButton';
import { CodeText } from '../../components/design/CodeText';
import type { SystemSettingRow } from './types';

// Item 7 + the "MOST IMPORTANT" ask. Matches 2i's settings-card pattern:
// each tunable number is its own surface-alt card with a numeral display
// box, an Arabic label paired with its literal DB key (CodeText), and a
// plain-language description underneath — not a table row. 2i mocks only
// 2 settings ending in one shared save button; this scales to 7 by giving
// each card its own save (editing 7 independent keys via one shared commit
// would be worse UX, not closer to the mockup's intent).
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
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      apiClient.patch(`/system-settings/${key}`, { value }),
    onSuccess: (_res, { key }) => {
      setError(null);
      setSavedKey(key);
      setTimeout(() => setSavedKey((cur) => (cur === key ? null : cur)), 2000);
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
    },
    onError: (err) => {
      setError(
        isAxiosError<{ message?: string | string[] }>(err)
          ? [err.response?.data?.message].flat().filter(Boolean).join(' — ') || 'تعذر حفظ القيمة.'
          : 'تعذر حفظ القيمة.',
      );
    },
  });

  return (
    <div>
      <div className="mb-4">
        <div className="text-[15px] font-extrabold text-ink">إعدادات المنظومة</div>
        <div className="mt-1 text-[11.5px] text-ink-soft">تُنفَّذ هذه الأرقام على التعبئات القادمة فقط — لا يوجد أي تخزين مؤقت للقيم.</div>
      </div>

      {isLoading && <p className="text-sm text-ink-soft">...جارٍ التحميل</p>}
      {isError && <p className="text-sm text-danger">تعذر تحميل إعدادات النظام.</p>}
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {data && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((setting) => {
            const current = editing[setting.key] ?? setting.value;
            const dirty = current !== setting.value;
            return (
              <Card key={setting.key} className="p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[12.5px] font-bold text-ink">{setting.description ?? setting.key}</span>
                </div>
                <div className="mt-1">
                  <CodeText>{setting.key}</CodeText>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <input
                    value={current}
                    onChange={(e) => setEditing((s) => ({ ...s, [setting.key]: e.target.value }))}
                    dir="ltr"
                    className="h-11 w-20 rounded-sm bg-surface-alt text-center font-mono text-[18px] font-bold text-ink shadow-sm focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                  <PillButton
                    size="sm"
                    disabled={!dirty || mutation.isPending}
                    onClick={() => mutation.mutate({ key: setting.key, value: current })}
                  >
                    حفظ
                  </PillButton>
                  {savedKey === setting.key && <span className="text-[11px] font-bold text-ok">تم الحفظ</span>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
