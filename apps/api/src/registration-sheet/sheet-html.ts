// Registration pivot, phase 4a — the A4 sheet each petrol station prints and
// posts at the pump: the active registration stations of its municipality,
// from live data. Rendered to PDF by the same offline Chromium as the card.
//
// BLACK AND WHITE ON PURPOSE: stations print this on an ordinary office
// printer, so it uses only black text and black rules on white — no fills,
// no colour, nothing that turns to grey mush.
//
// SECURITY: every value (names, addresses, hours, phones) is typed by staff
// and goes through escapeHtml(); nothing is interpolated raw.
import { escapeHtml, type CardAssets } from '../cards/render/card-html';

export interface SheetStation {
  name: string;
  address: string;
  workingHours: string | null;
  contactPhone: string | null;
}

export interface SheetData {
  municipalityName: string;
  // YYYY-MM-DD, or null when the municipality has no deadline set.
  cardRequiredFromDate: string | null;
  stations: SheetStation[];
  printedAt: Date;
}

// The same Arabic day format the web app uses for stored calendar days.
export function formatArabicDay(day: string): string {
  return new Date(`${day}T00:00:00.000Z`).toLocaleDateString('ar', { timeZone: 'UTC' });
}

function formatArabicPrintDate(at: Date): string {
  return at.toLocaleDateString('ar', { timeZone: 'Africa/Tripoli' });
}

const CSS = `
@page { size: A4; margin: 14mm 14mm 16mm 14mm; }
html, body { margin: 0; padding: 0; background: #fff; color: #000; }
body { font-family: 'Cairo', sans-serif; font-size: 15px; line-height: 1.5; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
h1 { margin: 0; font-size: 30px; font-weight: 900; line-height: 1.35; text-align: center; }
.muni { margin: 4px 0 0; font-size: 22px; font-weight: 700; text-align: center; }
.deadline { margin: 14px 0 0; padding: 10px 12px; border: 3px solid #000; font-size: 22px; font-weight: 800; text-align: center; }
.lead { margin: 14px 0 6px; font-size: 17px; font-weight: 700; }
table { width: 100%; border-collapse: collapse; }
th, td { border: 1.5px solid #000; padding: 7px 8px; text-align: start; vertical-align: top; }
th { font-weight: 800; font-size: 14px; border-bottom: 3px solid #000; }
td.num { width: 28px; text-align: center; font-weight: 800; }
tr { break-inside: avoid; }
td.name { font-weight: 800; }
.ltr { direction: ltr; unicode-bidi: isolate; display: inline-block; white-space: nowrap; }
.empty { margin-top: 20px; padding: 14px; border: 1.5px solid #000; font-size: 18px; font-weight: 700; text-align: center; }
.foot { margin-top: 18px; padding-top: 8px; border-top: 1.5px solid #000; font-size: 13px; display: flex; justify-content: space-between; }
`;

export function buildRegistrationSheetHtml(data: SheetData, assets: CardAssets): string {
  const rows = data.stations
    .map(
      (s, i) => `<tr>
  <td class="num">${i + 1}</td>
  <td class="name">${escapeHtml(s.name)}</td>
  <td>${escapeHtml(s.address)}</td>
  <td>${s.workingHours ? escapeHtml(s.workingHours) : '—'}</td>
  <td>${s.contactPhone ? `<span class="ltr">${escapeHtml(s.contactPhone)}</span>` : '—'}</td>
</tr>`,
    )
    .join('\n');

  const body =
    data.stations.length > 0
      ? `<p class="lead">استلم بطاقتك من أحد مكاتب التسجيل التالية:</p>
<table>
<thead><tr><th></th><th>المكتب</th><th>العنوان</th><th>ساعات العمل</th><th>الهاتف</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>`
      : `<div class="empty">لا يوجد حاليًا مكتب تسجيل عامل في هذه البلدية.</div>`;

  const deadline = data.cardRequiredFromDate
    ? `<div class="deadline">ابتداءً من ${escapeHtml(formatArabicDay(data.cardRequiredFromDate))} لن تتم تعبئة أي مركبة بدون بطاقة</div>`
    : '';

  return `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>مكاتب التسجيل</title>
<style>${assets.fontFaceCss}${CSS}</style></head>
<body>
<h1>مكاتب تسجيل المركبات وبطاقات تعبئة الوقود</h1>
<p class="muni">${escapeHtml(data.municipalityName)}</p>
${deadline}
${body}
<div class="foot"><span>تاريخ الطباعة: ${escapeHtml(formatArabicPrintDate(data.printedAt))}</span><span>القوائم تتغير — اطبع ورقة جديدة عند الحاجة</span></div>
<script>document.fonts.ready.then(function () { window.__cardReady = true; });</script>
</body></html>`;
}
