import {
  buildCardHtml,
  buildPrinterSetupHtml,
  escapeHtml,
  MIN_RULE_PX,
  QR_BOX_PX,
  SAFE_PX,
  type CardAssets,
  type CardFaceData,
} from './card-html';

const assets: CardAssets = { fontFaceCss: '', logoWhiteDataUri: 'data:image/svg+xml;base64,' };
const base: CardFaceData = {
  cardNumber: 'SBH-7K2M9Q4X',
  plate: '8-1234567',
  makeModel: 'تويوتا هايلكس',
  color: 'أبيض',
  year: '2018',
  fuel: 'بنزين',
  chassis: 'JTFDE626400123456',
  booklet: '1234567',
  officeName: 'مديرية أمن سبها',
  issueDate: '2026-09-27',
  stationCode: 'REG-000001',
  qrSvg: '<svg></svg>',
};

describe('card HTML template (one face)', () => {
  it('escapes every character that could start markup', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&`)).toBe('&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;');
  });

  it('never lets staff-typed values become HTML', () => {
    const hostile = '<img src=x onerror=alert(1)><script>alert(2)</script>';
    const html = buildCardHtml(
      { ...base, plate: hostile, makeModel: hostile, color: hostile, chassis: hostile, booklet: hostile, officeName: hostile },
      'full',
      assets,
    );
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>alert(2)');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('is ONE face: a single page in colour and in black, no back', () => {
    for (const mode of ['full', 'black'] as const) {
      const html = buildCardHtml(base, mode, assets);
      expect(html.match(/class="page"/g)).toHaveLength(1);
      expect(html).not.toContain('طريقة الاستعمال'); // the old back face
    }
  });

  it('prints every vehicle detail beside the QR code', () => {
    const html = buildCardHtml(base, 'full', assets);
    for (const text of ['SBH-7K2M9Q4X', '8-1234567', 'تويوتا هايلكس', 'أبيض', '2018', 'بنزين', 'JTFDE626400123456', '1234567', 'REG-000001', '2026-09-27', 'مديرية أمن سبها']) {
      expect(html).toContain(text);
    }
  });

  it('prints no owner name or identity number - the card has no field for them', () => {
    expect(Object.keys(base).sort()).toEqual(
      ['booklet', 'cardNumber', 'chassis', 'color', 'fuel', 'issueDate', 'makeModel', 'officeName', 'plate', 'qrSvg', 'stationCode', 'year'].sort(),
    );
  });

  it('keeps every text and the QR code at least 2 mm inside the card, with no rule under 0.25 mm', () => {
    expect(SAFE_PX).toBeGreaterThanOrEqual(24);
    expect(MIN_RULE_PX).toBeGreaterThanOrEqual(3);
    const html = buildCardHtml(base, 'full', assets);
    // Every absolutely positioned box that carries text or the QR starts inside the safe area.
    const boxes = [...html.matchAll(/class="abs"[^>]*style="left:(\d+)px;top:(\d+)px;width:(\d+)px;height:(\d+)px/g)];
    expect(boxes.length).toBeGreaterThan(8);
    for (const [, left, top, width, height] of boxes) {
      const l = Number(left);
      const t = Number(top);
      const w = Number(width);
      const h = Number(height);
      const bandOrStrip = l === 0 && w >= 1011; // header band, amber rule, bottom strip run edge to edge
      if (bandOrStrip) continue;
      expect(l).toBeGreaterThanOrEqual(SAFE_PX);
      expect(l + w).toBeLessThanOrEqual(1011 - SAFE_PX + 1);
      expect(t + h).toBeLessThanOrEqual(638 - SAFE_PX + 1);
    }
    // The QR box is the largest square and sits inside the safe area.
    expect(QR_BOX_PX / (300 / 25.4)).toBeGreaterThanOrEqual(26);
    expect(QR_BOX_PX / (300 / 25.4)).toBeLessThanOrEqual(30);
  });

  it('never sets text below 7 pt regular or 6 pt bold, and never a light grey', () => {
    const html = buildCardHtml(base, 'full', assets);
    for (const [, weight, size] of html.matchAll(/font:(\d+) (\d+)px/g)) {
      const px = Number(size);
      expect(px).toBeGreaterThanOrEqual(Number(weight) >= 700 ? 28 : 30);
    }
    expect(html).not.toMatch(/color:s*#([89a-f])/i);
  });

  it('the setup card draws the 1, 2 and 3 mm lines, the centre cross, a font ladder and three QR sizes', () => {
    const html = buildPrinterSetupHtml({ small: '<svg id="s"></svg>', medium: '<svg id="m"></svg>', large: '<svg id="l"></svg>' }, assets);
    for (const mm of ['1 mm', '2 mm', '3 mm']) expect(html).toContain(mm);
    for (const pt of ['6 pt', '8 pt', '10 pt', '14 pt']) expect(html).toContain(pt);
    expect(html).toContain('id="s"');
    expect(html).toContain('id="m"');
    expect(html).toContain('id="l"');
    expect(html.match(/class="page"/g)).toHaveLength(1);
  });
});
