// The one place an API failure becomes a sentence a person can act on (Phase 6,
// B3): what happened, and what to do next. No raw codes, no English. Every
// area's own error helper falls back to this, so a code nobody mapped still
// reads as a clear Arabic line, never as «Request failed with status code 409».

export type ApiErrorKind = 'network' | 'auth' | 'permission' | 'notfound' | 'conflict' | 'validation' | 'throttled' | 'server' | 'unknown';

interface ShapeOfAxiosError {
  isAxiosError?: boolean;
  response?: { status?: number; data?: { message?: unknown } };
}

// The API's machine-checkable markers, mapped to Arabic. New markers go here.
export const API_MESSAGES: Record<string, string> = {
  // the pump
  CARD_REQUIRED: 'لا تُسجَّل التعبئة إلا بمسح بطاقة المركبة. امسح البطاقة، أو ابحث عن المركبة المسجّلة إن تعذّر استخدامها.',
  CARD_NOT_FOUND: 'تعذّرت قراءة البطاقة: هذا الرمز ليس بطاقة من هذه المنظومة. امسحها مرة أخرى.',
  CARD_REVOKED: 'هذه البطاقة ملغاة. اطلب من صاحب المركبة مراجعة مكتب التسجيل لاستلام بطاقة جديدة.',
  CARD_VEHICLE_MISMATCH: 'هذه البطاقة تخص مركبة أخرى.',
  NO_CARD_NOT_NEEDED: 'تمّ مسح البطاقة، فلا حاجة لسبب «بدون بطاقة».',
  VEHICLE_NOT_REGISTERED: 'هذه المركبة غير مسجّلة في المنظومة. يسجّلها مكتب التسجيل أولًا.',
  EXCEPTION_TYPE_NOT_FOR_RULE: 'نوع الاستثناء هذا لا يشمل القاعدة التي منعت التعبئة. اختر نوعًا آخر.',
  EXCEPTION_TYPE_NOT_FOR_MUNICIPALITY: 'نوع الاستثناء هذا غير متاح في بلدية هذه المحطة.',
  EXCEPTION_LIMIT_REACHED: 'تجاوزت المحطة الحد اليومي لهذا النوع من الاستثناءات، ولا يُسمح بتجاوزه. اطلب من المشرف.',
  FUEL_TYPE_NOT_SOLD_HERE: 'هذه المحطة لا تبيع هذا النوع من الوقود حاليًا.',
  STATION_ARCHIVED: 'هذه المحطة مؤرشفة ولا تقبل تعبئات جديدة. تواصل مع مدير البلدية.',
  MUNICIPALITY_ARCHIVED: 'بلدية هذه المحطة مؤرشفة ولا تقبل تعبئات جديدة.',
  STATION_HAS_NO_MUNICIPALITY: 'لا بلدية محددة لهذه المحطة. يحدّدها مسؤول المنظومة.',
  // municipalities and places
  REASON_REQUIRED: 'اكتب السبب (ثلاثة أحرف على الأقل).',
  MUNICIPALITY_NAME_TAKEN: 'توجد بلدية بهذا الاسم مسبقًا.',
  MUNICIPALITY_NEEDS_AUTHORITY: 'لا يمكن تفعيل البلدية قبل إضافة الجهة الأمنية المشرفة عليها.',
  CONFIRMATION_NAME_MISMATCH: 'الاسم المكتوب لا يطابق الاسم المطلوب — لم يُغيَّر شيء.',
  REGISTRATION_STATION_NOT_ACTIVE: 'مكتب التسجيل هذا مغلق حاليًا، ولا يمكن التسجيل فيه.',
  REGISTRATION_STATION_ARCHIVED: 'مكتب التسجيل هذا مؤرشف، ولا يمكن التسجيل فيه.',
  VEHICLE_DUPLICATE: 'بعض بيانات المركبة مسجّلة مسبقًا لمركبة أخرى. راجع التنبيهات أسفل الحقول.',
  PLACES_OUTSIDE_SCOPE: 'بعض الأماكن المختارة خارج نطاقك.',
  // people
  PERMISSION_FROM_JOB_LOCKED: 'هذه الصلاحية من الوظيفة نفسها ولا تُسحب وحدها. غيّر الوظيفة بدلًا من ذلك.',
  PERMISSION_NOT_DELEGABLE: 'لا يمكنك منح هذه الصلاحية.',
  ROLE_SEPARATION_CONFLICT: 'لا يمكن الجمع بين العمل في محطات الوقود ومكاتب التسجيل لنفس المستخدم. أنشئ حسابًا منفصلًا.',
  SELF_ACTION: 'لا يمكنك تنفيذ هذا الإجراء على حسابك.',
  USER_OUT_OF_SCOPE: 'هذا الحساب خارج محطاتك أو مكاتبك.',
};

const GENERIC: Record<ApiErrorKind, string> = {
  network: 'تعذّر الاتصال بالخادم. تحقّق من الشبكة ثم أعد المحاولة. لم يُحفظ شيء.',
  auth: 'انتهت جلستك. سجّل الدخول من جديد.',
  permission: 'لا تملك صلاحية هذا الإجراء. تواصل مع مسؤولك إن كنت تحتاجه.',
  notfound: 'لم يُعثر على المطلوب. ربما تغيّر أو أُزيل. حدّث الصفحة وحاول مرة أخرى.',
  conflict: 'يتعارض هذا مع بيانات موجودة. حدّث الصفحة وحاول مرة أخرى.',
  validation: 'بعض البيانات غير صحيحة. راجع الحقول وصحّحها ثم أعد المحاولة.',
  throttled: 'محاولات كثيرة في وقت قصير. انتظر دقيقة ثم أعد المحاولة.',
  server: 'حدث خطأ في الخادم ولم يُحفظ شيء. أعد المحاولة بعد قليل، وإن تكرر فأبلغ مسؤول المنظومة.',
  unknown: 'تعذّر إتمام العملية. أعد المحاولة، وإن تكرر فأبلغ مسؤول المنظومة.',
};

function kindOf(status: number | undefined): ApiErrorKind {
  if (status === undefined) return 'network';
  if (status === 401) return 'auth';
  if (status === 403) return 'permission';
  if (status === 404) return 'notfound';
  if (status === 409) return 'conflict';
  if (status === 400 || status === 422) return 'validation';
  if (status === 429) return 'throttled';
  if (status >= 500) return 'server';
  return 'unknown';
}

const ARABIC = /[؀-ۿ]/;

export function describeApiError(error: unknown, context?: string): { message: string; kind: ApiErrorKind } {
  const e = error as ShapeOfAxiosError | null;
  const hasResponse = Boolean(e && typeof e === 'object' && e.response);
  const kind = e && typeof e === 'object' && e.isAxiosError ? kindOf(e.response?.status) : hasResponse ? kindOf(e!.response!.status) : 'unknown';
  const raw = e?.response?.data?.message;

  // 1. A marker the API sends, mapped here.
  if (typeof raw === 'string' && API_MESSAGES[raw]) return { message: API_MESSAGES[raw]!, kind };
  // 2. The API already wrote the validation messages in Arabic.
  if (Array.isArray(raw)) {
    const arabic = raw.filter((m): m is string => typeof m === 'string' && ARABIC.test(m));
    if (arabic.length > 0) return { message: arabic.join(' '), kind };
  }
  if (typeof raw === 'string' && ARABIC.test(raw)) return { message: raw, kind };
  // 3. The generic line for the kind of failure, headed by what was being done.
  const generic = GENERIC[kind];
  return { message: context ? `${context} ${generic}` : generic, kind };
}
