// CSV for every report table, made in the browser from the table on screen.
//  - A byte-order mark leads the file so Excel opens the Arabic correctly.
//  - Rows end in CRLF; a cell with a comma, quote or line break is quoted.
//  - A TEXT cell that starts with = + - or @ is prefixed with an apostrophe so a
//    spreadsheet never runs it as a formula (CSV injection). Numbers are left
//    as numbers, so a negative figure stays a figure.
export type CsvCell = string | number | null | undefined;

export function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  let text = typeof value === 'number' ? String(value) : value;
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: string[], rows: CsvCell[][]): string {
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
