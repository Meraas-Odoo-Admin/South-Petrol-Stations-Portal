import { parseCsv } from './csv';

describe('parseCsv', () => {
  it('reads a header and rows, trimming cells', () => {
    expect(parseCsv('a,b\n1, two \n3,4\n')).toEqual([
      { a: '1', b: 'two' },
      { a: '3', b: '4' },
    ]);
  });

  it('handles quoted cells with commas, doubled quotes and line breaks', () => {
    const rows = parseCsv('name,note\r\n"a, b","say ""hi"""\r\nx,"one\ntwo"\r\n');
    expect(rows[0]).toEqual({ name: 'a, b', note: 'say "hi"' });
    expect(rows[1]).toEqual({ name: 'x', note: 'one\ntwo' });
  });

  it('skips a BOM and blank lines, and fills missing trailing cells with empty text', () => {
    expect(parseCsv('﻿a,b,c\n\n1,2\n')).toEqual([{ a: '1', b: '2', c: '' }]);
  });

  it('refuses a file that ends inside a quoted cell', () => {
    expect(() => parseCsv('a\n"open')).toThrow(/quoted/);
  });
});
