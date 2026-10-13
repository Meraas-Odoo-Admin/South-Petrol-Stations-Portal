import { useMemo, useState } from 'react';
import { apiClient } from '../../lib/apiClient';
import { downloadBlob } from '../../lib/download';
import { Card } from '../../components/design/Card';
import { PillButton } from '../../components/design/PillButton';
import { StatusPill } from '../../components/design/StatusPill';
import { dayLabel, stamp } from '../regreports/common';

// One screen component for every phase-5B report: the API returns named
// tables (apps/api/src/ops-reports/ops-report-types.ts) and this draws them.
// Columns sort on a tap of the header; each table exports to CSV (the same
// rows, in the order shown). Status cells always carry words.

export type ColumnType = 'text' | 'number' | 'liters' | 'date' | 'datetime' | 'status';
export interface OpsColumn {
  key: string;
  label: string;
  type: ColumnType;
}
export type OpsCell = string | number | null;
export interface OpsTable {
  id: string;
  title: string;
  note?: string;
  columns: OpsColumn[];
  rows: Array<Record<string, OpsCell>>;
  flagKey?: string;
}
export interface OpsReport {
  report: string;
  title: string;
  range: { from: string; to: string };
  subject: Array<{ id: string; name: string }>;
  municipalities?: Array<{ id: string; name: string }>;
  tables: OpsTable[];
}

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const PAGE = 25;

const GOOD = ['سليم', 'في المسار', 'فعّال', 'مفعّلة', 'لا أحد بلا بطاقة'];
const BAD = ['غير مبرَّر', 'بطاقات غير مبرَّرة', 'فات الموعد', 'معرّض للتأخر', 'بيانات تحتاج مراجعة', 'فارغ', 'يحتاج مراجعة'];
function statusVariant(text: string): 'ok' | 'danger' | 'warn' | 'neutral' {
  if (GOOD.includes(text)) return 'ok';
  if (BAD.some((b) => text.includes(b))) return 'danger';
  if (text.includes('منخفض') || text.includes('لم تُصدر') || text.includes('موقوف')) return 'warn';
  return 'neutral';
}

function renderCell(column: OpsColumn, value: OpsCell) {
  if (value === null || value === undefined || value === '') return <span className="text-ink-soft">—</span>;
  switch (column.type) {
    case 'number':
      return <span className="tabular-nums">{typeof value === 'number' ? nf.format(value) : value}</span>;
    case 'liters':
      return <span className="tabular-nums">{typeof value === 'number' ? nf.format(value) : value}</span>;
    case 'date':
      return <span className="tabular-nums" dir="ltr">{dayLabel(String(value))}</span>;
    case 'datetime':
      return <span className="tabular-nums" dir="ltr">{stamp(String(value))}</span>;
    case 'status':
      return <StatusPill variant={statusVariant(String(value))} size="md">{String(value)}</StatusPill>;
    default:
      return <span>{String(value)}</span>;
  }
}

function sortRows(rows: OpsTable['rows'], key: string | null, dir: 'asc' | 'desc') {
  if (!key) return rows;
  const factor = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = a[key] ?? null;
    const y = b[key] ?? null;
    if (x === y) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * factor;
    return String(x).localeCompare(String(y), 'ar') * factor;
  });
}

export function OpsTableView({
  table,
  reportName,
  query,
}: {
  table: OpsTable;
  reportName: string;
  query: Record<string, string | undefined>;
}) {
  const [sort, setSort] = useState<string | null>(null);
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [failed, setFailed] = useState(false);
  // A long table shows its first rows and a button for the rest: on a phone a
  // few hundred stations would otherwise be a page of thousands of pixels. The
  // CSV always has every row.
  const [limit, setLimit] = useState(PAGE);
  const sorted = useMemo(() => sortRows(table.rows, sort, dir), [table.rows, sort, dir]);
  const rows = sorted.slice(0, limit);
  const hidden = sorted.length - rows.length;

  function toggle(key: string) {
    if (sort === key) setDir(dir === 'desc' ? 'asc' : 'desc');
    else {
      setSort(key);
      setDir('desc');
    }
  }

  async function exportCsv() {
    setFailed(false);
    try {
      const res = await apiClient.get<Blob>(`/ops-reports/${reportName}/export`, {
        params: { ...query, table: table.id, sort: sort ?? undefined, dir: sort ? dir : undefined },
        responseType: 'blob',
      });
      downloadBlob(res.data, `${reportName}-${table.id}_${query.from ?? ''}_${query.to ?? ''}.csv`);
    } catch {
      setFailed(true);
    }
  }

  const flagged = (row: Record<string, OpsCell>) => {
    if (!table.flagKey) return false;
    const v = row[table.flagKey];
    return typeof v === 'number' ? (table.flagKey === 'level' ? false : v > 0) : false;
  };

  return (
    <Card className="mb-4" data-testid={`ops-table-${table.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line bg-primary-100/50 px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-[18px] font-extrabold text-primary-dark lg:text-[15px]">{table.title}</h3>
          {table.note && <p className="mt-0.5 text-[14px] leading-[1.7] text-ink-soft lg:text-[12px]">{table.note}</p>}
        </div>
        {table.rows.length > 0 && (
          <PillButton size="field" variant="secondary" data-testid={`ops-export-${table.id}`} onClick={exportCsv}>
            تنزيل CSV
          </PillButton>
        )}
      </div>
      {failed && (
        <p role="alert" className="px-4 pt-3 text-[15px] font-bold text-danger-dark lg:text-[13px]">
          تعذّر تنزيل الملف. حاول مرة أخرى.
        </p>
      )}
      {table.rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-[16px] text-ink-soft lg:text-[14px]">لا توجد بيانات في هذه الفترة.</p>
      ) : (
        <>
          {/* Phone: each row a small card, so nothing scrolls sideways. */}
          <ul className="divide-y divide-line lg:hidden">
            {rows.map((row, i) => (
              <li key={i} className="space-y-1.5 px-4 py-3">
                {flagged(row) && <StatusPill variant="danger" size="md">يحتاج مراجعة</StatusPill>}
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                  {table.columns.map((c) => (
                    <div key={c.key} className={c.type === 'text' && table.columns.indexOf(c) === 0 ? 'col-span-2' : ''}>
                      <dt className="text-[15px] lg:text-[13px] text-ink-soft">{c.label}</dt>
                      <dd className="text-[16px] font-bold text-ink">{renderCell(c, row[c.key] ?? null)}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full text-[16px] lg:text-[14px]">
              <caption className="sr-only">{table.title}</caption>
              <thead>
                <tr className="border-b-2 border-line bg-surface-alt/60">
                  {table.columns.map((c) => (
                    <th
                      key={c.key}
                      scope="col"
                      aria-sort={sort === c.key ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      className="px-3 py-2 text-start text-[15px] lg:text-[13px] font-extrabold text-ink"
                    >
                      <button
                        type="button"
                        onClick={() => toggle(c.key)}
                        className="inline-flex min-h-[32px] items-center gap-1 rounded hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        {c.label}
                        <span aria-hidden="true" className="text-[13px] lg:text-[12px] text-ink-soft">
                          {sort === c.key ? (dir === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className={`border-b border-line ${flagged(row) ? 'bg-danger-100/40' : i % 2 ? 'bg-surface-alt/30' : ''}`}>
                    {table.columns.map((c, ci) => (
                      <td key={c.key} className={`px-3 py-2.5 align-top ${ci === 0 ? 'font-bold text-ink' : 'text-ink'}`}>
                        {renderCell(c, row[c.key] ?? null)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hidden > 0 && (
            <div className="border-t border-line p-3 text-center">
              <PillButton size="field" variant="secondary" data-testid={`ops-more-${table.id}`} onClick={() => setLimit(limit + PAGE)}>
                عرض المزيد ({nf.format(hidden)} صفًا متبقيًا)
              </PillButton>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
