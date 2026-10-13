// A small RFC 4180 reader for the client's station list: quoted cells, doubled
// quotes inside them, commas and line breaks inside quotes, an optional BOM.
// The first row is the header; every later row becomes an object keyed by it.
export function parseCsv(text: string): Array<Record<string, string>> {
  const source = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  const endCell = () => {
    row.push(cell);
    cell = '';
  };
  const endRow = () => {
    endCell();
    // A blank line (one empty cell) is not a record.
    if (!(row.length === 1 && row[0] === '')) rows.push(row);
    row = [];
  };

  for (let i = 0; i < source.length; i++) {
    const ch = source[i]!;
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      endCell();
    } else if (ch === '\n') {
      endRow();
    } else if (ch !== '\r') {
      cell += ch;
    }
  }
  if (quoted) throw new Error('The CSV ends inside a quoted cell.');
  if (cell !== '' || row.length > 0) endRow();

  const [header, ...body] = rows;
  if (!header) return [];
  const names = header.map((h) => h.trim());
  return body.map((cells) => {
    const record: Record<string, string> = {};
    names.forEach((name, index) => {
      record[name] = (cells[index] ?? '').trim();
    });
    return record;
  });
}
