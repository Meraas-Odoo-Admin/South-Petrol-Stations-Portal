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
  directorate_admin: 'إدارة المديرية',
  system_admin: 'مدير المنظومة',
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
  'companies:manage': 'إدارة الشركات',
  'municipalities:read': 'عرض البلديات',
  'municipalities:manage': 'إدارة البلديات',
  'routes:read': 'عرض خطوط السير',
  'routes:manage': 'إدارة خطوط السير',
  'security_authorities:read': 'عرض الجهات الأمنية',
  'security_authorities:manage': 'إدارة الجهات الأمنية',
  'stations:read': 'عرض المحطات',
  'stations:manage': 'إدارة المحطات',
  'users:manage': 'إدارة الحسابات',
  'roles:manage': 'إسناد الأدوار والصلاحيات الفردية',
  'reports:view_all_stations': 'عرض تقارير كل المحطات',
  'reports:view': 'عرض تقارير المحطة',
  'owners:manage': 'إدارة بيانات ملاك المركبات',
  'owners:reveal_identity': 'إظهار رقم هوية المالك الكامل',
  'vehicles:manage': 'إضافة/تعديل المركبات',
  'vehicles:read': 'عرض سجل المركبات',
  'vehicles:request_change': 'طلب تعديل بيانات مركبة (يتطلب اعتمادًا)',
  'vehicles:approve_change': 'اعتماد طلبات تعديل بيانات المركبات',
  'vehicle_types:read': 'عرض أنواع المركبات',
  'vehicle_types:manage': 'إدارة أنواع المركبات',
  'fillups:create': 'تسجيل تعبئة',
  'fillups:update': 'تعديل تعبئة (غير مفعّلة حاليًا)',
  'fillups:record_exception': 'تسجيل تعبئة كاستثناء دون موافقة',
  'fillups:approve_exception': 'اعتماد استثناء تعبئة',
  'settings:manage': 'إدارة إعدادات المنظومة',
  'audit:view': 'عرض سجل التغييرات',
  'exception_types:manage': 'إدارة أنواع الاستثناءات',
  'standing_exceptions:manage': 'منح/سحب استثناء مستمر',
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

// Station.ownershipType (Prisma enum StationOwnershipType) — fixed,
// two-value, not Settings-managed (see the schema's own comment on why).
export const OWNERSHIP_TYPE_LABELS: Record<string, string> = {
  GOVERNMENT: 'حكومية',
  PRIVATE: 'خاصة',
};

export function ownershipTypeLabel(ownershipType: string | null | undefined): string {
  if (!ownershipType) return '—';
  return OWNERSHIP_TYPE_LABELS[ownershipType] ?? ownershipType;
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
  // Round 11 item 1: deliberately provisional — see
  // VehicleOwner.identityType's schema comment and
  // isProvisionalOwnerIdentity below.
  DRIVERS_LICENSE: 'رخصة قيادة (مؤقت)',
};

export function identityTypeLabel(identityType: string | null | undefined): string {
  if (!identityType) return '—';
  return IDENTITY_TYPE_LABELS[identityType] ?? identityType;
}

// Round 11 item 1: a DRIVERS_LICENSE-identified owner is a one-time
// fallback, valid only for the vehicle's first fill-up — the vehicle
// profile stays flagged "incomplete" until a real national/administrative
// ID replaces it. Reuses the same accent-badge language
// STATION_STATUS_LABELS.UNVERIFIED already established for "on record but
// needs review," rather than inventing a new visual vocabulary for
// "incomplete."
export function isProvisionalOwnerIdentity(identityType: string | null | undefined): boolean {
  return identityType === 'DRIVERS_LICENSE';
}

export const PROVISIONAL_OWNER_LABEL = 'هوية مؤقتة — تحتاج مراجعة';
export const PROVISIONAL_OWNER_VARIANT = 'accent' as const;

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

// SystemSetting rows (apps/api/prisma/seed.ts's SYSTEM_SETTINGS) — the
// naming-dictionary rule (1b) applies here too: SettingsAdminPage used to
// render setting.description and setting.key directly, which are literal
// English developer text and literal snake_case-ish DB keys
// ("PLACEHOLDER — max fill-ups per owner per week...",
// "fillup.max_per_week_per_owner"). Four of these settings are
// placeholder values pending client confirmation (docs/OPEN_ITEMS.md
// #19/#20) — the Arabic description says so explicitly rather than
// presenting them as settled, same as the English placeholder text did.
export const SYSTEM_SETTING_LABELS: Record<string, { label: string; description: string }> = {
  'fillup.max_per_week': {
    label: 'الحد الأسبوعي لعدد التعبئات',
    description: 'أقصى عدد تعبئات مسموح به لكل مركبة خلال الأسبوع.',
  },
  'fillup.min_gap_days': {
    label: 'أقل فاصل زمني بين تعبئتين',
    description: 'عدد الأيام التي يجب أن تمضي قبل السماح بتعبئة جديدة للمركبة نفسها.',
  },
  'fillup.max_per_week_per_owner': {
    label: 'الحد الأسبوعي لعدد تعبئات مالك المركبة',
    description: 'أقصى عدد تعبئات مسموح به لمالك المركبة أسبوعيًا على جميع مركباته — رقم مبدئي بانتظار تأكيد العميل.',
  },
  'fillup.min_gap_days_per_owner': {
    label: 'أقل فاصل زمني بين تعبئتين لنفس مالك المركبة',
    description: 'عدد الأيام بين تعبئتين لنفس مالك المركبة، على أي من مركباته — رقم مبدئي بانتظار تأكيد العميل.',
  },
  'fillup.week_window_mode': {
    label: 'طريقة حساب الأسبوع',
    description: '"متجدد" يحسب آخر سبعة أيام تلقائيًا، أو "ثابت" يبدأ من يوم محدَّد كل أسبوع.',
  },
  'fillup.week_start_day': {
    label: 'يوم بداية الأسبوع',
    description: 'يُستخدم فقط عند اختيار طريقة الحساب "ثابت" — رقم مبدئي بانتظار تأكيد العميل.',
  },
  'fillup.max_liters_per_week_per_owner': {
    label: 'الحد الأسبوعي للترات مالك المركبة',
    description: 'أقصى مجموع لترات مسموح به لمالك المركبة أسبوعيًا على جميع مركباته — رقم مبدئي بانتظار تأكيد العميل.',
  },
  'fillup.price_per_liter.PETROL_95': {
    label: 'سعر لتر بنزين 95',
    description: 'يُستخدم لحساب تكلفة التعبئة تلقائيًا — مؤكَّد من العميل.',
  },
  'fillup.price_per_liter.DIESEL': {
    label: 'سعر لتر الديزل',
    description: 'رقم مبدئي بانتظار تأكيد العميل — لا يُعتمد كسعر حقيقي.',
  },
  'fillup.price_per_liter.KEROSENE': {
    label: 'سعر لتر الكاز',
    description: 'رقم مبدئي بانتظار تأكيد العميل — لا يُعتمد كسعر حقيقي.',
  },
};

export function systemSettingLabel(key: string): { label: string; description: string } {
  return SYSTEM_SETTING_LABELS[key] ?? { label: key, description: '' };
}
