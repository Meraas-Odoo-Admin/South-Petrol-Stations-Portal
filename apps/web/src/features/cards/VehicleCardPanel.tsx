import { useState, type CSSProperties } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { Card, CardHeader } from '../../components/design/Card';
import { PillButton } from '../../components/design/PillButton';
import { StatusPill } from '../../components/design/StatusPill';
import { LtrText } from '../../components/LtrText';
import { useAuth } from '../auth/AuthProvider';
import { CardIssueFlow } from './CardIssueFlow';
import {
  CARD_REASON_LABELS,
  CARD_STATUS_LABELS,
  cardErrorMessage,
  printCardPdf,
  printPdfBlob,
  rememberedPrintMode,
  type IssuableReason,
  type VehicleCardRow,
} from './cardApi';

interface RegistrationStationOption {
  id: string;
  name: string;
  status: 'ACTIVE' | 'TEMPORARILY_CLOSED' | 'CLOSED';
  municipality: { status: 'PREPARING' | 'LIVE' };
}

const STATUS_VARIANT = { ACTIVE: 'ok', REPLACED: 'neutral', CANCELLED: 'danger' } as const;
const REPLACEMENT_REASONS: IssuableReason[] = ['LOST', 'DAMAGED', 'DETAILS_CHANGED'];

// Registration pivot, phase 3 — replaces the old on-screen QR panel (which
// encoded the vehicle's internalCode; that QR is gone). Everyone who can
// read cards sees the current card, its status and history; only
// registration roles (cards:issue) get the desk actions, and cancelling
// without a replacement needs cards:cancel (registration supervisor/admin).
export function VehicleCardPanel({
  vehicleId,
  className = '',
  style,
}: {
  vehicleId: string;
  className?: string;
  style?: CSSProperties;
}) {
  const { hasPermission } = useAuth();
  const canRead = hasPermission('cards:read');
  const canIssue = hasPermission('cards:issue');
  const canCancel = hasPermission('cards:cancel');
  const queryClient = useQueryClient();

  const [issuing, setIssuing] = useState<null | { reason: IssuableReason; note: string; started: boolean }>(null);
  const [chosenStationId, setChosenStationId] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cardsQuery = useQuery({
    queryKey: ['vehicle-cards', vehicleId],
    queryFn: async () => (await apiClient.get<VehicleCardRow[]>(`/vehicles/${vehicleId}/cards`)).data,
    enabled: canRead,
  });
  const stationsQuery = useQuery({
    queryKey: ['registration-stations'],
    queryFn: async () => (await apiClient.get<RegistrationStationOption[]>('/registration-stations')).data,
    enabled: canIssue,
  });
  const openStations = (stationsQuery.data ?? []).filter((s) => s.status === 'ACTIVE' && s.municipality.status === 'LIVE');
  const stationId = openStations.length === 1 ? openStations[0]!.id : chosenStationId;

  const cancel = useMutation({
    mutationFn: async (cardId: string) => (await apiClient.post(`/cards/${cardId}/cancel`, { reason: cancelReason.trim() })).data,
    onSuccess: () => {
      setCancelling(false);
      setCancelReason('');
      setMessage('أُلغيت البطاقة — لم تعد تعمل في أي محطة.');
      queryClient.invalidateQueries({ queryKey: ['vehicle-cards', vehicleId] });
    },
    onError: (err) => setError(cardErrorMessage(err)),
  });

  if (!canRead) return null;

  const cards = cardsQuery.data ?? [];
  const active = cards.find((c) => c.status === 'ACTIVE') ?? null;
  const hasHistory = cards.length > 0;

  async function reprint(card: VehicleCardRow) {
    setError(null);
    try {
      printPdfBlob(await printCardPdf(card.id, rememberedPrintMode()));
      setMessage('أُرسلت البطاقة الحالية للطباعة مرة أخرى (بنفس الرقم والبيانات).');
    } catch (err) {
      setError(cardErrorMessage(err, 'تعذرت الطباعة.'));
    }
  }

  return (
    <Card className={className} style={style} data-testid="vehicle-card-panel">
      <CardHeader title="بطاقة المركبة" />
      <div className="space-y-4 p-4">
        {cardsQuery.isLoading && <p className="text-[13px] lg:text-[12px] text-ink-soft">...جارٍ التحميل</p>}

        {!cardsQuery.isLoading && !active && (
          <p className="text-[13px] lg:text-[12.5px] text-ink-soft" data-testid="vehicle-card-none">
            {hasHistory ? 'لا توجد بطاقة سارية لهذه المركبة.' : 'لم تُصدر بطاقة لهذه المركبة بعد.'}
          </p>
        )}

        {active && (
          <div className="rounded-sm bg-surface-alt p-3" data-testid="vehicle-card-current">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[20px] font-black text-primary">
                <LtrText>{active.cardNumber}</LtrText>
              </span>
              <StatusPill variant="ok">{CARD_STATUS_LABELS.ACTIVE}</StatusPill>
              {active.needsReissue && (
                <span data-testid="vehicle-card-needs-reissue">
                  <StatusPill variant="accent">تحتاج إلى تجديد</StatusPill>
                </span>
              )}
            </div>
            <p className="mt-1.5 text-[13px] lg:text-[12px] text-ink-soft">
              صدرت <LtrText>{active.printedIssueDate}</LtrText> — {active.registrationStation.name} ({active.desk.name})
            </p>
            {active.needsReissue && (
              <p className="mt-1.5 text-[13px] lg:text-[12px] text-accent-ink">
                تغيّرت اللوحة أو الطراز أو اللون منذ طباعة هذه البطاقة. ما زالت سارية، لكن يجب إصدار بطاقة محدَّثة.
              </p>
            )}
          </div>
        )}

        {message && <p className="text-[13px] lg:text-[12px] font-bold text-ok">{message}</p>}
        {error && <p className="text-[13px] lg:text-[12px] text-danger">{error}</p>}

        {/* Desk actions — registration roles only */}
        {canIssue && !issuing && (
          <div className="flex flex-wrap gap-2">
            <PillButton
              size="sm"
              data-testid="vehicle-card-issue"
              onClick={() => {
                setMessage(null);
                setError(null);
                setIssuing({ reason: hasHistory ? 'LOST' : 'FIRST_ISSUE', note: '', started: !hasHistory });
              }}
            >
              {hasHistory ? 'إصدار بطاقة جديدة' : 'إصدار البطاقة'}
            </PillButton>
            {active && (
              <PillButton size="sm" variant="secondary" onClick={() => reprint(active)} data-testid="vehicle-card-reprint">
                إعادة طباعة البطاقة الحالية
              </PillButton>
            )}
            {active && canCancel && !cancelling && (
              <PillButton size="sm" variant="danger" onClick={() => setCancelling(true)} data-testid="vehicle-card-cancel">
                إلغاء البطاقة
              </PillButton>
            )}
          </div>
        )}
        {!canIssue && active && canCancel && !cancelling && (
          <PillButton size="sm" variant="danger" onClick={() => setCancelling(true)} data-testid="vehicle-card-cancel">
            إلغاء البطاقة
          </PillButton>
        )}

        {cancelling && active && (
          <div className="space-y-2 rounded-sm border border-danger p-3">
            <p className="text-[13px] lg:text-[12.5px] font-bold text-danger">إلغاء البطاقة دون إصدار بديل</p>
            <input
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="سبب الإلغاء"
              className="h-9 w-full rounded-sm bg-surface-alt px-3 text-[13px] lg:text-[12.5px] focus:outline-none focus:ring-2 focus:ring-accent"
              data-testid="vehicle-card-cancel-reason"
            />
            <div className="flex gap-2">
              <PillButton
                size="sm"
                variant="danger"
                disabled={cancelReason.trim().length < 3 || cancel.isPending}
                onClick={() => cancel.mutate(active.id)}
                data-testid="vehicle-card-cancel-confirm"
              >
                تأكيد الإلغاء
              </PillButton>
              <PillButton size="sm" variant="ghost" onClick={() => setCancelling(false)}>
                تراجع
              </PillButton>
            </div>
          </div>
        )}

        {issuing && (
          <div className="space-y-3 rounded-sm border border-line p-3">
            {openStations.length === 0 ? (
              <p className="text-[13px] lg:text-[12px] text-danger">لا يوجد مكتب تسجيل مفتوح في نطاق حسابك للإصدار منه.</p>
            ) : (
              openStations.length > 1 && (
                <select
                  value={chosenStationId}
                  onChange={(e) => setChosenStationId(e.target.value)}
                  className="h-9 w-full rounded-sm bg-surface-alt px-3 text-[13px] lg:text-[12.5px] sm:w-80"
                >
                  <option value="">اختر مكتب التسجيل الذي تعمل فيه</option>
                  {openStations.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )
            )}
            {!issuing.started ? (
              <div className="space-y-2">
                <label className="block text-[13px] lg:text-[12px] font-bold text-ink-soft">سبب إصدار بطاقة جديدة</label>
                <select
                  value={issuing.reason}
                  onChange={(e) => setIssuing({ ...issuing, reason: e.target.value as IssuableReason })}
                  className="h-9 w-full rounded-sm bg-surface-alt px-3 text-[13px] lg:text-[12.5px] sm:w-80"
                  data-testid="vehicle-card-reason"
                >
                  {REPLACEMENT_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {CARD_REASON_LABELS[r]}
                    </option>
                  ))}
                </select>
                <input
                  value={issuing.note}
                  onChange={(e) => setIssuing({ ...issuing, note: e.target.value })}
                  placeholder="تفاصيل (اختياري) — مثل مكان فقدان البطاقة"
                  className="h-9 w-full rounded-sm bg-surface-alt px-3 text-[13px] lg:text-[12.5px]"
                />
                <p className="text-[13px] lg:text-[12px] text-ink-faint">البطاقة الحالية (إن وُجدت) تتوقف عن العمل فور إصدار الجديدة. يُسجَّل الإجراء في سجل التغييرات.</p>
                <div className="flex gap-2">
                  <PillButton size="sm" disabled={!stationId} onClick={() => setIssuing({ ...issuing, started: true })}>
                    متابعة
                  </PillButton>
                  <PillButton size="sm" variant="ghost" onClick={() => setIssuing(null)}>
                    إلغاء
                  </PillButton>
                </div>
              </div>
            ) : stationId ? (
              <CardIssueFlow
                vehicleId={vehicleId}
                registrationStationId={stationId}
                reason={issuing.reason}
                reasonNote={issuing.note}
                onCancel={() => setIssuing(null)}
                onDone={() => {
                  setIssuing(null);
                  setMessage('تم إصدار البطاقة وطباعتها.');
                }}
              />
            ) : null}
          </div>
        )}

        {cards.length > 0 && (
          <div>
            <p className="mb-1.5 text-[13px] lg:text-[12px] font-bold text-ink-soft">سجل البطاقات</p>
            <ul className="divide-y divide-line rounded-sm border border-line" data-testid="vehicle-card-history">
              {cards.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[13px] lg:text-[12px]">
                  <span className="flex items-center gap-2">
                    <LtrText>
                      <span className="font-bold">{c.cardNumber}</span>
                    </LtrText>
                    <StatusPill variant={STATUS_VARIANT[c.status]}>{CARD_STATUS_LABELS[c.status]}</StatusPill>
                  </span>
                  <span className="text-ink-soft">
                    {CARD_REASON_LABELS[c.reason]} · <LtrText>{c.printedIssueDate}</LtrText> · {c.issuedBy.fullName}
                    {c.status === 'CANCELLED' && c.cancelReason
                      ? ` · سبب الإلغاء: ${c.cancelReason === 'FAILED_PRINT' ? 'فشل الطباعة' : c.cancelReason}`
                      : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}
