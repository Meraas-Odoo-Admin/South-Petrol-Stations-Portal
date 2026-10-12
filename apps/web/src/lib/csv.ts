import { downloadBlob } from './download';
import { toCsv, type CsvCell } from './csvFormat';

export { csvCell, toCsv, type CsvCell } from './csvFormat';

export function downloadCsv(filename: string, headers: string[], rows: CsvCell[][]): void {
  downloadBlob(new Blob(['﻿',toCsv(headers, rows)], { type: 'text/csv;charset=utf-8' }), filename);
}
