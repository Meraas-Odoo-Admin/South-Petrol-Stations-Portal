import { StatusPill } from '../../components/design/StatusPill';
import { litersText, STOCK_STATUS_TEXT, STOCK_STATUS_VARIANT, useFuelStock, type FuelLevel } from './fuelStock';

// The current level per fuel type, compact, for the home screen and the
// fill-up screen (phase 5B). The server decides whether this caller may see it
// (the supervisor's «إظهار المخزون للموظفين» switch): when it says no, this
// renders nothing at all.

function LevelRow({ level }: { level: FuelLevel }) {
  const warning = level.status === 'DATA_WARNING';
  return (
    <li className="flex items-center justify-between gap-3 py-2.5" data-testid={`stock-strip-${level.fuelType}`}>
      <span className="text-[17px] font-bold text-ink lg:text-[14px]">{level.fuelLabel}</span>
      <span className="flex items-center gap-2.5">
        <span className="text-[18px] font-extrabold tabular-nums text-ink lg:text-[15px]">
          {warning ? 'غير معروف' : litersText(level.level)}
        </span>
        <StatusPill variant={STOCK_STATUS_VARIANT[level.status]} size="md">
          {STOCK_STATUS_TEXT[level.status]}
        </StatusPill>
      </span>
    </li>
  );
}

export function StockStrip({ stationId, title = 'مخزون الوقود في المحطة' }: { stationId: string | undefined; title?: string }) {
  const stock = useFuelStock(stationId);
  const data = stock.data;
  if (!data || !data.visible || data.levels.length === 0) return null;
  const configured = data.levels.filter((l) => l.configured);
  if (configured.length === 0) return null;
  return (
    <section aria-label={title} className="rounded-md bg-surface p-4 shadow-sm" data-testid="stock-strip">
      <h2 className="text-[16px] font-extrabold text-primary-dark lg:text-[14px]">{title}</h2>
      <ul className="mt-1 divide-y divide-line">
        {configured.map((l) => (
          <LevelRow key={l.fuelType} level={l} />
        ))}
      </ul>
    </section>
  );
}

// The warning on the fill-up screen: stock at or below zero for the fuel being
// poured. Never blocks - records can lag behind reality - it only says so.
export function StockWarning({ stationId, fuelType }: { stationId: string | undefined; fuelType: string | undefined }) {
  const stock = useFuelStock(stationId);
  const level = stock.data?.levels.find((l) => l.fuelType === fuelType);
  if (!stock.data?.visible || !level || !level.configured) return null;
  const empty = level.status === 'EMPTY' || level.status === 'DATA_WARNING';
  if (!empty) return null;
  return (
    <p
      role="status"
      data-testid="stock-warning"
      className="rounded-md border border-accent bg-accent-100 p-3 text-[16px] font-bold leading-[1.7] text-ink lg:text-[14px]"
    >
      {level.status === 'EMPTY'
        ? `مخزون ${level.fuelLabel} المسجَّل في المحطة صفر. يمكنك المتابعة، لكن تأكّد من تسجيل آخر توريد.`
        : `سجل مخزون ${level.fuelLabel} يحتاج مراجعة: قد يكون هناك توريد غير مسجَّل. يمكنك المتابعة.`}
    </p>
  );
}
