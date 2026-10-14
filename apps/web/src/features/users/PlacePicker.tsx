import { useId, useMemo, useState } from 'react';
import { Icon, ICONS } from '../../components/icons';
import { CodeText } from '../../components/design/CodeText';
import { placesChosenLabel } from './format';

export interface PlaceOption {
  id: string;
  name: string;
  code: string;
  /** Shown beside the name to tell look-alikes apart (the municipality). */
  group?: string | null;
}

const MAX_SHOWN = 50;

// Where somebody works: a searchable list with the chosen places as removable
// chips, never a wall of checkboxes. `single` is for choosing one place (a
// filter). Rows are 56px tall on a phone and the chips' remove buttons are
// 40px, so they can be hit with a thumb.
export function PlacePicker({
  options,
  selected,
  onChange,
  single = false,
  disabled = false,
  loading = false,
  noun = 'مكان',
  searchLabel,
}: {
  options: PlaceOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  single?: boolean;
  disabled?: boolean;
  loading?: boolean;
  /** For the empty-search sentence, e.g. "محطة". */
  noun?: string;
  searchLabel: string;
}) {
  const searchId = useId();
  const [query, setQuery] = useState('');
  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const chosen = selected.map((id) => byId.get(id)).filter((o): o is PlaceOption => Boolean(o));

  const normalized = query.trim().toLowerCase();
  const matches = useMemo(
    () =>
      normalized === ''
        ? options
        : options.filter((o) => `${o.name} ${o.code} ${o.group ?? ''}`.toLowerCase().includes(normalized)),
    [options, normalized],
  );
  const shown = matches.slice(0, MAX_SHOWN);

  function toggle(id: string) {
    if (disabled) return;
    if (single) {
      onChange(selected.includes(id) ? [] : [id]);
      return;
    }
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  }

  function addAllShown() {
    const next = new Set(selected);
    for (const o of matches) next.add(o.id);
    onChange([...next]);
  }

  const canAddAll = !single && !disabled && normalized !== '' && matches.length > 1 && matches.length <= MAX_SHOWN;

  return (
    <div className="space-y-3">
      {!single && (
        <div>
          <p role="status" className="mb-2 text-[14px] font-bold text-ink-soft lg:text-[12px]">
            {placesChosenLabel(chosen.length)}
          </p>
          {chosen.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {chosen.map((o) => (
                <li
                  key={o.id}
                  className={`flex min-h-[44px] items-center gap-1 rounded-full bg-primary-100 text-[15px] font-bold text-primary-dark lg:min-h-[36px] lg:text-[13px] ${
                    disabled ? 'px-4' : 'ps-4 pe-1'
                  }`}
                >
                  <span>{o.name}</span>
                  {!disabled && (
                    <button
                      type="button"
                      aria-label={`إزالة ${o.name}`}
                      onClick={() => toggle(o.id)}
                      className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-surface lg:h-8 lg:w-8"
                    >
                      <Icon d={ICONS.close} size={16} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!disabled && (
        <>
          <div>
            <label htmlFor={searchId} className="mb-1.5 block text-[14px] font-bold text-ink lg:text-[12px]">
              {searchLabel}
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 start-3.5 flex items-center text-ink-faint">
                <Icon d={ICONS.search} size={18} />
              </span>
              <input
                id={searchId}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ابحث بالاسم أو الرمز"
                className="h-[52px] w-full rounded-sm border border-line bg-surface-alt ps-11 pe-3.5 text-[16px] text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface lg:text-[14px]"
              />
            </div>
          </div>

          {loading && <p className="text-[14px] text-ink-soft lg:text-[12px]">جارٍ تحميل القائمة…</p>}

          {!loading && matches.length === 0 && (
            <p className="rounded-md bg-surface-alt p-4 text-[15px] text-ink-soft lg:text-[13px]">
              {query ? `لا يوجد ${noun} يطابق «${query}». جرّب جزءًا آخر من الاسم أو الرمز.` : `لا يوجد ${noun} في القائمة.`}
            </p>
          )}

          {matches.length > 0 && (
            <div>
              {canAddAll && (
                <button
                  type="button"
                  onClick={addAllShown}
                  className="mb-2 flex h-11 items-center gap-2 rounded-full bg-surface-alt px-4 text-[15px] font-bold text-ink-soft hover:bg-primary-100 hover:text-primary lg:h-9 lg:text-[13px]"
                >
                  <Icon d={ICONS.plus} size={16} />
                  إضافة كل النتائج ({matches.length})
                </button>
              )}
              <ul className="max-h-72 overflow-y-auto rounded-md bg-surface shadow-sm">
                {shown.map((o) => {
                  const on = selected.includes(o.id);
                  return (
                    <li key={o.id} className="border-b border-line-soft last:border-0">
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggle(o.id)}
                        className={`flex min-h-[56px] w-full items-center gap-3 px-4 py-2 text-start transition lg:min-h-[44px] ${
                          on ? 'bg-primary-100' : 'hover:bg-surface-alt'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                            on ? 'border-primary bg-primary text-white' : 'border-line'
                          }`}
                        >
                          {on && <Icon d={ICONS.check} size={14} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[16px] font-bold text-ink lg:text-[14px]">{o.name}</span>
                          <span className="flex flex-wrap items-center gap-x-3 text-[13px] text-ink-soft lg:text-[12px]">
                            <CodeText size="md">{o.code}</CodeText>
                            {o.group && <span>{o.group}</span>}
                          </span>
                        </span>
                        <span className="sr-only">{on ? 'مختار' : 'غير مختار'}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {matches.length > MAX_SHOWN && (
                <p className="mt-2 text-[14px] text-ink-soft lg:text-[12px]">
                  يُعرض أول {MAX_SHOWN} من {matches.length} — اكتب جزءًا من الاسم لتضييق القائمة.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
