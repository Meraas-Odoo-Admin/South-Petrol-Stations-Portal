// Phase 5C: remove what is not Sabha's, now that the client's list is loaded.
//
//   pnpm --filter @fuel-tracking/api stations:clean-non-sabha <csv>             (dry run, the default)
//   pnpm --filter @fuel-tracking/api stations:clean-non-sabha <csv> --confirm   (delete)
//
// Removes every station that is not on the client's CSV, every municipality
// other than سبها, and the test rows that hang off them (fill-ups, offices,
// vehicles registered there, cards, stock entries, scopes). Users are never
// touched. Run stations:import first.
//
// Refuses when a fill-up it would delete is not explained by a test marker
// (recorded by a real account at a real station) unless --allow-real-fillups.
import { PrismaClient } from '@prisma/client';
import { cleanOptions, readTextFile, runRemoval } from '../src/golive/cli';
import { parseStationRows } from '../src/golive/stations-import';
import { nonSabhaRoots } from '../src/golive/roots';

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) {
    console.error('Usage: stations:clean-non-sabha <csv> [--confirm] [--allow-real-fillups]');
    process.exitCode = 1;
    return;
  }
  const parsed = parseStationRows(readTextFile(file));
  if (parsed.errors.length > 0) {
    console.error('The file has problems:');
    for (const e of parsed.errors) console.error(`  - ${e}`);
    process.exitCode = 1;
    return;
  }
  const keep = new Set(parsed.rows.map((r) => `${r.company}\u0000${r.stationNumber}`));

  const prisma = new PrismaClient();
  try {
    const { roots, problems } = await nonSabhaRoots(prisma, keep);
    process.exitCode = await runRemoval(prisma, 'stations:clean-non-sabha', roots, cleanOptions(args), problems);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
