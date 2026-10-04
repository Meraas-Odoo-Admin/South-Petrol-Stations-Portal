import { readFileSync } from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { normalizePlate } from '@fuel-tracking/shared-types';

// The plate backfill in migration 20261003100100 is SQL; normalizePlate() is
// TypeScript. They must agree, or a vehicle registered today and one
// backfilled from older data would be matched by different rules. This runs
// the migration's own backfill statement (between its markers) over a set of
// plates inside a transaction that is always rolled back, and compares every
// row with the shared normalizer.
describe('Vehicle.normalizedPlate backfill (migration SQL) matches normalizePlate()', () => {
  const prisma = new PrismaClient();
  const migration = readFileSync(
    path.join(__dirname, '../prisma/migrations/20261003100100_p4a_vehicle_normalized_plate/migration.sql'),
    'utf-8',
  );
  const statement = migration.split('-- backfill:begin')[1]!.split('-- backfill:end')[0]!.replace(/^[^\n]*\n/, '');

  // Each entry is a distinct stored string (currentPlate is unique).
  const plates = [
    '8-1234567',
    '8 1234567',
    '٨-١٢٣٤٥٦٧',
    '۸-۱۲۳۴۵۶۷',
    '08-1234567',
    '81-234567',
    '8/1234567',
    '8.1234567',
    '8 - 1234567',
    '8--1234567',
    ' 8-1234567 ',
    '8_1234567',
    '8 1234567',
    '8‏-‏1234567',
    '08-0001234',
    '٠٨-٠٠١٢٣٤',
    '88-1',
    // No canonical form: NULL in SQL, null in TypeScript.
    '81234567',
    '٨١٢٣٤٥٦٧',
    '8-12-34',
    'ab-12',
    '8-12a4',
    '0-1234',
    '8-0',
    '123-4567',
    '8-12345678',
    '8-',
    '-1234567',
  ];

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('gives every plate the same answer in SQL and in TypeScript', async () => {
    const rollback = new Error('rollback');
    let rows: Array<{ currentPlate: string; normalizedPlate: string | null }> = [];
    await prisma
      .$transaction(async (tx) => {
        const runId = Date.now().toString(36);
        await tx.vehicle.createMany({
          data: plates.map((currentPlate, i) => ({ internalCode: `E2E-BF-${runId}-${i}`, currentPlate })),
        });
        // Static SQL taken from the migration file — no user input in it.
        await tx.$executeRawUnsafe(statement);
        rows = await tx.vehicle.findMany({
          where: { internalCode: { startsWith: `E2E-BF-${runId}-` } },
          select: { currentPlate: true, normalizedPlate: true },
        });
        throw rollback;
      })
      .catch((error) => {
        if (error !== rollback) throw error;
      });

    expect(rows).toHaveLength(plates.length);
    for (const row of rows) {
      expect({ plate: row.currentPlate, normalized: row.normalizedPlate }).toEqual({
        plate: row.currentPlate,
        normalized: normalizePlate(row.currentPlate),
      });
    }
    // And the headline cases, spelled out.
    const byPlate = new Map(rows.map((r) => [r.currentPlate, r.normalizedPlate]));
    expect(byPlate.get('8-1234567')).toBe('8-1234567');
    expect(byPlate.get('81-234567')).toBe('81-234567');
    expect(byPlate.get('08-1234567')).toBe('8-1234567');
    expect(byPlate.get('٨-١٢٣٤٥٦٧')).toBe('8-1234567');
    expect(byPlate.get('81234567')).toBeNull();
  });
});
