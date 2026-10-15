import { roleDescription, roleLabel } from '../../lib/labels';
import type { JobOption, PlaceKind } from './types';

const GROUPS: Array<{ kind: PlaceKind; title: string }> = [
  { kind: 'MUNICIPALITY', title: 'البلدية' },
  { kind: 'PETROL_STATION', title: 'محطات الوقود' },
  { kind: 'REGISTRATION', title: 'مكاتب التسجيل' },
  { kind: null, title: 'الإدارة' },
];

const placeKindOf = (job: JobOption): PlaceKind => job.placeKind ?? (job.municipalityScoped ? 'MUNICIPALITY' : job.kind);

// One job per person, picked from a short list grouped by side — never a set
// of checkboxes. Each job carries one plain sentence on what it does.
export function JobPicker({
  jobs,
  value,
  onChange,
  disabled = false,
  name = 'job',
}: {
  jobs: JobOption[];
  value: string | null;
  onChange: (jobId: string) => void;
  disabled?: boolean;
  name?: string;
}) {
  return (
    <div className="space-y-5">
      {GROUPS.map((group) => {
        const inGroup = jobs.filter((j) => placeKindOf(j) === group.kind);
        if (inGroup.length === 0) return null;
        return (
          <fieldset key={group.title} disabled={disabled} className="min-w-0">
            <legend className="mb-2 text-[14px] font-bold text-ink-soft lg:text-[12px]">{group.title}</legend>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {inGroup.map((job) => {
                const checked = value === job.id;
                const sentence = roleDescription(job.name, job.description);
                return (
                  <label key={job.id} className={`block ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                    <input
                      type="radio"
                      name={name}
                      value={job.id}
                      checked={checked}
                      onChange={() => onChange(job.id)}
                      className="peer sr-only"
                    />
                    <span
                      className={`block min-h-[64px] rounded-md border-2 p-4 transition peer-focus-visible:ring-2 peer-focus-visible:ring-primary-dark peer-focus-visible:ring-offset-2 ${
                        checked ? 'border-primary bg-primary-100' : 'border-line bg-surface hover:bg-surface-alt'
                      } ${disabled && !checked ? 'opacity-60' : ''}`}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                            checked ? 'border-primary' : 'border-line'
                          }`}
                        >
                          {checked && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
                        </span>
                        <span className="text-[17px] font-extrabold text-ink lg:text-[15px]">{roleLabel(job.name)}</span>
                        {checked && <span className="sr-only">(مختارة)</span>}
                      </span>
                      {sentence && <span className="mt-1 block text-[15px] text-ink-soft lg:text-[13px]">{sentence}</span>}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
