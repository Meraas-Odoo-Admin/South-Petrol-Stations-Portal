import type { PdfReport } from '../report-pdf/report-pdf.html';
import { jobLabelAr, stampAr } from '../common/labels-ar';

interface OfficesResult {
  range: { from: string; to: string };
  duplicatesRecordedSince: string | null;
  offices: Array<{
    name: string;
    cards: {
      issued: number;
      first: number;
      replacements: { total: number };
      failedPrintReprints: number;
      active: number;
      cancelled: number;
    };
    vehicles: {
      registered: number;
      duplicatesCaught: number;
      corrections: { requested: number; pending: number; approved: number; rejected: number };
    };
    people: {
      total: number;
      active: number;
      deactivated: number;
      byJob: Array<{ name: string; active: number; deactivated: number }>;
      lastLoginAt: Date | null;
    };
  }>;
}

// The office comparison as a landscape PDF: one row per office.
export function officesPdf(result: OfficesResult): PdfReport {
  return {
    title: 'متابعة مكاتب التسجيل',
    landscape: true,
    subtitle: [`الفترة: من ${result.range.from} إلى ${result.range.to} (بتوقيت طرابلس)`],
    tables: [
      {
        title: 'البطاقات',
        headers: [
          'المكتب',
          'بطاقات صادرة',
          'بطاقات أولى',
          'بدل (فاقد/تالف/تغيّر البيانات)',
          'إعادة طباعة بعد فشل (مهدورة)',
          'نشطة حاليًا',
          'ملغاة',
        ],
        rows: result.offices.map((o) => [
          o.name,
          o.cards.issued,
          o.cards.first,
          o.cards.replacements.total,
          o.cards.failedPrintReprints,
          o.cards.active,
          o.cards.cancelled,
        ]),
      },
      {
        title: 'المركبات والتصحيحات',
        headers: ['المكتب', 'مركبات جديدة', 'تكرارات مكتشفة', 'تصحيحات مطلوبة', 'قيد الاعتماد', 'معتمدة', 'مرفوضة'],
        rows: result.offices.map((o) => [
          o.name,
          o.vehicles.registered,
          o.vehicles.duplicatesCaught,
          o.vehicles.corrections.requested,
          o.vehicles.corrections.pending,
          o.vehicles.corrections.approved,
          o.vehicles.corrections.rejected,
        ]),
        footnote: result.duplicatesRecordedSince
          ? `تُسجَّل التكرارات المكتشفة منذ ${result.duplicatesRecordedSince}؛ لا يوجد سجل لما قبل ذلك التاريخ.`
          : undefined,
      },
      {
        title: 'الموظفون',
        headers: ['المكتب', 'عدد الموظفين', 'نشطون', 'موقوفون', 'حسب الوظيفة', 'آخر دخول'],
        rows: result.offices.map((o) => [
          o.name,
          o.people.total,
          o.people.active,
          o.people.deactivated,
          o.people.byJob.map((j) => `${jobLabelAr(j.name)}: ${j.active} نشط / ${j.deactivated} موقوف`).join('، ') || '—',
          stampAr(o.people.lastLoginAt),
        ]),
      },
    ],
  };
}
