// ONE helper for "a number of things" written inside an Arabic sentence, used
// by the API (notifications, PDFs) and the web (readiness, reports). Arabic
// number agreement is not "number + plural":
//
//   1        the singular, then «واحد/واحدة»   يوم واحد · بطاقة واحدة
//   2        the dual, no number               يومان · بطاقتان
//   3 - 10   the number + the plural           3 أيام · 5 بطاقات
//   11+      the number + the singular         11 يومًا · 25 بطاقة
//
// Digits stay Western (0-9), as everywhere else in the app.

export interface CountUnit {
  one: string;
  // The word after «واحد/واحدة»: omitted means «<one> <oneWord>».
  oneWord: 'واحد' | 'واحدة';
  two: string;
  few: string;
  many: string;
}

export const COUNT_UNITS = {
  day: { one: 'يوم', oneWord: 'واحد', two: 'يومان', few: 'أيام', many: 'يومًا' },
  hour: { one: 'ساعة', oneWord: 'واحدة', two: 'ساعتان', few: 'ساعات', many: 'ساعة' },
  minute: { one: 'دقيقة', oneWord: 'واحدة', two: 'دقيقتان', few: 'دقائق', many: 'دقيقة' },
  card: { one: 'بطاقة', oneWord: 'واحدة', two: 'بطاقتان', few: 'بطاقات', many: 'بطاقة' },
  liter: { one: 'لتر', oneWord: 'واحد', two: 'لتران', few: 'لترات', many: 'لترًا' },
  station: { one: 'محطة', oneWord: 'واحدة', two: 'محطتان', few: 'محطات', many: 'محطة' },
  office: { one: 'مكتب', oneWord: 'واحد', two: 'مكتبان', few: 'مكاتب', many: 'مكتبًا' },
  plate: { one: 'لوحة', oneWord: 'واحدة', two: 'لوحتان', few: 'لوحات', many: 'لوحة' },
  vehicle: { one: 'مركبة', oneWord: 'واحدة', two: 'مركبتان', few: 'مركبات', many: 'مركبة' },
  fillup: { one: 'تعبئة', oneWord: 'واحدة', two: 'تعبئتان', few: 'تعبئات', many: 'تعبئة' },
  person: { one: 'شخص', oneWord: 'واحد', two: 'شخصان', few: 'أشخاص', many: 'شخصًا' },
  employee: { one: 'موظف', oneWord: 'واحد', two: 'موظفان', few: 'موظفون', many: 'موظفًا' },
  row: { one: 'صف', oneWord: 'واحد', two: 'صفان', few: 'صفوف', many: 'صفًّا' },
  time: { one: 'مرة', oneWord: 'واحدة', two: 'مرتان', few: 'مرات', many: 'مرة' },
  case: { one: 'حالة', oneWord: 'واحدة', two: 'حالتان', few: 'حالات', many: 'حالة' },
  // Phase 7: the units of the settings page.
  exception: { one: 'استثناء', oneWord: 'واحد', two: 'استثناءان', few: 'استثناءات', many: 'استثناءً' },
  dinar: { one: 'دينار', oneWord: 'واحد', two: 'ديناران', few: 'دنانير', many: 'دينارًا' },
} as const satisfies Record<string, CountUnit>;

export type CountUnitKey = keyof typeof COUNT_UNITS;

// "يوم واحد", "يومان", "3 أيام", "11 يومًا", "0 يوم" (zero and a fraction take
// the singular, as in «0 يوم» and «1.5 لتر»).
//
// After a preposition (بعد، نحو، خلال، في) pass { oblique: true }: the dual and
// the sound plural take «ين» («بعد يومين»، «في 3 موظفين»).
export function arabicCount(count: number, unit: CountUnitKey, options: { oblique?: boolean } = {}): string {
  const base: CountUnit = COUNT_UNITS[unit];
  const u: CountUnit = options.oblique
    ? { ...base, two: base.two.replace(/ان$/, 'ين'), few: base.few.replace(/ون$/, 'ين') }
    : base;
  const n = Math.abs(count);
  if (!Number.isInteger(n)) return `${formatCount(count)} ${u.one}`;
  if (n === 0) return `0 ${u.one}`;
  if (n === 1) return `${u.one} ${u.oneWord}`;
  if (n === 2) return u.two;
  const shown = formatCount(count);
  // The last two digits decide: 103 is «103 أيام», 111 and 101 are «يومًا».
  const tail = n % 100;
  return tail >= 3 && tail <= 10 ? `${shown} ${u.few}` : `${shown} ${u.many}`;
}

function formatCount(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 2, useGrouping: true });
}
