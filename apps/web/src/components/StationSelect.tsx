import { useStations } from '../features/stations/useStations';

interface StationSelectProps {
  value: string;
  onChange: (stationId: string) => void;
  allowAllOption?: boolean;
  className?: string;
  disabled?: boolean;
  /** Ties the list to its visible label (Phase 7 audit). */
  id?: string;
}

// Real dropdown backed by GET /stations, replacing the free-text stationId
// inputs that used to require the caller to already know a station's exact
// id/name. The list is already server-side scoped to what the current user
// can see, so a station_supervisor (etc.) only ever sees their own
// station(s) here — never has to guess, never can pick one out of scope.
export function StationSelect({
  value,
  onChange,
  allowAllOption = false,
  className,
  disabled,
  id,
}: StationSelectProps) {
  const { data: stations, isLoading } = useStations();

  return (
    <select
      id={id}
      aria-label={id ? undefined : 'المحطة'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled || isLoading}
      className={
        className ?? 'w-64 rounded-sm border border-line bg-surface-alt px-2 py-1 disabled:opacity-60'
      }
    >
      {allowAllOption && <option value="">جميع المحطات</option>}
      {!allowAllOption && !value && <option value="">اختر محطة</option>}
      {isLoading && <option disabled>جارٍ التحميل…</option>}
      {stations?.map((station) => (
        <option key={station.id} value={station.id}>
          {station.internalCode} — {station.name}
        </option>
      ))}
      {stations?.length === 0 && <option disabled>لا توجد محطات ضمن صلاحياتك</option>}
    </select>
  );
}
