import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { useAuth } from '../auth/AuthProvider';
import { Card, CardHeader } from '../../components/design/Card';
import { PillButton } from '../../components/design/PillButton';
import { StatusPill } from '../../components/design/StatusPill';
import { RULE_VIOLATION_MESSAGES } from '../fillups/ruleViolationMessages';
import { STANDING_EXCEPTION_RULES, type StandingExceptionEntry } from './types';

interface StandingExceptionsSectionProps {
  driverId?: string;
  vehicleId?: string;
}

// Interim design, not from the original client spec — flagged in the
// final report. Shown directly on the driver/vehicle's own profile page
// (not a separate list nobody checks), which is exactly what this
// component is embedded into on both detail pages.
export function StandingExceptionsSection({ driverId, vehicleId }: StandingExceptionsSectionProps) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('standing_exceptions:manage');
  const queryClient = useQueryClient();
  const [showGrantForm, setShowGrantForm] = useState(false);
  const [selectedRules, setSelectedRules] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const queryKey = ['standing-exceptions', driverId ?? '', vehicleId ?? ''];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () =>
      (
        await apiClient.get<StandingExceptionEntry[]>('/standing-exceptions', {
          params: { driverId, vehicleId, activeOnly: 'true' },
        })
      ).data,
  });

  const grantMutation = useMutation({
    mutationFn: () =>
      apiClient.post('/standing-exceptions', {
        driverId,
        vehicleId,
        rules: selectedRules,
        reason,
        expiresAt: expiresAt || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setShowGrantForm(false);
      setSelectedRules([]);
      setReason('');
      setExpiresAt('');
      setFormError(null);
    },
    onError: () => setFormError('تعذر منح الاستثناء الدائم.'),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/standing-exceptions/${id}/revoke`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  function toggleRule(rule: string) {
    setSelectedRules((prev) => (prev.includes(rule) ? prev.filter((r) => r !== rule) : [...prev, rule]));
  }

  function submitGrant() {
    setFormError(null);
    if (selectedRules.length === 0) {
      setFormError('اختر قاعدة واحدة على الأقل.');
      return;
    }
    if (!reason.trim()) {
      setFormError('السبب مطلوب.');
      return;
    }
    grantMutation.mutate();
  }

  return (
    <Card>
      <CardHeader
        title="استثناءات دائمة (مستمرة)"
        action={
          canManage &&
          !showGrantForm && (
            <PillButton size="sm" onClick={() => setShowGrantForm(true)}>
              منح استثناء دائم
            </PillButton>
          )
        }
      />

      <div className="p-4">
        {isLoading && <p className="text-[13px] text-ink-soft">...جارٍ التحميل</p>}

        {data && data.length === 0 && !showGrantForm && (
          <p className="text-[13px] text-ink-soft">لا توجد استثناءات دائمة سارية.</p>
        )}

        {data && data.length > 0 && (
          <ul className="mb-3 space-y-2">
            {data.map((entry) => (
              <li key={entry.id} className="rounded-sm bg-accent-100 p-3.5 text-[12.5px]">
                <div className="mb-1.5 flex flex-wrap gap-1.5">
                  {entry.rules.map((rule) => (
                    <StatusPill key={rule} variant="accent">
                      {RULE_VIOLATION_MESSAGES[rule] ?? rule}
                    </StatusPill>
                  ))}
                </div>
                <p className="text-ink-soft">السبب: {entry.reason}</p>
                <p className="text-[11px] text-ink-faint">
                  مُنح بواسطة {entry.grantedBy.fullName} — {new Date(entry.grantedAt).toLocaleDateString('ar')}
                  {entry.expiresAt && ` — ينتهي في ${new Date(entry.expiresAt).toLocaleDateString('ar')}`}
                </p>
                {canManage && (
                  <PillButton
                    size="sm"
                    variant="danger"
                    onClick={() => revokeMutation.mutate(entry.id)}
                    disabled={revokeMutation.isPending}
                    className="mt-2"
                  >
                    إلغاء الاستثناء
                  </PillButton>
                )}
              </li>
            ))}
          </ul>
        )}

        {showGrantForm && (
          <div className="space-y-3 rounded-sm bg-surface-alt p-3.5">
            <div>
              <p className="mb-1.5 text-[11px] font-bold text-ink-soft">القواعد المشمولة</p>
              <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                {STANDING_EXCEPTION_RULES.map((rule) => (
                  <label key={rule} className="flex items-center gap-1.5 text-[12px] text-ink">
                    <input
                      type="checkbox"
                      checked={selectedRules.includes(rule)}
                      onChange={() => toggleRule(rule)}
                    />
                    {RULE_VIOLATION_MESSAGES[rule] ?? rule}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-bold text-ink-soft">السبب</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                className="w-full rounded-sm bg-surface px-3 py-2 text-[12.5px] text-ink shadow-sm focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-bold text-ink-soft">تاريخ الانتهاء (اختياري)</label>
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="h-9 rounded-sm bg-surface px-3 text-[12.5px] text-ink shadow-sm focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
            {formError && <p className="text-[12px] text-danger">{formError}</p>}
            <div className="flex gap-2">
              <PillButton onClick={submitGrant} disabled={grantMutation.isPending}>
                {grantMutation.isPending ? '...جارٍ الحفظ' : 'منح'}
              </PillButton>
              <PillButton variant="ghost" onClick={() => setShowGrantForm(false)}>
                إلغاء
              </PillButton>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
