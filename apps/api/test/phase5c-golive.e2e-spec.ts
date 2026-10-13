import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { cleanOptions, runRemoval } from '../src/golive/cli';
import { buildPlan, executePlan, type Roots } from '../src/golive/removal';
import { goliveRoots, nonSabhaRoots } from '../src/golive/roots';
import { SABHA, importStations, parseStationRows } from '../src/golive/stations-import';

// Phase 5C: the import, the two clean-up commands, the insert-only guard and
// the NOT NULL migration's null check. Every row these tests make is their
// own (names carry the run id); the clean-up commands are only ever pointed at
// roots listing those rows, never at the whole database.
describe('Phase 5C go-live (e2e)', () => {
  const prisma = new PrismaClient();
  const runId = Date.now().toString(36);
  const startedAt = new Date();
  let createdSabha = false;
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  const roots = (over: Partial<Roots>): Roots => ({
    userIds: [],
    municipalityIds: [],
    companyIds: [],
    stationIds: [],
    officeIds: [],
    includeOrphans: false,
    markerRows: false,
    ...over,
  });

  beforeAll(async () => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const sabha = await prisma.municipality.findUnique({ where: { name: SABHA } });
    if (!sabha) {
      await prisma.municipality.create({ data: { name: SABHA, status: 'LIVE' } });
      createdSabha = true;
    }
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { action: { in: ['IMPORT_STATIONS', 'TEST_DATA_REMOVAL'] }, createdAt: { gte: startedAt } },
    });
    if (createdSabha) await prisma.municipality.deleteMany({ where: { name: SABHA } });
    logSpy.mockRestore();
    errorSpy.mockRestore();
    await prisma.$disconnect();
  });

  // ── The import ────────────────────────────────────────────────────────

  describe('stations:import', () => {
    const company = `E2E P5C Import Co ${runId}`;
    const csv = [
      'company,station_number,name,locality,municipality,status,status_note,ownership_as_written,supervisor_name,supervisor_phone,operator_name,operator_phone,petrol_95,diesel,kerosene,source,check_note',
      `${company},1,محطة اختبار ١,حي أ,سبها,ACTIVE,,خاصة,,,,,yes,yes,no,test,`,
      `${company},2,محطة اختبار ٢,حي ب,سبها,SUSPENDED_OWNER,متوقفة,مملوكة,,,,,,,,test,"CONFIRM: a, b"`,
    ].join('\n');

    afterAll(async () => {
      const co = await prisma.company.findUnique({ where: { name: company } });
      if (!co) return;
      const stations = await prisma.station.findMany({ where: { companyId: co.id }, select: { id: true } });
      const ids = stations.map((s) => s.id);
      await prisma.stationFuelAvailability.deleteMany({ where: { stationId: { in: ids } } });
      await prisma.station.deleteMany({ where: { id: { in: ids } } });
      await prisma.company.delete({ where: { id: co.id } });
    });

    it('creates the stations, then a second run changes nothing', async () => {
      const parsed = parseStationRows(csv);
      expect(parsed.errors).toEqual([]);

      const first = await importStations(prisma, parsed.rows, { apply: true, warnings: parsed.warnings });
      expect(first.created).toHaveLength(2);
      expect(first.updated).toHaveLength(0);
      expect(first.checkNotes).toEqual([
        expect.objectContaining({ stationNumber: '2', note: 'CONFIRM: a, b' }),
      ]);

      const second = await importStations(prisma, parsed.rows, { apply: true, warnings: parsed.warnings });
      expect(second.created).toHaveLength(0);
      expect(second.updated).toHaveLength(0);
      expect(second.unchanged).toBe(2);

      const stations = await prisma.station.findMany({
        where: { company: { name: company } },
        include: { municipality: true, fuelAvailability: true },
        orderBy: { stationNumber: 'asc' },
      });
      expect(stations).toHaveLength(2);
      for (const s of stations) expect(s.municipality.name).toBe(SABHA);
      expect(stations[0]).toMatchObject({ locality: 'حي أ', status: 'ACTIVE' });
      expect(stations[0]!.fuelAvailability.map((f) => `${f.fuelType}:${f.isAvailable}`).sort()).toEqual([
        'DIESEL:true',
        'KEROSENE:false',
        'PETROL_95:true',
      ]);
      // The suspension note is kept; the ownership column in the file is ignored.
      expect(stations[1]).toMatchObject({ ownershipType: null, status: 'SUSPENDED_OWNER', statusNote: 'متوقفة' });
    });

    it('a dry run writes nothing', async () => {
      const dry = `E2E P5C Dry Co ${runId}`;
      const parsed = parseStationRows(csv.replaceAll(company, dry));
      const report = await importStations(prisma, parsed.rows, { apply: false });
      expect(report.created).toHaveLength(2);
      expect(await prisma.company.findUnique({ where: { name: dry } })).toBeNull();
    });

    it('a blank cell never wipes a value that is already there, unless asked to', async () => {
      const co = await prisma.company.findUniqueOrThrow({ where: { name: company } });
      await prisma.station.update({
        where: { companyId_stationNumber: { companyId: co.id, stationNumber: '1' } },
        data: { supervisorName: 'مشرف مضاف يدويا' },
      });
      const parsed = parseStationRows(csv);
      await importStations(prisma, parsed.rows, { apply: true });
      const kept = await prisma.station.findUniqueOrThrow({
        where: { companyId_stationNumber: { companyId: co.id, stationNumber: '1' } },
      });
      expect(kept.supervisorName).toBe('مشرف مضاف يدويا');

      await importStations(prisma, parsed.rows, { apply: true, clearBlanks: true });
      const cleared = await prisma.station.findUniqueOrThrow({
        where: { companyId_stationNumber: { companyId: co.id, stationNumber: '1' } },
      });
      expect(cleared.supervisorName).toBeNull();
    });
  });

  // ── The removal engine and its commands ───────────────────────────────

  describe('removal', () => {
    async function scratch(label: string, options: { realNames?: boolean } = {}) {
      const tag = `${label}-${runId}`;
      const municipality = await prisma.municipality.create({
        data: { name: options.realNames ? `Scratch Muni ${tag}` : `E2E P5C Muni ${tag}`, status: 'LIVE' },
      });
      const company = await prisma.company.create({
        data: { name: options.realNames ? `Scratch Co ${tag}` : `E2E P5C Co ${tag}` },
      });
      const user = await prisma.user.create({
        data: {
          username: options.realNames ? `scratch_user_${tag}` : `e2e_p5c_${tag}`,
          passwordHash: 'x',
          fullName: 'scratch',
        },
      });
      const station = await prisma.station.create({
        data: {
          internalCode: options.realNames ? `SCRATCH-${tag}` : `E2E-P5C-${tag}`,
          stationNumber: '1',
          name: options.realNames ? `Scratch station ${tag}` : `E2E P5C station ${tag}`,
          companyId: company.id,
          municipalityId: municipality.id,
        },
      });
      return { municipality, company, user, station, tag };
    }

    async function addStock(s: Awaited<ReturnType<typeof scratch>>) {
      const fuelEntry = await prisma.fuelStockEntry.create({
        data: {
          stationId: s.station.id,
          fuelType: 'PETROL_95',
          kind: 'DELIVERY',
          liters: 1000,
          occurredAt: new Date(),
          createdById: s.user.id,
        },
      });
      const office = await prisma.registrationStation.create({
        data: {
          internalCode: `E2E-P5C-REG-${s.tag}`,
          name: `E2E P5C office ${s.tag}`,
          municipalityId: s.municipality.id,
          address: 'x',
        },
      });
      const cardEntry = await prisma.stockEntry.create({
        data: {
          registrationStationId: office.id,
          kind: 'RECEIVED',
          quantity: 5,
          occurredAt: new Date(),
          createdById: s.user.id,
        },
      });
      return { fuelEntry, office, cardEntry };
    }

    const rootsOf = (s: Awaited<ReturnType<typeof scratch>>) =>
      roots({ userIds: [s.user.id], municipalityIds: [s.municipality.id], companyIds: [s.company.id] });

    async function exists(table: 'station' | 'fuelStockEntry' | 'stockEntry' | 'user' | 'municipality' | 'company', id: string) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (await (prisma as any)[table].findUnique({ where: { id } })) !== null;
    }

    it('keeps the insert-only tables insert-only for plain SQL, and lifts the guard only inside the clean-up', async () => {
      const a = await scratch('guard');
      const stock = await addStock(a);
      const b = await scratch('guard2');
      const stockB = await addStock(b);

      // Plain deletes and updates are refused, whoever sends them.
      await expect(
        prisma.$executeRawUnsafe('DELETE FROM "FuelStockEntry" WHERE "id" = $1', stock.fuelEntry.id),
      ).rejects.toThrow(/insert-only/);
      await expect(
        prisma.$executeRawUnsafe('DELETE FROM "StockEntry" WHERE "id" = $1', stock.cardEntry.id),
      ).rejects.toThrow(/insert-only/);
      await expect(
        prisma.$executeRawUnsafe('UPDATE "FuelStockEntry" SET "liters" = 1 WHERE "id" = $1', stock.fuelEntry.id),
      ).rejects.toThrow(/insert-only/);
      // Even the Prisma client cannot (the API has no such endpoint either).
      await expect(prisma.fuelStockEntry.delete({ where: { id: stock.fuelEntry.id } })).rejects.toThrow(/insert-only/);

      // The clean-up removes the test rows of ONE scratch set...
      const plan = await buildPlan(prisma, rootsOf(a));
      expect(plan.counts['FuelStockEntry']).toBe(1);
      expect(plan.counts['StockEntry']).toBe(1);
      await executePlan(prisma, plan);
      expect(await exists('fuelStockEntry', stock.fuelEntry.id)).toBe(false);
      expect(await exists('stockEntry', stock.cardEntry.id)).toBe(false);
      expect(await exists('station', a.station.id)).toBe(false);

      // ...and the guard is back straight afterwards, for the other set.
      await expect(
        prisma.$executeRawUnsafe('DELETE FROM "FuelStockEntry" WHERE "id" = $1', stockB.fuelEntry.id),
      ).rejects.toThrow(/insert-only/);
      expect(await exists('fuelStockEntry', stockB.fuelEntry.id)).toBe(true);

      // The setting does not leak across a transaction: setting it in one
      // transaction does not lift the guard in the next statement.
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.test_data_removal', 'on', true)`;
      });
      await expect(
        prisma.$executeRawUnsafe('DELETE FROM "FuelStockEntry" WHERE "id" = $1', stockB.fuelEntry.id),
      ).rejects.toThrow(/insert-only/);

      await executePlan(prisma, await buildPlan(prisma, rootsOf(b)));
      expect(await exists('fuelStockEntry', stockB.fuelEntry.id)).toBe(false);
    });

    it('a dry run deletes nothing and says what it would delete', async () => {
      const s = await scratch('dry');
      await addStock(s);
      const code = await runRemoval(prisma, 'test dry run', rootsOf(s), cleanOptions([]));
      expect(code).toBe(0);
      expect(await exists('station', s.station.id)).toBe(true);
      expect(await exists('user', s.user.id)).toBe(true);
      expect(await exists('municipality', s.municipality.id)).toBe(true);
      const printed = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(printed).toMatch(/DRY RUN/);
      expect(printed).toMatch(/Station\s+1/);

      await executePlan(prisma, await buildPlan(prisma, rootsOf(s)));
    });

    it('refuses in production without --confirm and the environment flag', async () => {
      const s = await scratch('prod');
      const before = process.env.NODE_ENV;
      const flag = process.env.ALLOW_TEST_DATA_REMOVAL;
      try {
        process.env.NODE_ENV = 'production';
        delete process.env.ALLOW_TEST_DATA_REMOVAL;
        expect(await runRemoval(prisma, 'test prod', rootsOf(s), cleanOptions([]))).toBe(1);
        expect(await runRemoval(prisma, 'test prod', rootsOf(s), cleanOptions(['--confirm']))).toBe(1);
        expect(await exists('station', s.station.id)).toBe(true);
        expect(await exists('user', s.user.id)).toBe(true);
      } finally {
        process.env.NODE_ENV = before;
        if (flag === undefined) delete process.env.ALLOW_TEST_DATA_REMOVAL;
        else process.env.ALLOW_TEST_DATA_REMOVAL = flag;
      }
      await executePlan(prisma, await buildPlan(prisma, rootsOf(s)));
    });

    it('with --confirm removes the rows, and writes one audit row of its own', async () => {
      const s = await scratch('confirm');
      await addStock(s);
      const code = await runRemoval(prisma, `test confirm ${runId}`, rootsOf(s), cleanOptions(['--confirm']));
      expect(code).toBe(0);
      for (const [table, id] of [
        ['station', s.station.id],
        ['user', s.user.id],
        ['municipality', s.municipality.id],
        ['company', s.company.id],
      ] as const) {
        expect(await exists(table, id)).toBe(false);
      }
      expect(await prisma.auditLog.count({ where: { action: 'TEST_DATA_REMOVAL', entityId: `test confirm ${runId}` } })).toBe(1);
    });

    it('refuses to delete a fill-up no test marker explains, unless told it is test data', async () => {
      const s = await scratch('real', { realNames: true });
      const fillUp = await prisma.fillUpTransaction.create({
        data: {
          stationId: s.station.id,
          municipalityId: s.municipality.id,
          fuelType: 'PETROL_95',
          quantityLiters: 20,
          recordedById: s.user.id,
          idempotencyKey: `real-${s.tag}`,
          identifiedBy: 'TYPED_UNREGISTERED',
          typedPlate: '5-123456',
          normalizedPlate: '5-123456',
        },
      });
      const onlyPlace = roots({ municipalityIds: [s.municipality.id], stationIds: [s.station.id] });

      expect(await runRemoval(prisma, 'test guard', onlyPlace, cleanOptions(['--confirm']))).toBe(1);
      expect(await prisma.fillUpTransaction.findUnique({ where: { id: fillUp.id } })).not.toBeNull();
      expect(await exists('station', s.station.id)).toBe(true);

      expect(await runRemoval(prisma, 'test guard', onlyPlace, cleanOptions(['--confirm', '--allow-real-fillups']))).toBe(0);
      expect(await prisma.fillUpTransaction.findUnique({ where: { id: fillUp.id } })).toBeNull();
      expect(await exists('station', s.station.id)).toBe(false);

      await prisma.refreshToken.deleteMany({ where: { userId: s.user.id } });
      await prisma.user.delete({ where: { id: s.user.id } });
      await prisma.company.delete({ where: { id: s.company.id } });
    });

    it('golive roots pick up test accounts and test places, never a real account or سبها', async () => {
      const s = await scratch('roots');
      const real = await prisma.user.create({
        data: { username: `real.person.${runId}`, passwordHash: 'x', fullName: 'real' },
      });
      const picked = await goliveRoots(prisma);
      expect(picked.userIds).toContain(s.user.id);
      expect(picked.userIds).not.toContain(real.id);
      expect(picked.municipalityIds).toContain(s.municipality.id);
      expect(picked.stationIds).toContain(s.station.id);
      const sabha = await prisma.municipality.findUniqueOrThrow({ where: { name: SABHA } });
      expect(picked.municipalityIds).not.toContain(sabha.id);
      expect(picked.includeOrphans).toBe(true);

      await prisma.user.delete({ where: { id: real.id } });
      await executePlan(prisma, await buildPlan(prisma, rootsOf(s)));
    });

    it('non-Sabha roots keep the listed stations and سبها, and flag a listed station still outside سبها', async () => {
      const s = await scratch('nonsabha');
      const keptStation = await prisma.station.create({
        data: {
          internalCode: `E2E-P5C-KEEP-${runId}`,
          stationNumber: '7',
          name: `E2E P5C keep ${runId}`,
          companyId: s.company.id,
          municipalityId: s.municipality.id,
        },
      });
      const keep = new Set([`${s.company.name}\u0000${keptStation.stationNumber}`]);
      const { roots: picked, problems } = await nonSabhaRoots(prisma, keep);
      const sabha = await prisma.municipality.findUniqueOrThrow({ where: { name: SABHA } });

      expect(picked.municipalityIds).toContain(s.municipality.id);
      expect(picked.municipalityIds).not.toContain(sabha.id);
      expect(picked.stationIds).toContain(s.station.id);
      expect(picked.stationIds).not.toContain(keptStation.id);
      expect(picked.userIds).toEqual([]);
      expect(problems.join('\n')).toContain('run stations:import first');

      await executePlan(prisma, await buildPlan(prisma, rootsOf(s)));
    });
  });

  // ── The NOT NULL migration ────────────────────────────────────────────

  describe('migration p5c_required_municipality', () => {
    const dir = readdirSync(path.resolve(__dirname, '../prisma/migrations')).find((d) =>
      d.endsWith('_p5c_required_municipality'),
    )!;
    const sql = readFileSync(path.resolve(__dirname, '../prisma/migrations', dir, 'migration.sql'), 'utf8');
    const check = /DO \$\$[\s\S]*?\n\$\$;/.exec(sql)![0];
    const schema = `p5c_null_check_${runId}`;

    async function inScratchSchema(nulls: { stations: number; fillUps: number }, body: (tx: PrismaClient) => Promise<void>) {
      await prisma.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      try {
        await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
          await tx.$executeRawUnsafe('CREATE TABLE "Station" ("id" text PRIMARY KEY, "municipalityId" text)');
          await tx.$executeRawUnsafe('CREATE TABLE "FillUpTransaction" ("id" text PRIMARY KEY, "municipalityId" text)');
          for (let i = 0; i < nulls.stations; i++) {
            await tx.$executeRawUnsafe(`INSERT INTO "Station" VALUES ('s${i}', NULL)`);
          }
          await tx.$executeRawUnsafe(`INSERT INTO "Station" VALUES ('ok', 'm')`);
          for (let i = 0; i < nulls.fillUps; i++) {
            await tx.$executeRawUnsafe(`INSERT INTO "FillUpTransaction" VALUES ('f${i}', NULL)`);
          }
          await body(tx as unknown as PrismaClient);
        });
      } finally {
        await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      }
    }

    it('is a guarded constraint tightening: the check comes before every ALTER', () => {
      expect(sql.indexOf('DO $$')).toBeGreaterThanOrEqual(0);
      expect(sql.indexOf('DO $$')).toBeLessThan(sql.indexOf('ALTER TABLE'));
      expect(sql).toMatch(/ALTER TABLE "Station" ALTER COLUMN "municipalityId" SET NOT NULL/);
      expect(sql).toMatch(/ALTER TABLE "FillUpTransaction" ALTER COLUMN "municipalityId" SET NOT NULL/);
    });

    it('stops with a clear message, counting the rows, when nulls remain', async () => {
      await expect(
        inScratchSchema({ stations: 2, fillUps: 3 }, async (tx) => {
          await tx.$executeRawUnsafe(check);
        }),
      ).rejects.toThrow(/2 station\(s\) and 3 fill-up\(s\) have no municipality/);
    });

    it('lets the migration through when nothing is null', async () => {
      await inScratchSchema({ stations: 0, fillUps: 0 }, async (tx) => {
        await tx.$executeRawUnsafe(check);
      });
    });
  });
});
