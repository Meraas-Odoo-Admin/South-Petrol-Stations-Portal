import { isAxiosError } from 'axios';
import { describeApiError } from '../../lib/apiError';
import { plateSharingMessage } from '../vehicles/plateSharing';

// Registration pivot, phase 2: the API refuses registration with
// machine-checkable markers (never English prose in this Arabic UI — same
// convention as the fill-up screen's STATION_HAS_NO_MUNICIPALITY). This maps
// them to what the registration employee should read.
export function registrationErrorMessage(error: unknown): string {
  if (!isAxiosError<{ message?: string | string[]; details?: { limit?: number; otherType?: string | null; vehicle?: string } }>(error) || !error.response) {
    return describeApiError(error).message;
  }
  const { status, data } = error.response;
  // Field-level refusals from the shared rules come back as Arabic sentences
  // (the same text the form shows live) - show them as they are.
  if (status === 400 && Array.isArray(data?.message)) {
    const arabic = data.message.filter((m) => typeof m === 'string' && /[؀-ۿ]/.test(m));
    if (arabic.length > 0) return arabic.join(' ');
  }
  const code = typeof data?.message === 'string' ? data.message : '';
  const sharing = plateSharingMessage(code, data?.details);
  if (sharing) return sharing;
  switch (code) {
    case 'REGISTRATION_STATION_NOT_ACTIVE':
      return 'مكتب التسجيل هذا مغلق حاليًا، ولا يمكن التسجيل فيه.';
    case 'REGISTRATION_STATION_ARCHIVED':
      return 'مكتب التسجيل هذا مؤرشف، ولا يمكن التسجيل فيه.';
    case 'MUNICIPALITY_ARCHIVED':
      return 'بلدية هذا المكتب مؤرشفة، ولا يمكن التسجيل فيه.';
    case 'VEHICLE_TYPE_INVALID':
      return 'نوع المركبة المختار غير موجود أو موقوف. اختر نوعًا آخر من القائمة.';
    case 'OWNER_VEHICLE_LIMIT':
      return `هذا المالك مسجّل له الحد الأقصى المسموح من المركبات (${data?.details?.limit ?? '—'}). لا يمكن تسجيل مركبة أخرى باسمه.`;
    case 'VEHICLE_DUPLICATE':
      return 'بعض بيانات المركبة مسجّلة مسبقًا لمركبة أخرى — راجع التنبيهات أسفل الحقول.';
  }
  if (status === 403) {
    return 'لا تملك صلاحية التسجيل في مكتب التسجيل هذا.';
  }
  if (status === 409) {
    return 'يوجد مالك مسجّل مسبقًا بنفس نوع ورقم الهوية.';
  }
  if (status === 400) {
    return 'بعض البيانات المدخلة غير صحيحة — راجع الحقول وحاول مرة أخرى.';
  }
  return 'تعذر إتمام التسجيل. حاول مرة أخرى.';
}
