import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { Card, CardHeader } from '../../components/design/Card';
import { CodeText } from '../../components/design/CodeText';
import { LtrText } from '../../components/LtrText';
import type { AuditLogRow } from './types';

const TAKE = 25;

const ENTITY_TYPES = [
  'User',
  'SystemSetting',
  'ExceptionType',
  'StandingException',
  'Vehicle',
  'Driver',
  'FillUpTransaction',
  'Exception',
  'Station',
];

function ValueChip({ value, variant }: { value: unknown; variant: 'neutral' | 'accent' }) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const cls =
    variant === 'neutral' ? 'bg-surface-alt text-ink' : 'bg-accent-100 text-accent-ink';
  return (
    <span dir="ltr" className={`inline-block rounded-[3px] px-1.5 font-mono text-[13px] lg:text-[12px] font-bold ${cls}`}>
      {text}
    </span>
  );
}

// Matches 2i's audit log card: append-only narrative feed (timestamp +
// one sentence per entry with changed-value chips), not a raw table with
// JSON dumps. Filtering (not in the mockup, which shows a handful of
// static rows) is a scale necessity at 9 entity types — kept but restyled
// to sit inside the card header rather than as a bare page control.
export function AuditLogAdminPage() {
  const [skip, setSkip] = useState(0);
  const [entityType, setEntityType] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'audit-log', skip, entityType],
    queryFn: async () =>
      (
        await apiClient.get<{ total: number; rows: AuditLogRow[] }>('/audit-log', {
          params: { skip, take: TAKE, entityType: entityType || undefined },
        })
      ).data,
  });

  return (
    <Card>
      <CardHeader
        title="سجل التغييرات"
        subtitle={data ? `${data.total} سجل` : undefined}
        action={
          <select
            value={entityType}
            onChange={(e) => {
              setEntityType(e.target.value);
              setSkip(0);
            }}
            className="h-8 rounded-sm bg-surface-alt px-2.5 text-[13px] lg:text-[12px] text-ink focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="">كل الأنواع</option>
            {ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        }
      />

      {isLoading && <p className="p-4 text-sm text-ink-soft">...جارٍ التحميل</p>}
      {isError && <p className="p-4 text-sm text-danger">تعذر تحميل سجل التدقيق.</p>}

      {data && (
        <>
          {data.rows.map((row) => {
            const changedKeys =
              row.newValue && typeof row.newValue === 'object'
                ? Object.keys(row.newValue as Record<string, unknown>)
                : [];
            return (
              <div key={row.id} className="flex gap-3.5 border-b border-surface-alt px-[18px] py-3 last:border-0">
                <div className="w-24 shrink-0 pt-0.5">
                  <LtrText>
                    <span className="font-mono text-[13px] lg:text-[12px] font-semibold text-ink-faint">
                      {new Date(row.createdAt).toLocaleString('en-GB', {
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </LtrText>
                </div>
                <div className="flex-1 text-[13px] lg:text-[12.5px] leading-[1.7] text-ink">
                  <span className="font-bold">{row.user ? row.user.fullName : '—'}</span>{' '}
                  <CodeText>{row.action}</CodeText> <CodeText>{row.entityType}</CodeText>{' '}
                  <CodeText>#{row.entityId.slice(0, 8)}</CodeText>
                  {changedKeys.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {changedKeys.map((key) => {
                        const oldV = row.oldValue && typeof row.oldValue === 'object' ? (row.oldValue as Record<string, unknown>)[key] : undefined;
                        const newV = (row.newValue as Record<string, unknown>)[key];
                        return (
                          <span key={key} className="inline-flex items-center gap-1">
                            <span className="text-[13px] lg:text-[12px] text-ink-faint">{key}</span>
                            {oldV !== undefined && (
                              <>
                                <ValueChip value={oldV} variant="neutral" />
                                <span className="text-ink-faint">←</span>
                              </>
                            )}
                            <ValueChip value={newV} variant="accent" />
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {data.rows.length === 0 && <p className="p-4 text-center text-[13px] lg:text-[12.5px] text-ink-soft">لا توجد سجلات</p>}

          <div className="flex items-center justify-between px-[18px] py-3 text-[13px] lg:text-[12px] text-ink-faint">
            <span>السجل للإضافة فقط — لا يُعدّل ولا يُحذف.</span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={skip === 0}
                onClick={() => setSkip(Math.max(0, skip - TAKE))}
                className="rounded-full px-3 py-1 font-bold text-ink-soft hover:bg-surface-alt disabled:opacity-40"
              >
                السابق
              </button>
              <button
                type="button"
                disabled={skip + TAKE >= data.total}
                onClick={() => setSkip(skip + TAKE)}
                className="rounded-full px-3 py-1 font-bold text-ink-soft hover:bg-surface-alt disabled:opacity-40"
              >
                التالي
              </button>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
