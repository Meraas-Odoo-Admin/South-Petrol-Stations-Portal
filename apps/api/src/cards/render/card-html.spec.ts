import { buildCardHtml, escapeHtml, type CardAssets, type CardFaceData } from './card-html';

const assets: CardAssets = { fontFaceCss: '', logoWhiteDataUri: 'data:image/svg+xml;base64,' };
const base: CardFaceData = {
  cardNumber: 'SBH-7K2M9Q4X',
  plate: '8-1234567',
  vehicleLine: 'تويوتا هايلكس — أبيض',
  officeName: 'مديرية أمن سبها',
  issueDate: '2026-09-27',
  stationCode: 'REG-000001',
  qrSvg: '<svg></svg>',
};

describe('card HTML template', () => {
  it('escapes every character that could start markup', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&`)).toBe('&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;');
  });

  it('never lets staff-typed values (plate, make/model/colour, office name) become HTML', () => {
    const hostile = '<img src=x onerror=alert(1)><script>alert(2)</script>';
    const html = buildCardHtml(
      { ...base, plate: hostile, vehicleLine: hostile, officeName: hostile },
      'full',
      assets,
    );
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>alert(2)');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('full mode prints front + back; black-only is the front with the fixed layer hidden', () => {
    const full = buildCardHtml(base, 'full', assets);
    const black = buildCardHtml(base, 'black', assets);
    expect(full.match(/class="page"/g)).toHaveLength(2);
    expect(black.match(/class="page"/g)).toHaveLength(1);
    // Fixed layer: header band, card title, office name — only in 'full'.
    expect(full).toContain('بطاقة تعبئة الوقود');
    expect(black).not.toContain('بطاقة تعبئة الوقود');
    expect(black).not.toContain('مديرية أمن سبها');
    // Per-card fields are in both.
    for (const html of [full, black]) {
      expect(html).toContain('SBH-7K2M9Q4X');
      expect(html).toContain('8-1234567');
      expect(html).toContain('REG-000001');
    }
  });

  it('prints no owner name or identity number — the card has no field for them', () => {
    expect(Object.keys(base).sort()).toEqual(
      ['cardNumber', 'issueDate', 'officeName', 'plate', 'qrSvg', 'stationCode', 'vehicleLine'].sort(),
    );
  });
});
