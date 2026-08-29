import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { useAuth } from '../auth/AuthProvider';
import { Card, CardHeader } from '../../components/design/Card';
import { PillButton } from '../../components/design/PillButton';
import { StatusPill } from '../../components/design/StatusPill';
import { LtrText } from '../../components/LtrText';
import { RULE_VIOLATION_MESSAGES } from '../fillups/ruleViolationMessages';
import { STANDING_EXCEPTION_RULES, type StandingExceptionEntry } from './types';

interface StandingExceptionsSectionProps {
  // Exactly one of these is set by the host page — this page's own
  // subject, and the ONLY thing the listing query filters by (Prisma ANDs
  // driverId+vehicleId together, so passing both here would silently hide
  // driver-only/vehicle-only grants that don't happen to match both).
  driverId?: string;
  vehicleId?: string;
  // Optional context for the grant form's scope selector only — e.g. the
  // driver page passes the driver's primary vehicle here so "السائق
  // ومركبة معيّنة" / "المركبة وحدها" are choosable, never used for listing.
  driverLabel?: string;
  contextVehicleId?: string;
  contextVehicleLabel?: string;
  vehicleLabel?: string;
  contextDriverId?: string;
  contextDriverLabel?: string;
}

type Scope = 'driver_and_vehicle' | 'driver_only' | 'vehicle_only';

// Interim design, not from the original client spec — flagged in the
// final report. Shown directly on the driver/vehicle's own profile page
// (not a separate list nobody checks), which is exactly what this
// component is embedded into on both detail pages.
//
// Verification-fix item 7: the grant panel previously had no scope
// selector at all (always granted against whichever single ID the host
// page passed in) and used raw HTML controls throughout. Artboard 6d
// draws three scope tiles ("driver+vehicle" / "driver only" / "vehicle
// only") with a live echo sentence — the "driver+vehicle" and "vehicle
// only" tiles need the OTHER entity's id, which the host page now passes
// in as context (e.g. the driver's primary vehicle) when one exists.
export function StandingExceptionsSection({
  driverId,
  driverLabel,
  vehicleId,
  vehicleLabel,
  contextVehicleId,
  contextVehicleLabel,
  contextDriverId,
  contextDriverLabel,
}: StandingExceptionsSectionProps) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('standing_exceptions:manage');
  const queryClient = useQueryClient();

  // The grant form's own working set of ids — defaults to whichever entity
  // this page is about, plus its context counterpart, so all three scope
  // tiles have something to grant against.
  const effectiveDriverId = driverId ?? contextDriverId;
  const effectiveDriverLabel = driverLabel ?? contextDriverLabel;
  const effectiveVehicleId = vehicleId ?? contextVehicleId;
  const effectiveVehicleLabel = vehicleLabel ?? contextVehicleLabel;

  const [showGrantForm, setShowGrantForm] = useState(false);
  const [scope, setScope] = useState<Scope>(
    effectiveDriverId && effectiveVehicleId ? 'driver_and_vehicle' : effectiveDriverId ? 'driver_only' : 'vehicle_only',
  );
  const [selectedRules, setSelectedRules] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [noExpiry, setNoExpiry] = useState(true);
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
        driverId: scope !== 'vehicle_only' ? effectiveDriverId : undefined,
        vehicleId: scope !== 'driver_only' ? effectiveVehicleId : undefined,
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

  const vehicleLabelNode = <LtrText>{effectiveVehicleLabel ?? 'هذه'}</LtrText>;
  const scopeSentence =
    scope === 'driver_and_vehicle' ? (
      <>سيُطبَّق على: {effectiveDriverLabel ?? 'هذا السائق'} عند تعبئة المركبة {vehicleLabelNode} فقط.</>
    ) : scope === 'driver_only' ? (
      <>سيُطبَّق على: {effectiveDriverLabel ?? 'هذا السائق'} على كل مركباته.</>
    ) : (
      <>سيُطبَّق على أي سائق يقود المركبة {vehicleLabelNode}.</>
    );

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
          <Card className="border border-line p-4">
            {(effectiveDriverId && effectiveVehicleId) && (
              <div className="mb-4">
                <p className="mb-2 text-[13px] font-bold text-ink">على مَن يُطبَّق؟</p>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setScope('driver_and_vehicle')}
                    className={`flex flex-col items-center justify-center gap-0.5 rounded-sm py-3 text-center ${
                      scope === 'driver_and_vehicle' ? 'border-2 border-primary bg-primary-100' : 'bg-surface-alt'
                    }`}
                  >
                    <span className={`text-[12px] font-extrabold ${scope === 'driver_and_vehicle' ? 'text-primary-dark' : 'text-ink-soft'}`}>
                      السائق ومركبة معيّنة
                    </span>
                    <span className={`text-[10px] ${scope === 'driver_and_vehicle' ? 'text-primary-dark' : 'text-ink-faint'}`}>الأضيق نطاقًا</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setScope('driver_only')}
                    className={`flex flex-col items-center justify-center gap-0.5 rounded-sm py-3 text-center ${
                      scope === 'driver_only' ? 'border-2 border-primary bg-primary-100' : 'bg-surface-alt'
                    }`}
                  >
                    <span className={`text-[12px] font-bold ${scope === 'driver_only' ? 'text-primary-dark' : 'text-ink-soft'}`}>السائق وحده</span>
                    <span className={`text-[10px] ${scope === 'driver_only' ? 'text-primary-dark' : 'text-ink-faint'}`}>كل مركباته</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setScope('vehicle_only')}
                    className={`flex flex-col items-center justify-center gap-0.5 rounded-sm py-3 text-center ${
                      scope === 'vehicle_only' ? 'border-2 border-primary bg-primary-100' : 'bg-surface-alt'
                    }`}
                  >
                    <span className={`text-[12px] font-bold ${scope === 'vehicle_only' ? 'text-primary-dark' : 'text-ink-soft'}`}>المركبة وحدها</span>
                    <span className={`text-[10px] ${scope === 'vehicle_only' ? 'text-primary-dark' : 'text-ink-faint'}`}>أي سائق</span>
                  </button>
                </div>
                <div className="mt-2.5 rounded-sm bg-primary-100 px-3 py-2.5 text-[12px] font-semibold text-primary-dark">
                  {scopeSentence}
                </div>
              </div>
            )}

            <div className="mb-4">
              <p className="mb-2 text-[13px] font-bold text-ink">أي قاعدة يشملها الاستثناء؟</p>
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
                      <span className="text-[13px] font-semibold text-ink">{RULE_VIOLATION_MESSAGES[rule] ?? rule}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mb-4">
              <label className="mb-1.5 block text-[13px] font-bold text-ink">سبب المنح — مطلوب</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                className="w-full rounded-sm border border-primary bg-primary-100 px-3.5 py-2.5 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <p className="mt-1.5 text-[11px] text-ink-soft">اذكر الأمر أو التكليف الذي يستند إليه الاستثناء — يُقرأ لاحقًا في المراجعة.</p>
            </div>

            <div className="mb-4">
              <label className="mb-1.5 block text-[13px] font-bold text-ink">تاريخ الانتهاء</label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={expiresAt}
                  disabled={noExpiry}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="h-11 flex-1 rounded-sm border border-line bg-surface-alt px-3.5 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setNoExpiry((s) => !s)}
                  className={`h-11 shrink-0 rounded-sm px-4 text-[12.5px] font-bold ${
                    noExpiry ? 'bg-primary text-white' : 'bg-surface-alt text-ink-soft'
                  }`}
                >
                  بلا تاريخ انتهاء
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-ink-soft">يُفضَّل تحديد تاريخ. الاستثناء بلا نهاية يظهر في تقرير المراجعة الشهري.</p>
            </div>

            {formError && <p className="mb-3 text-[12px] text-danger">{formError}</p>}
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
