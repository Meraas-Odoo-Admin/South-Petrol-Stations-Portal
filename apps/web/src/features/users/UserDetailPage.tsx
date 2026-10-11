import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { CodeText } from '../../components/design/CodeText';
import { PillButton } from '../../components/design/PillButton';
import { StatusPill } from '../../components/design/StatusPill';
import { Icon, ICONS } from '../../components/icons';
import { roleLabel } from '../../lib/labels';
import { adminErrorMessage } from '../admin/adminErrors';
import { AccountCard } from './AccountCard';
import { AccountStatusPill } from './AccountStatusPill';
import { ActivityCard } from './ActivityCard';
import { AdvancedCard } from './AdvancedCard';
import { IdentityCard } from './IdentityCard';
import { JobAndPlaceCard } from './JobAndPlaceCard';
import { Notice } from './parts';
import { useUserDetail } from './useUsers';
import type { Capabilities } from './types';

// Why this person is read-only for the caller, in a sentence. Null when the
// caller may change them.
function readOnlyNote(caps: Capabilities): string | null {
  switch (caps.readOnlyReason) {
    case 'SELF':
      return 'هذا حسابك. لتغيير كلمة مرورك استخدم صفحة «كلمة المرور».';
    case 'PRIVILEGED':
      return 'هذا الحساب بصلاحيات أعلى من صلاحياتك، فهو للعرض فقط.';
    case 'WORKS_ELSEWHERE':
      return 'يعمل هذا الموظف أيضًا خارج محطاتك أو مكاتبك، لذلك الصفحة للعرض فقط.';
    default:
      return caps.canManageAccount ? null : 'ليس لديك صلاحية تعديل هذا الحساب.';
  }
}

function BackLink({ basePath }: { basePath: string }) {
  return (
    <Link
      to={basePath}
      className="inline-flex min-h-[44px] items-center gap-2 rounded-full pe-3 text-[16px] font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 lg:text-[14px]"
    >
      <Icon d={ICONS.arrowBack} size={18} />
      العودة إلى القائمة
    </Link>
  );
}

// One person: who they are, their job and place, their account, the
// advanced options (closed), and what happened to the account lately. Every
// control follows the server's `capabilities`; nothing here decides access.
export function UserDetailPage({ basePath }: { basePath: string }) {
  const { userId } = useParams();
  const { hasPermission } = useAuth();
  const detail = useUserDetail(userId);

  if (detail.isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4" aria-busy="true" aria-label="جارٍ التحميل">
        <div className="h-24 animate-pulse-soft rounded-md bg-surface" />
        <div className="h-64 animate-pulse-soft rounded-md bg-surface" />
      </div>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <BackLink basePath={basePath} />
        <div className="rounded-md bg-surface p-6 text-center shadow-sm">
          <p className="text-[18px] font-extrabold text-ink lg:text-[15px]">لا يمكن فتح هذا الحساب</p>
          <p className="mx-auto mt-1 max-w-md text-[16px] text-ink-soft lg:text-[14px]">
            {adminErrorMessage(detail.error, 'لم نتمكن من تحميل الحساب. تأكد من الاتصال ثم حاول مجددًا.')}
          </p>
          <div className="mt-4 flex justify-center">
            <PillButton size="field" variant="secondary" onClick={() => detail.refetch()}>
              إعادة المحاولة
            </PillButton>
          </div>
        </div>
      </div>
    );
  }

  const user = detail.data;
  const note = readOnlyNote(user.capabilities);
  const job = user.roles[0]?.role ?? null;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <BackLink basePath={basePath} />

      <header className="rounded-md bg-surface p-4 shadow-sm lg:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[24px] font-extrabold leading-tight text-ink lg:text-xl">{user.fullName}</h1>
            <CodeText size="md">{user.username}</CodeText>
          </div>
          <AccountStatusPill status={user.status} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusPill variant="neutral" size="md">
            {job ? roleLabel(job.name) : 'بلا وظيفة'}
          </StatusPill>
          {user.roles.length > 1 && (
            <StatusPill variant="warn" size="md">
              {`${user.roles.length} وظائف`}
            </StatusPill>
          )}
        </div>
      </header>

      {note && !user.capabilities.canManageAccount && user.capabilities.readOnlyReason && (
        <Notice kind="info">{note}</Notice>
      )}

      <IdentityCard user={user} readOnlyNote={note} />
      <JobAndPlaceCard user={user} />
      <AccountCard user={user} readOnlyNote={note} />
      {user.capabilities.canManageAdvanced && hasPermission('roles:manage') && <AdvancedCard user={user} />}
      <ActivityCard userId={user.id} />
    </div>
  );
}
