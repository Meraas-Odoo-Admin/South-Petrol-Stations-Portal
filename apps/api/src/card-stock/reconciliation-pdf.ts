import type { PdfReport } from '../report-pdf/report-pdf.html';
import { stampAr } from '../common/labels-ar';

interface ReconciliationResult {
  range: { from: string; to: string };
  pools: Array<{
    registrationStation: { name: string };
    desk: { name: string } | null;
    windows: Array<{
      from: { at: Date; quantity: number };
      to: { at: Date; quantity: number };
      received: number;
      used: number;
      prints: { card: number; test: number; total: number };
      difference: number;
      status: 'OK' | 'UNACCOUNTED' | 'NEGATIVE';
    }>;
  }>;
}

// The words that go with a difference. Colour is only ever a second signal.
export function differenceText(
  status: 'OK' | 'UNACCOUNTED' | 'NEGATIVE',
  difference: number,
): { text: string; tone: 'ok' | 'danger' | 'warn' } {
  if (status === 'OK') return { text: 'مطابق', tone: 'ok' };
  if (status === 'UNACCOUNTED') return { text: `${difference} بطاقة غير مبرَّرة`, tone: 'danger' };
  return { text: `${Math.abs(difference)} بطاقة أقل من المطبوع — راجع الجرد`, tone: 'warn' };
}

export function reconciliationPdf(result: ReconciliationResult): PdfReport {
  const rows = result.pools.flatMap((pool) =>
    pool.windows.map((w) => [
      pool.desk ? `${pool.registrationStation.name} — ${pool.desk.name}` : pool.registrationStation.name,
      `${stampAr(w.from.at)} ← ${stampAr(w.to.at)}`,
      w.from.quantity,
      w.received,
      w.to.quantity,
      w.used,
      `${w.prints.total} (بطاقات ${w.prints.card}، اختبار ${w.prints.test})`,
      differenceText(w.status, w.difference),
    ]),
  );
  return {
    title: 'مطابقة مخزون البطاقات الفارغة',
    landscape: true,
    subtitle: [`الفترة: من ${result.range.from} إلى ${result.range.to} (بتوقيت طرابلس)`],
    tables: [
      {
        headers: ['المكتب', 'بين جردين', 'الجرد السابق', 'المستلَم', 'الجرد الحالي', 'المستخدم من الفارغ', 'المطبوع المسجَّل', 'الفرق'],
        rows,
        emptyText: 'لا توجد جردات متتالية في هذه الفترة.',
      },
    ],
    notes: [
      'المستخدم = الجرد السابق + المستلَم − الجرد الحالي. الفرق = المستخدم − المطبوع المسجَّل في النظام (بطاقات وبطاقات اختبار).',
      'فرق موجب: بطاقات خرجت من الصندوق ولم تُسجَّل لها طباعة. فرق سالب: غالبًا خطأ في العدّ أو الإدخال.',
    ],
  };
}
