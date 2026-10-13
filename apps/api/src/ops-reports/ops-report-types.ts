// The shape every phase-5B report returns: a few named TABLES. One shape means
// one screen component draws any report (sortable columns, CSV export), and
// the CSV export is the same rows the screen shows.

export type ColumnType = 'text' | 'number' | 'liters' | 'date' | 'datetime' | 'status';

export interface TableColumn {
  key: string;
  label: string;
  type: ColumnType;
}

export type Cell = string | number | null;

export interface ReportTable {
  id: string;
  title: string;
  // Set when the table was paged for the screen: the rows are one page of
  // `total`, starting at `skip`.
  total?: number;
  skip?: number;
  take?: number;
  // One short sentence under the title saying what the table counts.
  note?: string;
  columns: TableColumn[];
  rows: Array<Record<string, Cell>>;
  // Rows the reader should look at first (fuel unaccounted for, low stock):
  // the screen marks them with a word as well as a colour.
  flagKey?: string;
}

export interface OpsReport {
  report: string;
  title: string;
  range: { from: string; to: string };
  // Names of what the figures are about (stations, offices, municipality).
  subject: Array<{ id: string; name: string }>;
  // Present for reports with a municipality choice.
  municipalities?: Array<{ id: string; name: string }>;
  tables: ReportTable[];
  // People the report can be narrowed to (read from the full employees table
  // before paging, so a filter list stays complete).
  employees?: Array<{ id: string; name: string }>;
}

export const col = (key: string, label: string, type: ColumnType = 'text'): TableColumn => ({ key, label, type });

// CSV, UTF-8 with a BOM so a spreadsheet reads the Arabic correctly. Cells
// that start with = + - @ are prefixed with a quote so a formula is never run.
export function sortedRows(table: ReportTable, sort?: string, dir: 'asc' | 'desc' = 'desc'): ReportTable['rows'] {
  const rows = [...table.rows];
  if (sort && table.columns.some((c) => c.key === sort)) {
    const factor = dir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      const x = a[sort] ?? null;
      const y = b[sort] ?? null;
      if (x === y) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * factor;
      return String(x).localeCompare(String(y), 'ar') * factor;
    });
  }
  return rows;
}

// What the screen gets: ONE page of each table (or of the named table only),
// sorted on the server, with the table's total. The report itself is computed
// in full (its figures are aggregates over the period); only the rows that
// leave the server are bounded.
export function pageReport(
  report: OpsReport,
  options: { table?: string; sort?: string; dir?: 'asc' | 'desc'; skip?: number; take?: number },
): OpsReport {
  const take = Math.min(Math.max(options.take ?? 25, 1), 100);
  const only = options.table ? report.tables.filter((t) => t.id === options.table) : report.tables;
  const employees = report.tables
    .find((t) => t.id === 'employees')
    ?.rows.filter((r) => typeof r.employeeId === 'string' && typeof r.employee === 'string')
    .map((r) => ({ id: r.employeeId as string, name: r.employee as string }));
  return {
    ...report,
    ...(employees && employees.length > 0 ? { employees } : {}),
    tables: only.map((table) => {
      const skip = options.table ? Math.max(options.skip ?? 0, 0) : 0;
      const ordered = sortedRows(table, options.table ? options.sort : undefined, options.dir);
      return { ...table, rows: ordered.slice(skip, skip + take), total: table.rows.length, skip, take };
    }),
  };
}

export function tableToCsv(table: ReportTable, sort?: string, dir: 'asc' | 'desc' = 'desc'): string {
  const rows = sortedRows(table, sort, dir);
  const escape = (value: Cell): string => {
    if (value === null || value === undefined) return '';
    let text = String(value);
    if (/^[=+\-@]/.test(text) && typeof value === 'string') text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const header = table.columns.map((c) => escape(c.label)).join(',');
  const lines = rows.map((r) => table.columns.map((c) => escape(r[c.key] ?? null)).join(','));
  return '﻿' + [header, ...lines].join('\r\n') + '\r\n';
}
