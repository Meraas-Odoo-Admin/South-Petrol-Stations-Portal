import type { FillUpHistoryEntry } from '@fuel-tracking/shared-types';
import { StatusPill } from './design/StatusPill';

// What a recorded fill-up reads as: compliant, an exception (Phase 6: no
// approval step; older rows that were approved or covered by a standing
// exception read as exceptions too), and «بدون بطاقة» beside either.
export function FillUpStatusPill({ row }: { row: FillUpHistoryEntry }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {row.isException ? (
        <StatusPill variant="accent">استثناء</StatusPill>
      ) : (
        <StatusPill variant="ok">مطابق للقواعد</StatusPill>
      )}
      {row.identifiedBy === 'NO_CARD' && <StatusPill variant="neutral">بدون بطاقة</StatusPill>}
    </span>
  );
}
