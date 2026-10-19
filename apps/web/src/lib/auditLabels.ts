// The audit log in words (after review, 15 Oct 2026): every action, record
// kind and field the API writes, in Arabic, and the device behind an entry.
// An action or field missing here still shows, as its code.

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  // Sign-in and security
  LOGIN: 'سجّل الدخول',
  LOGOUT: 'سجّل الخروج',
  LOGIN_FAILED: 'محاولة دخول فاشلة',
  ACCOUNT_LOCKED: 'قُفل الحساب بعد محاولات خاطئة',
  ROTATE: 'جدّد الجلسة',
  CHANGE_PASSWORD: 'غيّر كلمة المرور',
  RESET_PASSWORD: 'أعاد تعيين كلمة المرور',
  UNLOCK_USER: 'فكّ قفل الحساب',
  // Accounts and access
  ASSIGN_ROLE: 'أسند وظيفة',
  REMOVE_ROLE: 'أزال وظيفة',
  CHANGE_JOB: 'غيّر الوظيفة',
  GRANT_PERMISSION: 'منح صلاحية',
  REVOKE_PERMISSION: 'سحب صلاحية',
  SET_PLACES: 'حدّد أماكن العمل',
  ADD_STATION_SCOPE: 'أضاف محطة إلى النطاق',
  REMOVE_STATION_SCOPE: 'أزال محطة من النطاق',
  ADD_REGISTRATION_STATION_SCOPE: 'أضاف مكتب تسجيل إلى النطاق',
  REMOVE_REGISTRATION_STATION_SCOPE: 'أزال مكتب تسجيل من النطاق',
  DEACTIVATE_USER: 'عطّل الحساب',
  REACTIVATE_USER: 'أعاد تفعيل الحساب',
  ARCHIVE_USER: 'أرشف الحساب',
  RESTORE_USER: 'استعاد الحساب',
  // Vehicles, owners and cards
  PLATE_CHANGE: 'غيّر اللوحة',
  // After review (18 Oct 2026): «تعديل» changes these directly.
  UPDATE_IDENTITY: 'عدّل هوية المركبة (اللوحة/الشاصي/الكتيب/النوع/المالك)',
  UPDATE_OWNER_IDENTITY: 'صحّح هوية المالك',
  VEHICLE_CHANGE_REQUESTED: 'طلب تعديل بيانات مركبة',
  VEHICLE_CHANGE_APPROVED: 'وافق على تعديل بيانات مركبة',
  VEHICLE_CHANGE_REJECTED: 'رفض تعديل بيانات مركبة',
  OWNER_IDENTITY_CHANGE_REQUESTED: 'طلب تعديل هوية مالك',
  OWNER_IDENTITY_CHANGE_APPROVED: 'وافق على تعديل هوية مالك',
  OWNER_IDENTITY_CHANGE_REJECTED: 'رفض تعديل هوية مالك',
  REVEAL_NATIONAL_ID: 'كشف الرقم الوطني',
  ISSUE_CARD: 'أصدر بطاقة',
  PRINT_CARD: 'طبع بطاقة',
  REPLACE_CARD: 'استبدل بطاقة',
  CANCEL_CARD: 'ألغى بطاقة',
  DUPLICATE_CAUGHT: 'رُصد تسجيل مكرر',
  LINK_UNREGISTERED_FILLUPS: 'ربط تعبئات سابقة بالمركبة',
  // Fuel
  FUEL_STORAGE_SETUP: 'ضبط خزان وقود',
  FUEL_STORAGE_UPDATE: 'عدّل سعة خزان وقود',
  FUEL_DELIVERY: 'سجّل توريد وقود',
  FUEL_DELIVERY_CORRECTION: 'صحّح توريد وقود',
  FUEL_RESET: 'صفّر مستوى الوقود',
  STOCK_VISIBILITY: 'غيّر إظهار المخزون للموظفين',
  // Records
  CREATE: 'أنشأ',
  UPDATE: 'عدّل',
  ARCHIVE: 'أرشف',
  RESTORE: 'استعاد',
  UPDATE_EXCEPTION_SETTINGS: 'عدّل إعدادات الاستثناءات',
  // Reports leaving the system (after review, 19 Oct 2026)
  EXPORT: 'صدّر تقريرًا',
  // System
  IMPORT_STATIONS: 'استورد قائمة المحطات',
  TEST_DATA_REMOVAL: 'حذف البيانات التجريبية',
};

// The filter's groups. The value sent is every action of the group.
export const AUDIT_ACTION_GROUPS: Array<{ label: string; actions: string[] }> = [
  { label: 'الدخول والأمان', actions: ['LOGIN', 'LOGOUT', 'LOGIN_FAILED', 'ACCOUNT_LOCKED', 'CHANGE_PASSWORD', 'RESET_PASSWORD', 'UNLOCK_USER', 'ROTATE'] },
  {
    label: 'الحسابات والصلاحيات',
    actions: [
      'ASSIGN_ROLE',
      'REMOVE_ROLE',
      'CHANGE_JOB',
      'GRANT_PERMISSION',
      'REVOKE_PERMISSION',
      'SET_PLACES',
      'ADD_STATION_SCOPE',
      'REMOVE_STATION_SCOPE',
      'ADD_REGISTRATION_STATION_SCOPE',
      'REMOVE_REGISTRATION_STATION_SCOPE',
      'DEACTIVATE_USER',
      'REACTIVATE_USER',
      'ARCHIVE_USER',
      'RESTORE_USER',
    ],
  },
  {
    label: 'المركبات والبطاقات',
    actions: [
      'UPDATE_IDENTITY',
      'UPDATE_OWNER_IDENTITY',
      'PLATE_CHANGE',
      'VEHICLE_CHANGE_REQUESTED',
      'VEHICLE_CHANGE_APPROVED',
      'VEHICLE_CHANGE_REJECTED',
      'OWNER_IDENTITY_CHANGE_REQUESTED',
      'OWNER_IDENTITY_CHANGE_APPROVED',
      'OWNER_IDENTITY_CHANGE_REJECTED',
      'REVEAL_NATIONAL_ID',
      'ISSUE_CARD',
      'PRINT_CARD',
      'REPLACE_CARD',
      'CANCEL_CARD',
      'DUPLICATE_CAUGHT',
      'LINK_UNREGISTERED_FILLUPS',
    ],
  },
  { label: 'الوقود', actions: ['FUEL_STORAGE_SETUP', 'FUEL_STORAGE_UPDATE', 'FUEL_DELIVERY', 'FUEL_DELIVERY_CORRECTION', 'FUEL_RESET', 'STOCK_VISIBILITY'] },
  { label: 'الإنشاء والتعديل', actions: ['CREATE', 'UPDATE', 'ARCHIVE', 'RESTORE', 'UPDATE_EXCEPTION_SETTINGS'] },
  { label: 'تصدير التقارير', actions: ['EXPORT'] },
  { label: 'النظام', actions: ['IMPORT_STATIONS', 'TEST_DATA_REMOVAL'] },
];

// The entries worth a second look: shown tinted.
export const ALERT_ACTIONS = new Set(['LOGIN_FAILED', 'ACCOUNT_LOCKED', 'REVEAL_NATIONAL_ID', 'TEST_DATA_REMOVAL', 'FUEL_RESET']);

export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  User: 'حساب',
  Station: 'محطة وقود',
  RegistrationStation: 'مكتب تسجيل',
  Municipality: 'بلدية',
  Company: 'شركة',
  Route: 'خط',
  VehicleType: 'نوع مركبة',
  ExceptionType: 'نوع استثناء',
  SecurityAuthority: 'جهة أمنية',
  Vehicle: 'مركبة',
  VehicleOwner: 'مالك',
  VehicleCard: 'بطاقة',
  SystemSetting: 'إعداد',
  FillUpTransaction: 'تعبئة',
  FuelStockEntry: 'حركة مخزون',
  StationFuelStorage: 'خزان وقود',
  VehicleChangeRequest: 'طلب تعديل مركبة',
  OwnerChangeRequest: 'طلب تعديل مالك',
  RefreshToken: 'جلسة',
  System: 'النظام',
  Report: 'تقرير',
  Exception: 'استثناء',
  StandingException: 'استثناء دائم',
  Driver: 'سائق',
};

export const AUDIT_FIELD_LABELS: Record<string, string> = {
  fullName: 'الاسم الكامل',
  username: 'اسم المستخدم',
  name: 'الاسم',
  job: 'الوظيفة',
  jobs: 'الوظائف',
  roleName: 'الوظيفة',
  roleId: 'الوظيفة',
  placeCount: 'عدد الأماكن',
  internalCode: 'الرمز الداخلي',
  code: 'الرمز',
  status: 'الحالة',
  isActive: 'مفعّل',
  reason: 'السبب',
  value: 'القيمة',
  stationId: 'المحطة',
  registrationStationId: 'مكتب التسجيل',
  registeredAtRegistrationStationId: 'مكتب التسجيل',
  municipalityId: 'البلدية',
  companyId: 'الشركة',
  vehicleId: 'المركبة',
  exceptionTypeId: 'نوع الاستثناء',
  currentPlate: 'اللوحة',
  plate: 'اللوحة',
  cardNumber: 'رقم البطاقة',
  identityType: 'نوع الهوية',
  identifiedBy: 'طريقة التعرّف',
  noCardReason: 'سبب عدم وجود بطاقة',
  isException: 'استثناء',
  ruleOverridden: 'تجاوز القاعدة',
  fuelType: 'نوع الوقود',
  fuelTypes: 'أنواع الوقود',
  fuelMismatch: 'اختلاف نوع الوقود',
  liters: 'اللترات',
  level: 'المستوى',
  capacityLiters: 'سعة الخزان',
  openingLevelLiters: 'المستوى الافتتاحي',
  openedAt: 'تاريخ البدء',
  occurredAt: 'الوقت',
  waybillNumber: 'رقم إذن التسليم',
  correctsEntryId: 'يصحّح الحركة',
  showStockToEmployees: 'إظهار المخزون للموظفين',
  securityAuthority: 'الجهة الأمنية',
  revealed: 'كُشف',
  side: 'الجهة',
  failedAttempts: 'عدد المحاولات الخاطئة',
  filters: 'التصفية المستخدمة',
  chassisNumber: 'رقم الشاصي',
  registrationBooklet: 'رقم كتيب المركبة',
  ownerId: 'المالك',
  vehicleTypeId: 'نوع المركبة',
  identityNumberChanged: 'تغيّر رقم الهوية',
  lockedUntil: 'مقفل حتى',
  minutes: 'المدة بالدقائق',
};

// The reports an EXPORT entry names (its entityId).
export const AUDIT_REPORT_LABELS: Record<string, string> = {
  daily: 'تقرير المحطة اليومي',
  violations: 'الاستثناءات',
  'my-day': 'يومي (مكتب التسجيل)',
  'my-shift': 'ورديتي',
  office: 'تقرير المكتب',
  station: 'تقرير المحطة',
  municipality: 'تقرير البلدية',
  summary: 'الملخص بين البلديات',
  'registration-offices': 'مكاتب التسجيل',
  'audit-log': 'سجل التدقيق',
};

// Why a sign-in failed (LOGIN_FAILED's reason).
export const LOGIN_FAILURE_LABELS: Record<string, string> = {
  UNKNOWN_USER: 'اسم مستخدم غير موجود',
  INACTIVE: 'الحساب معطّل',
  LOCKED: 'الحساب مقفل',
  WRONG_PASSWORD: 'كلمة مرور خاطئة',
};

export interface DeviceInfo {
  // «Chrome · Android», or the tool's name for a script.
  text: string;
  // Not a person's browser: a script or an automated browser.
  automated: boolean;
  mobile: boolean;
}

// The browser and system behind a user agent — enough to tell a phone at a
// pump from an office computer, and either from a script.
export function describeDevice(userAgent: string | null | undefined): DeviceInfo | null {
  const ua = userAgent?.trim();
  if (!ua) return null;
  const tool = /(curl|wget|python-requests|axios|node-fetch|PostmanRuntime|HeadlessChrome|Playwright|Go-http-client|okhttp)/i.exec(ua);
  if (tool) return { text: tool[1]!, automated: true, mobile: false };

  const os = /Android/.test(ua)
    ? 'Android'
    : /iPhone|iPod/.test(ua)
      ? 'iPhone'
      : /iPad/.test(ua)
        ? 'iPad'
        : /CrOS/.test(ua)
          ? 'ChromeOS'
          : /Windows/.test(ua)
            ? 'Windows'
            : /Mac OS X|Macintosh/.test(ua)
              ? 'macOS'
              : /Linux/.test(ua)
                ? 'Linux'
                : null;
  const browser = /Edg(e|A|iOS)?\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /SamsungBrowser/.test(ua)
        ? 'Samsung Internet'
        : /Firefox|FxiOS/.test(ua)
          ? 'Firefox'
          : /Chrome\/|CriOS/.test(ua)
            ? 'Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : null;
  const mobile = /Mobi|Android|iPhone|iPod/.test(ua);
  const text = [browser, os].filter(Boolean).join(' · ') || 'جهاز غير معروف';
  return { text, automated: false, mobile };
}

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

// A recorded value as a person reads it: yes/no, a dash for nothing, lists
// with Arabic commas. `format` turns a known code (a fuel, a job, a date)
// into words.
export function auditValueText(value: unknown, format?: (code: string) => string): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'نعم' : 'لا';
  if (Array.isArray(value)) return value.length ? value.map((v) => auditValueText(v, format)).join('، ') : '—';
  if (typeof value === 'string') {
    if (format) return format(value);
    if (ISO_INSTANT.test(value)) return value.slice(0, 16).replace('T', ' ');
    return value;
  }
  if (typeof value === 'number') return String(value);
  return JSON.stringify(value);
}
