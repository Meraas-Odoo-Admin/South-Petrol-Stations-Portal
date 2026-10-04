// Registration pivot, phase 4a: read-only plate checks before launch.
//
//   pnpm --filter @fuel-tracking/api plates:report
//
// A Libyan plate is a city code plus a serial number, and its canonical form
// is `<city>-<serial>` (see packages/shared-types/src/plate.ts). This lists:
//   1. vehicles whose plate has NO separator or can't be split into exactly a
//      city code (1-2 digits) and a serial number (1-7 digits) — these have
//      no canonical form, so they can't be matched by typed plate until
//      someone corrects them;
//   2. vehicles that would share a canonical plate (the same plate typed two
//      ways, e.g. `8-1234567` and `08 1234567`) — never merged here;
//   3. vehicles whose stored normalizedPlate column is missing or stale.
//
// READ-ONLY: nothing is changed, merged or deleted; what to do with each
// vehicle is the client's decision. It normalizes currentPlate itself with
// the shared normalizer rather than trusting the backfilled column. Plates
// are not personal data (CLAUDE.md rule 10); no owner details are printed.
import { PrismaClient } from '@prisma/client';
import { normalizePlate, toWesternDigits } from '@fuel-tracking/shared-types';

const prisma = new PrismaClient();

type Row = {
  internalCode: string;
  currentPlate: string;
  normalizedPlate: string | null;
  createdAt: Date;
  _count: { fillUps: number };
};

// Why a plate has no canonical form, in words the client can act on.
function whyUnsplittable(plate: string): string {
  const digits = toWesternDigits(plate);
  if (/^[0-9]+$/.test(digits.trim())) return 'no separator between city code and number';
  return 'cannot be split into exactly a city code and a number';
}

async function main() {
  const vehicles: Row[] = await prisma.vehicle.findMany({
    select: { internalCode: true, currentPlate: true, normalizedPlate: true, createdAt: true, _count: { select: { fillUps: true } } },
    orderBy: { createdAt: 'asc' },
  });

  const unsplittable = vehicles.filter((v) => normalizePlate(v.currentPlate) === null);
  const groups = new Map<string, Row[]>();
  for (const v of vehicles) {
    const key = normalizePlate(v.currentPlate);
    if (key === null) continue;
    groups.set(key, [...(groups.get(key) ?? []), v]);
  }
  const collisions = [...groups.entries()].filter(([, members]) => members.length > 1);
  const stale = vehicles.filter((v) => v.normalizedPlate !== normalizePlate(v.currentPlate));

  console.log(`Vehicles checked: ${vehicles.length}`);

  console.log(`\nPlates with no separator or that can't be split into a city code and a number: ${unsplittable.length}`);
  for (const v of unsplittable) {
    console.log(`    ${v.internalCode}  stored as "${v.currentPlate}"  (${whyUnsplittable(v.currentPlate)})  fill-ups: ${v._count.fillUps}`);
  }

  console.log(`\nPlates that are the same plate typed two ways: ${collisions.length} group(s), ${collisions.reduce((n, [, m]) => n + m.length, 0)} vehicle(s)`);
  for (const [normalized, members] of collisions) {
    console.log(`\n  canonical ${normalized}`);
    for (const m of members) {
      console.log(`    ${m.internalCode}  stored as "${m.currentPlate}"  registered ${m.createdAt.toISOString().slice(0, 10)}  fill-ups: ${m._count.fillUps}`);
    }
  }

  // A vehicle with no canonical form always has a NULL column — that is the
  // first list, not a staleness problem.
  const reallyStale = stale.filter((v) => normalizePlate(v.currentPlate) !== null);
  if (reallyStale.length > 0) {
    console.log(`\nVehicles whose normalizedPlate column is missing or out of date: ${reallyStale.length}`);
    for (const v of reallyStale) console.log(`    ${v.internalCode}  "${v.currentPlate}"  column: ${v.normalizedPlate ?? 'NULL'}`);
  }
  console.log('\nNothing was changed.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
