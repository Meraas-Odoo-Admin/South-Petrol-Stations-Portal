import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { buildPlan, executePlan, type Plan, type Roots } from './removal';

export interface CleanOptions {
  confirm: boolean;
  allowRealFillUps: boolean;
}

export function cleanOptions(argv: string[]): CleanOptions {
  return { confirm: argv.includes('--confirm'), allowRealFillUps: argv.includes('--allow-real-fillups') };
}

// pnpm runs the script from apps/api; a path typed from the repo root is
// resolved against INIT_CWD, where the person actually was.
export function resolveInputPath(given: string): string {
  const candidates = [path.resolve(given)];
  if (process.env.INIT_CWD) candidates.unshift(path.resolve(process.env.INIT_CWD, given));
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error(`File not found: ${given}`);
  return found;
}

export const readTextFile = (given: string): string => readFileSync(resolveInputPath(given), 'utf8');

export function printCounts(title: string, counts: Record<string, number>): void {
  console.log(title);
  const width = Math.max(...Object.keys(counts).map((k) => k.length));
  let total = 0;
  for (const [table, count] of Object.entries(counts)) {
    total += count;
    if (count > 0) console.log(`  ${table.padEnd(width)}  ${count}`);
  }
  console.log(`  ${'TOTAL'.padEnd(width)}  ${total}`);
}

// Production needs both --confirm and ALLOW_TEST_DATA_REMOVAL=yes, so a removal
// there is two deliberate acts and never one mistyped flag.
export function productionRefusal(env: NodeJS.ProcessEnv, options: CleanOptions): string | null {
  if (env.NODE_ENV === 'production') {
    if (!options.confirm) return 'NODE_ENV is production: pass --confirm.';
    if (env.ALLOW_TEST_DATA_REMOVAL !== 'yes') return 'NODE_ENV is production: set ALLOW_TEST_DATA_REMOVAL=yes as well as --confirm.';
  }
  return null;
}

// The shared run: plan, print, refuse on real fill-ups, and delete only with
// --confirm. Returns the process exit code.
export async function runRemoval(
  prisma: PrismaClient,
  label: string,
  roots: Roots,
  options: CleanOptions,
  extraProblems: string[] = [],
): Promise<number> {
  const refusal = productionRefusal(process.env, options);
  if (refusal) {
    console.error(`Refusing to run ${label}: ${refusal}`);
    return 1;
  }
  if (extraProblems.length > 0) {
    console.error(`Refusing to run ${label}:`);
    for (const p of extraProblems) console.error(`  - ${p}`);
    return 1;
  }

  const plan: Plan = await buildPlan(prisma, roots);
  console.log(`${label}: ${options.confirm ? 'DELETING' : 'DRY RUN - nothing is deleted'}`);
  console.log(
    `  roots: ${plan.userIds.length} users, ${plan.municipalityIds.length} municipalities, ${plan.companyIds.length} companies, ` +
      `${plan.stationIds.length} stations, ${plan.officeIds.length} offices; derived: ${plan.vehicleIds.length} vehicles, ` +
      `${plan.ownerIds.length} owners, ${plan.driverIds.length} drivers`,
  );
  printCounts('Rows that would be deleted:', plan.counts);

  if (plan.realFillUpCount > 0 && !options.allowRealFillUps) {
    console.error(
      `\nRefusing: ${plan.realFillUpCount} fill-up(s) in the plan are not explained by any test marker (recorded by a real account, at a real station, with no seed/spec key). First ones:`,
    );
    for (const f of plan.realFillUpSample) {
      console.error(`  ${f.id}  station ${f.stationId}  ${f.occurredAt.toISOString()}  by user ${f.recordedById}`);
    }
    console.error('If these really are test rows, run again with --allow-real-fillups.');
    return 1;
  }

  if (!options.confirm) {
    console.log('\nNothing was deleted. Run again with --confirm to delete.');
    return 0;
  }
  const deleted = await executePlan(prisma, plan);
  printCounts('\nDeleted:', deleted);
  await prisma.auditLog.create({
    data: { action: 'TEST_DATA_REMOVAL', entityType: 'System', entityId: label, newValue: { deleted } },
  });
  return 0;
}
