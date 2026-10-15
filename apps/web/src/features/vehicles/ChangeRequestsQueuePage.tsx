import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiClient } from '../../lib/apiClient';
import { useAuth } from '../auth/AuthProvider';
import { LtrText } from '../../components/LtrText';
import { PageHeader } from '../../components/design/PageHeader';
import { Card } from '../../components/design/Card';
import { PillButton } from '../../components/design/PillButton';
import { StatusPill } from '../../components/design/StatusPill';
import { CodeText } from '../../components/design/CodeText';
import { vehicleChangeTypeLabel, identityTypeLabel } from '../../lib/labels';
import { diffValues } from '../../lib/textDiff';
import { REFERENCE_CODE_LABEL, referenceCode } from '@fuel-tracking/shared-types';
import type { VehicleChangeRequestEntry, OwnerChangeRequestEntry } from './types-change-requests';
import { SkeletonRows } from '../../components/design/Skeleton';
import { Pagination } from '../../components/Pagination';
import { useClientPage } from '../../lib/pageSize';

// Round 4 feedback item 7: consequences of approving are spelled out
// (which reports are affected, that the old value is kept in the record),
// not just an approve/reject pair with no context on what approval does.
// Generic across change types — the consequences are the same shape
// whether it's a chassis or booklet-number correction.
const APPROVAL_CONSEQUENCES = [
  'ستُحدَّث هوية المركبة في كل الشاشات فور الاعتماد.',
  'التقارير الصادرة سابقًا لا تتغيّر — يسري التصحيح على ما يُصدر بعد الاعتماد فقط.',
  'يبقى الرقم القديم محفوظًا في سجل المركبة، ولا يُحذف.',
];

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
// table row — each request carries a reason and its reference code that reads
// poorly squeezed into table cells.
export function ChangeRequestsQueuePage() {
  const queryClient = useQueryClient();
  const { hasPermission } = useAuth();
  const canReviewOwnerChanges = hasPermission('owners:approve_change');
  const [statusFilter, setStatusFilter] = useState<'PENDING' | 'APPROVED' | 'REJECTED' | ''>('PENDING');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['vehicle-change-requests', statusFilter],
    queryFn: async () =>
      (
        await apiClient.get<VehicleChangeRequestEntry[]>('/vehicles/change-requests', {
          params: { status: statusFilter || undefined, take: 100 },
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

  // Round 20: owner identity corrections are a distinct request shape
  // (identityType+identityNumber pair, not a single current/requested
  // string) — fetched and rendered as a second section rather than forced
  // into the same generic card loop as vehicle change requests above.
  const { data: ownerData, isLoading: ownerIsLoading, isError: ownerIsError } = useQuery({
    queryKey: ['owner-change-requests', statusFilter],
    queryFn: async () =>
      (
        await apiClient.get<OwnerChangeRequestEntry[]>('/owners/change-requests', {
          params: { status: statusFilter || undefined, take: 100 },
        })
      ).data,
    enabled: canReviewOwnerChanges,
  });
  // 10 a page each; the two lists keep their own page in the address.
  const vehiclePage = useClientPage(data ?? []);
  const ownerPage = useClientPage(ownerData ?? [], 'opage');

  const approveOwnerMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/owners/change-requests/${id}/approve`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['owner-change-requests'] }),
  });

  const rejectOwnerMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiClient.post(`/owners/change-requests/${id}/reject`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owner-change-requests'] });
      setRejectingId(null);
      setRejectReason('');
    },
  });

  return (
    <div>
      <PageHeader
        title="طلبات التعديل والتصحيح"
        actions={
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="h-9 rounded-sm bg-surface-alt px-3 text-[13px] lg:text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-primary-dark"
          >
            <option value="">الكل</option>
            <option value="PENDING">قيد الانتظار</option>
            <option value="APPROVED">معتمد</option>
            <option value="REJECTED">مرفوض</option>
          </select>
        }
      />

      <p className="mb-3 mt-2 text-[15px] lg:text-[13px] font-extrabold text-ink">طلبات تعديل بيانات المركبة</p>
      {isLoading && <SkeletonRows rows={4} />}
      {isError && <p className="text-[15px] lg:text-[13px] text-danger">تعذر تحميل الطلبات.</p>}

      {data && (
        <div className="space-y-4">
          {vehiclePage.pageItems.map((r) => {
            const diff = diffValues(r.currentValue, r.requestedValue);
            return (
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
                  <p className="mt-0.5 text-[13px] lg:text-[12px] text-ink-faint">{vehicleChangeTypeLabel(r.changeType)}</p>
                </div>
                <StatusPill variant={STATUS_VARIANT[r.status]}>{STATUS_LABELS[r.status]}</StatusPill>
              </div>

              <div className="mt-4 grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_30px_1fr] sm:gap-0">
                <div className="rounded-sm bg-surface-alt px-3.5 py-3">
                  <div className="text-[13px] lg:text-[12px] text-ink-soft">الساري الآن</div>
                  <div className="mt-1.5">
                    <LtrText>
                      <span className="font-mono text-[14px] lg:text-[13px] font-bold text-ink">{r.currentValue}</span>
                    </LtrText>
                  </div>
                </div>
                <div className="rotate-90 text-center text-ink-faint sm:rotate-0">←</div>
                <div className="rounded-sm border border-accent bg-accent-100 px-3.5 py-3">
                  <div className="text-[13px] lg:text-[12px] text-accent-ink">المقترح — يختلف في الخانات المظللة</div>
                  <div className="mt-1.5">
                    <LtrText>
                      <span className="font-mono text-[14px] lg:text-[13px] font-bold text-ink">
                        {diff.prefix}
                        <mark
                          className="rounded-sm bg-accent px-0.5 text-ink"
                          data-testid="change-request-diff-highlight"
                        >
                          {diff.newChanged}
                        </mark>
                        {diff.suffix}
                      </span>
                    </LtrText>
                  </div>
                </div>
              </div>

              <p className="mt-3 text-[13px] lg:text-[12.5px] leading-[1.7] text-ink">{r.reason}</p>
              <p className="mt-1 text-[13px] lg:text-[12px] text-ink-faint" data-testid="change-request-code">
                {REFERENCE_CODE_LABEL}: <CodeText>{referenceCode('VEHICLE_CHANGE', r.id)}</CodeText>
              </p>

              {r.status === 'REJECTED' && r.rejectionReason && (
                <p className="mt-2 text-[13px] lg:text-[12px] text-danger">سبب الرفض: {r.rejectionReason}</p>
              )}

              {r.status === 'PENDING' && (
                <>
                  <div className="mt-4 rounded-sm bg-surface-alt p-3.5">
                    <p className="mb-1.5 text-[13px] lg:text-[12px] font-bold text-ink">ما يتأثر بالاعتماد</p>
                    <ul className="space-y-1">
                      {APPROVAL_CONSEQUENCES.map((c) => (
                        <li key={c} className="flex gap-1.5 text-[13px] lg:text-[12px] text-ink-soft">
                          <span className="text-ink-faint">•</span>
                          {c}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <PillButton
                      size="sm"
                      onClick={() => approveMutation.mutate(r.id)}
                      disabled={approveMutation.isPending}
                      variant="brand"
                    >
                      اعتماد التصحيح
                    </PillButton>
                    {rejectingId === r.id ? (
                      <div className="flex w-full flex-1 flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
                        <input
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          placeholder="سبب الرفض"
                          className="h-9 flex-1 rounded-sm bg-surface-alt px-3 text-[13px] lg:text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-primary-dark"
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
                        رفض مع ذكر السبب
                      </PillButton>
                    )}
                  </div>
                </>
              )}
            </Card>
            );
          })}
          {data.length === 0 && (
            <Card className="p-6 text-center text-[15px] lg:text-[13px] text-ink-soft">لا توجد طلبات مطابقة</Card>
          )}
          <Pagination skip={vehiclePage.skip} take={vehiclePage.take} total={vehiclePage.total} onSkipChange={vehiclePage.setSkip} testId="vehicle-requests-pager" />
        </div>
      )}

      {canReviewOwnerChanges && (
        <>
          <p className="mb-3 mt-6 text-[15px] lg:text-[13px] font-extrabold text-ink">طلبات تصحيح هوية المالك</p>
          {ownerIsLoading && <SkeletonRows rows={4} />}
          {ownerIsError && <p className="text-[15px] lg:text-[13px] text-danger">تعذر تحميل الطلبات.</p>}

          {ownerData && (
            <div className="space-y-4">
              {ownerPage.pageItems.map((r) => (
                <Card key={r.id} className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[15px] font-extrabold text-ink">{r.owner?.fullName ?? r.ownerId}</span>
                      <p className="mt-0.5 text-[13px] lg:text-[12px] text-ink-faint">تصحيح رقم/نوع الهوية</p>
                    </div>
                    <StatusPill variant={STATUS_VARIANT[r.status]}>{STATUS_LABELS[r.status]}</StatusPill>
                  </div>

                  <div className="mt-4 grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_30px_1fr] sm:gap-0">
                    <div className="rounded-sm bg-surface-alt px-3.5 py-3">
                      <div className="text-[13px] lg:text-[12px] text-ink-soft">الساري الآن</div>
                      <div className="mt-1.5">
                        <p className="text-[13px] lg:text-[12px] text-ink-faint">{identityTypeLabel(r.currentIdentityType)}</p>
                        <LtrText>
                          <span className="font-mono text-[14px] lg:text-[13px] font-bold text-ink">{r.currentIdentityNumber}</span>
                        </LtrText>
                      </div>
                    </div>
                    <div className="rotate-90 text-center text-ink-faint sm:rotate-0">←</div>
                    <div className="rounded-sm border border-accent bg-accent-100 px-3.5 py-3">
                      <div className="text-[13px] lg:text-[12px] text-accent-ink">المقترح</div>
                      <div className="mt-1.5">
                        <p className="text-[13px] lg:text-[12px] text-accent-ink">{identityTypeLabel(r.requestedIdentityType)}</p>
                        <LtrText>
                          <span className="font-mono text-[14px] lg:text-[13px] font-bold text-ink">{r.requestedIdentityNumber}</span>
                        </LtrText>
                      </div>
                    </div>
                  </div>

                  <p className="mt-3 text-[13px] lg:text-[12.5px] leading-[1.7] text-ink">{r.reason}</p>
                  <p className="mt-1 text-[13px] lg:text-[12px] text-ink-faint" data-testid="change-request-code">
                    {REFERENCE_CODE_LABEL}: <CodeText>{referenceCode('OWNER_CHANGE', r.id)}</CodeText>
                  </p>

                  {r.status === 'REJECTED' && r.rejectionReason && (
                    <p className="mt-2 text-[13px] lg:text-[12px] text-danger">سبب الرفض: {r.rejectionReason}</p>
                  )}

                  {r.status === 'PENDING' && (
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <PillButton
                        size="sm"
                        onClick={() => approveOwnerMutation.mutate(r.id)}
                        disabled={approveOwnerMutation.isPending}
                        variant="brand"
                      >
                        اعتماد التصحيح
                      </PillButton>
                      {rejectingId === r.id ? (
                        <div className="flex w-full flex-1 flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
                          <input
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="سبب الرفض"
                            className="h-9 flex-1 rounded-sm bg-surface-alt px-3 text-[13px] lg:text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-primary-dark"
                          />
                          <PillButton
                            size="sm"
                            variant="danger"
                            onClick={() =>
                              rejectReason.trim() && rejectOwnerMutation.mutate({ id: r.id, reason: rejectReason })
                            }
                            disabled={rejectOwnerMutation.isPending || !rejectReason.trim()}
                          >
                            تأكيد الرفض
                          </PillButton>
                        </div>
                      ) : (
                        <PillButton size="sm" variant="danger" onClick={() => setRejectingId(r.id)}>
                          رفض مع ذكر السبب
                        </PillButton>
                      )}
                    </div>
                  )}
                </Card>
              ))}
              {ownerData.length === 0 && (
                <Card className="p-6 text-center text-[15px] lg:text-[13px] text-ink-soft">لا توجد طلبات مطابقة</Card>
              )}
              <Pagination skip={ownerPage.skip} take={ownerPage.take} total={ownerPage.total} onSkipChange={ownerPage.setSkip} testId="owner-requests-pager" />
            </div>
          )}
        </>
      )}
    </div>
  );
}
