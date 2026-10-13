import { arabicCount, type CountUnitKey } from '@fuel-tracking/shared-types';

// The notification the super admin reads when another super admin changes a
// setting or a fill-up rule: ONE plain Arabic sentence. Never the setting's key,
// never `true`/`false`, never an arrow - those were what the bell used to show
// («03: 2 ← 2», «false ← true»).

interface SettingKind {
  label: string;
  // How a value is written: a count of something, a plain number, or words.
  unit?: CountUnitKey | 'dinar_per_liter' | 'weekday' | 'week_mode';
}

const SETTINGS: Record<string, SettingKind> = {
  'fillup.max_per_week': { label: 'الحد الأسبوعي لعدد تعبئات المركبة', unit: 'fillup' },
  'fillup.min_gap_days': { label: 'أقل فاصل زمني بين تعبئتين للمركبة', unit: 'day' },
  'fillup.max_per_week_per_owner': { label: 'الحد الأسبوعي لعدد تعبئات المالك', unit: 'fillup' },
  'fillup.min_gap_days_per_owner': { label: 'أقل فاصل زمني بين تعبئتين للمالك', unit: 'day' },
  'fillup.max_liters_per_week_per_owner': { label: 'الحد الأسبوعي للترات المالك', unit: 'liter' },
  'fillup.week_window_mode': { label: 'طريقة حساب الأسبوع', unit: 'week_mode' },
  'fillup.week_start_day': { label: 'يوم بداية الأسبوع', unit: 'weekday' },
  'stock.low_threshold_liters': { label: 'حدّ تنبيه انخفاض الوقود', unit: 'liter' },
  'cards.low_blank_threshold': { label: 'حدّ تنبيه نقص البطاقات الفارغة', unit: 'card' },
  'fillup.price_per_liter.PETROL_95': { label: 'سعر لتر بنزين 95', unit: 'dinar_per_liter' },
  'fillup.price_per_liter.DIESEL': { label: 'سعر لتر الديزل', unit: 'dinar_per_liter' },
  'fillup.price_per_liter.KEROSENE': { label: 'سعر لتر الكاز', unit: 'dinar_per_liter' },
};

const RULES: Record<string, string> = {
  'fillup.rule.vehicle_gap.enabled': 'الفاصل الأدنى بين تعبئتين للمركبة',
  'fillup.rule.vehicle_weekly.enabled': 'الحد الأسبوعي لتعبئات المركبة',
  'fillup.rule.owner_gap.enabled': 'الفاصل الأدنى بين تعبئتين للمالك',
  'fillup.rule.owner_weekly.enabled': 'الحد الأسبوعي لتعبئات المالك',
  'fillup.rule.owner_liters.enabled': 'الحد الأسبوعي للترات المالك',
};

// 0 = Sunday, as the rule engine reads it.
const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

function writeValue(kind: SettingKind, raw: string): string {
  const n = Number(raw);
  const numeric = raw.trim() !== '' && Number.isFinite(n);
  switch (kind.unit) {
    case 'weekday':
      return numeric && WEEKDAYS[n] ? WEEKDAYS[n]! : 'يوم غير معروف';
    case 'week_mode':
      return raw === 'fixed' ? 'أسبوع ثابت' : raw === 'rolling' ? 'أسبوع متجدد' : 'غير معروفة';
    case 'dinar_per_liter':
      return numeric ? `${n} دينار للتر` : 'غير معروف';
    case undefined:
      return numeric ? String(n) : 'قيمة جديدة';
    default:
      return numeric ? arabicCount(n, kind.unit, { oblique: true }) : 'قيمة جديدة';
  }
}

const isOn = (value: string) => value.trim().toLowerCase() === 'true';

// Returns null when nothing changed (no notification at all).
export function settingChangeNotification(
  key: string,
  before: string,
  after: string,
): { kind: 'RULE_SWITCH_CHANGED' | 'SETTING_CHANGED'; title: string; body: string } | null {
  if (before === after) return null;

  const rule = RULES[key];
  if (key.startsWith('fillup.rule.')) {
    const name = rule ?? 'قاعدة تعبئة';
    const on = isOn(after);
    return {
      kind: 'RULE_SWITCH_CHANGED',
      title: on ? `تم تفعيل قاعدة «${name}»` : `تم إيقاف قاعدة «${name}»`,
      body: on
        ? 'صارت القاعدة تُطبَّق على كل تعبئة جديدة.'
        : 'لم تعد القاعدة تُطبَّق على التعبئات الجديدة.',
    };
  }

  const kind = SETTINGS[key] ?? { label: 'أحد إعدادات المنظومة' };
  return {
    kind: 'SETTING_CHANGED',
    title: `تم تعديل «${kind.label}»`,
    body: `تم تعديل «${kind.label}» من ${writeValue(kind, before)} إلى ${writeValue(kind, after)}.`,
  };
}
