import { useState } from 'react';
import { formatDate } from '../../lib/dateFormat';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { useAuth } from '../auth/AuthProvider';
import { Card, CardHeader } from '../../components/design/Card';
import { DateField } from '../../components/DateField';
import { PillButton } from '../../components/design/PillButton';
import { StatusPill } from '../../components/design/StatusPill';
import { LtrText } from '../../components/LtrText';
import { formatLicensePlate } from '../../lib/libyanFormats';
import { RULE_VIOLATION_MESSAGES } from '../fillups/ruleViolationMessages';
import { STANDING_EXCEPTION_RULES, type StandingExceptionEntry } from './types';

interface StandingExceptionsSectionProps {
  // Exactly one of these is set by the host page — this page's own
  // subject, and the ONLY thing the listing query filters by (Prisma ANDs
  // ownerId+vehicleId together, so passing both here would silently hide
  // owner-only/vehicle-only grants that don't happen to match both).
  ownerId?: string;
  vehicleId?: string;
  // Optional context for the grant form's scope selector only — e.g. the
  // vehicle page passes its own owner here so "المالك ومركبة معيّنة" /
  // "المالك وحده" are choosable, never used for listing.
  ownerLabel?: string;
  contextVehicleId?: string;
  contextVehicleLabel?: string;
  vehicleLabel?: string;
  contextOwnerId?: string;
  contextOwnerLabel?: string;
}

type Scope = 'owner_and_vehicle' | 'owner_only' | 'vehicle_only';

// Interim design, not from the original client spec — flagged in the
// final report. Shown directly on the vehicle's own profile page (not a
// separate list nobody checks), which is exactly what this component is
// embedded into.
//
// Round 6: re-scoped from driver to vehicle owner (see
// docs/DESIGN_owner_based_fillups.md) — the scope tiles are now "owner +
// vehicle" / "owner only" / "vehicle only" instead of driver-based.
export function StandingExceptionsSection({
  ownerId,
  ownerLabel,
  vehicleId,
  vehicleLabel,
  contextVehicleId,
  contextVehicleLabel,
  contextOwnerId,
  contextOwnerLabel,
}: StandingExceptionsSectionProps) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('standing_exceptions:manage');
  const queryClient = useQueryClient();

  // The grant form's own working set of ids — defaults to whichever entity
  // this page is about, plus its context counterpart, so all three scope
  // tiles have something to grant against.
  const effectiveOwnerId = ownerId ?? contextOwnerId;
  const effectiveOwnerLabel = ownerLabel ?? contextOwnerLabel;
  const effectiveVehicleId = vehicleId ?? contextVehicleId;
  const effectiveVehicleLabel = vehicleLabel ?? contextVehicleLabel;

  const [showGrantForm, setShowGrantForm] = useState(false);
  const [scope, setScope] = useState<Scope>(
    effectiveOwnerId && effectiveVehicleId ? 'owner_and_vehicle' : effectiveOwnerId ? 'owner_only' : 'vehicle_only',
  );
  const [selectedRules, setSelectedRules] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [noExpiry, setNoExpiry] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  const queryKey = ['standing-exceptions', ownerId ?? '', vehicleId ?? ''];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () =>
      (
        await apiClient.get<StandingExceptionEntry[]>('/standing-exceptions', {
          params: { ownerId, vehicleId, activeOnly: 'true' },
        })
      ).data,
  });

  const grantMutation = useMutation({
    mutationFn: () =>
      apiClient.post('/standing-exceptions', {
        ownerId: scope !== 'vehicle_only' ? effectiveOwnerId : undefined,
        vehicleId: scope !== 'owner_only' ? effectiveVehicleId : undefined,
        rules: selectedRules,
        reason,
        expiresAt: noExpiry ? undefined : expiresAt || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setShowGrantForm(false);
      setSelectedRules([]);
      setReason('');
      setExpiresAt('');
      setNoExpiry(true);
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

  function describeEntryScope(entry: StandingExceptionEntry): string {
    if (entry.ownerId && entry.vehicleId) {
      return `هذا المالك، على مركبة ${entry.vehicle ? formatLicensePlate(entry.vehicle.currentPlate) : ''} فقط`;
    }
    if (entry.ownerId) {
      return 'هذا المالك، على كل مركباته';
    }
    return `المركبة ${entry.vehicle ? formatLicensePlate(entry.vehicle.currentPlate) : ''}، بغض النظر عن مالكها`;
  }

  const vehicleLabelNode = <LtrText>{effectiveVehicleLabel ?? 'هذه'}</LtrText>;
  const scopeSentence =
    scope === 'owner_and_vehicle' ? (
      <>سيُطبَّق على: {effectiveOwnerLabel ?? 'هذا المالك'} عند تعبئة المركبة {vehicleLabelNode} فقط.</>
    ) : scope === 'owner_only' ? (
      <>سيُطبَّق على: {effectiveOwnerLabel ?? 'هذا المالك'} على كل مركباته.</>
    ) : (
      <>سيُطبَّق على المركبة {vehicleLabelNode}، بغض النظر عن مالكها.</>
    );

  return (
    <Card className={data && data.length > 0 ? 'border-2 border-accent' : ''}>
      <CardHeader
        title={data && data.length > 0 ? 'استثناءات مستمرة سارية' : 'استثناءات دائمة (مستمرة)'}
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
        {isLoading && <p className="text-[15px] lg:text-[13px] text-ink-soft">...جارٍ التحميل</p>}

        {data && data.length === 0 && !showGrantForm && (
          <p className="text-[15px] lg:text-[13px] text-ink-soft">لا توجد استثناءات دائمة سارية.</p>
        )}

        {data && data.length > 0 && (
          <ul className="mb-3 space-y-2">
            {data.map((entry) => (
              <li key={entry.id} className="rounded-sm bg-accent-100 p-3.5 text-[13px] lg:text-[12.5px]">
                <p className="mb-1.5 font-bold text-accent-ink">النطاق: {describeEntryScope(entry)}</p>
                <div className="mb-1.5 flex flex-wrap gap-1.5">
                  {entry.rules.map((rule) => (
                    <StatusPill key={rule} variant="accent">
                      {RULE_VIOLATION_MESSAGES[rule] ?? rule}
                    </StatusPill>
                  ))}
                </div>
                <p className="text-ink-soft">السبب: {entry.reason}</p>
                <p className="text-[13px] lg:text-[12px] text-ink-faint">
                  مُنح بواسطة {entry.grantedBy.fullName} — <LtrText>{formatDate(entry.grantedAt)}</LtrText>
                  {entry.expiresAt && <> — ينتهي في <LtrText>{formatDate(entry.expiresAt)}</LtrText></>}
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
          <Card className="border border-line p-4">
            {(effectiveOwnerId && effectiveVehicleId) && (
              <div className="mb-4">
                <p className="mb-2 text-[15px] lg:text-[13px] font-bold text-ink">على مَن يُطبَّق؟</p>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setScope('owner_and_vehicle')}
                    className={`flex flex-col items-center justify-center gap-0.5 rounded-sm py-3 text-center ${
                      scope === 'owner_and_vehicle' ? 'border-2 border-primary bg-primary-100' : 'bg-surface-alt'
                    }`}
                  >
                    <span className={`text-[13px] lg:text-[12px] font-extrabold ${scope === 'owner_and_vehicle' ? 'text-primary-dark' : 'text-ink-soft'}`}>
                      المالك ومركبة معيّنة
                    </span>
                    <span className={`text-[13px] lg:text-[12px] ${scope === 'owner_and_vehicle' ? 'text-primary-dark' : 'text-ink-faint'}`}>الأضيق نطاقًا</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setScope('owner_only')}
                    className={`flex flex-col items-center justify-center gap-0.5 rounded-sm py-3 text-center ${
                      scope === 'owner_only' ? 'border-2 border-primary bg-primary-100' : 'bg-surface-alt'
                    }`}
                  >
                    <span className={`text-[13px] lg:text-[12px] font-bold ${scope === 'owner_only' ? 'text-primary-dark' : 'text-ink-soft'}`}>المالك وحده</span>
                    <span className={`text-[13px] lg:text-[12px] ${scope === 'owner_only' ? 'text-primary-dark' : 'text-ink-faint'}`}>كل مركباته</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setScope('vehicle_only')}
                    className={`flex flex-col items-center justify-center gap-0.5 rounded-sm py-3 text-center ${
                      scope === 'vehicle_only' ? 'border-2 border-primary bg-primary-100' : 'bg-surface-alt'
                    }`}
                  >
                    <span className={`text-[13px] lg:text-[12px] font-bold ${scope === 'vehicle_only' ? 'text-primary-dark' : 'text-ink-soft'}`}>المركبة وحدها</span>
                    <span className={`text-[13px] lg:text-[12px] ${scope === 'vehicle_only' ? 'text-primary-dark' : 'text-ink-faint'}`}>أي مالك</span>
                  </button>
                </div>
                <div className="mt-2.5 rounded-sm bg-primary-100 px-3 py-2.5 text-[13px] lg:text-[12px] font-semibold text-primary-dark">
                  {scopeSentence}
                </div>
              </div>
            )}

            <div className="mb-4">
              <p className="mb-2 text-[15px] lg:text-[13px] font-bold text-ink">أي قاعدة يشملها الاستثناء؟</p>
              <div className="flex flex-col gap-2">
                {STANDING_EXCEPTION_RULES.map((rule) => {
                  const checked = selectedRules.includes(rule);
                  return (
                    <button
                      key={rule}
                      type="button"
                      onClick={() => toggleRule(rule)}
                      className={`flex items-center gap-2.5 rounded-sm p-3 text-start ${
                        checked ? 'border-2 border-primary bg-primary-100' : 'bg-surface-alt'
                      }`}
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${
                          checked ? 'bg-primary' : 'border-2 border-ink-faint'
                        }`}
                      >
                        {checked && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5">
                            <path d="M20 6L9 17l-5-5" />
                          </svg>
                        )}
                      </span>
                      <span className="text-[15px] lg:text-[13px] font-semibold text-ink">{RULE_VIOLATION_MESSAGES[rule] ?? rule}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mb-4">
              <label className="mb-1.5 block text-[15px] lg:text-[13px] font-bold text-ink">سبب المنح — مطلوب</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                className="w-full rounded-sm border border-primary bg-primary-100 px-3.5 py-2.5 text-[15px] lg:text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <p className="mt-1.5 text-[13px] lg:text-[12px] text-ink-soft">اذكر الأمر أو التكليف الذي يستند إليه الاستثناء — يُقرأ لاحقًا في المراجعة.</p>
            </div>

            <div className="mb-4">
              <label className="mb-1.5 block text-[15px] lg:text-[13px] font-bold text-ink">تاريخ الانتهاء</label>
              <div className="flex items-center gap-2">
                <DateField value={expiresAt} onChange={setExpiresAt} disabled={noExpiry} className="flex-1" />
                <button
                  type="button"
                  onClick={() => setNoExpiry((s) => !s)}
                  className={`h-11 shrink-0 rounded-sm px-4 text-[13px] lg:text-[12.5px] font-bold ${
                    noExpiry ? 'bg-primary text-white' : 'bg-surface-alt text-ink-soft'
                  }`}
                >
                  بلا تاريخ انتهاء
                </button>
              </div>
              <p className="mt-1.5 text-[13px] lg:text-[12px] text-ink-soft">يُفضَّل تحديد تاريخ. الاستثناء بلا نهاية يظهر في تقرير المراجعة الشهري.</p>
            </div>

            {formError && <p className="mb-3 text-[13px] lg:text-[12px] text-danger">{formError}</p>}
            <div className="flex gap-2">
              <PillButton onClick={submitGrant} disabled={grantMutation.isPending} className="flex-1">
                {grantMutation.isPending ? '...جارٍ الحفظ' : 'منح الاستثناء'}
              </PillButton>
              <PillButton variant="ghost" onClick={() => setShowGrantForm(false)}>
                إلغاء
              </PillButton>
            </div>
          </Card>
        )}
      </div>
    </Card>
  );
}
