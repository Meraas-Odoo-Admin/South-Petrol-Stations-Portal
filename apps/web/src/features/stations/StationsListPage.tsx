import { useMemo, useState } from 'react';
import { useStations } from './useStations';
import { PageHeader } from '../../components/design/PageHeader';
import { Card } from '../../components/design/Card';
import { StatusPill } from '../../components/design/StatusPill';
import { CodeText } from '../../components/design/CodeText';
import { Icon, ICONS } from '../../components/icons';
import { STATION_STATUS_VARIANT, stationStatusLabel, fuelTypeLabel } from '../../lib/labels';
import type { StationBasicInfo } from './types';

const STATUS_FILTER_OPTIONS = ['ACTIVE', 'NOT_YET_SUPPLIED', 'SUSPENDED_LEGAL', 'SUSPENDED_COMMITTEE', 'SUSPENDED_OWNER', 'UNVERIFIED'];

const SELECT_CLASS =
  'h-[52px] rounded-sm border border-line bg-surface-alt px-3 text-[16px] text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface lg:h-11 lg:text-[14px]';

function matches(station: StationBasicInfo, term: string): boolean {
  if (!term) return true;
  const haystack = `${station.name} ${station.internalCode} ${station.stationNumber} ${station.municipality?.name ?? ''}`.toLowerCase();
  return haystack.includes(term.toLowerCase());
}

// The stations the person's account reaches, read-only. Phase 5A: stations are
// created, edited and archived by the municipality manager from «إدارة
// المحطات»; a supervisor controls their own station from «محطتي». This page
// is only a plain list for people who have neither.
export function StationsListPage() {
  const { data: stations, isLoading, isError } = useStations();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const filtered = useMemo(
    () => stations?.filter((s) => matches(s, query) && (!statusFilter || s.status === statusFilter)),
    [stations, query, statusFilter],
  );

  return (
    <div className="space-y-4">
      <PageHeader title="المحطات" subtitle={stations ? `${stations.length} محطة ضمن صلاحياتك` : undefined} />

      {isLoading && <p className="text-[15px] text-ink-soft lg:text-[13px]">جارٍ التحميل…</p>}
      {isError && <p className="text-[15px] text-danger lg:text-[13px]">تعذر تحميل قائمة المحطات.</p>}

      {stations && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-80">
            <span className="pointer-events-none absolute inset-y-0 start-3.5 flex items-center text-ink-faint">
              <Icon d={ICONS.search} size={18} />
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="بحث بالاسم أو الرمز أو الرقم"
              placeholder="ابحث بالاسم أو الرمز أو الرقم"
              className={`${SELECT_CLASS} w-full ps-11 pe-3.5`}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="الحالة"
            className={SELECT_CLASS}
          >
            <option value="">كل الحالات</option>
            {STATUS_FILTER_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {stationStatusLabel(status)}
              </option>
            ))}
          </select>
        </div>
      )}

      {filtered && filtered.length === 0 && (
        <Card className="p-5 text-center text-[16px] text-ink-soft lg:text-[14px]">لا توجد محطات مطابقة</Card>
      )}

      {filtered && filtered.length > 0 && (
        <ul className="space-y-3">
          {filtered.map((station) => (
            <li key={station.id}>
              <Card className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[18px] font-extrabold text-ink lg:text-[15px]">{station.name}</p>
                    <p className="text-[14px] text-ink-soft lg:text-[12px]">
                      {station.municipality?.name ?? '—'} · <CodeText>{station.internalCode}</CodeText> · رقم{' '}
                      <span dir="ltr">{station.stationNumber}</span>
                    </p>
                  </div>
                  <StatusPill variant={STATION_STATUS_VARIANT[station.status] ?? 'neutral'} size="md">
                    {stationStatusLabel(station.status)}
                  </StatusPill>
                </div>
                {station.fuelAvailability.some((f) => f.isAvailable) && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {station.fuelAvailability
                      .filter((f) => f.isAvailable)
                      .map((f) => (
                        <StatusPill key={f.fuelType} variant="ok" size="md">
                          {fuelTypeLabel(f.fuelType)}
                        </StatusPill>
                      ))}
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
