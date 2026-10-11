// Dates on these screens read in Tripoli time with Western numerals, as
// everywhere else in the app (numbers stay left-to-right inside RTL text).
const WHEN = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Tripoli',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function formatWhen(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return WHEN.format(new Date(iso)).replace(',', '');
}

// "3 places chosen" in correct Arabic (one, two, few, many).
export function placesChosenLabel(count: number): string {
  if (count === 0) return 'لم يُختر مكان بعد';
  if (count === 1) return 'مكان واحد مختار';
  if (count === 2) return 'مكانان مختاران';
  if (count <= 10) return `${count} أماكن مختارة`;
  return `${count} مكانًا مختارًا`;
}
