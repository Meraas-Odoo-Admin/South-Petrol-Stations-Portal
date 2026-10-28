// Display text only: the area and the plain-Arabic sentence a person sees for
// each permission on their page (phase 5B, section 5). Nothing in the app's
// logic reads these; the permission KEYS remain the only thing that is checked
// (CLAUDE.md rule 2). A key missing here still appears, under «أخرى», with the
// description stored in the database.

export const PERMISSION_AREAS: Array<{ key: string; label: string }> = [
  { key: 'fillups', label: 'التعبئة في المحطة' },
  { key: 'stock', label: 'مخزون الوقود' },
  { key: 'stations', label: 'المحطات والمكاتب' },
  { key: 'registration', label: 'تسجيل المركبات والبطاقات' },
  { key: 'vehicles', label: 'المركبات والملاك' },
  { key: 'reports', label: 'التقارير' },
  { key: 'people', label: 'الأشخاص والصلاحيات' },
  { key: 'municipalities', label: 'البلديات والشركات' },
  { key: 'notifications', label: 'الإشعارات' },
  { key: 'system', label: 'المنظومة والإعدادات' },
  { key: 'other', label: 'أخرى' },
];

export const PERMISSION_LABELS: Record<string, { area: string; label: string }> = {
  'fillups:create': { area: 'fillups', label: 'تسجيل تعبئة' },
  'fillups:update': { area: 'fillups', label: 'تعديل تعبئة' },
  'fillups:record_exception': { area: 'fillups', label: 'تسجيل تعبئة كاستثناء' },
  'exception_settings:manage': { area: 'fillups', label: 'ضبط حدود الاستثناءات اليومية' },
  'exception_types:manage': { area: 'fillups', label: 'إدارة أنواع الاستثناءات' },
  'cards:scan': { area: 'fillups', label: 'قراءة بطاقة المركبة عند المضخة' },

  'fuel_stock:read': { area: 'stock', label: 'رؤية مخزون الوقود وتفاصيله وسجل التوريد' },
  'fuel_stock:read_visible': { area: 'stock', label: 'رؤية مستوى الوقود في محطته' },
  'fuel_stock:configure': { area: 'stock', label: 'ضبط سعة خزانات المحطات' },
  'fuel_stock:deliver': { area: 'stock', label: 'تسجيل توريد الوقود للمحطات وتصحيحه' },
  'fuel_stock:reset': { area: 'stock', label: 'تصفير مخزون المحطة' },

  'vehicles:transfer_owner': { area: 'vehicles', label: 'نقل ملكية مركبة مبيعة وإلغاء بطاقتها' },

  'stations:read': { area: 'stations', label: 'عرض المحطات' },
  'stations:manage': { area: 'stations', label: 'تعديل المحطة وأنواع الوقود التي تبيعها' },
  'stations:create': { area: 'stations', label: 'إنشاء المحطات وأرشفتها' },
  'routes:read': { area: 'stations', label: 'عرض خطوط النقل' },
  'routes:manage': { area: 'stations', label: 'إدارة خطوط النقل' },
  'registration_stations:read': { area: 'stations', label: 'عرض مكاتب التسجيل' },
  'registration_stations:manage': { area: 'stations', label: 'إنشاء مكاتب التسجيل وتعديلها' },

  'cards:read': { area: 'registration', label: 'عرض بطاقات المركبة وتاريخها' },
  'cards:issue': { area: 'registration', label: 'إصدار البطاقات وطباعتها' },
  'cards:cancel': { area: 'registration', label: 'إلغاء بطاقة بدون بدل' },

  'vehicles:read': { area: 'vehicles', label: 'البحث في المركبات' },
  'records:browse': { area: 'vehicles', label: 'فتح شاشات السجلات: المركبات والمحطات' },
  'vehicles:manage': { area: 'vehicles', label: 'تسجيل المركبات وتعديلها' },
  'vehicles:request_change': { area: 'vehicles', label: 'طلب تصحيح رقم الهيكل أو الدفتر' },
  'vehicles:approve_change': { area: 'vehicles', label: 'الموافقة على طلبات تصحيح المركبات' },
  'vehicle_types:read': { area: 'vehicles', label: 'عرض أنواع المركبات' },
  'vehicle_types:manage': { area: 'vehicles', label: 'إدارة أنواع المركبات' },
  'owners:read': { area: 'vehicles', label: 'البحث في الملاك' },
  'owners:manage': { area: 'vehicles', label: 'تسجيل الملاك وتعديلهم' },
  'owners:request_change': { area: 'vehicles', label: 'طلب تصحيح هوية مالك' },
  'owners:approve_change': { area: 'vehicles', label: 'الموافقة على طلبات تصحيح هوية الملاك' },
  'owners:reveal_identity': { area: 'vehicles', label: 'إظهار رقم الهوية كاملًا (يُسجَّل في المراجعة)' },

  'reports:view': { area: 'reports', label: 'تقارير المحطات' },
  'reports:view_all_stations': { area: 'reports', label: 'لوحة المؤشرات العامة' },
  'reports:municipality': { area: 'reports', label: 'تقارير البلدية كاملة' },
  'reports:cross_municipality': { area: 'reports', label: 'ملخص مقارنة البلديات' },
  'reports:own_shift': { area: 'reports', label: 'تقرير مناوبته' },
  'registration_reports:view': { area: 'reports', label: 'تقارير مكتب التسجيل' },
  'registration_reports:own_day': { area: 'reports', label: 'تقرير يومه في التسجيل' },
  'audit:view': { area: 'reports', label: 'سجل المراجعة' },

  'users:manage': { area: 'people', label: 'إدارة كل الحسابات' },
  'users:manage_municipality_staff': { area: 'people', label: 'إدارة مشرفي المحطات ومديري المكاتب في البلدية' },
  'users:manage_staff': { area: 'people', label: 'إدارة موظفي محطته أو مكتبه' },
  'users:manage_system_admins': { area: 'people', label: 'إدارة حسابات مديري المنظومة' },
  'roles:manage': { area: 'people', label: 'منح الوظائف والصلاحيات' },

  'municipalities:read': { area: 'municipalities', label: 'عرض البلديات' },
  'municipalities:manage': { area: 'municipalities', label: 'إنشاء البلديات وتعديلها' },
  'companies:read': { area: 'municipalities', label: 'عرض الشركات' },
  'companies:manage': { area: 'municipalities', label: 'إضافة شركة' },
  'companies:update': { area: 'municipalities', label: 'تعديل الشركات وأرشفتها' },
  'security_authorities:read': { area: 'municipalities', label: 'عرض الجهات الأمنية' },
  'security_authorities:manage': { area: 'municipalities', label: 'إدارة الجهات الأمنية' },

  'notifications:read': { area: 'notifications', label: 'قراءة إشعاراته' },
  'notifications:station_events': { area: 'notifications', label: 'إشعارات المحطة: المخزون والتجاوزات والإقفال' },
  'notifications:office_events': { area: 'notifications', label: 'إشعارات المكتب: التصحيحات والنقص والإقفال' },
  'notifications:municipality_events': { area: 'notifications', label: 'إشعارات البلدية: المخزون والنقص والأرشفة والموعد' },
  'notifications:system_events': { area: 'notifications', label: 'إشعارات المنظومة: بلدية بلا مدير وتغيير الإعدادات' },

  'settings:manage': { area: 'system', label: 'إعدادات المنظومة' },
  'rules:toggle': { area: 'system', label: 'تشغيل قواعد التعبئة وإيقافها' },
};
