import { PillButton } from '../../components/design/PillButton';
import { ACCOUNT_ACTION_LABELS, roleLabel } from '../../lib/labels';
import { Notice, SectionCard } from './parts';
import { formatWhen } from './format';
import { useUserActivity } from './useUsers';

// The latest entries about this account: who did what, when, and why. The
// same trail the audit log keeps; nothing here is editable.
export function ActivityCard({ userId }: { userId: string }) {
  const activity = useUserActivity(userId);

  return (
    <SectionCard title="آخر النشاط" description="ما جرى على هذا الحساب ومن فعله.">
      {activity.isLoading && <p className="text-[15px] text-ink-soft lg:text-[13px]">جارٍ التحميل…</p>}
      {activity.isError && (
        <div className="space-y-3">
          <Notice kind="error">تعذّر تحميل النشاط.</Notice>
          <PillButton size="field" variant="secondary" onClick={() => activity.refetch()}>
            إعادة المحاولة
          </PillButton>
        </div>
      )}
      {activity.data && activity.data.length === 0 && (
        <p className="text-[15px] text-ink-soft lg:text-[13px]">لا توجد أنشطة مسجلة على هذا الحساب بعد.</p>
      )}
      {activity.data && activity.data.length > 0 && (
        <ol className="divide-y divide-surface-alt">
          {activity.data.map((entry) => (
            <li key={entry.id} className="py-3">
              <p className="text-[16px] font-bold text-ink lg:text-[14px]">
                {ACCOUNT_ACTION_LABELS[entry.action] ?? 'تغيير على الحساب'}
                {entry.job ? ` — ${roleLabel(entry.job)}` : ''}
              </p>
              <p className="text-[14px] text-ink-soft lg:text-[12px]">
                {entry.actorName ? `بواسطة ${entry.actorName} · ` : ''}
                <span dir="ltr">{formatWhen(entry.createdAt)}</span>
              </p>
              {entry.reason && <p className="mt-1 text-[15px] text-ink lg:text-[13px]">السبب: {entry.reason}</p>}
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  );
}
