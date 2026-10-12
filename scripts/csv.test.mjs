import test from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, toCsv } from '../apps/web/src/lib/csvFormat.ts';

test('plain text and numbers stay as they are', () => {
  assert.equal(csvCell('مكتب سبها'), 'مكتب سبها');
  assert.equal(csvCell(12), '12');
  assert.equal(csvCell(-3), '-3');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(undefined), '');
});

test('commas, quotes and line breaks are quoted', () => {
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('one\ntwo'), '"one\ntwo"');
});

test('a text cell that starts like a formula is neutralised, a number is not', () => {
  assert.equal(csvCell('=SUM(A1)'), "'=SUM(A1)");
  assert.equal(csvCell('+1'), "'+1");
  assert.equal(csvCell('-1 card'), "'-1 card");
  assert.equal(csvCell('@cmd'), "'@cmd");
  assert.equal(csvCell(-1), '-1');
});

test('rows end in CRLF with the header first', () => {
  assert.equal(toCsv(['البند', 'العدد'], [['بطاقات', 5], ['تكرار', 0]]), 'البند,العدد\r\nبطاقات,5\r\nتكرار,0\r\n');
});
