// Registration pivot, phase 3 — the printed vehicle card as HTML, rendered
// to PDF by headless Chromium (CardRendererService).
//
// Every position/size/colour below is copied from
// design/design_handoff_fuel_control_system/CLAUDE-CODE-CARD-PROMPT.md and
// `Vehicle Card.dc.html`: the card is authored at 300 dpi, 638 × 1011 px,
// with absolutely positioned elements. The PDF step scales it by 96/300 so
// those px land at exactly 53.98 × 85.60 mm.
//
// SECURITY: plate, make/model/colour and the office name are typed by
// staff. Every per-card value goes through escapeHtml() — never interpolate
// raw text into this template. The QR is generated SVG of the card number
// alone.

export type CardRenderMode = 'full' | 'black';

export interface CardFaceData {
  cardNumber: string;
  plate: string;
  vehicleLine: string;
  officeName: string;
  issueDate: string; // YYYY-MM-DD
  stationCode: string;
  qrSvg: string; // from `qrcode` (trusted: generated from cardNumber only)
}

export interface CardAssets {
  fontFaceCss: string; // @font-face rules with data: URIs (bundled Cairo)
  logoWhiteDataUri: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const TEAL = '#0D5C52';
const STRIPE = '#11695E';
const AMBER = '#E8A53D';

// Header-band stripes: #11695E lines, 3 px wide, at 135°, repeating every
// 22 px — drawn as a flat vector pattern rather than a CSS gradient, since
// the print rules allow flat colour only.
function bandSvg(height: number, id: string): string {
  return `<svg class="abs" style="left:0;top:0" width="638" height="${height}" viewBox="0 0 638 ${height}">
  <defs><pattern id="${id}" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <rect x="0" y="0" width="3" height="22" fill="${STRIPE}"/></pattern></defs>
  <rect width="638" height="${height}" fill="${TEAL}"/>
  <rect width="638" height="${height}" fill="url(#${id})"/>
</svg>`;
}

// Shrinks a field's font until its text fits its box (never below 25 px,
// the design's 6 pt minimum). Runs once, after the embedded fonts have
// loaded (measuring with a fallback font would fit the wrong widths).
const FIT_SCRIPT = `
document.fonts.ready.then(function () {
document.querySelectorAll('[data-fit]').forEach(function (el) {
  var size = parseFloat(getComputedStyle(el).fontSize);
  var lineRatio = parseFloat(getComputedStyle(el).lineHeight) / size;
  var box = el.parentElement;
  // Width of the text itself (a Range), not scrollWidth, and the element's
  // line-box height, not scrollHeight: Cairo's glyphs are taller than the
  // design's line height, so scroll metrics report overflow that isn't there.
  function overflowing() {
    var range = document.createRange();
    range.selectNodeContents(el);
    return range.getBoundingClientRect().width > el.clientWidth + 1 || el.offsetHeight > box.clientHeight + 1;
  }
  while (overflowing() && size > 25) {
    size -= 1;
    el.style.fontSize = size + 'px';
    el.style.lineHeight = Math.round(size * lineRatio) + 'px';
  }
});
window.__cardReady = true;
});
`;

const BASE_CSS = `
/* Chromium quantises the PDF page to 54.017 × 85.683 mm (its nearest
   steps to 53.98 × 85.60) — within 0.1 mm, inside card-printer tolerance.
   The page and bottom strips run one design px past 1011 as bleed, so
   that last 0.08 mm is never a white sliver. */
@page { size: 53.98mm 85.6mm; margin: 0; }
html, body { margin: 0; padding: 0; background: #ffffff; }
body { font-family: 'Cairo', sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { position: relative; width: 638px; height: 1012px; overflow: hidden; background: #ffffff; }
.page + .page { break-before: page; }
.abs { position: absolute; display: block; }
.ltr { direction: ltr; unicode-bidi: isolate; white-space: nowrap; display: inline-block; }
.center { text-align: center; }
`;

function frontFixedLayer(officeName: string, logo: string): string {
  return `
${bandSvg(250, 'band-front')}
<div class="abs" style="left:0;top:250px;width:638px;height:8px;background:${AMBER}"></div>
<img class="abs" src="${logo}" alt="" style="left:284px;top:30px;width:70px;height:70px">
<div class="abs" style="left:35px;top:112px;width:568px;height:76px;display:flex;align-items:center;justify-content:center;overflow:hidden">
  <div data-fit class="center" style="width:568px;font:800 32px/38px 'Cairo',sans-serif;color:#ffffff;text-wrap:balance">${escapeHtml(officeName)}</div>
</div>
<div class="abs center" style="left:35px;top:190px;width:568px;height:40px;font:900 34px/40px 'Cairo',sans-serif;color:${AMBER}">بطاقة تعبئة الوقود</div>
<div class="abs" style="left:0;top:997px;width:638px;height:15px;background:${TEAL}"></div>`;
}

function frontVariableLayer(data: CardFaceData): string {
  // The QR's 57 px quiet zone (x 85–553, y 259–727) holds nothing else.
  return `
<div class="abs" style="left:142px;top:316px;width:354px;height:354px">${data.qrSvg}</div>
<div class="abs" style="left:35px;top:732px;width:568px;height:104px;overflow:hidden">
  <div data-fit class="center" dir="ltr" style="width:568px;white-space:nowrap;font:900 96px/104px 'Cairo',sans-serif;color:#000000;letter-spacing:.01em;font-variant-numeric:tabular-nums">${escapeHtml(data.plate)}</div>
</div>
<div class="abs" style="left:35px;top:848px;width:568px;height:44px;overflow:hidden">
  <div data-fit class="center" style="width:568px;white-space:nowrap;font:700 36px/44px 'Cairo',sans-serif;color:#000000">${escapeHtml(data.vehicleLine)}</div>
</div>
<div class="abs" style="left:35px;top:900px;width:568px;height:66px;display:flex;flex-direction:column;align-items:center;font:600 27px/33px 'Cairo',sans-serif;color:#000000">
  <div style="white-space:nowrap;height:33px">رقم البطاقة <span class="ltr" style="font-weight:800">${escapeHtml(data.cardNumber)}</span></div>
  <div style="white-space:nowrap;height:33px">صدرت <span class="ltr" style="font-weight:700">${escapeHtml(data.issueDate)}</span> · المحطة <span class="ltr" style="font-weight:700">${escapeHtml(data.stationCode)}</span></div>
</div>`;
}

function backPage(officeName: string): string {
  const step = (numeral: string, text: string) => `
  <div style="display:flex;gap:18px;align-items:flex-start">
    <div style="width:52px;height:52px;border-radius:50%;background:${TEAL};color:#fff;display:flex;align-items:center;justify-content:center;font:900 28px/1 'Cairo',sans-serif;flex:none">${numeral}</div>
    <div style="flex:1;font:700 31px/46px 'Cairo',sans-serif;color:#000000">${text}</div>
  </div>`;
  return `<div class="page" dir="rtl">
${bandSvg(150, 'band-back')}
<div class="abs" style="left:0;top:150px;width:638px;height:8px;background:${AMBER}"></div>
<div class="abs center" style="left:35px;top:44px;width:568px;height:40px;font:900 34px/40px 'Cairo',sans-serif;color:#ffffff">طريقة الاستعمال</div>
<div class="abs center" style="left:35px;top:90px;width:568px;height:32px;font:700 26px/32px 'Cairo',sans-serif;color:${AMBER}">بطاقة تعبئة الوقود</div>
<div class="abs" style="left:35px;top:206px;width:568px;display:flex;flex-direction:column;gap:30px">
${step('١', 'اعرض هذه البطاقة على موظف المحطة ليمسح الرمز.')}
${step('٢', 'هذه البطاقة لهذه المركبة وحدها، ولا يجوز نقلها إلى مركبة أخرى.')}
${step('٣', 'إذا فُقدت البطاقة أو تلفت، راجع أقرب مركز تسجيل.')}
</div>
<div class="abs" style="left:35px;top:760px;width:568px;height:2px;background:${TEAL}"></div>
<div class="abs center" style="left:35px;top:790px;width:568px;font:700 30px/44px 'Cairo',sans-serif;color:#000000;text-wrap:balance">للاستفسار أو لأي تعديل على بيانات المركبة، راجع أقرب مركز تسجيل.</div>
<div class="abs" style="left:35px;top:900px;width:568px;height:64px;overflow:hidden">
  <div data-fit class="center" style="width:568px;font:600 26px/32px 'Cairo',sans-serif;color:#000000;text-wrap:balance">${escapeHtml(officeName)}</div>
</div>
<div class="abs" style="left:0;top:997px;width:638px;height:15px;background:${TEAL}"></div>
</div>`;
}

function document(body: string, assets: CardAssets): string {
  return `<!DOCTYPE html><html lang="ar"><head><meta charset="utf-8">
<style>${assets.fontFaceCss}${BASE_CSS}</style></head>
<body>${body}<script>${FIT_SCRIPT}</script></body></html>`;
}

// The card: front + back in 'full' mode. 'black' is the same template with
// the fixed (pre-printable) layer hidden — the pass for pre-printed colour
// stock. The back is entirely pre-printed, so 'black' is the front only.
export function buildCardHtml(data: CardFaceData, mode: CardRenderMode, assets: CardAssets): string {
  const front = `<div class="page" dir="rtl">
${mode === 'full' ? frontFixedLayer(data.officeName, assets.logoWhiteDataUri) : ''}
${frontVariableLayer(data)}
</div>`;
  return document(mode === 'full' ? front + backPage(data.officeName) : front, assets);
}

// Setup/alignment card for a desk printer (new desk, new ribbon): the full
// design with a sample, NON-card QR, plus the 3 mm safe margin, centre
// cross-hairs and corner marks on both sides.
export function buildTestCardHtml(qrSvg: string, officeName: string, assets: CardAssets): string {
  const marks = `
<div class="abs" style="left:35px;top:35px;width:568px;height:941px;border:2px dashed #000;box-sizing:border-box"></div>
<div class="abs" style="left:318px;top:0;width:2px;height:1011px;background:#000"></div>
<div class="abs" style="left:0;top:504px;width:638px;height:2px;background:#000"></div>
${[
  [0, 0],
  [598, 0],
  [0, 971],
  [598, 971],
]
  .map(([x, y]) => `<div class="abs" style="left:${x}px;top:${y}px;width:40px;height:40px;border:2px solid #000;box-sizing:border-box"></div>`)
  .join('')}`;
  const data: CardFaceData = {
    cardNumber: 'TEST-CARD',
    plate: '00-0000000',
    vehicleLine: 'بطاقة اختبار — للمعايرة فقط',
    officeName,
    issueDate: '0000-00-00',
    stationCode: 'TEST',
    qrSvg,
  };
  const front = `<div class="page" dir="rtl">${frontFixedLayer(officeName, assets.logoWhiteDataUri)}${frontVariableLayer(data)}${marks}</div>`;
  const back = backPage(officeName).replace(/<\/div>$/, `${marks}</div>`);
  return document(front + back, assets);
}
