// The printed vehicle card as HTML, rendered to PDF by headless Chromium
// (CardRendererService). Phase 6: ONE face, printed once, on an Evolis Zenius
// Classic (single-sided thermal transfer, 300 dpi, ISO CR80 85.60 x 53.98 mm).
//
// The card is authored LANDSCAPE at 300 dpi: 1011 x 638 design px (1 mm =
// 11.81 px). The PDF step scales it by 96/300 so those px land on exactly
// 85.60 x 53.98 mm. Rules the layout keeps (docs/PRINTING.md):
//  - every text, the QR code and the plate sit at least 2 mm (24 px) inside
//    every edge; only the header band and the bottom strip run edge to edge;
//  - no line thinner than 0.25 mm (3 px);
//  - the smallest text is 7 pt regular (29.2 px, set at 30 px) or 6 pt bold
//    (25 px, set at 28 px); no light grey - small text is pure black, which the
//    printer lays down with the black resin (K) panel;
//  - the QR code is vector, pure black on white, about 28.8 mm square with its
//    4-module quiet zone, the most important element, and never crowded;
//  - the plate is the largest text;
//  - no owner name, no national ID, no imitation of the official emblem.
//
// SECURITY: plate, make/model/colour, chassis, booklet and the office name are
// typed by staff. Every per-card value goes through escapeHtml() - never
// interpolate raw text into this template. The QR is generated SVG of the
// card number alone.

// 'full': colour ribbon (YMCKO) - teal header band, amber rule.
// 'black': monochrome ribbon - the same face with every element in black on
// white, no fills, so the single K panel prints all of it.
export type CardRenderMode = 'full' | 'black';

// The three layouts that were put to the client; 'A' is the one that ships.
export type CardLayout = 'A' | 'B' | 'C';

export interface CardFaceData {
  cardNumber: string;
  plate: string;
  makeModel: string;
  color: string;
  year: string;
  fuel: string;
  chassis: string;
  booklet: string;
  officeName: string;
  issueDate: string; // YYYY-MM-DD
  stationCode: string;
  qrSvg: string; // from `qrcode` (trusted: generated from cardNumber only)
}

export interface CardAssets {
  fontFaceCss: string; // @font-face rules with data: URIs (bundled Cairo)
  logoWhiteDataUri: string;
}

// Design px of the card face and the printable limits.
export const CARD_PX = { width: 1011, height: 638 } as const;
export const PX_PER_MM = 300 / 25.4; // 11.811
export const SAFE_PX = Math.ceil(2 * PX_PER_MM); // 24 px = 2 mm
export const MIN_TEXT_PX = { regular: 30, bold: 28 } as const; // 7 pt / 6 pt at 300 dpi
export const MIN_RULE_PX = 3; // 0.25 mm
export const QR_BOX_PX = 340; // 28.8 mm including the quiet zone

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const TEAL = '#0D5C52';
const AMBER = '#E8A53D';
const BLACK = '#000000';

// Shrinks a field's font until its text fits its box (never below its own
// data-min, which is the printable minimum). Runs once, after the embedded
// fonts have loaded (measuring with a fallback font would fit the wrong widths).
const FIT_SCRIPT = `
document.fonts.ready.then(function () {
document.querySelectorAll('[data-fit]').forEach(function (el) {
  var size = parseFloat(getComputedStyle(el).fontSize);
  var min = parseFloat(el.getAttribute('data-min') || '28');
  var lineRatio = parseFloat(getComputedStyle(el).lineHeight) / size;
  var box = el.parentElement;
  function overflowing() {
    var range = document.createRange();
    range.selectNodeContents(el);
    return range.getBoundingClientRect().width > el.clientWidth + 1 || el.offsetHeight > box.clientHeight + 1;
  }
  while (overflowing() && size > min) {
    size -= 1;
    el.style.fontSize = size + 'px';
    el.style.lineHeight = Math.round(size * lineRatio) + 'px';
  }
});
window.__cardReady = true;
});
`;

const BASE_CSS = `
/* Chromium quantises the PDF page to the nearest of its own steps (about
   0.04 mm off 85.60 x 53.98); fitPdfToCard cuts the page box back to the exact
   size afterwards. The page runs one design px past the card as bleed, so the
   last 0.08 mm is never a white sliver. */
@page { size: 85.6mm 53.98mm; margin: 0; }
html, body { margin: 0; padding: 0; background: #ffffff; width: 1011px; height: 638px; overflow: hidden; }
body { font-family: 'Cairo', sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { position: relative; width: 1012px; height: 639px; overflow: hidden; background: #ffffff; }
.abs { position: absolute; display: block; }
.ltr { direction: ltr; unicode-bidi: isolate; white-space: nowrap; display: inline-block; }
`;

// A labelled value: the label 28 px bold, the value 33 px extra-bold, both pure
// black. `ltr` isolates codes (chassis, booklet) from the Arabic around them.
function field(label: string, value: string, left: number, top: number, width: number, opts: { ltr?: boolean } = {}): string {
  const shown = value.trim() === '' ? '—' : value;
  return `<div class="abs" style="left:${left}px;top:${top}px;width:${width}px;height:78px;overflow:hidden">
  <div style="font:700 28px/32px 'Cairo',sans-serif;color:${BLACK};white-space:nowrap">${escapeHtml(label)}</div>
  <div style="height:42px;overflow:hidden"><div data-fit data-min="28" style="width:${width}px;white-space:nowrap;text-align:start;font:800 33px/42px 'Cairo',sans-serif;color:${BLACK}">${opts.ltr ? `<span class="ltr">${escapeHtml(shown)}</span>` : escapeHtml(shown)}</div></div>
</div>`;
}

function header(mode: CardRenderMode, officeName: string, logo: string, leftText: { text: string; ltr: boolean } = { text: 'بطاقة تعبئة الوقود', ltr: false }): string {
  const colour = mode === 'full';
  const text = colour ? '#ffffff' : BLACK;
  const sub = colour ? AMBER : BLACK;
  return `
${colour ? `<div class="abs" style="left:0;top:0;width:1012px;height:92px;background:${TEAL}"></div>
<div class="abs" style="left:0;top:92px;width:1012px;height:8px;background:${AMBER}"></div>
<img class="abs" src="${logo}" alt="" style="left:${1011 - SAFE_PX - 60}px;top:16px;width:60px;height:60px">`
    : `<div class="abs" style="left:${SAFE_PX}px;top:96px;width:${1011 - 2 * SAFE_PX}px;height:${MIN_RULE_PX}px;background:${BLACK}"></div>`}
<div class="abs" style="left:${SAFE_PX + 280}px;top:${colour ? 12 : 8}px;width:${1011 - 2 * SAFE_PX - 280 - (colour ? 76 : 0)}px;height:68px;overflow:hidden">
  <div data-fit data-min="28" style="width:100%;text-align:start;font:800 40px/68px 'Cairo',sans-serif;color:${text};white-space:nowrap">${escapeHtml(officeName)}</div>
</div>
<div class="abs" style="left:${SAFE_PX}px;top:${colour ? 18 : 14}px;width:260px;height:56px;overflow:hidden">
  <div data-fit data-min="28" dir="${leftText.ltr ? 'ltr' : 'rtl'}" style="width:260px;white-space:nowrap;font:900 34px/56px 'Cairo',sans-serif;color:${sub};text-align:end">${escapeHtml(leftText.text)}</div>
</div>`;
}

function footer(mode: CardRenderMode): string {
  return mode === 'full' ? `<div class="abs" style="left:0;top:624px;width:1012px;height:15px;background:${TEAL}"></div>` : '';
}

function qrBlock(data: CardFaceData, left: number, top: number): string {
  // The quiet zone (4 modules) is inside the SVG, so nothing else is drawn in the box.
  const below = top + QR_BOX_PX + 6;
  return `<div class="abs" style="left:${left}px;top:${top}px;width:${QR_BOX_PX}px;height:${QR_BOX_PX}px;background:#ffffff">${data.qrSvg}</div>
<div class="abs" style="left:${left}px;top:${below}px;width:${QR_BOX_PX}px;height:36px;overflow:hidden;text-align:center">
  <div style="font:700 28px/36px 'Cairo',sans-serif;color:${BLACK};white-space:nowrap">رقم البطاقة</div>
</div>
<div class="abs" style="left:${left}px;top:${below + 34}px;width:${QR_BOX_PX}px;height:44px;overflow:hidden;text-align:center">
  <div data-fit data-min="28" class="ltr" dir="ltr" style="width:${QR_BOX_PX}px;font:900 34px/44px 'Cairo',sans-serif;color:${BLACK};white-space:nowrap">${escapeHtml(data.cardNumber)}</div>
</div>
<div class="abs" style="left:${left}px;top:${below + 80}px;width:${QR_BOX_PX}px;height:38px;overflow:hidden;text-align:center">
  <div style="font:700 30px/38px 'Cairo',sans-serif;color:${BLACK};white-space:nowrap">صدرت <span class="ltr">${escapeHtml(data.issueDate)}</span></div>
</div>`;
}

// The reading order: the plate (largest), a rule, then the details in two columns.
function detailsBlock(data: CardFaceData, left: number, top: number, width: number): string {
  const gap = 20;
  const col = Math.floor((width - gap) / 2);
  const right = left + col + gap; // the first column in reading order (RTL)
  const rowTop = (n: number) => top + 118 + n * 84;
  return `
<div class="abs" style="left:${left}px;top:${top}px;width:${width}px;height:104px;overflow:hidden">
  <div data-fit data-min="70" class="ltr" dir="ltr" style="width:${width}px;text-align:center;font:900 104px/104px 'Cairo',sans-serif;color:${BLACK};letter-spacing:.01em;font-variant-numeric:tabular-nums">${escapeHtml(data.plate)}</div>
</div>
<div class="abs" style="left:${left}px;top:${top + 110}px;width:${width}px;height:${MIN_RULE_PX}px;background:${BLACK}"></div>
${field('الماركة والطراز', data.makeModel, right, rowTop(0), col)}
${field('اللون', data.color, left, rowTop(0), col)}
${field('سنة الصنع', data.year, right, rowTop(1), col, { ltr: true })}
${field('نوع الوقود', data.fuel, left, rowTop(1), col)}
${field('رقم الهيكل', data.chassis, left, rowTop(2), width, { ltr: true })}
${field('رقم دفتر السيارة', data.booklet, right, rowTop(3), col, { ltr: true })}
${field('رمز المكتب', data.stationCode, left, rowTop(3), col, { ltr: true })}`;
}

function faceBody(data: CardFaceData, mode: CardRenderMode, layout: CardLayout, assets: CardAssets): string {
  const detailsWidth = 1011 - 2 * SAFE_PX - QR_BOX_PX - 40; // 599
  if (layout === 'B') {
    // Option B: the QR at the reading end (right in RTL), details to its left.
    const qrLeft = 1011 - SAFE_PX - QR_BOX_PX;
    return `${header(mode, data.officeName, assets.logoWhiteDataUri)}
${qrBlock(data, qrLeft, 122)}
${detailsBlock(data, SAFE_PX, 116, detailsWidth)}
${footer(mode)}`;
  }
  if (layout === 'C') {
    // Option C: the plate across the whole card at the top, the QR below at one
    // side (full size) and a single column of details beside it; the card
    // number moves up into the header.
    const col = 1011 - 2 * SAFE_PX - QR_BOX_PX - 40;
    const colLeft = SAFE_PX + QR_BOX_PX + 40;
    const row = (n: number) => 232 + n * 92;
    return `${header(mode, data.officeName, assets.logoWhiteDataUri, { text: data.cardNumber, ltr: true })}
<div class="abs" style="left:${SAFE_PX}px;top:108px;width:${1011 - 2 * SAFE_PX}px;height:104px;overflow:hidden">
  <div data-fit data-min="70" class="ltr" dir="ltr" style="width:${1011 - 2 * SAFE_PX}px;text-align:center;font:900 104px/104px 'Cairo',sans-serif;color:${BLACK};font-variant-numeric:tabular-nums">${escapeHtml(data.plate)}</div>
</div>
<div class="abs" style="left:${SAFE_PX}px;top:216px;width:${1011 - 2 * SAFE_PX}px;height:${MIN_RULE_PX}px;background:${BLACK}"></div>
<div class="abs" style="left:${SAFE_PX}px;top:240px;width:${QR_BOX_PX}px;height:${QR_BOX_PX}px;background:#ffffff">${data.qrSvg}</div>
${field('الماركة والطراز', data.makeModel, colLeft, row(0), col)}
${field('اللون / السنة', data.color + ' · ' + data.year, colLeft, row(1), col)}
${field('نوع الوقود / الدفتر', data.fuel + ' · ' + data.booklet, colLeft, row(2), col)}
${field('رقم الهيكل / صدرت', data.chassis + '  ' + data.issueDate, colLeft, row(3), col, { ltr: true })}
${footer(mode)}`;
  }
  // Option A (recommended): the QR on the left, large and alone, with the card
  // number and date under it; plate and details to its right.
  return `${header(mode, data.officeName, assets.logoWhiteDataUri)}
${qrBlock(data, SAFE_PX, 122)}
${detailsBlock(data, SAFE_PX + QR_BOX_PX + 40, 116, detailsWidth)}
${footer(mode)}`;
}

function document(body: string, assets: CardAssets): string {
  return `<!DOCTYPE html><html lang="ar"><head><meta charset="utf-8">
<style>${assets.fontFaceCss}${BASE_CSS}</style></head>
<body>${body}<script>${FIT_SCRIPT}</script></body></html>`;
}

// The card: ONE page, one face.
export function buildCardHtml(
  data: CardFaceData,
  mode: CardRenderMode,
  assets: CardAssets,
  layout: CardLayout = 'A',
): string {
  return document(`<div class="page" dir="rtl">${faceBody(data, mode, layout, assets)}</div>`, assets);
}

// Setup/alignment card for a desk printer (new desk, new ribbon): the real
// face with a sample, NON-card QR, plus the 2 mm safe margin, centre cross-hairs
// and corner marks. One page, never counted.
export function buildTestCardHtml(qrSvg: string, officeName: string, assets: CardAssets): string {
  const data: CardFaceData = {
    cardNumber: 'TEST-CARD',
    plate: '00-0000000',
    makeModel: 'بطاقة اختبار',
    color: 'للمعايرة فقط',
    year: '0000',
    fuel: '—',
    chassis: 'TESTCARD0000000000',
    booklet: '0000000',
    officeName,
    issueDate: '0000-00-00',
    stationCode: 'TEST',
    qrSvg,
  };
  const marks = `
<div class="abs" style="left:${SAFE_PX}px;top:${SAFE_PX}px;width:${1011 - 2 * SAFE_PX}px;height:${638 - 2 * SAFE_PX}px;border:3px dashed #000;box-sizing:border-box"></div>
<div class="abs" style="left:505px;top:0;width:3px;height:638px;background:#000"></div>
<div class="abs" style="left:0;top:318px;width:1011px;height:3px;background:#000"></div>`;
  return document(`<div class="page" dir="rtl">${faceBody(data, 'full', 'A', assets)}${marks}</div>`, assets);
}

// The page the client prints ONCE on the real printer and reads back: which of
// the 1, 2 and 3 mm lines survive, whether the centre cross sits in the middle,
// which sizes of text stay readable, and which QR sizes scan. Laid out in zones
// (left: the font ladder; right: three QR sizes and a plate), left to right, so
// nothing overlaps and every item can be read off.
export function buildPrinterSetupHtml(qrSvgs: { small: string; medium: string; large: string }, assets: CardAssets): string {
  const mm = (value: number) => Math.round(value * PX_PER_MM);
  const W = 1011;
  const H = 638;
  const edge = (m: number, labelLeft: number) => `
<div class="abs" style="left:${mm(m)}px;top:${mm(m)}px;width:${W - 2 * mm(m)}px;height:${H - 2 * mm(m)}px;border:3px solid #000;box-sizing:border-box"></div>
<div class="abs" style="left:${labelLeft}px;top:${H - mm(m) - 19}px;font:700 26px/26px 'Cairo',sans-serif;background:#fff;color:#000;padding:0 8px;white-space:nowrap">${m} mm</div>`;
  const inner = mm(3) + 18; // content starts inside the 3 mm line
  const ladder = [6, 7, 8, 10, 12, 14];
  let y = inner + 40;
  const ladderHtml = ladder
    .map((pt) => {
      const px = Math.round((pt * 300) / 72);
      if (y < 326 && y + px + 6 > 314) y = 330; // never under the centre cross
      const row = `<div class="abs" dir="ltr" style="left:${inner}px;top:${y}px;white-space:nowrap;font:700 ${px}px/${px + 6}px 'Cairo',sans-serif;color:#000">${pt} pt <span dir="rtl">بطاقة A1</span></div>`;
      y += px + 12;
      return row;
    })
    .join('');
  const qr = (svg: string, sizeMm: number, left: number, top: number) => {
    const px = mm(sizeMm);
    return `<div class="abs" style="left:${left}px;top:${top}px;width:${px}px;height:${px}px">${svg.replace(/width="\d+" height="\d+"/, `width="${px}" height="${px}"`)}</div>
<div class="abs" dir="ltr" style="left:${left}px;top:${top + px + 2}px;width:${px}px;text-align:center;font:700 28px/30px 'Cairo',sans-serif;color:#000;white-space:nowrap">${sizeMm} mm</div>`;
  };
  const colRight = 520;
  const qrTop = inner + 40;
  const body = `<div class="page" dir="ltr">
${edge(1, 140)}${edge(2, 440)}${edge(3, 740)}
<div class="abs" style="left:505px;top:${mm(4)}px;width:3px;height:${H - 2 * mm(4)}px;background:#000"></div>
<div class="abs" style="left:${mm(4)}px;top:318px;width:${W - 2 * mm(4)}px;height:3px;background:#000"></div>
<div class="abs" style="left:${inner}px;top:${inner - 6}px;width:${W - 2 * inner}px;font:900 30px/38px 'Cairo',sans-serif;color:#000;white-space:nowrap">Printer setup <span dir="rtl">· إعداد الطابعة</span></div>
${ladderHtml}
${qr(qrSvgs.large, 22, colRight, qrTop)}
${qr(qrSvgs.medium, 14, colRight + mm(22) + 24, qrTop)}
${qr(qrSvgs.small, 9, colRight + mm(22) + 24, qrTop + mm(14) + 40)}
<div class="abs" style="left:${colRight}px;top:${qrTop + mm(22) + 86}px;width:${W - colRight - inner}px;height:100px;overflow:hidden">
  <div data-fit data-min="70" class="ltr" dir="ltr" style="width:${W - colRight - inner}px;text-align:center;font:900 100px/100px 'Cairo',sans-serif;color:#000">12-6523071</div>
</div>
</div>`;
  return document(body, assets);
}
