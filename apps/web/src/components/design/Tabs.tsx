import { useSearchParams } from 'react-router-dom';

// Tabs of a place page (a station, an office). The chosen tab lives in the
// address (?tab=), so a link, a refresh and the back button all land on it.
// Teal marks the chosen tab (structure); a tab may carry a small count.

export interface TabDef {
  key: string;
  label: string;
  /** A number shown beside the label, e.g. things waiting. */
  count?: number;
}

// `param` names the address key: a row of tabs inside another tab (the
// stations / offices tabs inside a municipality's «المحطات والمكاتب») uses its
// own, so the two never overwrite each other.
export function useTab(tabs: TabDef[], param = 'tab'): [string, (key: string) => void] {
  const [params, setParams] = useSearchParams();
  const requested = params.get(param);
  const current = tabs.find((t) => t.key === requested)?.key ?? tabs[0]!.key;
  return [
    current,
    (key) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set(param, key);
          // A new tab starts on its first page, without the old tab's page or
          // report-table choice.
          next.delete('page');
          next.delete('table');
          return next;
        },
        { replace: true },
      ),
  ];
}

export function Tabs({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: TabDef[];
  value: string;
  onChange: (key: string) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="scrollbar-none flex gap-1 overflow-x-auto border-b-2 border-line lg:flex-wrap lg:overflow-visible">
      {tabs.map((tab) => {
        const active = tab.key === value;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={`tab-${tab.key}`}
            aria-selected={active}
            aria-controls={`panel-${tab.key}`}
            data-testid={`tab-${tab.key}`}
            onClick={() => onChange(tab.key)}
            className={`-mb-0.5 flex min-h-[48px] shrink-0 items-center gap-2 border-b-[3px] px-4 text-[16px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-dark lg:text-[14px] ${
              active ? 'border-primary text-primary-dark' : 'border-transparent text-ink-soft hover:text-ink'
            }`}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className="rounded-full bg-accent px-2 text-[15px] lg:text-[13px] font-extrabold leading-5 text-ink">{tab.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ tab, value, children }: { tab: string; value: string; children: React.ReactNode }) {
  if (tab !== value) return null;
  return (
    <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="space-y-4 pt-4">
      {children}
    </div>
  );
}
