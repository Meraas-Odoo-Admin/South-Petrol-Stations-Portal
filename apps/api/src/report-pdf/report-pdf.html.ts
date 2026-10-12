// Report PDFs as HTML for the offline Chromium renderer (the same one that
// prints the vehicle card), with the bundled Cairo font. pdfkit has no Arabic
// shaping or bidi support, so Arabic text came out blank or in boxes there;
// Chromium shapes and orders it correctly.

export type Tone = 'danger' | 'ok' | 'warn';

export interface PdfCell {
  text: string | number;
  tone?: Tone;
}

export interface PdfTable {
  title?: string;
  headers: string[];
  rows: Array<Array<string | number | PdfCell>>;
  /** Shown when there are no rows. */
  emptyText?: string;
  footnote?: string;
}

export interface PdfReport {
  title: string;
  /** Lines under the title: filters, the range, the date it was made. */
  subtitle?: string[];
  tables: PdfTable[];
  landscape?: boolean;
  notes?: string[];
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function escapeHtml(value: string | number): string {
  return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]!);
}

const CSS = `
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{font-family:'Cairo',sans-serif;color:#132524;font-size:10pt;line-height:1.55}
h1{font-size:17pt;font-weight:800;margin:0 0 2mm}
.sub{color:#5B6D6A;font-size:9.5pt;margin:0}
.rule{height:3px;background:#0D5C52;margin:3mm 0 5mm;border-radius:2px}
h2{font-size:12pt;font-weight:800;margin:6mm 0 2mm}
table{width:100%;border-collapse:collapse;margin-bottom:2mm}
thead{display:table-header-group}
th{background:#EEF2EE;color:#132524;font-weight:700;font-size:9pt;text-align:start;padding:2mm 2.2mm;border-bottom:1px solid #93A19E}
td{padding:1.8mm 2.2mm;border-bottom:1px solid #E3E7E2;font-size:9.5pt;vertical-align:top}
tr{page-break-inside:avoid}
td.danger{color:#8F3120;font-weight:800}
td.ok{color:#1F7A5C;font-weight:700}
td.warn{color:#8F5B0B;font-weight:700}
.empty{color:#5B6D6A;padding:3mm 0}
.foot{color:#5B6D6A;font-size:8.5pt;margin:0 0 3mm}
.notes{margin-top:6mm;border-top:1px solid #E3E7E2;padding-top:2mm;color:#5B6D6A;font-size:8.5pt}
`;

function cell(value: string | number | PdfCell): string {
  if (typeof value === 'object') {
    return `<td dir="auto"${value.tone ? ` class="${value.tone}"` : ''}>${escapeHtml(value.text)}</td>`;
  }
  // dir=auto: a number or a date stays left-to-right inside right-to-left text.
  return `<td dir="auto">${escapeHtml(value)}</td>`;
}

function table(t: PdfTable): string {
  const head = `<tr>${t.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr>`;
  const body =
    t.rows.length === 0
      ? ''
      : t.rows.map((row) => `<tr>${row.map(cell).join('')}</tr>`).join('');
  return [
    t.title ? `<h2>${escapeHtml(t.title)}</h2>` : '',
    `<table><thead>${head}</thead><tbody>${body}</tbody></table>`,
    t.rows.length === 0 ? `<p class="empty">${escapeHtml(t.emptyText ?? 'لا توجد بيانات في هذه الفترة.')}</p>` : '',
    t.footnote ? `<p class="foot">${escapeHtml(t.footnote)}</p>` : '',
  ].join('');
}

export function buildReportHtml(report: PdfReport, fontFaceCss: string): string {
  const page = report.landscape ? 'A4 landscape' : 'A4';
  return `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8">
<style>@page{size:${page};margin:13mm}${fontFaceCss}${CSS}</style></head>
<body>
<h1>${escapeHtml(report.title)}</h1>
${(report.subtitle ?? []).map((s) => `<p class="sub">${escapeHtml(s)}</p>`).join('')}
<div class="rule"></div>
${report.tables.map(table).join('')}
${report.notes && report.notes.length ? `<div class="notes">${report.notes.map((n) => `<p>${escapeHtml(n)}</p>`).join('')}</div>` : ''}
<script>window.__cardReady=false;document.fonts.ready.then(function(){window.__cardReady=true;});</script>
</body></html>`;
}
