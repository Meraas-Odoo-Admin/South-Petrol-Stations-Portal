// Phase 5C: load Sabha's confirmed petrol stations from the client's CSV.
//
//   pnpm --filter @fuel-tracking/api stations:import <csv> [--dry-run] [--overwrite-blanks]
//
// e.g. pnpm --filter @fuel-tracking/api stations:import data/private/sabha-stations.csv
//
// Safe to run twice: stations are matched by (company, station number) and
// brought in line with the file; a second run changes nothing. Rows with a
// check note are imported as written and the notes are listed for the client.
// A blank cell never wipes a value already in the database unless
// --overwrite-blanks is given (use it once, on a database that still holds the
// old seeded roster).
import { PrismaClient } from '@prisma/client';
import { importStations, parseStationRows } from '../src/golive/stations-import';
import { readTextFile } from '../src/golive/cli';

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) {
    console.error('Usage: stations:import <csv> [--dry-run] [--overwrite-blanks]');
    process.exitCode = 1;
    return;
  }
  const dryRun = args.includes('--dry-run');

  const parsed = parseStationRows(readTextFile(file));
  if (parsed.errors.length > 0) {
    console.error('The file has problems; nothing was imported:');
    for (const e of parsed.errors) console.error(`  - ${e}`);
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient();
  try {
    const report = await importStations(prisma, parsed.rows, { apply: !dryRun, warnings: parsed.warnings, clearBlanks: args.includes('--overwrite-blanks') });
    console.log(`${dryRun ? 'DRY RUN - nothing written. ' : ''}Stations in file: ${parsed.rows.length}`);
    console.log(`  created:   ${report.created.length}`);
    for (const c of report.created) console.log(`    + ${c.company} / ${c.stationNumber}  ${c.name}  (${c.internalCode})`);
    console.log(`  updated:   ${report.updated.length}`);
    for (const u of report.updated) console.log(`    ~ ${u.company} / ${u.stationNumber}  ${u.name}  [${u.changed.join(', ')}]`);
    console.log(`  unchanged: ${report.unchanged}`);
    if (report.warnings.length > 0) {
      console.log('Client questions / warnings:');
      for (const w of report.warnings) console.log(`  ? ${w}`);
    }
    if (report.checkNotes.length > 0) {
      console.log('Check notes imported as written (client to confirm):');
      for (const n of report.checkNotes) console.log(`  ! ${n.company} / ${n.stationNumber}  ${n.name}: ${n.note}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
