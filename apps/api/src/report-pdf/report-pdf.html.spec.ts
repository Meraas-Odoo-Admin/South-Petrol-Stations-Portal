import { buildReportHtml, escapeHtml } from './report-pdf.html';

describe('report PDF html', () => {
  it('escapes text so a name or a reason can never inject markup', () => {
    expect(escapeHtml('<script>alert("x")</script> & \'q\'')).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;q&#39;');
  });

  it('is right-to-left Arabic, A4, and waits for the font before the renderer prints', () => {
    const html = buildReportHtml({ title: 'تقرير', tables: [{ headers: ['أ'], rows: [['١']] }] }, '@font-face{}');
    expect(html).toContain('lang="ar" dir="rtl"');
    expect(html).toContain('size:A4;');
    expect(html).toContain('window.__cardReady=true');
    expect(buildReportHtml({ title: 't', landscape: true, tables: [] }, '')).toContain('size:A4 landscape');
  });

  it('puts a tone on a cell but always keeps its words, so colour is never alone', () => {
    const html = buildReportHtml(
      { title: 't', tables: [{ headers: ['h'], rows: [[{ text: '20 بطاقة غير مبرَّرة', tone: 'danger' }]] }] },
      '',
    );
    expect(html).toContain('class="danger"');
    expect(html).toContain('20 بطاقة غير مبرَّرة');
  });

  it('says plainly when a table is empty', () => {
    const html = buildReportHtml({ title: 't', tables: [{ headers: ['h'], rows: [], emptyText: 'لا شيء' }] }, '');
    expect(html).toContain('لا شيء');
  });
});
