import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { identityTypeLabel } from '../../lib/labels';
import { maskIdentityNumber } from '../../lib/masking';
import { formatLicensePlate } from '../../lib/libyanFormats';
import { formatDateTime } from '../../lib/dateFormat';
import { AUDIT_ACTION_LABELS, AUDIT_FIELD_LABELS, auditValueText } from '../../lib/auditLabels';
import { PageHeader } from '../../components/design/PageHeader';
import { Card, CardHeader } from '../../components/design/Card';
import { Dialog } from '../../components/design/Dialog';
import { PillButton } from '../../components/design/PillButton';
import { TextAreaField } from '../../components/design/TextField';
import { SkeletonRows } from '../../components/design/Skeleton';
import { Pagination } from '../../components/Pagination';
import { LtrText } from '../../components/LtrText';
import { OwnerIdentityReveal } from '../../components/OwnerIdentityReveal';
import { Icon, ICONS } from '../../components/icons';
import { usePageParam } from '../../lib/usePageParam';
import { LIST_PAGE_SIZE } from '../../lib/pageSize';
import { useAuth } from '../auth/AuthProvider';
import { Notice } from '../users/parts';
import { OwnerEditForm } from '../vehicles/OwnerEditForm';
import { registrationErrorMessage } from '../registration/registrationErrors';

// After review (Khalil, 28 Oct 2026): «الملاك» — the owners registry for the
// office managers and those above them: find an owner, correct their details
// (and, for who may, their identity), see their vehicles and detach one from
// them, and read their history. Every change is in the audit log; the
// owner's own history is shown on their page.

interface OwnerListItem {
  id: string;
  fullName: string;
  identityType: string;
  identityNumber: string;
  phone: string | null;
  vehicleCount: number;
  createdAt: string;
}

interface OwnerDetail {
  id: string;
  fullName: string;
  identityType: string;
  identityNumber: string;
  phone: string | null;
  address: string | null;
  createdAt: string;
  vehicles: Array<{
    id: string;
    internalCode: string;
    currentPlate: string;
    make: string | null;
    model: string | null;
    color: string | null;
    createdAt: string;
    activeCardNumber: string | null;
  }>;
  history: Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    oldValue: Record<string, unknown> | null;
    newValue: Record<string, unknown> | null;
    createdAt: string;
    user: { id: string; fullName: string; username: string } | null;
  }>;
}

const TAKE = LIST_PAGE_SIZE;

function BackLink() {
  return (
    <Link
      to="/owners"
      className="inline-flex min-h-[44px] items-center gap-2 rounded-full pe-3 text-[16px] font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-dark lg:text-[14px]"
    >
      <Icon d={ICONS.arrowBack} size={18} />
      العودة إلى الملاك
    </Link>
  );
}

// ── the list ─────────────────────────────────────────────────────────────

export function OwnersListPage() {
  const { user } = useAuth();
  const permissions = user?.permissions ?? [];
  const { skip, setSkip } = usePageParam(TAKE);
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => {
      if (text.trim() !== search) {
        setSearch(text.trim());
        setSkip(0);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [text]);

  const list = useQuery({
    queryKey: ['owners', 'manage', search, skip],
    placeholderData: (prev) => prev,
    queryFn: async () =>
      (
        await apiClient.get<{ total: number; items: OwnerListItem[] }>('/owners', {
          params: { paged: true, skip, take: TAKE, search: search || undefined },
        })
      ).data,
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="الملاك"
        subtitle={list.data ? `${list.data.total.toLocaleString('en-US')} مالك — ابحث، صحّح البيانات، واطّلع على مركباتهم وسجلّهم` : undefined}
      />
      <Card>
        <div className="p-4 lg:px-[18px]">
          <label htmlFor="owners-search" className="mb-1.5 block text-[14px] font-bold text-ink lg:text-[12px]">
            بحث بالاسم أو رقم الهوية أو الهاتف
          </label>
          <input
            id="owners-search"
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="h-[52px] w-full rounded-sm border border-line bg-surface-alt px-3.5 text-[16px] text-ink focus:outline-none focus:ring-2 focus:ring-primary-dark lg:h-11 lg:text-[14px]"
            data-testid="owners-search"
          />
        </div>
        {list.isLoading && <SkeletonRows rows={6} />}
        {list.isError && <p className="p-4 text-[15px] text-danger lg:text-[13px]">تعذّر تحميل الملاك. تأكد من الاتصال ثم أعد المحاولة.</p>}
        {list.data && (
          <>
            {list.data.items.length === 0 ? (
              <p className="p-6 text-center text-[15px] text-ink-soft lg:text-[13px]">لا يوجد ملاك يطابقون البحث.</p>
            ) : (
              <ul className="divide-y divide-line-soft" data-testid="owners-list">
                {list.data.items.map((o) => (
                  <li key={o.id}>
                    <Link to={`/owners/${o.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-surface-alt lg:px-[18px]">
                      <div className="min-w-0">
                        <p className="text-[16px] font-bold text-ink lg:text-[14px]">{o.fullName}</p>
                        <p className="text-[14px] text-ink-soft lg:text-[12px]">
                          {identityTypeLabel(o.identityType)} <LtrText>{maskIdentityNumber(o.identityNumber, permissions)}</LtrText>
                          {o.phone && (
                            <>
                              {' · '}
                              <LtrText>{o.phone}</LtrText>
                            </>
                          )}
                        </p>
                      </div>
                      <span className="rounded-full bg-surface-alt px-3 py-1 text-[14px] font-bold text-ink lg:text-[12px]">
                        {o.vehicleCount.toLocaleString('en-US')} مركبة
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Pagination skip={skip} take={TAKE} total={list.data.total} onSkipChange={setSkip} testId="owners-pager" />
          </>
        )}
      </Card>
    </div>
  );
}

// ── one owner ────────────────────────────────────────────────────────────

function HistoryLine({ row, ownerId }: { row: OwnerDetail['history'][number]; ownerId: string }) {
  const who = row.user?.fullName ?? 'النظام';
  const action = AUDIT_ACTION_LABELS[row.action] ?? row.action;
  const about =
    row.entityType === 'Vehicle' ? (
      <>
        {' '}
        <Link to={`/vehicles/${row.entityId}`} className="font-bold text-primary-dark underline-offset-2 hover:underline">
          المركبة
        </Link>{' '}
        {row.newValue?.ownerId === ownerId ? '(أُعطيت له)' : '(أُخذت منه)'}
      </>
    ) : null;
  const keys = Object.keys(row.newValue ?? {}).filter((k) => !['ownerId', 'registrationStationId', 'revealed'].includes(k));
  return (
    <li className="py-2.5">
      <p className="text-[15px] text-ink lg:text-[13px]">
        <span className="font-bold">{who}</span> {action}
        {about}
      </p>
      {keys.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-[14px] text-ink-soft lg:text-[12px]">
          {keys.map((k) => (
            <li key={k}>
              {AUDIT_FIELD_LABELS[k] ?? k}:{' '}
              {row.oldValue && k in row.oldValue && (
                <>
                  <span className="line-through">{auditValueText(row.oldValue[k])}</span> ←{' '}
                </>
              )}
              <span className="font-bold text-ink">{auditValueText(row.newValue![k])}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[13px] text-ink-faint lg:text-[12px]">
        <LtrText>{formatDateTime(row.createdAt)}</LtrText>
      </p>
    </li>
  );
}

function DetachDialog({ vehicle, onClose }: { vehicle: OwnerDetail['vehicles'][number]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null | undefined>(undefined);
  const detach = useMutation({
    mutationFn: async () =>
      (await apiClient.post<{ cancelledCard: { cardNumber: string } | null }>(`/vehicles/${vehicle.id}/detach-owner`, { reason: reason.trim() })).data,
    onSuccess: async (res) => {
      setDone(res.cancelledCard?.cardNumber ?? null);
      await queryClient.invalidateQueries({ queryKey: ['owners'] });
      await queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      await queryClient.invalidateQueries({ queryKey: ['vehicle-cards', vehicle.id] });
    },
    onError: (err) => setError(registrationErrorMessage(err)),
  });
  if (done !== undefined) {
    return (
      <Dialog open title="فُكّت المركبة من المالك" onClose={onClose} footer={<PillButton size="field" onClick={onClose}>تم</PillButton>}>
        <p className="text-[16px] leading-[1.7] text-ink lg:text-[14px]" data-testid="detach-done">
          صارت المركبة <LtrText>{formatLicensePlate(vehicle.currentPlate)}</LtrText> بلا مالك.{' '}
          {done ? (
            <>
              أُلغيت بطاقتها <bdi dir="ltr" className="font-mono font-bold">{done}</bdi>.
            </>
          ) : (
            'لم تكن لها بطاقة فعّالة.'
          )}{' '}
          تُعطى لمالكها الصحيح من صفحتها بـ«نقل الملكية».
        </p>
      </Dialog>
    );
  }
  return (
    <Dialog
      open
      title="فك المركبة من المالك"
      busy={detach.isPending}
      onClose={onClose}
      footer={
        <>
          <PillButton size="field" variant="secondary" disabled={detach.isPending} onClick={onClose}>
            رجوع
          </PillButton>
          <PillButton
            size="field"
            variant="danger"
            data-testid="detach-confirm"
            disabled={reason.trim().length < 3 || detach.isPending}
            onClick={() => {
              setError(null);
              detach.mutate();
            }}
          >
            {detach.isPending ? 'جارٍ الفك…' : 'فك المركبة وإلغاء بطاقتها'}
          </PillButton>
        </>
      }
    >
      <div className="space-y-4" data-testid="detach-dialog">
        <p className="rounded-md bg-accent-100 p-3 text-[15px] font-bold leading-[1.7] text-ink lg:text-[13px]">
          المركبة <LtrText>{formatLicensePlate(vehicle.currentPlate)}</LtrText> ({vehicle.internalCode}) ستصبح بلا مالك، وتُلغى بطاقتها
          {vehicle.activeCardNumber ? (
            <>
              {' '}
              <bdi dir="ltr" className="font-mono">{vehicle.activeCardNumber}</bdi>
            </>
          ) : null}
          . لا تُعبَّأ بعدها حتى تُعطى لمالك وتصدر لها بطاقة.
        </p>
        <TextAreaField label="سبب الفك (مطلوب)" value={reason} onChange={(e) => setReason(e.target.value)} />
        {error && <Notice kind="error">{error}</Notice>}
      </div>
    </Dialog>
  );
}

export function OwnerManagePage() {
  const { ownerId } = useParams();
  const { user, hasPermission } = useAuth();
  const permissions = user?.permissions ?? [];
  const canEditDetails = hasPermission('owners:manage');
  const canEditIdentity = hasPermission('owners:approve_change');
  const canDetach = hasPermission('vehicles:transfer_owner');
  const [editing, setEditing] = useState(false);
  const [detaching, setDetaching] = useState<OwnerDetail['vehicles'][number] | null>(null);

  const owner = useQuery({
    queryKey: ['owners', 'detail', ownerId],
    enabled: Boolean(ownerId),
    queryFn: async () => (await apiClient.get<OwnerDetail>(`/owners/${ownerId}/detail`)).data,
  });

  if (owner.isLoading) return <SkeletonRows rows={6} />;
  if (owner.isError || !owner.data) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Notice kind="error">تعذّر فتح هذا المالك.</Notice>
      </div>
    );
  }
  const o = owner.data;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <BackLink />
      <PageHeader title={o.fullName} subtitle={`مالك منذ ${formatDateTime(o.createdAt)}`} />

      <Card>
        <CardHeader
          title="البيانات"
          action={
            !editing && (canEditDetails || canEditIdentity) ? (
              <PillButton size="sm" variant="secondary" onClick={() => setEditing(true)} data-testid="owner-edit">
                تعديل
              </PillButton>
            ) : undefined
          }
        />
        <div className="p-4 lg:px-[18px]">
          {editing ? (
            <OwnerEditForm
              ownerId={o.id}
              fullName={o.fullName}
              phone={o.phone}
              identityType={o.identityType}
              canEditDetails={canEditDetails}
              canEditIdentity={canEditIdentity}
              onDone={() => {
                setEditing(false);
                void owner.refetch();
              }}
            />
          ) : (
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-[14px] text-ink-soft lg:text-[12px]">الاسم</dt>
                <dd className="text-[16px] font-bold text-ink lg:text-[14px]">{o.fullName}</dd>
              </div>
              <div>
                <dt className="text-[14px] text-ink-soft lg:text-[12px]">{identityTypeLabel(o.identityType)}</dt>
                <dd className="text-[16px] font-bold text-ink lg:text-[14px]">
                  <OwnerIdentityReveal ownerId={o.id} maskedValue={maskIdentityNumber(o.identityNumber, permissions)} />
                </dd>
              </div>
              <div>
                <dt className="text-[14px] text-ink-soft lg:text-[12px]">الهاتف</dt>
                <dd className="text-[16px] font-bold text-ink lg:text-[14px]">{o.phone ? <LtrText>{o.phone}</LtrText> : '—'}</dd>
              </div>
              <div>
                <dt className="text-[14px] text-ink-soft lg:text-[12px]">العنوان</dt>
                <dd className="text-[16px] font-bold text-ink lg:text-[14px]">{o.address ?? '—'}</dd>
              </div>
            </dl>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="مركباته" subtitle={`${o.vehicles.length} مركبة`} />
        {o.vehicles.length === 0 ? (
          <p className="p-4 text-[15px] text-ink-soft lg:text-[13px]">لا توجد مركبات باسم هذا المالك.</p>
        ) : (
          <ul className="divide-y divide-line-soft" data-testid="owner-vehicles">
            {o.vehicles.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 lg:px-[18px]">
                <Link to={`/vehicles/${v.id}`} className="min-w-0 hover:underline">
                  <p className="text-[16px] font-bold text-ink lg:text-[14px]">
                    <LtrText>{formatLicensePlate(v.currentPlate)}</LtrText>
                    <span className="ms-2 text-[14px] font-normal text-ink-soft lg:text-[12px]">{v.internalCode}</span>
                  </p>
                  <p className="text-[14px] text-ink-soft lg:text-[12px]">
                    {[v.make, v.model, v.color].filter(Boolean).join(' · ') || '—'} · البطاقة:{' '}
                    {v.activeCardNumber ? <bdi dir="ltr" className="font-mono">{v.activeCardNumber}</bdi> : 'لا توجد'}
                  </p>
                </Link>
                {canDetach && (
                  <PillButton size="sm" variant="secondary" onClick={() => setDetaching(v)} data-testid={`owner-detach-${v.id}`}>
                    فك من المالك
                  </PillButton>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="سجل التعديلات" subtitle="كل تعديل على المالك، وكل مركبة أُعطيت له أو أُخذت منه — من سجل التدقيق" />
        {o.history.length === 0 ? (
          <p className="p-4 text-[15px] text-ink-soft lg:text-[13px]">لا توجد تعديلات بعد.</p>
        ) : (
          <ul className="divide-y divide-line-soft px-4 lg:px-[18px]" data-testid="owner-history">
            {o.history.map((row) => (
              <HistoryLine key={row.id} row={row} ownerId={o.id} />
            ))}
          </ul>
        )}
        {hasPermission('audit:view') && (
          <p className="px-4 pb-3 text-[14px] lg:px-[18px] lg:text-[12px]">
            <Link to={`/admin/audit-log?entityType=VehicleOwner&entityId=${o.id}`} className="font-bold text-primary-dark hover:underline">
              فتح في سجل التدقيق
            </Link>
          </p>
        )}
      </Card>

      {detaching && <DetachDialog vehicle={detaching} onClose={() => setDetaching(null)} />}
    </div>
  );
}
