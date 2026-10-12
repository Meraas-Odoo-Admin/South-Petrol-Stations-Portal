import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { PillButton } from '../../components/design/PillButton';
import { Dialog } from '../../components/design/Dialog';
import { StatusPill } from '../../components/design/StatusPill';
import { TextField } from '../../components/design/TextField';
import { DateField } from '../../components/DateField';
import { PrintRegistrationSheetButton } from '../../components/PrintRegistrationSheetButton';
import { adminErrorMessage } from '../admin/adminErrors';
import { useAuth } from '../auth/AuthProvider';
import { Notice, SectionCard } from '../users/parts';
import type { MunicipalityLite } from './placesShared';

export const STAGE_LABELS = { GRACE: 'سماح', AWARENESS: 'توعية', CARD_REQUIRED: 'البطاقة مطلوبة' } as const;

// Today as an Africa/Tripoli calendar day (YYYY-MM-DD). The server decides the
// stage; this only tells when the typed name is asked for.
function tripoliToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Tripoli' }).format(new Date());
}

// The municipality's launch stage and its two dates. The municipality manager
// sets the dates of their own municipality; the server refuses any other
// field, and any other municipality, for them.
export function StageCard({ municipality }: { municipality: MunicipalityLite }) {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canSet = hasPermission('municipalities:manage') || hasPermission('municipalities:set_stage_dates');
  const [open, setOpen] = useState(false);
  const [awareness, setAwareness] = useState(municipality.awarenessStartDate ?? '');
  const [deadline, setDeadline] = useState(municipality.cardRequiredFromDate ?? '');
  const [typed, setTyped] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const needsConfirm = Boolean(deadline) && deadline <= tripoliToday() && deadline !== (municipality.cardRequiredFromDate ?? '');
  const mutation = useMutation({
    mutationFn: async () =>
      apiClient.patch(`/municipalities/${municipality.id}`, {
        awarenessStartDate: awareness || null,
        cardRequiredFromDate: deadline || null,
        confirmName: needsConfirm ? typed.trim() : undefined,
      }),
    onSuccess: async () => {
      setOpen(false);
      setTyped('');
      setProblem(null);
      await queryClient.invalidateQueries({ queryKey: ['municipalities'] });
      await queryClient.invalidateQueries({ queryKey: ['stations'] });
    },
    onError: (err) => setProblem(adminErrorMessage(err, 'تعذّر حفظ تواريخ المراحل.')),
  });

  const stage = municipality.stage ?? 'GRACE';
  const noDeadline =
    (municipality.status === 'LIVE' || Boolean(municipality.awarenessStartDate)) && !municipality.cardRequiredFromDate;

  return (
    <SectionCard
      title={`مرحلة ${municipality.name}`}
      description="تواريخ بدء التوعية واشتراط البطاقة، بتوقيت طرابلس."
    >
      <div className="space-y-4" data-testid={`municipality-stage-${municipality.id}`}>
        <div className="flex flex-wrap items-center gap-3">
          <StatusPill variant={stage === 'CARD_REQUIRED' ? 'ok' : 'neutral'} size="md">
            {STAGE_LABELS[stage]}
          </StatusPill>
          <StatusPill variant={municipality.status === 'LIVE' ? 'ok' : 'neutral'} size="md">
            {municipality.status === 'LIVE' ? 'مفعّلة' : 'قيد الإعداد'}
          </StatusPill>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-[14px] text-ink-soft lg:text-[12px]">بدء التوعية</dt>
            <dd className="text-[17px] font-bold text-ink lg:text-[15px]" dir="ltr">
              {municipality.awarenessStartDate ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="text-[14px] text-ink-soft lg:text-[12px]">البطاقة مطلوبة ابتداءً من</dt>
            <dd className="text-[17px] font-bold text-ink lg:text-[15px]" dir="ltr">
              {municipality.cardRequiredFromDate ?? '—'}
            </dd>
          </div>
        </dl>
        {noDeadline && (
          <div data-testid={`municipality-no-deadline-warning-${municipality.id}`}>
            <Notice kind="pending">
              فترة السماح فعّالة ولم يُحدَّد موعد نهائي — تُقبل التعبئة بدون بطاقة بلا حدّ زمني حتى تحدد الموعد.
            </Notice>
          </div>
        )}
        <div className="flex flex-wrap gap-2.5">
          {canSet && (
            <PillButton
              size="field"
              variant="secondary"
              onClick={() => {
                setAwareness(municipality.awarenessStartDate ?? '');
                setDeadline(municipality.cardRequiredFromDate ?? '');
                setTyped('');
                setProblem(null);
                setOpen(true);
              }}
            >
              تعديل التواريخ
            </PillButton>
          )}
          <PrintRegistrationSheetButton municipalityId={municipality.id} />
        </div>
      </div>

      <Dialog
        open={open}
        title={`مراحل ${municipality.name}`}
        busy={mutation.isPending}
        onClose={() => !mutation.isPending && setOpen(false)}
        footer={
          <>
            <PillButton size="field" variant="secondary" disabled={mutation.isPending} onClick={() => setOpen(false)}>
              رجوع
            </PillButton>
            <PillButton
              size="field"
              variant={needsConfirm ? 'danger' : 'primary'}
              disabled={mutation.isPending || (needsConfirm && typed.trim() !== municipality.name)}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? 'جارٍ الحفظ…' : 'حفظ'}
            </PillButton>
          </>
        }
      >
        <div data-testid="municipality-dates-editor" className="space-y-4">
          <p className="leading-[1.8] text-ink-soft">
            تبدأ المرحلة عند منتصف الليل بتوقيت طرابلس. اترك التاريخ فارغًا لعدم تحديده؛ بلا موعد نهائي تبقى البلدية في مرحلة السماح.
          </p>
          <div>
            <p className="mb-1.5 text-[14px] font-bold text-ink lg:text-[12px]">بدء التوعية</p>
            <DateField value={awareness} onChange={setAwareness} />
          </div>
          <div>
            <p className="mb-1.5 text-[14px] font-bold text-ink lg:text-[12px]">البطاقة مطلوبة ابتداءً من</p>
            <DateField value={deadline} onChange={setDeadline} />
          </div>
          {needsConfirm && (
            <div data-testid="municipality-dates-confirm">
              <Notice kind="error">
                هذا الموعد اليوم أو قبله، فسيُرفض فورًا كل تعبئة بدون بطاقة فعّالة. للتأكيد اكتب اسم البلدية كما هو.
              </Notice>
              <div className="mt-3">
                <TextField
                  label={`اكتب: ${municipality.name}`}
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  data-testid="municipality-dates-confirm-name"
                />
              </div>
            </div>
          )}
          {problem && <Notice kind="error">{problem}</Notice>}
        </div>
      </Dialog>
    </SectionCard>
  );
}
