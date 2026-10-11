import { useState } from 'react';
import { apiClient } from '../../lib/apiClient';
import { PillButton } from '../../components/design/PillButton';
import { Dialog } from '../../components/design/Dialog';
import { TextAreaField } from '../../components/design/TextField';
import { adminErrorMessage } from '../admin/adminErrors';
import { AccountStatusPill } from './AccountStatusPill';
import { TemporaryPasswordPanel } from './TemporaryPasswordPanel';
import { Notice, SectionCard } from './parts';
import { formatWhen } from './format';
import { useAccountMutation } from './useUsers';
import type { UserDetail } from './types';

type Open = null | 'deactivate' | 'reactivate' | 'reset';

// The account itself: deactivate or reactivate (with a written reason, never
// delete — history must stay), reset the password (the temporary password is
// shown once, here), and unlock a locked account.
export function AccountCard({ user, readOnlyNote }: { user: UserDetail; readOnlyNote: string | null }) {
  const [open, setOpen] = useState<Open>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const deactivate = useAccountMutation(user.id, async () =>
    (await apiClient.post<UserDetail>(`/users/${user.id}/deactivate`, { reason: reason.trim() })).data,
  );
  const reactivate = useAccountMutation(user.id, async () =>
    (await apiClient.post<UserDetail>(`/users/${user.id}/reactivate`, { reason: reason.trim() })).data,
  );
  const reset = useAccountMutation(user.id, async () =>
    (await apiClient.post<{ temporaryPassword: string }>(`/users/${user.id}/reset-password`)).data,
  );
  const unlock = useAccountMutation(user.id, async () => (await apiClient.post<UserDetail>(`/users/${user.id}/unlock`)).data);

  const can = user.capabilities.canManageAccount;
  const busy = deactivate.isPending || reactivate.isPending || reset.isPending;
  const error = deactivate.error ?? reactivate.error ?? reset.error ?? unlock.error;

  function close() {
    if (busy) return;
    setOpen(null);
    setReason('');
    setReasonError(null);
    // The temporary password is dropped from memory the moment the panel closes.
    setTemporaryPassword(null);
  }

  function submitReason(run: typeof deactivate, message: string) {
    if (reason.trim().length < 3) {
      setReasonError('اكتب سببًا واضحًا (ثلاثة أحرف على الأقل). يُحفظ السبب في سجل التغييرات.');
      return;
    }
    setReasonError(null);
    setDone(null);
    run.mutate(undefined as never, {
      onSuccess: () => {
        setOpen(null);
        setReason('');
        setDone(message);
      },
      onError: () => setOpen(null),
    });
  }

  return (
    <SectionCard title="الحساب">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <AccountStatusPill status={user.status} />
          <p className="text-[15px] text-ink-soft lg:text-[13px]">
            آخر دخول:{' '}
            {user.lastLoginAt ? <span dir="ltr">{formatWhen(user.lastLoginAt)}</span> : 'لم يسجّل الدخول بعد'}
          </p>
        </div>

        {!can && readOnlyNote && <Notice kind="info">{readOnlyNote}</Notice>}
        {error && <Notice kind="error">{adminErrorMessage(error, 'تعذّر تنفيذ الإجراء. حاول مجددًا.')}</Notice>}
        {done && <Notice kind="success">{done}</Notice>}

        {can && (
          <div className="flex flex-col gap-2.5 lg:flex-row lg:flex-wrap">
            {!user.isActive ? (
              <PillButton size="field" onClick={() => setOpen('reactivate')}>
                إعادة تفعيل الحساب
              </PillButton>
            ) : (
              <>
                <PillButton
                  size="field"
                  variant="secondary"
                  onClick={() => {
                    setDone(null);
                    setOpen('reset');
                  }}
                >
                  إعادة تعيين كلمة المرور
                </PillButton>
                {user.status === 'locked' && (
                  <PillButton
                    size="field"
                    variant="secondary"
                    disabled={unlock.isPending}
                    onClick={() => {
                      setDone(null);
                      unlock.mutate(undefined as never, { onSuccess: () => setDone('تم فك قفل الحساب.') });
                    }}
                  >
                    {unlock.isPending ? 'جارٍ الفك…' : 'فك القفل'}
                  </PillButton>
                )}
                <PillButton size="field" variant="danger" onClick={() => setOpen('deactivate')}>
                  إيقاف الحساب
                </PillButton>
              </>
            )}
          </div>
        )}
        <p className="text-[14px] text-ink-soft lg:text-[12px]">
          لا تُحذف الحسابات أبدًا؛ يبقى سجل صاحبها محفوظًا حتى بعد إيقافه.
        </p>
      </div>

      <Dialog
        open={open === 'deactivate' || open === 'reactivate'}
        title={open === 'deactivate' ? 'إيقاف الحساب' : 'إعادة تفعيل الحساب'}
        busy={busy}
        onClose={close}
        footer={
          <>
            <PillButton size="field" variant="secondary" disabled={busy} onClick={close}>
              رجوع
            </PillButton>
            {open === 'deactivate' ? (
              <PillButton
                size="field"
                variant="danger"
                disabled={busy}
                onClick={() => submitReason(deactivate, 'تم إيقاف الحساب، وأُنهي تسجيل دخول صاحبه.')}
              >
                {deactivate.isPending ? 'جارٍ الإيقاف…' : 'إيقاف الحساب'}
              </PillButton>
            ) : (
              <PillButton
                size="field"
                disabled={busy}
                onClick={() => submitReason(reactivate, 'تمت إعادة تفعيل الحساب.')}
              >
                {reactivate.isPending ? 'جارٍ التفعيل…' : 'إعادة التفعيل'}
              </PillButton>
            )}
          </>
        }
      >
        <p className="mb-3 leading-[1.8]">
          {open === 'deactivate'
            ? `سيُمنع ${user.fullName} من الدخول فورًا وسيُنهى تسجيل دخوله على كل أجهزته. يمكنك إعادة تفعيله لاحقًا.`
            : `سيتمكن ${user.fullName} من الدخول مجددًا بكلمة مروره الحالية.`}
        </p>
        <TextAreaField
          label="السبب (مطلوب)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={reasonError}
          hint="يُحفظ السبب في سجل التغييرات مع اسمك."
        />
      </Dialog>

      <Dialog
        open={open === 'reset'}
        title="إعادة تعيين كلمة المرور"
        busy={reset.isPending}
        onClose={close}
        footer={
          temporaryPassword ? (
            <PillButton size="field" onClick={close}>
              تم تسليم الكلمة
            </PillButton>
          ) : (
            <>
              <PillButton size="field" variant="secondary" disabled={reset.isPending} onClick={close}>
                رجوع
              </PillButton>
              <PillButton
                size="field"
                disabled={reset.isPending}
                onClick={() =>
                  reset.mutate(undefined as never, {
                    onSuccess: (result) => setTemporaryPassword(result.temporaryPassword),
                    onError: () => setOpen(null),
                  })
                }
              >
                {reset.isPending ? 'جارٍ الإنشاء…' : 'إنشاء كلمة مؤقتة'}
              </PillButton>
            </>
          )
        }
      >
        {temporaryPassword ? (
          <TemporaryPasswordPanel password={temporaryPassword} who={user.fullName} />
        ) : (
          <>
            <p className="leading-[1.8]">ستُنشأ كلمة مرور مؤقتة جديدة لـ {user.fullName} وتظهر لك مرة واحدة.</p>
            <ul className="mt-2 list-disc space-y-1 ps-5 leading-[1.8] text-ink-soft">
              <li>تتوقف كلمة مروره القديمة عن العمل.</li>
              <li>يُنهى تسجيل دخوله على كل أجهزته.</li>
              <li>يُفك قفل الحساب إن كان مقفلًا.</li>
              <li>سيُطلب منه اختيار كلمة مرور جديدة عند أول دخول.</li>
            </ul>
          </>
        )}
      </Dialog>
    </SectionCard>
  );
}
