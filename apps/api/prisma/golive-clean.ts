// Phase 5C: remove all test data before real use.
//
//   pnpm --filter @fuel-tracking/api golive:clean              (dry run, the default)
//   pnpm --filter @fuel-tracking/api golive:clean --confirm    (delete)
//
// Removes the test accounts (employee1, supervisor1, registration1,
// regsupervisor1, admin1, admin2, sysadmin1 and the syn_/pw_/e2e_ accounts),
// the dev activity seed, test municipalities/companies/stations/offices, and
// every vehicle, owner, card, fill-up and stock entry that hangs off them.
// Counts per table are printed first. Real activity's audit rows are never
// deleted: only audit rows written by the removed test accounts go.
//
// In production it needs --confirm AND ALLOW_TEST_DATA_REMOVAL=yes.
// The insert-only stock tables are cleared through one controlled path (a
// transaction-local setting their triggers check); the triggers are not
// dropped or weakened (see migration p5c_test_data_removal_guard).
import { PrismaClient } from '@prisma/client';
import { cleanOptions, runRemoval } from '../src/golive/cli';
import { goliveRoots } from '../src/golive/roots';

async function main() {
  const args = process.argv.slice(2);
  const prisma = new PrismaClient();
  try {
    const roots = await goliveRoots(prisma);
    process.exitCode = await runRemoval(prisma, 'golive:clean', roots, cleanOptions(args));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
