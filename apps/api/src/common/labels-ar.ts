// Arabic labels for what the PDF exports print. Display text only: nothing in
// the app's logic reads a job name (CLAUDE.md rule 2). Mirrors the web's labels.
export const JOB_LABELS_AR: Record<string, string> = {
  station_employee: 'موظف محطة',
  station_supervisor: 'مشرف محطة',
  registration_employee: 'موظف تسجيل',
  registration_supervisor: 'مشرف تسجيل',
  directorate_admin: 'إدارة المديرية',
  system_admin: 'مدير المنظومة',
};
export const jobLabelAr = (name: string | null): string => (name ? (JOB_LABELS_AR[name] ?? name) : '—');

const STAMP = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Tripoli',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
export const stampAr = (value: Date | string | null): string => (value ? STAMP.format(new Date(value)).replace(',', '') : '—');
