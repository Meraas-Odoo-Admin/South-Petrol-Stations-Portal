import { COUNT_UNITS, arabicCount, type CountUnitKey } from '@fuel-tracking/shared-types';

// Arabic-label dictionary for every internal code/enum value the app
// stores. Source of truth: design/"Fuel Control System - Round 2
// Screens.dc.html" artboard 1b ("قاموس المسمّيات") — its hard rule:
// "لا يظهر في أي شاشة رمز أو اسم حقل قاعدة بيانات أو قيمة تعدادية" (no
// screen may ever show a code, DB field name, or enum value). Every map
// here is what replaces the raw value app-wide; the raw value itself
// stays out of JSX except inside a dev-only comment.

// Roles (Role.name from the DB — station_employee / station_supervisor /
// directorate_admin / system_admin per apps/api/prisma/seed.ts).
export const ROLE_LABELS: Record<string, string> = {
  station_employee: 'موظف محطة',
  station_supervisor: 'مشرف محطة',
  registration_employee: 'موظف تسجيل',
  registration_supervisor: 'مدير مكتب التسجيل',
  directorate_admin: 'مدير البلدية',
  system_admin: 'المدير العام للنظام',
};

export function roleLabel(roleName: string): string {
  return ROLE_LABELS[roleName] ?? roleName;
}

// Permission.key (apps/api/prisma/seed.ts's PERMISSIONS list) — round 14:
// the per-user "صلاحيات إضافية" checkbox list in UsersAdminPage used to
// show these raw (English) keys directly, which the client flagged as
// something station staff won't understand. Every permission actually
// seeded gets an entry here; a key added to the backend without a matching
// entry here still renders (falls back to the raw key, same pattern as
// roleLabel above) rather than crashing, but should get a real label added
// promptly — this list is meant to stay complete.
export const PERMISSION_LABELS: Record<string, string> = {
  'companies:read': 'عرض الشركات',
  'companies:manage': 'إضافة الشركات',
  'companies:update': 'تعديل الشركات وأرشفتها',
  'municipalities:read': 'عرض البلديات',
  'municipalities:manage': 'إدارة البلديات',
  'routes:read': 'عرض خطوط السير',
  'routes:manage': 'إدارة خطوط السير',
  'security_authorities:read': 'عرض الجهات الأمنية',
  'security_authorities:manage': 'إدارة الجهات الأمنية',
  'registration_stations:read': 'عرض مكاتب التسجيل',
  'registration_stations:manage': 'إدارة مكاتب التسجيل',
  'cards:read': 'عرض بطاقات المركبات وسجلها',
  'cards:issue': 'إصدار بطاقات المركبات وطباعتها',
  'cards:cancel': 'إلغاء بطاقة مركبة دون بديل',
  'cards:scan': 'مسح بطاقة المركبة عند التعبئة',
  'stations:read': 'عرض المحطات',
  'stations:manage': 'إدارة المحطات',
  'users:manage': 'إدارة الحسابات',
  'users:manage_staff': 'إدارة حسابات موظفي محطتك أو مكتبك',
  'users:manage_system_admins': 'إدارة حسابات مديري المنظومة',
  'roles:manage': 'إسناد الأدوار والصلاحيات الفردية',
  'reports:view_all_stations': 'عرض تقارير كل المحطات',
  'reports:view': 'عرض تقارير المحطة',
  'owners:read': 'عرض سجل ملاك المركبات',
  'owners:manage': 'إدارة بيانات ملاك المركبات',
  'owners:reveal_identity': 'إظهار رقم هوية المالك الكامل',
  'owners:request_change': 'طلب تصحيح هوية مالك (يتطلب اعتمادًا)',
  'owners:approve_change': 'اعتماد طلبات تصحيح هوية المالك',
  'vehicles:manage': 'إضافة/تعديل المركبات',
  'vehicles:read': 'عرض سجل المركبات',
  'records:browse': 'فتح شاشات السجلات: المركبات والمحطات',
  'vehicles:request_change': 'طلب تعديل بيانات مركبة (يتطلب اعتمادًا)',
  'vehicles:approve_change': 'اعتماد طلبات تعديل بيانات المركبات',
  'vehicle_types:read': 'عرض أنواع المركبات',
  'vehicle_types:manage': 'إدارة أنواع المركبات',
  'fillups:create': 'تسجيل تعبئة',
  'fillups:update': 'تعديل تعبئة (غير مفعّلة حاليًا)',
  'fillups:record_exception': 'تسجيل تعبئة كاستثناء دون موافقة',
  'settings:manage': 'إدارة إعدادات المنظومة',
  'audit:view': 'عرض سجل التدقيق',
  'exception_types:manage': 'إدارة أنواع الاستثناءات',
};

export function permissionLabel(key: string): string {
  return PERMISSION_LABELS[key] ?? key;
}

// Vehicle.usageType (Prisma enum VehicleUsageType).
export const USAGE_TYPE_LABELS: Record<string, string> = {
  GOVERNMENT: 'مركبة إدارية',
  PRIVATE: 'مركبة دورية',
  COMMERCIAL: 'مركبة نقل',
};

export function usageTypeLabel(usageType: string | null | undefined): string {
  if (!usageType) return '—';
  return USAGE_TYPE_LABELS[usageType] ?? usageType;
}

// Station.status (Prisma enum StationStatus) — Arabic per the schema's own
// inline comments.
export const STATION_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'نشطة',
  SUSPENDED_LEGAL: 'موقوفة قضائيًا',
  SUSPENDED_COMMITTEE: 'موقوفة (لجنة)',
  SUSPENDED_OWNER: 'معلّقة - خاصة',
  NOT_YET_SUPPLIED: 'لم تُزوَّد بعد',
  // Not in the design's naming dictionary (1b) — that table only covers
  // the 5 statuses it drew. UNVERIFIED is real in the Prisma enum (schema
  // comment: "من القائمة المكتوبة، تحتاج مراجعة يدوية" / "from the
  // handwritten list, needs manual review") — found via the code-leak
  // audit, not the artboard. Arabic wording matches the schema comment's
  // own phrasing rather than inventing new copy.
  UNVERIFIED: 'غير مؤكدة — تحتاج مراجعة',
};

export const STATION_STATUS_VARIANT: Record<string, 'ok' | 'neutral' | 'danger' | 'accent'> = {
  ACTIVE: 'ok',
  SUSPENDED_LEGAL: 'danger',
  SUSPENDED_COMMITTEE: 'danger',
  SUSPENDED_OWNER: 'danger',
  NOT_YET_SUPPLIED: 'neutral',
  UNVERIFIED: 'accent',
};

export function stationStatusLabel(status: string | null | undefined): string {
  if (!status) return '—';
  return STATION_STATUS_LABELS[status] ?? status;
}

// Fuel types (FuelType — PETROL_95 / DIESEL / KEROSENE).
export const FUEL_TYPE_LABELS: Record<string, string> = {
  PETROL_95: 'بنزين 95',
  DIESEL: 'ديزل',
  KEROSENE: 'كاز',
};

export function fuelTypeLabel(fuelType: string | null | undefined): string {
  if (!fuelType) return '—';
  return FUEL_TYPE_LABELS[fuelType] ?? fuelType;
}

// Identity type (NATIONAL_ID / ADMINISTRATIVE_ID / DRIVERS_LICENSE).
export const IDENTITY_TYPE_LABELS: Record<string, string> = {
  NATIONAL_ID: 'رقم وطني',
  ADMINISTRATIVE_ID: 'رقم إداري',
  // Rows created before phase 5A may still carry this; nothing creates it any more.
  DRIVERS_LICENSE: 'رخصة قيادة (قديم)',
  INSTITUTION: 'جهة / مؤسسة',
};

export function identityTypeLabel(identityType: string | null | undefined): string {
  if (!identityType) return '—';
  return IDENTITY_TYPE_LABELS[identityType] ?? identityType;
}


// Generic pending/approved/rejected status wording, shared by change
// requests and exceptions (dictionary's "حالات الاستثناء").
export const APPROVAL_STATUS_LABELS: Record<string, string> = {
  PENDING: 'بانتظار الاعتماد',
  pending: 'بانتظار الاعتماد',
  APPROVED: 'معتمد',
  approved: 'معتمد',
  REJECTED: 'مرفوض',
  rejected: 'مرفوض',
};

// Dictionary's "لم يسرِ بعد" — a pending correction hasn't taken effect
// yet; the old value is still the one in force everywhere in the system.
export const CHANGE_NOT_YET_EFFECTIVE = 'لم يسرِ بعد';

// VehicleChangeRequest.changeType — was previously duplicated locally in
// ChangeRequestsQueuePage.tsx and VehicleDetailPage.tsx instead of living
// here with every other enum's dictionary entry (verification-fix item 10:
// not a leak, since both call sites already showed correct Arabic text,
// just an inconsistent source of truth).
export const VEHICLE_CHANGE_TYPE_LABELS: Record<string, string> = {
  CHASSIS_CHANGE: 'رقم الشاصي',
  BOOKLET_CHANGE: 'رقم كتيب المركبة',
  // Round 12: rule-affecting vehicle edits route through this same
  // approval flow now — see VehicleChangeType's schema comment.
  OWNER_CHANGE: 'المالك',
  // Deprecated (round 14) — kept only so a pre-existing pending/decided
  // request of this type still renders a real label instead of a raw key.
  USAGE_TYPE_CHANGE: 'نوع الاستخدام',
  PLATE_CHANGE: 'رقم اللوحة',
  VEHICLE_TYPE_CHANGE: 'نوع المركبة',
};

export function vehicleChangeTypeLabel(changeType: string | null | undefined): string {
  if (!changeType) return '—';
  return VEHICLE_CHANGE_TYPE_LABELS[changeType] ?? changeType;
}

// SystemSetting rows (apps/api/prisma/rbac-catalog.ts's SYSTEM_SETTINGS) — the
// naming-dictionary rule (1b) applies here too: the page never shows a raw
// key or the English developer description stored with it.
//
// Phase 7: every number carries its unit (`unit`, written with Arabic number
// agreement by arabicCount, plus `per` for a rate: «3 تعبئات في الأسبوع»), and
// the «رقم مبدئي بانتظار تأكيد العميل» notes are gone from the cards. The
// values that carried one are listed in OPEN_ITEMS #66 for Mohamed to confirm
// with the client: the four per-owner numbers, the week start day and the
// diesel and kerosene prices.
export interface SettingLabel {
  label: string;
  description: string;
  unit?: CountUnitKey;
  /** What the number is counted against, after the unit: «في الأسبوع», «للتر». */
  per?: string;
  /** How 0 reads when 0 means "no limit": «بلا حد». */
  zeroText?: string;
}

export const SYSTEM_SETTING_LABELS: Record<string, SettingLabel> = {
  'fillup.max_per_week': {
    label: 'الحد الأسبوعي لعدد التعبئات',
    description: 'أقصى عدد تعبئات مسموح به لكل مركبة خلال الأسبوع.',
    unit: 'fillup',
    per: 'في الأسبوع',
  },
  'fillup.min_gap_days': {
    label: 'أقل فاصل زمني بين تعبئتين',
    description: 'عدد الأيام التي يجب أن تمضي قبل السماح بتعبئة جديدة للمركبة نفسها.',
    unit: 'day',
  },
  'fillup.max_per_week_per_owner': {
    label: 'الحد الأسبوعي لعدد تعبئات مالك المركبة',
    description: 'أقصى عدد تعبئات مسموح به لمالك المركبة أسبوعيًا على جميع مركباته.',
    unit: 'fillup',
    per: 'في الأسبوع',
  },
  'fillup.min_gap_days_per_owner': {
    label: 'أقل فاصل زمني بين تعبئتين لنفس مالك المركبة',
    description: 'عدد الأيام بين تعبئتين لنفس مالك المركبة، على أي من مركباته.',
    unit: 'day',
  },
  'fillup.week_window_mode': {
    label: 'طريقة حساب الأسبوع',
    description: '"متجدد" يحسب آخر سبعة أيام تلقائيًا، أو "ثابت" يبدأ من يوم محدَّد كل أسبوع.',
  },
  'fillup.week_start_day': {
    label: 'يوم بداية الأسبوع',
    description: 'اليوم الذي يبدأ منه الأسبوع عند الحساب "الثابت".',
  },
  'stock.low_threshold_liters': {
    label: 'حدّ تنبيه انخفاض الوقود',
    description:
      'عندما ينزل أي نوع وقود في محطة تحت هذا العدد من اللترات يُنبَّه مشرف المحطة ومدير البلدية، مرة عند الانخفاض ومرة أخرى بعد إعادة التعبئة وانخفاضه من جديد.',
    unit: 'liter',
  },
  // After review (19 Oct 2026): «ضوابط المالك».
  'registration.max_vehicles_per_owner': {
    label: 'أقصى عدد مركبات للمالك الواحد',
    description: 'أقصى عدد مركبات يمكن تسجيلها باسم مالك واحد (برقم هويته). 0 تعني بلا حد. لا يمسّ المركبات المسجّلة سابقًا.',
    unit: 'vehicle',
    zeroText: 'بلا حد',
  },
  'fillup.max_liters_per_week_per_owner': {
    label: 'الحد الأسبوعي للترات مالك المركبة',
    description: 'أقصى مجموع لترات مسموح به لمالك المركبة أسبوعيًا على جميع مركباته.',
    unit: 'liter',
    per: 'في الأسبوع',
  },
  'fillup.price_per_liter.PETROL_95': {
    label: 'سعر لتر بنزين 95',
    description: 'يُستخدم لحساب كمية التعبئة من المبلغ المدفوع.',
    unit: 'dinar',
    per: 'للتر',
  },
  'fillup.price_per_liter.DIESEL': {
    label: 'سعر لتر الديزل',
    description: 'يُستخدم لحساب كمية التعبئة من المبلغ المدفوع.',
    unit: 'dinar',
    per: 'للتر',
  },
  'fillup.price_per_liter.KEROSENE': {
    label: 'سعر لتر الكاز',
    description: 'يُستخدم لحساب كمية التعبئة من المبلغ المدفوع.',
    unit: 'dinar',
    per: 'للتر',
  },
  'exceptions.station_daily_threshold': {
    label: 'حدّ تنبيه استثناءات المحطة في اليوم',
    description: 'إذا تجاوز عدد استثناءات محطة واحدة هذا الرقم في يوم واحد، تُعلَّم المحطة للمراجعة.',
    unit: 'exception',
    per: 'في اليوم',
  },
};

export function systemSettingLabel(key: string): SettingLabel {
  return SYSTEM_SETTING_LABELS[key] ?? { label: key, description: '' };
}

// A setting's value as a person reads it: «3 تعبئات في الأسبوع», «يومان»,
// «1000 لتر», «0.15 دينار للتر». A value with no unit is shown as it is.
export function settingValueText(key: string, value: string | number): string {
  const { unit, per, zeroText } = systemSettingLabel(key);
  const n = Number(value);
  if (zeroText && n === 0) return zeroText;
  if (!unit || !Number.isFinite(n)) return String(value);
  return [arabicCount(n, unit), per].filter(Boolean).join(' ');
}

// The unit word alone, for the space next to a stepper's figure: «تعبئة»,
// «يوم», «لتر», «دينار للتر».
export function settingUnitWord(key: string): string {
  const { unit, per } = systemSettingLabel(key);
  if (!unit) return '';
  return [COUNT_UNITS[unit].one, per].filter(Boolean).join(' ');
}

// One plain sentence per job, shown on the job picker (phase 4b). Display
// text only — nothing in the app's logic reads a role name. A job added later
// still renders: it falls back to the description stored on the role.
export const ROLE_DESCRIPTIONS: Record<string, string> = {
  station_employee: 'يسجّل التعبئات في محطته فقط.',
  station_supervisor: 'يعتمد الاستثناءات ويدير موظفي محطته.',
  registration_employee: 'يسجّل المركبات والملاك ويصدر البطاقات في مكتبه.',
  registration_supervisor: 'يدير مكتبه وموظفيه، ويعتمد التصحيحات وإلغاء البطاقات.',
  directorate_admin: 'يدير محطات بلديته ومكاتب التسجيل فيها ومشرفيها.',
  system_admin: 'ينشئ البلديات ومديريها ويضبط قواعد المنظومة.',
};

export function roleDescription(roleName: string, fallback?: string | null): string | null {
  return ROLE_DESCRIPTIONS[roleName] ?? fallback ?? null;
}

// The three sides a job can be on (Role.kind; null = administration).
export const JOB_SIDE_LABELS = {
  PETROL_STATION: 'محطات الوقود',
  REGISTRATION: 'مكاتب التسجيل',
  ADMIN: 'الإدارة',
} as const;

export const ACCOUNT_STATUS_LABELS = {
  active: 'نشط',
  deactivated: 'موقوف',
  locked: 'مقفل',
  must_change: 'يجب تغيير كلمة المرور',
  archived: 'مؤرشف',
} as const;

// AuditLog.action values written for an account (phase 4b), as a sentence.
export const ACCOUNT_ACTION_LABELS: Record<string, string> = {
  CREATE: 'أُنشئ الحساب',
  UPDATE: 'عُدّلت بيانات الحساب',
  CHANGE_JOB: 'غُيّرت الوظيفة',
  SET_PLACES: 'غُيّرت أماكن العمل',
  DEACTIVATE_USER: 'أُوقف الحساب',
  REACTIVATE_USER: 'أُعيد تفعيل الحساب',
  RESET_PASSWORD: 'أُعيد تعيين كلمة المرور',
  UNLOCK_USER: 'فُكّ قفل الحساب',
  ASSIGN_ROLE: 'أُسند دور',
  REMOVE_ROLE: 'أُزيل دور',
  GRANT_PERMISSION: 'مُنحت صلاحية فردية',
  REVOKE_PERMISSION: 'سُحبت صلاحية فردية',
  ADD_STATION_SCOPE: 'أُضيفت محطة',
  REMOVE_STATION_SCOPE: 'أُزيلت محطة',
  ADD_REGISTRATION_STATION_SCOPE: 'أُضيف مكتب تسجيل',
  REMOVE_REGISTRATION_STATION_SCOPE: 'أُزيل مكتب تسجيل',
  CHANGE_PASSWORD: 'غيّر كلمة مروره',
};
