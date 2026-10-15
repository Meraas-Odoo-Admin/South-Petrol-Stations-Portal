// Streams the rows of a SQL-Server-exported .xlsx whose XML uses an `x:`
// namespace prefix (exceljs reads nothing from it). Rows come as arrays of
// strings indexed by column (A=0); missing cells are ''.
const { spawn, execFileSync } = require('child_process');

function unescapeXml(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function sharedStrings(file) {
  const xml = execFileSync('unzip', ['-p', file, 'xl/sharedStrings.xml'], { maxBuffer: 1 << 30 }).toString('utf8');
  const out = [];
  const si = /<(?:x:)?si>([\s\S]*?)<\/(?:x:)?si>/g;
  let m;
  while ((m = si.exec(xml))) {
    const parts = [];
    const t = /<(?:x:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:x:)?t>/g;
    let n;
    while ((n = t.exec(m[1]))) parts.push(unescapeXml(n[1]));
    out.push(parts.join(''));
  }
  return out;
}

function colIndex(letters) {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

// onRow(cells, rowNumber) for every row, header included (rowNumber 1).
async function eachRow(file, sheetPath, onRow) {
  const strings = sharedStrings(file);
  const child = spawn('unzip', ['-p', file, sheetPath]);
  let buf = '';
  let rowNumber = 0;
  const rowRe = /<(?:x:)?row\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:x:)?row>)/g;
  const cellRe = /<(?:x:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:x:)?c>)/g;
  for await (const chunk of child.stdout) {
    buf += chunk.toString('utf8');
    let last = 0;
    rowRe.lastIndex = 0;
    let m;
    while ((m = rowRe.exec(buf))) {
      last = rowRe.lastIndex;
      rowNumber++;
      const cells = [];
      const body = m[1] ?? '';
      cellRe.lastIndex = 0;
      let c;
      while ((c = cellRe.exec(body))) {
        const attrs = c[1];
        const ref = /\br="([A-Z]+)\d+"/.exec(attrs);
        const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
        const inner = c[2] ?? '';
        let value = '';
        const v = /<(?:x:)?v>([\s\S]*?)<\/(?:x:)?v>/.exec(inner);
        if (type === 's' && v) value = strings[Number(v[1])] ?? '';
        else if (type === 'inlineStr') {
          const t = /<(?:x:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:x:)?t>/.exec(inner);
          value = t ? unescapeXml(t[1]) : '';
        } else if (v) value = unescapeXml(v[1]);
        const idx = ref ? colIndex(ref[1]) : cells.length;
        cells[idx] = value;
      }
      for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = '';
      onRow(cells, rowNumber);
    }
    buf = buf.slice(last);
  }
}

module.exports = { eachRow };
