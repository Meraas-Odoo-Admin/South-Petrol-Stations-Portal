import type { FillUpHistoryEntry } from '@fuel-tracking/shared-types';
import { StatusPill } from './design/StatusPill';

// Round 4 feedback (driver/vehicle detail mockups): a fill-up history row
// needs one of three distinct statuses, not a bare "exception: yes/no" —
// a standing-exception-covered row reads differently from a one-time
// submitted exception (approved or still pending), which reads differently
// again from a fully compliant row.
export function FillUpStatusPill({ row }: { row: FillUpHistoryEntry }) {
  if (row.standingExceptionId) {
    return <StatusPill variant="accent">استثناء مستمر</StatusPill>;
  }
  if (row.isException) {
    return row.exception?.approvedById ? (
      <StatusPill variant="ok">استثناء معتمد</StatusPill>
    ) : (
      <StatusPill variant="accent">بانتظار الاعتماد</StatusPill>
    );
  }
  return <StatusPill variant="ok">مطابق للقواعد</StatusPill>;
}
