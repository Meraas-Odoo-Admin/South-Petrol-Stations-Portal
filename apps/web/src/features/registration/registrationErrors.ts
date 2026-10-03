import { isAxiosError } from 'axios';

// Registration pivot, phase 2: the API refuses registration with
// machine-checkable markers (never English prose in this Arabic UI — same
// convention as the fill-up screen's STATION_HAS_NO_MUNICIPALITY). This maps
// them to what the registration employee should read.
export function registrationErrorMessage(error: unknown): string {
  if (!isAxiosError<{ message?: string | string[] }>(error) || !error.response) {
    return 'تعذر الاتصال بالخادم. حاول مرة أخرى.';
  }
  const { status, data } = error.response;
  const code = typeof data?.message === 'string' ? data.message : '';
  switch (code) {
    case 'REGISTRATION_STATION_NOT_ACTIVE':
      return 'مكتب التسجيل هذا مغلق حاليًا، ولا يمكن التسجيل فيه.';
    case 'MUNICIPALITY_NOT_LIVE':
      return 'بلدية مكتب التسجيل هذا لم تُفعَّل في المنظومة بعد، ولا يمكن التسجيل فيه.';
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
