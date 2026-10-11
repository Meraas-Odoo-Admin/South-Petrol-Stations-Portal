import { StatusPill } from '../../components/design/StatusPill';
import { ACCOUNT_STATUS_LABELS } from '../../lib/labels';
import type { AccountStatus } from './types';

// Every status is a word, never colour alone. A deactivated account is a
// routine state, so it is neutral, not red; red is kept for broken rules.
const VARIANT: Record<AccountStatus, 'ok' | 'neutral' | 'warn'> = {
  active: 'ok',
  deactivated: 'neutral',
  locked: 'warn',
  must_change: 'warn',
};

export function AccountStatusPill({ status }: { status: AccountStatus }) {
  return (
    <StatusPill variant={VARIANT[status]} size="md">
      {ACCOUNT_STATUS_LABELS[status]}
    </StatusPill>
  );
}
