import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiClient } from '../../lib/apiClient';
import { LtrText } from '../../components/LtrText';
import { PageHeader } from '../../components/design/PageHeader';
import { Card } from '../../components/design/Card';
import { PillButton } from '../../components/design/PillButton';
import { StatusPill } from '../../components/design/StatusPill';
import { CodeText } from '../../components/design/CodeText';
import type { VehicleChangeRequestEntry } from './types-change-requests';

const CHANGE_TYPE_LABELS: Record<VehicleChangeRequestEntry['changeType'], string> = {
  CHASSIS_CHANGE: 'رقم الشاصي',
  BOOKLET_CHANGE: 'رقم كتيب المركبة',
};

const STATUS_VARIANT: Record<VehicleChangeRequestEntry['status'], 'accent' | 'ok' | 'danger'> = {
  PENDING: 'accent',
  APPROVED: 'ok',
  REJECTED: 'danger',
};

const STATUS_LABELS: Record<VehicleChangeRequestEntry['status'], string> = {
  PENDING: 'قيد الانتظار',
  APPROVED: 'معتمد',
  REJECTED: 'مرفوض',
};

// First UI ever built against the vehicle change-request backend (built
// an earlier phase, item 5). Old value -> new value, requester, reason —
// approve and reject actions, reject requiring its own reason (matches
// what the backend already requires — RejectVehicleChangeRequestDto).
//
// Card-per-request matches 2e's identity-change review pattern (pending
// badge as an amber pill, old/new value comparison) rather than a bare
// table row — each request carries a reason + proof reference that reads
// poorly squeezed into table cells.
export function ChangeRequestsQueuePage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<'PENDING' | 'APPROVED' | 'REJECTED' | ''>('PENDING');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['vehicle-change-requests', statusFilter],
    queryFn: async () =>
      (
        await apiClient.get<VehicleChangeRequestEntry[]>('/vehicles/change-requests', {
          params: { status: statusFilter || undefined, take: 50 },
        })
      ).data,
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/vehicles/change-requests/${id}/approve`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vehicle-change-requests'] }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiClient.post(`/vehicles/change-requests/${id}/reject`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicle-change-requests'] });
      setRejectingId(null);
      setRejectReason('');
    },
  });

  return (
    <div>
      <PageHeader
        title="طلبات تعديل هوية المركبة"
        actions={
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="h-9 rounded-sm bg-surface-alt px-3 text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="">الكل</option>
            <option value="PENDING">قيد الانتظار</option>
            <option value="APPROVED">معتمد</option>
            <option value="REJECTED">مرفوض</option>
          </select>
        }
      />

      {isLoading && <p className="text-[13px] text-ink-soft">...جارٍ التحميل</p>}
      {isError && <p className="text-[13px] text-danger">تعذر تحميل الطلبات.</p>}

      {data && (
        <div className="space-y-4">
          {data.map((r) => (
            <Card key={r.id} className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  {r.vehicle ? (
                    <Link to={`/vehicles/${r.vehicle.id}`} className="text-[15px] font-extrabold text-primary hover:underline">
                      {r.vehicle.internalCode}
                    </Link>
                  ) : (
                    <span className="text-[15px] font-extrabold text-ink">{r.vehicleId}</span>
                  )}
                  <p className="mt-0.5 text-[11px] text-ink-faint">{CHANGE_TYPE_LABELS[r.changeType]}</p>
                </div>
                <StatusPill variant={STATUS_VARIANT[r.status]}>{STATUS_LABELS[r.status]}</StatusPill>
              </div>

              <div className="mt-4 grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_30px_1fr] sm:gap-0">
                <div className="rounded-sm bg-surface-alt px-3.5 py-3">
                  <div className="text-[10.5px] text-ink-soft">الساري الآن</div>
                  <div className="mt-1.5">
                    <LtrText>
                      <span className="font-mono text-[14px] font-bold text-ink">{r.currentValue}</span>
                    </LtrText>
                  </div>
                </div>
                <div className="rotate-90 text-center text-ink-faint sm:rotate-0">←</div>
                <div className="rounded-sm bg-accent-100 px-3.5 py-3">
                  <div className="text-[10.5px] text-accent-dark">المقترح</div>
                  <div className="mt-1.5">
                    <LtrText>
                      <span className="font-mono text-[14px] font-bold text-ink">{r.requestedValue}</span>
                    </LtrText>
                  </div>
                </div>
              </div>

              <p className="mt-3 text-[12.5px] leading-[1.7] text-ink">{r.reason}</p>
              {r.proofReference && (
                <p className="mt-1 text-[11px] text-ink-faint">
                  مرجع الإثبات: <CodeText>{r.proofReference}</CodeText>
                </p>
              )}

              {r.status === 'REJECTED' && r.rejectionReason && (
                <p className="mt-2 text-[12px] text-danger">سبب الرفض: {r.rejectionReason}</p>
              )}

              {r.status === 'PENDING' && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <PillButton
                    size="sm"
                    onClick={() => approveMutation.mutate(r.id)}
                    disabled={approveMutation.isPending}
                    className="!bg-primary !text-white !border-0 !shadow-none"
                  >
                    اعتماد التصحيح
                  </PillButton>
                  {rejectingId === r.id ? (
                    <div className="flex w-full flex-1 flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
                      <input
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="سبب الرفض"
                        className="h-9 flex-1 rounded-sm bg-surface-alt px-3 text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                      />
                      <PillButton
                        size="sm"
                        variant="danger"
                        onClick={() => rejectReason.trim() && rejectMutation.mutate({ id: r.id, reason: rejectReason })}
                        disabled={rejectMutation.isPending || !rejectReason.trim()}
                      >
                        تأكيد الرفض
                      </PillButton>
                    </div>
                  ) : (
                    <PillButton size="sm" variant="danger" onClick={() => setRejectingId(r.id)}>
                      رفض بسبب
                    </PillButton>
                  )}
                </div>
              )}
            </Card>
          ))}
          {data.length === 0 && (
            <Card className="p-6 text-center text-[13px] text-ink-soft">لا توجد طلبات مطابقة</Card>
          )}
        </div>
      )}
    </div>
  );
}
