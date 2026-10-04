import { LtrText } from './LtrText';
import { formatLicensePlate } from '../lib/libyanFormats';

// Phase 4a: a fill-up row may have no vehicle record (an unregistered plate
// typed at the pump). Show the plate as typed with an "unregistered" badge.
export function FillUpPlate({
  vehicle,
  typedPlate,
}: {
  vehicle: { currentPlate: string } | null;
  typedPlate: string | null;
}) {
  if (vehicle) return <LtrText>{formatLicensePlate(vehicle.currentPlate)}</LtrText>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <LtrText>{typedPlate ? formatLicensePlate(typedPlate) : '—'}</LtrText>
      <span className="rounded-sm bg-accent-100 px-1.5 py-0.5 text-[10.5px] font-bold text-accent-dark">مركبة غير مسجلة</span>
    </span>
  );
}
