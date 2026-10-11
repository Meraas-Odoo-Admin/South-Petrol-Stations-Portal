import { isAxiosError } from 'axios';

// The API's machine-checkable refusal markers for the admin screens
// (municipalities, security authorities, registration stations, users),
// mapped to Arabic — the English prose the API might otherwise carry is
// never shown in this UI.
const MESSAGES: Record<string, string> = {
  MUNICIPALITY_NAME_TAKEN: 'توجد بلدية بهذا الاسم مسبقًا.',
  MUNICIPALITY_NEEDS_AUTHORITY: 'لا يمكن تفعيل البلدية قبل إضافة الجهة الأمنية المشرفة عليها.',
  CONFIRMATION_NAME_MISMATCH: 'الاسم المكتوب لا يطابق اسم البلدية — لم يُغيَّر شيء.',
  MUNICIPALITY_HAS_AUTHORITY: 'لهذه البلدية جهة أمنية مسبقًا — لكل بلدية جهة أمنية واحدة فقط.',
  AUTHORITY_OF_LIVE_MUNICIPALITY: 'هذه الجهة تشرف على بلدية مفعّلة، ولا يمكن نقلها إلى بلدية أخرى.',
  SECURITY_AUTHORITY_NAME_TAKEN: 'توجد جهة أمنية بهذا الاسم مسبقًا.',
  MUNICIPALITY_CODE_TAKEN: 'هذا الرمز مستخدم لبلدية أخرى.',
  INVALID_DATE: 'التاريخ غير صالح.',
  AWARENESS_NOT_BEFORE_DEADLINE: 'تاريخ بدء التوعية يجب أن يسبق تاريخ اشتراط البطاقة.',
  DESK_NAME_TAKEN: 'يوجد مكتب بهذا الاسم في مكتب التسجيل هذا.',
  STAGE_DATES_ONLY: 'يمكنك تعديل تاريخي التوعية واشتراط البطاقة فقط.',
  // Phase 4b — accounts.
  USER_OUT_OF_SCOPE: 'هذا الحساب خارج محطاتك أو مكاتبك.',
  SELF_ACTION: 'لا يمكنك تنفيذ هذا الإجراء على حسابك. لتغيير كلمة المرور استخدم صفحة كلمة المرور.',
  PRIVILEGED_ACCOUNT: 'هذا الحساب بصلاحيات أعلى من صلاحياتك، ولا يمكنك تعديله.',
  WORKS_ELSEWHERE: 'يعمل هذا الموظف أيضًا خارج محطاتك أو مكاتبك، فلا يمكنك تعديل حسابه.',
  ACTION_NOT_ALLOWED: 'لا تملك صلاحية تنفيذ هذا الإجراء.',
  JOB_NOT_ALLOWED: 'لا يمكنك منح هذه الوظيفة.',
  JOB_REQUIRED: 'اختر الوظيفة أولًا.',
  PLACES_REQUIRED: 'اختر مكان عمل واحدًا على الأقل.',
  PLACES_OUTSIDE_SCOPE: 'اخترت مكانًا خارج محطاتك أو مكاتبك.',
  PLACES_NOT_FOR_THIS_JOB: 'هذه الوظيفة لا تُحدَّد لها أماكن عمل.',
  PLACE_NOT_FOUND: 'أحد الأماكن المختارة غير موجود.',
  ALREADY_INACTIVE: 'هذا الحساب موقوف مسبقًا.',
  ALREADY_ACTIVE: 'هذا الحساب نشط مسبقًا.',
};

interface SeparationDetails {
  existingSide?: 'PETROL_STATION' | 'REGISTRATION';
  requestedSide?: 'PETROL_STATION' | 'REGISTRATION';
  conflictingRole?: string | null;
}

const SIDE_LABELS = { PETROL_STATION: 'محطات الوقود', REGISTRATION: 'مكاتب التسجيل' } as const;

export function adminErrorMessage(error: unknown, fallback: string): string {
  if (!isAxiosError<{ message?: string | string[]; details?: SeparationDetails }>(error) || !error.response) {
    return fallback;
  }
  const code = error.response.data?.message;
  if (typeof code !== 'string') return fallback;
  // The API's own duplicate-username refusal is English prose, not a code.
  if (error.response.status === 409 && /username/i.test(code)) return 'اسم المستخدم هذا مستخدم مسبقًا، اختر اسمًا آخر.';

  // Registration pivot, phase 2: one person can never work both sides.
  if (code === 'ROLE_SEPARATION_CONFLICT') {
    const details = error.response.data?.details ?? {};
    const existing = details.existingSide ? SIDE_LABELS[details.existingSide] : 'جهة أخرى';
    const requested = details.requestedSide ? SIDE_LABELS[details.requestedSide] : 'الجهة المطلوبة';
    return `لا يمكن الجمع بين العمل في ${existing} و${requested} لنفس المستخدم — هذا المستخدم يعمل في ${existing} مسبقًا. أنشئ حسابًا منفصلًا بدلًا من ذلك.`;
  }
  return MESSAGES[code] ?? fallback;
}
