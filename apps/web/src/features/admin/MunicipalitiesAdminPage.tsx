import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { Card, CardHeader } from '../../components/design/Card';
import { PillButton } from '../../components/design/PillButton';
import { StatusPill } from '../../components/design/StatusPill';
import type { MunicipalityRef } from '../stations/types';
import { PrintRegistrationSheetButton } from '../../components/PrintRegistrationSheetButton';
import { DateField } from '../../components/DateField';
import { adminErrorMessage } from './adminErrors';

const STAGE_LABELS = { GRACE: 'سماح', AWARENESS: 'توعية', CARD_REQUIRED: 'البطاقة مطلوبة' } as const;

// Today as an Africa/Tripoli calendar day (YYYY-MM-DD) — the server decides
// the stage; this is only used to know when to ask for the typed name.
function tripoliToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Tripoli' }).format(new Date());
}

const inputClass =
  'h-9 rounded-sm bg-surface-alt px-3 text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-accent';

// Registration pivot, phase 2 — the admin screen Phase 1 left API-only.
// A municipality is PREPARING (admin-only, no fill-ups) or LIVE. Going
// live needs its security authority first (the API enforces it). Going
// back from LIVE to PREPARING instantly stops every fill-up there, so it
// demands the admin type the municipality's exact name — and the API
// checks that too, not just this screen.
export function MunicipalitiesAdminPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [confirming, setConfirming] = useState<MunicipalityRef | null>(null);
  const [typedName, setTypedName] = useState('');
  const [editingDates, setEditingDates] = useState<MunicipalityRef | null>(null);
  const [awarenessDraft, setAwarenessDraft] = useState('');
  const [deadlineDraft, setDeadlineDraft] = useState('');
  const [datesTypedName, setDatesTypedName] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'municipalities'],
    queryFn: async () => (await apiClient.get<MunicipalityRef[]>('/municipalities')).data,
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'municipalities'] });

  const createMutation = useMutation({
    mutationFn: () => apiClient.post('/municipalities', { name: newName.trim() }),
    onSuccess: () => {
      setError(null);
      setShowCreate(false);
      setNewName('');
      invalidate();
    },
    onError: (err) => setError(adminErrorMessage(err, 'تعذر إضافة البلدية.')),
  });

  const statusMutation = useMutation({
    mutationFn: (payload: { id: string; status: 'LIVE' | 'PREPARING'; confirmName?: string }) =>
      apiClient.patch(`/municipalities/${payload.id}`, { status: payload.status, confirmName: payload.confirmName }),
    onSuccess: () => {
      setError(null);
      setConfirming(null);
      setTypedName('');
      invalidate();
      // Station lists show preparing/live, and non-admins' lists change.
      queryClient.invalidateQueries({ queryKey: ['stations'] });
    },
    onError: (err) => setError(adminErrorMessage(err, 'تعذر تغيير حالة البلدية.')),
  });

  const needsDeadlineConfirm = !!deadlineDraft && deadlineDraft <= tripoliToday();
  const datesMutation = useMutation({
    mutationFn: (payload: { id: string; awarenessStartDate: string | null; cardRequiredFromDate: string | null; confirmName?: string }) =>
      apiClient.patch(`/municipalities/${payload.id}`, {
        awarenessStartDate: payload.awarenessStartDate,
        cardRequiredFromDate: payload.cardRequiredFromDate,
        confirmName: payload.confirmName,
      }),
    onSuccess: () => {
      setError(null);
      setEditingDates(null);
      setDatesTypedName('');
      invalidate();
    },
    onError: (err) => setError(adminErrorMessage(err, 'تعذر حفظ تواريخ المراحل.')),
  });

  const codeMutation = useMutation({
    mutationFn: (payload: { id: string; code: string }) => apiClient.patch(`/municipalities/${payload.id}`, { code: payload.code }),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (err) => {
      setError(adminErrorMessage(err, 'رمز البلدية يجب أن يكون من 2 إلى 5 أحرف إنجليزية كبيرة.'));
      invalidate();
    },
  });

  return (
    <div className="space-y-4">
      {showCreate && (
        <Card className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-[11.5px] text-ink-soft">اسم البلدية</label>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} className={`${inputClass} w-56`} />
            </div>
            <PillButton disabled={!newName.trim() || createMutation.isPending} onClick={() => createMutation.mutate()}>
              إضافة
            </PillButton>
          </div>
          <p className="mt-2 text-[11px] text-ink-faint">تبدأ البلدية الجديدة «قيد الإعداد» — لا تظهر محطاتها إلا للإدارة.</p>
        </Card>
      )}

      {confirming && (
        <Card className="border-t-4 border-danger p-4" data-testid="municipality-deactivate-confirm">
          <p className="text-[13px] font-bold text-danger">إعادة «{confirming.name}» إلى قيد الإعداد</p>
          <p className="mt-1.5 text-[12px] leading-[1.8] text-ink-soft">
            سيتوقف تسجيل أي تعبئة في كل محطات هذه البلدية فورًا، وتختفي محطاتها عن غير الإدارة. للتأكيد اكتب اسم البلدية
            كما هو:
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <input
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              placeholder={confirming.name}
              className={`${inputClass} w-56`}
              data-testid="municipality-confirm-name"
            />
            <PillButton
              variant="danger"
              disabled={typedName.trim() !== confirming.name || statusMutation.isPending}
              onClick={() =>
                statusMutation.mutate({ id: confirming.id, status: 'PREPARING', confirmName: typedName.trim() })
              }
            >
              إعادة إلى قيد الإعداد
            </PillButton>
            <PillButton
              variant="ghost"
              onClick={() => {
                setConfirming(null);
                setTypedName('');
              }}
            >
              إلغاء
            </PillButton>
          </div>
        </Card>
      )}

      {editingDates && (
        <Card className="p-4" data-testid="municipality-dates-editor">
          <p className="text-[13px] font-bold text-ink">مراحل «{editingDates.name}»</p>
          <p className="mt-1.5 text-[12px] leading-[1.8] text-ink-soft">
            التواريخ بتوقيت طرابلس، وتبدأ المرحلة عند منتصف الليل. اترك التاريخ فارغًا لعدم تحديده؛ بلا موعد نهائي تبقى
            البلدية في مرحلة السماح.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-[11.5px] text-ink-soft">بدء التوعية</label>
              <DateField value={awarenessDraft} onChange={setAwarenessDraft} inputClassName="h-9 text-[12.5px]" />
            </div>
            <div>
              <label className="mb-1 block text-[11.5px] text-ink-soft">البطاقة مطلوبة ابتداءً من</label>
              <DateField value={deadlineDraft} onChange={setDeadlineDraft} inputClassName="h-9 text-[12.5px]" />
            </div>
          </div>
          {needsDeadlineConfirm && (
            <div className="mt-3" data-testid="municipality-dates-confirm">
              <p className="text-[12px] font-bold text-danger">
                هذا الموعد اليوم أو قبله، فسيُرفض فورًا كل تعبئة بدون بطاقة فعّالة. للتأكيد اكتب اسم البلدية كما هو:
              </p>
              <input
                value={datesTypedName}
                onChange={(e) => setDatesTypedName(e.target.value)}
                placeholder={editingDates.name}
                className={`${inputClass} mt-2 w-56`}
                data-testid="municipality-dates-confirm-name"
              />
            </div>
          )}
          <div className="mt-3 flex gap-3">
            <PillButton
              variant={needsDeadlineConfirm ? 'danger' : undefined}
              disabled={datesMutation.isPending || (needsDeadlineConfirm && datesTypedName.trim() !== editingDates.name)}
              onClick={() =>
                datesMutation.mutate({
                  id: editingDates.id,
                  awarenessStartDate: awarenessDraft || null,
                  cardRequiredFromDate: deadlineDraft || null,
                  confirmName: needsDeadlineConfirm ? datesTypedName.trim() : undefined,
                })
              }
            >
              حفظ
            </PillButton>
            <PillButton variant="ghost" onClick={() => setEditingDates(null)}>
              إلغاء
            </PillButton>
          </div>
        </Card>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      <Card>
        <CardHeader
          title="البلديات"
          subtitle={data ? `${data.filter((m) => m.status === 'LIVE').length} مفعّلة من ${data.length}` : undefined}
          action={
            <PillButton size="sm" onClick={() => setShowCreate((s) => !s)}>
              {showCreate ? 'إلغاء' : 'بلدية جديدة +'}
            </PillButton>
          }
        />
        {isLoading && <p className="p-4 text-sm text-ink-soft">...جارٍ التحميل</p>}
        {isError && <p className="p-4 text-sm text-danger">تعذر تحميل البلديات.</p>}
        {data && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-[12.5px]">
              <thead>
                <tr className="bg-surface-alt text-[11px] font-bold text-ink-soft">
                  <th className="px-[18px] py-2.5 text-start">البلدية</th>
                  <th className="px-[18px] py-2.5 text-start">رمز البطاقات</th>
                  <th className="px-[18px] py-2.5 text-start">الحالة</th>
                  <th className="px-[18px] py-2.5 text-start">المرحلة</th>
                  <th className="px-[18px] py-2.5 text-start">الجهة الأمنية</th>
                  <th className="px-[18px] py-2.5 text-start"></th>
                </tr>
              </thead>
              <tbody>
                {data.map((m) => (
                  <tr key={m.id} className="border-b border-surface-alt last:border-0">
                    <td className="px-[18px] py-3 font-bold text-ink">{m.name}</td>
                    <td className="px-[18px] py-3">
                      {/* Card-number prefix: SBH → cards read SBH-7K2M9Q4X. */}
                      <input
                        defaultValue={m.code ?? ''}
                        placeholder="—"
                        dir="ltr"
                        maxLength={5}
                        onBlur={(e) => {
                          const code = e.target.value.trim().toUpperCase();
                          if (code && code !== (m.code ?? '')) codeMutation.mutate({ id: m.id, code });
                        }}
                        className={`${inputClass} w-20 font-mono uppercase`}
                        aria-label="رمز البطاقات"
                      />
                    </td>
                    <td className="px-[18px] py-3">
                      <StatusPill variant={m.status === 'LIVE' ? 'ok' : 'neutral'}>
                        {m.status === 'LIVE' ? 'مفعّلة' : 'قيد الإعداد'}
                      </StatusPill>
                    </td>
                    <td className="px-[18px] py-3" data-testid={`municipality-stage-${m.id}`}>
                      <StatusPill variant={m.stage === 'CARD_REQUIRED' ? 'ok' : 'neutral'}>
                        {STAGE_LABELS[m.stage ?? 'GRACE']}
                      </StatusPill>
                      {/* Persistent: grace is running (LIVE, or awareness already
                          started) and nothing says when it ends, so cars without a
                          card are accepted indefinitely. */}
                      {(m.status === 'LIVE' || m.awarenessStartDate) && !m.cardRequiredFromDate && (
                        <p
                          role="alert"
                          className="mt-1.5 rounded-sm border border-accent bg-accent-100 px-2 py-1.5 text-[11px] font-extrabold text-ink"
                          data-testid={`municipality-no-deadline-warning-${m.id}`}
                        >
                          ⚠ فترة السماح فعّالة — لم يُحدَّد موعد نهائي
                          <span className="block text-[10.5px] font-bold text-ink-soft">
                            تُقبل التعبئة بدون بطاقة بلا حدّ زمني حتى تحدد الموعد.
                          </span>
                        </p>
                      )}
                      <button
                        type="button"
                        className="mt-1 block text-[11px] font-bold text-primary underline"
                        onClick={() => {
                          setError(null);
                          setAwarenessDraft(m.awarenessStartDate ?? '');
                          setDeadlineDraft(m.cardRequiredFromDate ?? '');
                          setDatesTypedName('');
                          setEditingDates(m);
                        }}
                      >
                        تواريخ المراحل
                      </button>
                      <PrintRegistrationSheetButton municipalityId={m.id} className="mt-1 block" />
                    </td>
                    <td className="px-[18px] py-3 text-ink-soft">
                      {m.securityAuthority?.name ?? <span className="text-ink-faint">— لا توجد —</span>}
                    </td>
                    <td className="px-[18px] py-3">
                      {m.status === 'PREPARING' ? (
                        <PillButton
                          size="sm"
                          disabled={!m.securityAuthority || statusMutation.isPending}
                          title={m.securityAuthority ? undefined : 'أضف الجهة الأمنية أولًا'}
                          onClick={() => statusMutation.mutate({ id: m.id, status: 'LIVE' })}
                        >
                          تفعيل
                        </PillButton>
                      ) : (
                        <PillButton
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setError(null);
                            setTypedName('');
                            setConfirming(m);
                          }}
                        >
                          إعادة إلى قيد الإعداد
                        </PillButton>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
