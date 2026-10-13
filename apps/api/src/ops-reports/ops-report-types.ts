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
}

export const col = (key: string, label: string, type: ColumnType = 'text'): TableColumn => ({ key, label, type });

// CSV, UTF-8 with a BOM so a spreadsheet reads the Arabic correctly. Cells
// that start with = + - @ are prefixed with a quote so a formula is never run.
export function tableToCsv(table: ReportTable, sort?: string, dir: 'asc' | 'desc' = 'desc'): string {
  const rows = [...table.rows];
  if (sort && table.columns.some((c) => c.key === sort)) {
    const factor = dir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      const x = a[sort];
      const y = b[sort];
      if (x === y) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * factor;
      return String(x).localeCompare(String(y), 'ar') * factor;
    });
  }
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
