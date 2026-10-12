import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { Card } from '../../components/design/Card';
import { adminErrorMessage } from './adminErrors';
import type { SystemSettingRow } from './types';

// Every fill-up rule the engine applies, and the setting that switches it.
// Defaults: all on, except the owner liters rule (off). A switched-off rule is
// skipped completely - in the preview and in the real recording alike.
const RULES: Array<{ key: string; title: string; text: string; defaultOn: boolean }> = [
  {
    key: 'fillup.rule.vehicle_gap.enabled',
    title: 'الفاصل الأدنى بين تعبئتين للمركبة',
    text: 'لا تُقبل تعبئة المركبة قبل مرور الأيام المحدّدة على آخر تعبئة لها.',
    defaultOn: true,
  },
  {
    key: 'fillup.rule.vehicle_weekly.enabled',
    title: 'عدد التعبئات الأسبوعي للمركبة',
    text: 'حدّ أقصى لعدد تعبئات المركبة الواحدة في الأسبوع.',
    defaultOn: true,
  },
  {
    key: 'fillup.rule.owner_gap.enabled',
    title: 'الفاصل الأدنى بين تعبئتين للمالك',
    text: 'يُحسب على كل مركبات المالك الفرد معًا. لا يُطبَّق على مركبات الجهات والمؤسسات.',
    defaultOn: true,
  },
  {
    key: 'fillup.rule.owner_weekly.enabled',
    title: 'عدد التعبئات الأسبوعي للمالك',
    text: 'حدّ أقصى لتعبئات المالك الفرد في الأسبوع على كل مركباته. لا يُطبَّق على الجهات.',
    defaultOn: true,
  },
  {
    key: 'fillup.rule.owner_liters.enabled',
    title: 'لترات المالك الأسبوعية',
    text: 'حدّ أقصى لمجموع لترات المالك الفرد في الأسبوع. مُعطَّلة افتراضيًا.',
    defaultOn: false,
  },
];

// Switches for the fill-up rules. Only the super admin gets this screen (the
// API refuses anyone else), and every change is written to the audit log.
export function RuleSwitchesCard({ settings }: { settings: SystemSettingRow[] }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const byKey = new Map(settings.map((s) => [s.key, s.value]));

  const toggle = useMutation({
    mutationFn: async ({ key, on }: { key: string; on: boolean }) =>
      apiClient.patch(`/system-settings/${key}`, { value: on ? 'true' : 'false' }),
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
    },
    onError: (err) => setError(adminErrorMessage(err, 'تعذّر تغيير القاعدة.')),
  });

  return (
    <Card className="p-4 lg:p-5" data-testid="rule-switches">
      <h2 className="text-[18px] font-extrabold text-ink lg:text-[15px]">قواعد التعبئة</h2>
      <p className="mt-1 text-[15px] leading-[1.7] text-ink-soft lg:text-[13px]">
        شغّل كل قاعدة أو أوقفها. القاعدة الموقوفة لا تُطبَّق إطلاقًا على التعبئات القادمة، ويُسجَّل كل تغيير باسمك. الأرقام (الحدود والفواصل) تُضبط أدناه.
      </p>
      {error && (
        <p role="alert" className="mt-3 text-[15px] font-medium text-danger-dark lg:text-[13px]">
          {error}
        </p>
      )}
      <ul className="mt-3 divide-y divide-surface-alt">
        {RULES.map((rule) => {
          const raw = byKey.get(rule.key);
          const on = raw === undefined ? rule.defaultOn : raw === 'true';
          return (
            <li key={rule.key} className="flex items-start justify-between gap-4 py-3.5">
              <div className="min-w-0">
                <p className="text-[17px] font-bold text-ink lg:text-[14px]">{rule.title}</p>
                <p className="mt-0.5 text-[15px] leading-[1.7] text-ink-soft lg:text-[12px]">{rule.text}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={`${rule.title}: ${on ? 'مفعّلة' : 'موقوفة'}`}
                data-testid={`rule-switch-${rule.key}`}
                disabled={toggle.isPending}
                onClick={() => toggle.mutate({ key: rule.key, on: !on })}
                className="flex shrink-0 items-center gap-2.5 rounded-full p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:opacity-60"
              >
                <span className={`text-[15px] font-bold lg:text-[13px] ${on ? 'text-ok' : 'text-ink-soft'}`}>
                  {on ? 'مفعّلة' : 'موقوفة'}
                </span>
                <span
                  aria-hidden="true"
                  className={`relative h-8 w-14 rounded-full transition-colors ${on ? 'bg-primary' : 'bg-line'}`}
                >
                  <span
                    className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? 'start-7' : 'start-1'}`}
                  />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
