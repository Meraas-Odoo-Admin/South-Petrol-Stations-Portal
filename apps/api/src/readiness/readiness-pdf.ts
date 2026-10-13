import { arabicCount } from '@fuel-tracking/shared-types';
import type { PdfReport } from '../report-pdf/report-pdf.html';

interface Headline {
  cardlessPlates: number;
  averagePerDay: number;
  daysNeeded: number | null;
  daysLeft: number | null;
  deadline: string | null;
  windowDays: number;
  verdict: string;
  shortfall: number | null;
}

interface ReadinessResult {
  municipality: { name: string; cardRequiredFromDate: string | null };
  range: { from: string; to: string };
  sees: { stations: string; offices: string; headline: boolean };
  headline: Headline | null;
  approximateRows: number;
  daily: Array<{ day: string; withCard: number; withoutCard: number; distinctCardlessPlates: number; cardsIssued: number }>;
  stations: Array<{
    name: string;
    withCard: number;
    typedRegistered: number;
    typedUnregistered: number;
    emergencyOverride: number;
    distinctCardlessPlates: number;
  }>;
  offices: Array<{ name: string; cardsIssued: number; firstCardsIssued: number }>;
}

// The headline in plain Arabic, always saying it is an estimate.
export function headlineSentence(h: Headline): string {
  switch (h.verdict) {
    case 'NONE_REMAINING':
      return 'لا توجد مركبات بدون بطاقة بين من عبّأوا مؤخرًا.';
    case 'NO_ISSUANCE':
      return `يوجد ${arabicCount(h.cardlessPlates, 'plate')} بدون بطاقة، ولم تُصدر مكاتب التسجيل بطاقات أولى مؤخرًا، فلا يمكن تقدير المدة.`;
    case 'NO_DEADLINE':
      return `يحتاج إصدار البطاقات لـ ${arabicCount(h.cardlessPlates, 'plate', { oblique: true })} بدون بطاقة تقريبًا ${arabicCount(h.daysNeeded ?? 0, 'day')}، بمعدل ${arabicCount(h.averagePerDay ?? 0, 'card')} يوميًا. لم يُحدَّد موعد نهائي بعد.`;
    case 'DEADLINE_PASSED':
      return `انقضى الموعد النهائي، ولا تزال ${arabicCount(h.cardlessPlates, 'plate')} بدون بطاقة.`;
    case 'ON_TRACK':
      return `يحتاج التسجيل تقريبًا ${arabicCount(h.daysNeeded ?? 0, 'day')} والمتبقي ${arabicCount(h.daysLeft ?? 0, 'day')}: الموعد واقعي بالمعدل الحالي (${arabicCount(h.averagePerDay ?? 0, 'card')} يوميًا).`;
    default:
      return `يحتاج التسجيل تقريبًا ${arabicCount(h.daysNeeded ?? 0, 'day')} والمتبقي ${arabicCount(h.daysLeft ?? 0, 'day')}: الموعد غير واقعي بالمعدل الحالي، وقد تبقى نحو ${arabicCount(h.shortfall ?? 0, 'plate')} بدون بطاقة.`;
  }
}

export function readinessPdf(result: ReadinessResult): PdfReport {
  const tables: PdfReport['tables'] = [];
  if (result.headline) {
    tables.push({
      title: 'التقدير (تقدير وليس حسابًا مؤكدًا)',
      headers: ['الخلاصة'],
      rows: [[headlineSentence(result.headline)]],
      footnote: `الحساب: لوحات مميّزة عُبّئت بدون بطاقة في آخر ${arabicCount(result.headline.windowDays, 'day', { oblique: true })} ولا بطاقة فعّالة لها ÷ متوسط البطاقات الأولى المُصدرة يوميًا في المدة نفسها، مقرَّبًا للأعلى.`,
    });
  }
  if (result.sees.stations !== 'none') {
    tables.push({
      title: 'المحطات: بطاقة مقابل بدون بطاقة',
      headers: ['المحطة', 'بمسح بطاقة', 'مسجَّلة بالكتابة', 'غير مسجَّلة بالكتابة', 'تفويض طارئ', 'لوحات مميّزة بدون بطاقة'],
      rows: result.stations.map((s) => [
        s.name,
        s.withCard,
        s.typedRegistered,
        s.typedUnregistered,
        s.emergencyOverride,
        s.distinctCardlessPlates,
      ]),
    });
    tables.push({
      title: 'يوميًا',
      headers: ['اليوم', 'بمسح بطاقة', 'بدون بطاقة', 'لوحات مميّزة بدون بطاقة', 'بطاقات صادرة'],
      rows: result.daily.map((d) => [d.day, d.withCard, d.withoutCard, d.distinctCardlessPlates, d.cardsIssued]),
    });
  }
  if (result.sees.offices !== 'none') {
    tables.push({
      title: 'مكاتب التسجيل: البطاقات الصادرة',
      headers: ['المكتب', 'كل البطاقات', 'بطاقات أولى'],
      rows: result.offices.map((o) => [o.name, o.cardsIssued, o.firstCardsIssued]),
    });
  }
  return {
    title: `جاهزية الموعد النهائي — ${result.municipality.name}`,
    subtitle: [
      `الفترة: من ${result.range.from} إلى ${result.range.to} (بتوقيت طرابلس)`,
      result.municipality.cardRequiredFromDate ? `الموعد النهائي: ${result.municipality.cardRequiredFromDate}` : 'لم يُحدَّد موعد نهائي',
    ],
    tables,
    notes:
      result.approximateRows > 0
        ? [`${result.approximateRows} تعبئة في هذه الفترة سبقت تسجيل طريقة التعرّف، وطريقتها تقريبية (بيانات اختبار).`]
        : [],
  };
}
