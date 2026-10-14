import { Prisma, type PrismaClient } from '@prisma/client';
import {
  LEGACY_SEEDED_STATION_CODE_PREFIXES,
  SYNTHETIC_REASON_PREFIX,
  SYNTHETIC_WAYBILL_PREFIX,
  TEST_FILLUP_KEY_PREFIXES,
  TEST_NAME_STARTS,
  TEST_STATION_CODE_PREFIXES,
  TEST_USERNAMES,
  TEST_USERNAME_PREFIXES,
  TEST_VEHICLE_CODE_PREFIXES,
} from './test-markers';

// One removal engine for both clean-up commands:
//
//   stations:clean-non-sabha  roots = stations not in the client's CSV and every
//                             municipality except سبها (users are never roots)
//   golive:clean              roots = test users, test municipalities, test
//                             companies, test stations and offices
//
// A command names its ROOTS; this file works out everything that hangs off
// them (fill-ups, cards, vehicles, owners, stock entries, scopes...) and
// deletes it in an order the foreign keys accept. The plan is computed first
// and is the same object a --dry-run prints, so the preview is the deletion.

export type Db = PrismaClient | Prisma.TransactionClient;

export interface Roots {
  userIds: string[];
  municipalityIds: string[];
  companyIds: string[];
  stationIds: string[];
  officeIds: string[];
  /** Also take vehicles with no registering user or office, and owners/drivers nothing refers to. */
  includeOrphans: boolean;
  /**
   * Also take rows the seeds and Playwright name by marker (VEH-SEED-/PW-VEH-/SYN- vehicles,
   * syn-/pw-/e2e fill-up keys, [synthetic] stock entries). golive:clean sets this; the
   * non-Sabha clean does not: a test vehicle is not non-Sabha just because it is a test.
   */
  markerRows: boolean;
}

export interface Plan {
  userIds: string[];
  municipalityIds: string[];
  companyIds: string[];
  stationIds: string[];
  officeIds: string[];
  deskIds: string[];
  vehicleIds: string[];
  ownerIds: string[];
  driverIds: string[];
  /** Fill-ups that no test marker explains. A non-empty list stops the run. */
  realFillUpCount: number;
  realFillUpSample: Array<{ id: string; stationId: string; occurredAt: Date; recordedById: string }>;
  fillUpWhere: Prisma.FillUpTransactionWhereInput;
  markerRows: boolean;
  counts: Record<string, number>;
}

const startsWithAny = <K extends string>(field: K, prefixes: readonly string[]) =>
  prefixes.map((p) => ({ [field]: { startsWith: p } }));

// Fill-ups a test marker explains: a test account recorded them, a seed or
// spec key names them, or they sit at a test station / municipality / company.
function testFillUpWhere(): Prisma.FillUpTransactionWhereInput {
  const stationIsTest: Prisma.StationWhereInput[] = [
    ...(startsWithAny('internalCode', [...TEST_STATION_CODE_PREFIXES, ...LEGACY_SEEDED_STATION_CODE_PREFIXES]) as Prisma.StationWhereInput[]),
    ...(startsWithAny('name', TEST_NAME_STARTS) as Prisma.StationWhereInput[]),
    { municipality: { is: { OR: startsWithAny('name', TEST_NAME_STARTS) as Prisma.MunicipalityWhereInput[] } } },
    { company: { is: { OR: startsWithAny('name', TEST_NAME_STARTS) as Prisma.CompanyWhereInput[] } } },
  ];
  return {
    OR: [
      {
        recordedBy: {
          is: {
            OR: [
              { username: { in: [...TEST_USERNAMES] } },
              ...(startsWithAny('username', TEST_USERNAME_PREFIXES) as Prisma.UserWhereInput[]),
            ],
          },
        },
      },
      ...(startsWithAny('idempotencyKey', TEST_FILLUP_KEY_PREFIXES) as Prisma.FillUpTransactionWhereInput[]),
      { station: { is: { OR: stationIsTest } } },
    ],
  };
}

export async function buildPlan(db: Db, roots: Roots): Promise<Plan> {
  const userIds = [...new Set(roots.userIds)];

  // Municipality -> its stations and offices.
  const [stationsInMunicipalities, officesInMunicipalities, stationsOfCompanies] = await Promise.all([
    db.station.findMany({ where: { municipalityId: { in: roots.municipalityIds } }, select: { id: true } }),
    db.registrationStation.findMany({ where: { municipalityId: { in: roots.municipalityIds } }, select: { id: true } }),
    db.station.findMany({ where: { companyId: { in: roots.companyIds } }, select: { id: true } }),
  ]);
  const stationIds = [
    ...new Set([...roots.stationIds, ...stationsInMunicipalities.map((s) => s.id), ...stationsOfCompanies.map((s) => s.id)]),
  ];
  const officeIds = [...new Set([...roots.officeIds, ...officesInMunicipalities.map((o) => o.id)])];

  const desks = await db.registrationDesk.findMany({ where: { registrationStationId: { in: officeIds } }, select: { id: true } });
  const deskIds = desks.map((d) => d.id);

  // Vehicles: registered at a planned office or by a planned user, or one the
  // seeds and Playwright name. With includeOrphans also those with neither a
  // registering user nor an office (they predate registration offices).
  const vehicleOr: Prisma.VehicleWhereInput[] = [
    { registeredAtRegistrationStationId: { in: officeIds } },
    { registeredById: { in: userIds } },
  ];
  if (roots.markerRows) vehicleOr.push(...(startsWithAny('internalCode', TEST_VEHICLE_CODE_PREFIXES) as Prisma.VehicleWhereInput[]));
  if (roots.includeOrphans) vehicleOr.push({ registeredById: null, registeredAtRegistrationStationId: null });
  const vehicles = await db.vehicle.findMany({ where: { OR: vehicleOr }, select: { id: true } });
  const vehicleIds = vehicles.map((v) => v.id);

  // Owners go when none of their vehicles stays (and, for orphans, when they
  // have no vehicle at all). Owners of a kept vehicle always stay.
  const ownerCandidates = await db.vehicleOwner.findMany({
    select: { id: true, vehicles: { select: { id: true } } },
  });
  const planVehicles = new Set(vehicleIds);
  const ownerIds = ownerCandidates
    .filter((o) =>
      o.vehicles.length === 0 ? roots.includeOrphans : o.vehicles.every((v) => planVehicles.has(v.id)),
    )
    .map((o) => o.id);
  const planOwners = new Set(ownerIds);
  // Only owners that were attached to a planned vehicle or are orphans are
  // candidates above; an owner with only kept vehicles is excluded by `every`.

  const fillUpWhere: Prisma.FillUpTransactionWhereInput = {
    OR: [
      { stationId: { in: stationIds } },
      { vehicleId: { in: vehicleIds } },
      { recordedById: { in: userIds } },
      { municipalityId: { in: roots.municipalityIds } },
      ...(roots.markerRows
        ? (startsWithAny('idempotencyKey', TEST_FILLUP_KEY_PREFIXES) as Prisma.FillUpTransactionWhereInput[])
        : []),
    ],
  };

  // Drivers (legacy): go when everything they are attached to goes.
  const driverCandidates = await db.driver.findMany({
    select: { id: true, vehicles: { select: { vehicleId: true } }, fillUps: { select: { id: true } } },
  });
  const planFillUps = new Set(
    (await db.fillUpTransaction.findMany({ where: fillUpWhere, select: { id: true } })).map((f) => f.id),
  );
  const driverIds = driverCandidates
    .filter((d) => {
      const links = d.vehicles.length + d.fillUps.length;
      if (links === 0) return roots.includeOrphans;
      return d.vehicles.every((v) => planVehicles.has(v.vehicleId)) && d.fillUps.every((f) => planFillUps.has(f.id));
    })
    .map((d) => d.id);

  // The guard: planned fill-ups no test marker explains.
  const realWhere: Prisma.FillUpTransactionWhereInput = {
    AND: [fillUpWhere, { NOT: testFillUpWhere() }],
  };
  const [realFillUpCount, realFillUpSample] = await Promise.all([
    db.fillUpTransaction.count({ where: realWhere }),
    db.fillUpTransaction.findMany({
      where: realWhere,
      take: 5,
      orderBy: { occurredAt: 'desc' },
      select: { id: true, stationId: true, occurredAt: true, recordedById: true },
    }),
  ]);

  const plan: Plan = {
    userIds,
    municipalityIds: roots.municipalityIds,
    companyIds: roots.companyIds,
    stationIds,
    officeIds,
    deskIds,
    vehicleIds,
    ownerIds: [...planOwners],
    driverIds,
    realFillUpCount,
    realFillUpSample,
    fillUpWhere,
    markerRows: roots.markerRows,
    counts: {},
  };
  plan.counts = await countPlan(db, plan);
  return plan;
}

// The where-clauses, one per table, in deletion order. Dry-run counts them and
// the real run deletes them, so the two cannot disagree.
interface Step {
  table: string;
  where: unknown;
  /** Rows that point at another row of the same table go first. */
  selfLinked?: unknown;
}

function steps(plan: Plan): Step[] {
  const { userIds, municipalityIds, stationIds, officeIds, deskIds, vehicleIds, ownerIds, driverIds } = plan;
  const fillUpIdFilter = { fillUpTransaction: plan.fillUpWhere };
  return [
    {
      table: 'Notification',
      where: { OR: [{ userId: { in: userIds } }, ...(plan.markerRows ? [{ dedupeKey: { startsWith: 'syn-' } }] : [])] },
    },
    { table: 'Exception', where: fillUpIdFilter },
    { table: 'FillUpTransaction', where: plan.fillUpWhere },
    {
      table: 'StandingException',
      where: { OR: [{ ownerId: { in: ownerIds } }, { vehicleId: { in: vehicleIds } }, { grantedById: { in: userIds } }] },
    },
    { table: 'VehicleChangeRequest', where: { OR: [{ vehicleId: { in: vehicleIds } }, { requestedById: { in: userIds } }] } },
    { table: 'OwnerChangeRequest', where: { OR: [{ ownerId: { in: ownerIds } }, { requestedById: { in: userIds } }] } },
    {
      table: 'VehicleCard',
      where: {
        OR: [{ vehicleId: { in: vehicleIds } }, { registrationStationId: { in: officeIds } }, { issuedById: { in: userIds } }],
      },
    },
    {
      table: 'CardPrint',
      where: {
        OR: [{ registrationStationId: { in: officeIds } }, { deskId: { in: deskIds } }, { printedById: { in: userIds } }],
      },
    },
    {
      table: 'DuplicateCatch',
      where: { OR: [{ registrationStationId: { in: officeIds } }, { userId: { in: userIds } }] },
    },
    {
      table: 'StockEntry',
      where: {
        OR: [
          { registrationStationId: { in: officeIds } },
          { deskId: { in: deskIds } },
          { createdById: { in: userIds } },
          ...(plan.markerRows ? [{ reason: { startsWith: SYNTHETIC_REASON_PREFIX } }] : []),
        ],
      },
      selfLinked: { correctsEntryId: { not: null } },
    },
    { table: 'VehiclePlateHistory', where: { vehicleId: { in: vehicleIds } } },
    { table: 'VehicleChassisHistory', where: { vehicleId: { in: vehicleIds } } },
    { table: 'VehicleBookletHistory', where: { vehicleId: { in: vehicleIds } } },
    { table: 'DriverVehicle', where: { OR: [{ vehicleId: { in: vehicleIds } }, { driverId: { in: driverIds } }] } },
    { table: 'Vehicle', where: { id: { in: vehicleIds } } },
    { table: 'Driver', where: { id: { in: driverIds } } },
    { table: 'VehicleOwner', where: { id: { in: ownerIds } } },
    {
      table: 'FuelStockEntry',
      where: {
        OR: [
          { stationId: { in: stationIds } },
          { createdById: { in: userIds } },
          ...(plan.markerRows
            ? [{ waybillNumber: { startsWith: SYNTHETIC_WAYBILL_PREFIX } }, { reason: { startsWith: SYNTHETIC_REASON_PREFIX } }]
            : []),
        ],
      },
      selfLinked: { correctsEntryId: { not: null } },
    },
    { table: 'StationFuelStorage', where: { OR: [{ stationId: { in: stationIds } }, { createdById: { in: userIds } }] } },
    { table: 'StationFuelAvailability', where: { stationId: { in: stationIds } } },
    { table: 'ExceptionFlag', where: { stationId: { in: stationIds } } },
    { table: 'UserStationScope', where: { OR: [{ stationId: { in: stationIds } }, { userId: { in: userIds } }] } },
    { table: 'Station', where: { id: { in: stationIds } } },
    {
      table: 'UserRegistrationStationScope',
      where: { OR: [{ registrationStationId: { in: officeIds } }, { userId: { in: userIds } }] },
    },
    { table: 'RegistrationDesk', where: { id: { in: deskIds } } },
    { table: 'RegistrationStation', where: { id: { in: officeIds } } },
    { table: 'UserMunicipalityScope', where: { OR: [{ municipalityId: { in: municipalityIds } }, { userId: { in: userIds } }] } },
    { table: 'MunicipalitySetting', where: { municipalityId: { in: municipalityIds } } },
    { table: 'SecurityAuthority', where: { municipalityId: { in: municipalityIds } } },
    { table: 'Municipality', where: { id: { in: municipalityIds } } },
    { table: 'Company', where: { id: { in: plan.companyIds } } },
    { table: 'UserPermission', where: { OR: [{ userId: { in: userIds } }, { grantedById: { in: userIds } }] } },
    { table: 'UserRole', where: { userId: { in: userIds } } },
    { table: 'RefreshToken', where: { userId: { in: userIds } } },
    { table: 'AuditLog', where: { userId: { in: userIds } } },
    { table: 'User', where: { id: { in: userIds } } },
  ];
}

const delegateName = (table: string) => table.charAt(0).toLowerCase() + table.slice(1);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const delegate = (db: Db, table: string): any => (db as any)[delegateName(table)];

async function countPlan(db: Db, plan: Plan): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const step of steps(plan)) {
    counts[step.table] = await delegate(db, step.table).count({ where: step.where });
  }
  return counts;
}

// The ONE place the insert-only guard is lifted. The two triggers
// (stock_entry_insert_only, fuel_stock_entry_insert_only) let a row DELETE
// through only inside a transaction that has set this value, and UPDATE and
// TRUNCATE are refused regardless. SET LOCAL ends with the transaction, so the
// guard is back for every other statement the moment the clean-up commits.
async function liftInsertOnlyGuard(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRaw`SELECT set_config('app.test_data_removal', 'on', true)`;
}

export async function executePlan(prisma: PrismaClient, plan: Plan): Promise<Record<string, number>> {
  const deleted: Record<string, number> = {};
  await prisma.$transaction(
    async (tx) => {
      await liftInsertOnlyGuard(tx);
      // Rows kept but pointing at something removed: break the link, keep the row.
      await tx.fillUpTransaction.updateMany({
        where: {
          AND: [
            { NOT: plan.fillUpWhere },
            { standingException: { is: { OR: [{ ownerId: { in: plan.ownerIds } }, { vehicleId: { in: plan.vehicleIds } }, { grantedById: { in: plan.userIds } }] } } },
          ],
        },
        data: { standingExceptionId: null, coveredRule: null },
      });
      await tx.vehicleChangeRequest.updateMany({
        where: { decidedById: { in: plan.userIds } },
        data: { decidedById: null },
      });
      await tx.ownerChangeRequest.updateMany({
        where: { decidedById: { in: plan.userIds } },
        data: { decidedById: null },
      });
      await tx.vehicleCard.updateMany({ where: { cancelledById: { in: plan.userIds } }, data: { cancelledById: null } });
      await tx.standingException.updateMany({ where: { revokedById: { in: plan.userIds } }, data: { revokedById: null } });
      await tx.station.updateMany({
        where: { securityAuthority: { is: { municipalityId: { in: plan.municipalityIds } } } },
        data: { securityAuthorityId: null },
      });

      for (const step of steps(plan)) {
        const d = delegate(tx, step.table);
        let n = 0;
        if (step.selfLinked) {
          n += (await d.deleteMany({ where: { AND: [step.where, step.selfLinked] } })).count;
        }
        n += (await d.deleteMany({ where: step.where })).count;
        deleted[step.table] = n;
      }
    },
    { timeout: 600_000, maxWait: 30_000 },
  );
  return deleted;
}

