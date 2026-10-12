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
      return `يوجد ${h.cardlessPlates} لوحة بدون بطاقة، ولم تُصدر مكاتب التسجيل بطاقات أولى مؤخرًا، فلا يمكن تقدير المدة.`;
    case 'NO_DEADLINE':
      return `تقريبًا ${h.daysNeeded} يومًا لازمة لإصدار البطاقات لـ ${h.cardlessPlates} لوحة بدون بطاقة، بمعدل ${h.averagePerDay} بطاقة يوميًا. لم يُحدَّد موعد نهائي بعد.`;
    case 'DEADLINE_PASSED':
      return `انقضى الموعد النهائي، ولا تزال ${h.cardlessPlates} لوحة بدون بطاقة.`;
    case 'ON_TRACK':
      return `تقريبًا ${h.daysNeeded} يومًا لازمة مقابل ${h.daysLeft} يومًا متبقية: الموعد واقعي بالمعدل الحالي (${h.averagePerDay} بطاقة يوميًا).`;
    default:
      return `تقريبًا ${h.daysNeeded} يومًا لازمة مقابل ${h.daysLeft} يومًا متبقية: الموعد غير واقعي بالمعدل الحالي، وقد تبقى نحو ${h.shortfall} لوحة بدون بطاقة.`;
  }
}

export function readinessPdf(result: ReadinessResult): PdfReport {
  const tables: PdfReport['tables'] = [];
  if (result.headline) {
    tables.push({
      title: 'التقدير (تقدير وليس حسابًا مؤكدًا)',
      headers: ['الخلاصة'],
      rows: [[headlineSentence(result.headline)]],
      footnote: `الحساب: لوحات مميّزة عُبّئت بدون بطاقة في آخر ${result.headline.windowDays} يومًا ولا بطاقة فعّالة لها ÷ متوسط البطاقات الأولى المُصدرة يوميًا في المدة نفسها، مقرَّبًا للأعلى.`,
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
