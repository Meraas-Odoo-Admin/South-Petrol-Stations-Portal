import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { normalizePlate } from '@fuel-tracking/shared-types';
// Round 20: split out to rbac-catalog.ts (a side-effect-free module) so
// bootstrap-prod.ts can reuse this exact catalog without importing this
// file itself, which would also run this file's own `main()` (below,
// unconditional at module load) and seed demo data as a side effect.
import { PERMISSIONS, ROLE_PERMISSIONS, UNRESTRICTED_STATION_ACCESS_ROLES, SYSTEM_SETTINGS } from './rbac-catalog';
import { syncRbacCatalog } from './rbac-sync';
import { deleteAuditRows } from './audit-removal';

export { PERMISSIONS, ROLE_PERMISSIONS, UNRESTRICTED_STATION_ACCESS_ROLES, SYSTEM_SETTINGS };

const prisma = new PrismaClient();

// Phase 5C: this seed creates TEST FIXTURES ONLY - roles, settings, lookups,
// the test accounts, and a few synthetic stations/vehicles/owners. Sabha's real
// stations (names, supervisors, phone numbers) are NOT in code: they are
// loaded from the client's private CSV by
//   pnpm --filter @fuel-tracking/api stations:import data/private/sabha-stations.csv
// and removed non-Sabha rows by stations:clean-non-sabha. A test in
// src/golive/no-real-data.spec.ts keeps real names and numbers out of tracked files.
//
// The client's six companies are lookups, not personal data, and stay here.
const COMPANIES = [
  'ليبيا نفط',
  'الراحلة',
  'الشرارة الذهبية',
  'الطرق السريعة',
  'الثقة الدولية',
  'البريقة',
];

// Only سبها: it is the one municipality in scope (Phase 5C removed the rest).
const MUNICIPALITIES = ['سبها'];
const ROUTES = ['خط سبها'];
// One security authority per municipality (docs/OPEN_ITEMS.md #4, answered).
const SECURITY_AUTHORITIES = [{ name: 'مديرية أمن سبها', municipality: 'سبها' }];

// Registration pivot, phase 1: only سبها is live.
const LIVE_MUNICIPALITIES = new Set(['سبها']);

// Round 12: starting list for the new VehicleType lookup — admin/
// system_admin can add more from the admin panel, this just keeps the
// dropdown non-empty on first login.
const VEHICLE_TYPES = ['سيارة خاصة', 'نقل خفيف', 'نقل ثقيل', 'حافلة', 'دراجة نارية', 'معدة ثقيلة'];

// ── Drivers, Owners, Vehicles: seeded test fixtures ───────────────────
// Prior to this phase, seed.ts created ONLY companies/roles/stations/test
// users — a fresh reseed produced zero drivers/vehicles/owners, so there
// was nothing to actually record a fill-up against or browse. Still
// synthetic (not real client data — same caveat as the station list), but
// valid-format per the regex rules in
// apps/api/src/common/validators/libyan-formats.ts, and deliberately
// varied to exercise every path that has no create/edit UI yet to
// generate its own fixtures from: multi-entry plate history, a
// multi-driver association with exactly one primary, and both a
// with-history and a clean (zero-fill-up) vehicle/driver.
//
// Round 18: `Vehicle.model` is a single free-text field, and
// `VehicleBrandPicker`/`VehicleBrandLogo` treat it as the BRAND alone
// (exact-matched against `VEHICLE_BRANDS[].name`, which are English brand
// names like "Toyota") — there is no separate "specific model/trim"
// column in the schema. Every `model` value below was changed from an
// earlier round's Arabic "brand + trim" compound string (e.g. "تويوتا
// لاندكروزر") to the bare English brand name the real dropdown actually
// offers (e.g. "Toyota") — otherwise VehicleBrandLogo's exact-match never
// hits and every seeded vehicle silently falls back to the generic
// category glyph, exactly the gap the client asked to have fixed. This
// does lose the trim-level flavor (Land Cruiser vs. Hilux); adding that
// back would need a real schema column, not a seed-data change.
const SEED_OWNERS = [
  { key: 'O1', identityType: 'NATIONAL_ID', identityNumber: '119700000011', fullName: 'عبدالسلام محمد الزنتاني', phone: '091-1000011' },
  { key: 'O2', identityType: 'NATIONAL_ID', identityNumber: '219750000012', fullName: 'فاطمة علي المصراتي', phone: '092-1000012' },
  // Round 17: additional owners named for the actual region the newly-
  // seeded real stations sit in (Fezzan — سبها/أوباري/مرزق/القطرون/غات),
  // drawing on the tribal/nisba surnames genuinely common there rather
  // than reusing the same two coastal-city names for every fixture.
  { key: 'O3', identityType: 'NATIONAL_ID', identityNumber: '219680000013', fullName: 'عائشة سالم أولاد سليمان', phone: '091-3450013' },
  { key: 'O4', identityType: 'NATIONAL_ID', identityNumber: '118750000014', fullName: 'إبراهيم مفتاح المقرحي', phone: '092-5670014' },
  { key: 'O5', identityType: 'NATIONAL_ID', identityNumber: '219820000015', fullName: 'نورية خليفة التارقي', phone: '092-7890015' },
  { key: 'O6', identityType: 'NATIONAL_ID', identityNumber: '118900000016', fullName: 'مادي كوكو غبدي', phone: '091-4560016' },
  { key: 'O7', identityType: 'NATIONAL_ID', identityNumber: '117650000017', fullName: 'الصادق عمر الحساوي', phone: '092-3780017' },
  { key: 'O8', identityType: 'NATIONAL_ID', identityNumber: '219770000018', fullName: 'زينب محمد الرقيعي', phone: '091-2340018' },
  { key: 'O9', identityType: 'NATIONAL_ID', identityNumber: '119600000019', fullName: 'مفتاح سالم القذاذفة', phone: '092-6450019' },
  { key: 'O10', identityType: 'NATIONAL_ID', identityNumber: '219850000020', fullName: 'حواء إبراهيم أنت عمر', phone: '091-3670020' },
  { key: 'O11', identityType: 'ADMINISTRATIVE_ID', identityNumber: '5187000021', fullName: 'عبدالناصر خليفة الفزاني', phone: '092-5890021' },
  { key: 'O12', identityType: 'NATIONAL_ID', identityNumber: '219730000022', fullName: 'سعاد علي المجابرة', phone: '091-4230022' },
] as const;

const SEED_DRIVERS = [
  { key: 'D1', identityType: 'NATIONAL_ID', identityNumber: '119850000001', fullName: 'محمد عبدالسلام الزنتاني', phone: '091-2000001' },
  { key: 'D2', identityType: 'NATIONAL_ID', identityNumber: '219900000002', fullName: 'خديجة إبراهيم المصراتي', phone: '092-2000002' },
  { key: 'D3', identityType: 'NATIONAL_ID', identityNumber: '117800000003', fullName: 'عمر يوسف الفزاني', phone: '093-2000003' },
  { key: 'D4', identityType: 'ADMINISTRATIVE_ID', identityNumber: '5199500004', fullName: 'يوسف الطاهر الطارقي', phone: '094-2000004' },
  { key: 'D5', identityType: 'NATIONAL_ID', identityNumber: '118200000005', fullName: 'سالم أحمد البرعصي', phone: '095-2000005' },
  { key: 'D6', identityType: 'NATIONAL_ID', identityNumber: '218800000006', fullName: 'مريم خالد الشريف', phone: '096-2000006' },
] as const;

// stationKey 'A' = STN-TEST-0001 (Raheela), 'B' = STN-TEST-0002 (Sharara) —
// resolved against stationA/stationB further down, once they exist.
const SEED_VEHICLES = [
  {
    key: 'V1',
    internalCode: 'VEH-SEED-001',
    currentPlate: '5-1000002',
    chassisNumber: 'SEEDV000000000001',
    vehicleType: 'سيارة خاصة',
    model: 'Toyota',
    color: 'أبيض',
    manufactureYear: 2019,
    usageType: 'PRIVATE',
    ownerKey: 'O1',
    // 2 rows: an older, closed plate, then the current one — exercises the
    // plate-history UI path, which has no create/edit form to generate
    // this from otherwise.
    plateHistory: ['5-1000001', '5-1000002'],
    // 2 drivers, exactly one primary — same reasoning, no association UI
    // exists yet either.
    drivers: [
      { key: 'D1', isPrimary: true },
      { key: 'D2', isPrimary: false },
    ],
    // Recent (yesterday) — a fresh test fill-up against V1 today should
    // trip VEHICLE_GAP_TOO_SHORT, so the rule-violation/exception flow is
    // actually reachable without the tester needing to record two fill-ups
    // themselves first.
    fillUps: [{ daysAgo: 1, stationKey: 'A', fuelType: 'PETROL_95', quantityLiters: 35 }],
  },
  {
    key: 'V2',
    internalCode: 'VEH-SEED-002',
    currentPlate: '8-2000001',
    chassisNumber: 'SEEDV000000000002',
    vehicleType: 'سيارة خاصة',
    model: 'Kia',
    color: 'رمادي',
    manufactureYear: 2021,
    usageType: 'PRIVATE',
    ownerKey: 'O2',
    drivers: [{ key: 'D3', isPrimary: true }],
    // Three fill-ups already inside the current rolling 7-day window,
    // spaced exactly min_gap_days apart from each other and from "now" —
    // the rule engine's weekly-cap check trips only once the EXISTING
    // count already reaches fillup.max_per_week (3), so a fresh test
    // fill-up (which would be the 4th) passes the gap check but hits
    // VEHICLE_WEEKLY_CAP_REACHED. Otherwise testing the weekly cap means
    // waiting a real week. V3/V5/V6 stay at zero fill-ups for the "first
    // fill-up ever" / clean path.
    fillUps: [
      { daysAgo: 6, stationKey: 'A', fuelType: 'PETROL_95', quantityLiters: 30 },
      { daysAgo: 4, stationKey: 'A', fuelType: 'PETROL_95', quantityLiters: 28 },
      { daysAgo: 2, stationKey: 'A', fuelType: 'PETROL_95', quantityLiters: 32 },
    ],
  },
  {
    key: 'V3',
    internalCode: 'VEH-SEED-003',
    currentPlate: '15-3000001',
    chassisNumber: 'SEEDV000000000003',
    vehicleType: 'نقل خفيف',
    model: 'Toyota',
    color: 'أزرق',
    manufactureYear: 2017,
    usageType: 'COMMERCIAL',
    ownerKey: null,
    drivers: [{ key: 'D4', isPrimary: true }],
    fillUps: [],
  },
  {
    key: 'V4',
    internalCode: 'VEH-SEED-004',
    currentPlate: '5-4000001',
    chassisNumber: 'SEEDV000000000004',
    vehicleType: 'سيارة خاصة',
    model: 'Hyundai',
    color: 'أسود',
    manufactureYear: 2020,
    usageType: 'PRIVATE',
    ownerKey: 'O1',
    drivers: [{ key: 'D5', isPrimary: true }],
    // Old enough (5 days, past the 2-day gap) to be browsable history
    // without blocking a fresh test fill-up against the same vehicle.
    fillUps: [{ daysAgo: 5, stationKey: 'B', fuelType: 'DIESEL', quantityLiters: 50 }],
  },
  {
    key: 'V5',
    internalCode: 'VEH-SEED-005',
    currentPlate: '8-5000001',
    chassisNumber: null, // deliberately unset — exercises the change-request first-time-set path
    vehicleType: 'سيارة خاصة',
    model: 'Toyota',
    color: 'أبيض',
    manufactureYear: 2022,
    usageType: 'GOVERNMENT',
    ownerKey: null,
    drivers: [], // no driver assigned at all — a real, if unusual, state
    fillUps: [],
  },
  {
    key: 'V6',
    internalCode: 'VEH-SEED-006',
    currentPlate: '15-6000001',
    chassisNumber: 'SEEDV000000000006',
    vehicleType: 'سيارة خاصة',
    model: 'Nissan',
    color: 'فضي',
    manufactureYear: 2018,
    usageType: 'PRIVATE',
    ownerKey: 'O2',
    drivers: [{ key: 'D6', isPrimary: true }],
    fillUps: [],
  },
  // Round 17: additional vehicles recording fill-up history at the newly-
  // seeded real stations (see stationsByKey below) instead of only the
  // two synthetic ones — no driver association on any of these (round 6
  // dropped driver identity from the active fill-up flow; Driver/
  // DriverVehicle are kept only for historical rows the original 6
  // vehicles already exercise).
  {
    key: 'V7',
    internalCode: 'VEH-SEED-007',
    currentPlate: '21-1234567',
    chassisNumber: 'SEEDV000000000007',
    vehicleType: 'نقل خفيف',
    model: 'Toyota',
    color: 'أبيض',
    manufactureYear: 2020,
    usageType: 'PRIVATE',
    ownerKey: 'O3',
    drivers: [],
    fillUps: [{ daysAgo: 6, stationKey: 'THIQA', fuelType: 'PETROL_95', quantityLiters: 40 }],
  },
  {
    key: 'V8',
    internalCode: 'VEH-SEED-008',
    currentPlate: '5-987654',
    chassisNumber: 'SEEDV000000000008',
    vehicleType: 'سيارة خاصة',
    model: 'Hyundai',
    color: 'فضي',
    manufactureYear: 2022,
    usageType: 'PRIVATE',
    ownerKey: 'O4',
    drivers: [],
    fillUps: [{ daysAgo: 3, stationKey: 'RAWWAD', fuelType: 'PETROL_95', quantityLiters: 38 }],
  },
  {
    key: 'V9',
    internalCode: 'VEH-SEED-009',
    currentPlate: '9-456123',
    chassisNumber: 'SEEDV000000000009',
    vehicleType: 'سيارة خاصة',
    model: 'Kia',
    color: 'أسود',
    manufactureYear: 2021,
    usageType: 'PRIVATE',
    ownerKey: 'O5',
    drivers: [],
    fillUps: [],
  },
  {
    key: 'V10',
    internalCode: 'VEH-SEED-010',
    currentPlate: '31-778899',
    chassisNumber: 'SEEDV000000000010',
    vehicleType: 'سيارة خاصة',
    model: 'Nissan',
    color: 'أبيض',
    manufactureYear: 2019,
    usageType: 'PRIVATE',
    ownerKey: 'O6',
    drivers: [],
    fillUps: [{ daysAgo: 8, stationKey: 'MURZUQ', fuelType: 'PETROL_95', quantityLiters: 45 }],
  },
  {
    key: 'V11',
    internalCode: 'VEH-SEED-011',
    currentPlate: '5-334455',
    chassisNumber: 'SEEDV000000000011',
    vehicleType: 'سيارة خاصة',
    model: 'Toyota',
    color: 'رمادي',
    manufactureYear: 2023,
    usageType: 'GOVERNMENT',
    ownerKey: 'O7',
    drivers: [],
    fillUps: [
      { daysAgo: 10, stationKey: 'KATIB', fuelType: 'PETROL_95', quantityLiters: 42 },
      { daysAgo: 5, stationKey: 'KATIB', fuelType: 'PETROL_95', quantityLiters: 40 },
    ],
  },
  {
    key: 'V12',
    internalCode: 'VEH-SEED-012',
    currentPlate: '8-112233',
    chassisNumber: 'SEEDV000000000012',
    vehicleType: 'سيارة خاصة',
    model: 'Mercedes-Benz',
    color: 'أسود',
    manufactureYear: 2018,
    usageType: 'PRIVATE',
    ownerKey: 'O8',
    drivers: [],
    fillUps: [],
  },
  {
    key: 'V13',
    internalCode: 'VEH-SEED-013',
    currentPlate: '15-665544',
    chassisNumber: 'SEEDV000000000013',
    vehicleType: 'سيارة خاصة',
    model: 'Suzuki',
    color: 'أزرق',
    manufactureYear: 2020,
    usageType: 'PRIVATE',
    ownerKey: 'O9',
    drivers: [],
    fillUps: [{ daysAgo: 4, stationKey: 'AFIYA', fuelType: 'PETROL_95', quantityLiters: 36 }],
  },
  {
    key: 'V14',
    internalCode: 'VEH-SEED-014',
    currentPlate: '21-998877',
    chassisNumber: 'SEEDV000000000014',
    vehicleType: 'نقل ثقيل',
    model: 'Isuzu',
    color: 'أبيض',
    manufactureYear: 2017,
    usageType: 'COMMERCIAL',
    ownerKey: 'O10',
    drivers: [],
    fillUps: [{ daysAgo: 7, stationKey: 'NAMAA', fuelType: 'DIESEL', quantityLiters: 60 }],
  },
  {
    key: 'V15',
    internalCode: 'VEH-SEED-015',
    currentPlate: '9-223344',
    chassisNumber: 'SEEDV000000000015',
    vehicleType: 'سيارة خاصة',
    model: 'Peugeot',
    color: 'فضي',
    manufactureYear: 2021,
    usageType: 'PRIVATE',
    ownerKey: 'O11',
    drivers: [],
    fillUps: [],
  },
  {
    key: 'V16',
    internalCode: 'VEH-SEED-016',
    currentPlate: '5-556677',
    chassisNumber: 'SEEDV000000000016',
    vehicleType: 'سيارة خاصة',
    model: 'Kia',
    color: 'أحمر',
    manufactureYear: 2019,
    usageType: 'PRIVATE',
    ownerKey: 'O12',
    drivers: [],
    fillUps: [{ daysAgo: 6, stationKey: 'B', fuelType: 'PETROL_95', quantityLiters: 25 }],
  },
  {
    key: 'V17',
    internalCode: 'VEH-SEED-017',
    currentPlate: '31-889900',
    chassisNumber: 'SEEDV000000000017',
    vehicleType: 'سيارة خاصة',
    model: 'Mitsubishi',
    color: 'أسود',
    manufactureYear: 2016,
    usageType: 'PRIVATE',
    // Same owner as V7 — a real, common case (one owner, multiple
    // vehicles), which is exactly what the per-owner aggregate rule-engine
    // checks (docs/DESIGN_owner_based_fillups.md) exist to catch.
    ownerKey: 'O3',
    drivers: [],
    fillUps: [{ daysAgo: 2, stationKey: 'MURZUQ', fuelType: 'PETROL_95', quantityLiters: 44 }],
  },
  {
    key: 'V18',
    internalCode: 'VEH-SEED-018',
    currentPlate: '5-778899',
    chassisNumber: 'SEEDV000000000018',
    vehicleType: 'سيارة خاصة',
    model: 'Hyundai',
    color: 'أبيض',
    manufactureYear: 2022,
    usageType: 'PRIVATE',
    ownerKey: null,
    drivers: [],
    fillUps: [],
  },
] as const;

// Synthetic placeholders so the exception approve flow has something to
// test against — NOT the client-confirmed categories from docs/OPEN_ITEMS.md
// #12/#13 (transit-traveler, medical), which are still pending.
const EXCEPTION_TYPES = [
  {
    key: 'OTHER',
    name: 'Other (synthetic placeholder — not a real client-confirmed category)',
    requiresProof: true,
    // Phase 6: a default daily limit per station, editable in «القوائم». A type
    // with NO limit (null) means no limit, never zero.
    dailyLimitPerStation: 10,
  },
  {
    key: 'OTHER_NO_PROOF',
    name: 'Other, no proof required (synthetic placeholder — not a real client-confirmed category)',
    requiresProof: false,
    dailyLimitPerStation: 10,
  },
];

// apps/web/e2e/global-setup.ts creates real data through the real HTTP API
// on every Playwright run (company/station/driver/vehicle/fill-up, always
// prefixed "PW ") and never deletes it — there are no DELETE endpoints for
// any of these, by design (CLAUDE.md). Left alone, this accumulates in a
// dev DB and is exactly what a manual tester runs into when browsing the
// driver/vehicle lists. Seed-time cleanup via direct Prisma access (not
// the API) is the only place that can safely remove it, in FK-safe order.
// Wrapped so a failure here (e.g. an interrupted Playwright run leaving
// yet another shape of partial data) never blocks the rest of the seed.
async function cleanupPlaywrightFixtures(): Promise<void> {
  try {
    // Registration pivot, phase 2: global-setup also creates a PW
    // registration desk, vehicles registered there (some auto-coded V-…),
    // more owners, and run-specific accounts (pw_sup_/pw_admin_/pw_reg_).
    const pwRegistrationStations = await prisma.registrationStation.findMany({
      where: { name: { startsWith: 'PW Registration Desk ' } },
    });
    const registrationStationIds = pwRegistrationStations.map((s) => s.id);
    const [pwVehicles, pwOwners, pwStations, pwCompanies, pwUsers] = await Promise.all([
      prisma.vehicle.findMany({
        where: {
          OR: [
            { internalCode: { startsWith: 'PW-VEH-' } },
            { registeredAtRegistrationStationId: { in: registrationStationIds } },
          ],
        },
      }),
      prisma.vehicleOwner.findMany({
        where: {
          OR: ['PW Test Owner ', 'PW Clean Owner ', 'PW Registered Owner ', 'PW Wizard Owner ', 'PW Scan Owner '].map((prefix) => ({
            fullName: { startsWith: prefix },
          })),
        },
      }),
      prisma.station.findMany({ where: { internalCode: { startsWith: 'PW-STN-' } } }),
      prisma.company.findMany({ where: { name: { startsWith: 'PW Test Co ' } } }),
      prisma.user.findMany({
        where: {
          OR: ['pw_needschange_', 'pw_sup_', 'pw_admin_', 'pw_reg_'].map((prefix) => ({ username: { startsWith: prefix } })),
        },
      }),
    ]);
    const vehicleIds = pwVehicles.map((v) => v.id);
    const ownerIds = pwOwners.map((o) => o.id);
    const stationIds = pwStations.map((s) => s.id);
    const companyIds = pwCompanies.map((c) => c.id);
    const userIds = pwUsers.map((u) => u.id);

    if (
      !vehicleIds.length &&
      !ownerIds.length &&
      !stationIds.length &&
      !companyIds.length &&
      !userIds.length &&
      !registrationStationIds.length
    ) {
      return;
    }

    const fillUpFilter = {
      OR: [
        { vehicleId: { in: vehicleIds } },
        { stationId: { in: stationIds } },
        { recordedById: { in: userIds } },
      ],
    };
    await prisma.exception.deleteMany({ where: { fillUpTransaction: fillUpFilter } });
    await prisma.fillUpTransaction.deleteMany({ where: fillUpFilter });
    await prisma.vehiclePlateHistory.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.vehicleChassisHistory.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.vehicleBookletHistory.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.vehicleChangeRequest.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    // Phase 3: cards reference vehicles and desks; desks reference stations.
    await prisma.vehicleCard.deleteMany({
      where: { OR: [{ vehicleId: { in: vehicleIds } }, { registrationStationId: { in: registrationStationIds } }] },
    });
    await prisma.vehicle.deleteMany({ where: { id: { in: vehicleIds } } });
    await prisma.vehicleOwner.deleteMany({ where: { id: { in: ownerIds } } });
    await prisma.userStationScope.deleteMany({
      where: { OR: [{ stationId: { in: stationIds } }, { userId: { in: userIds } }] },
    });
    await prisma.userRegistrationStationScope.deleteMany({
      where: { OR: [{ registrationStationId: { in: registrationStationIds } }, { userId: { in: userIds } }] },
    });
    await prisma.station.deleteMany({ where: { id: { in: stationIds } } });
    // Phase 4c: prints and duplicate catches point at these desks, offices and users.
    await prisma.cardPrint.deleteMany({
      where: { OR: [{ registrationStationId: { in: registrationStationIds } }, { printedById: { in: userIds } }] },
    });
    await prisma.duplicateCatch.deleteMany({
      where: { OR: [{ registrationStationId: { in: registrationStationIds } }, { userId: { in: userIds } }] },
    });
    await prisma.registrationDesk.deleteMany({ where: { registrationStationId: { in: registrationStationIds } } });
    await prisma.registrationStation.deleteMany({ where: { id: { in: registrationStationIds } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userPermission.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await deleteAuditRows(prisma, { where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });

    console.log(
      `  🧹 Cleaned up Playwright e2e fixtures: ${vehicleIds.length} vehicles, ${ownerIds.length} owners, ${stationIds.length} stations, ${registrationStationIds.length} registration stations, ${companyIds.length} companies, ${userIds.length} throwaway users.`,
    );
  } catch (error) {
    console.warn('  ⚠ Playwright fixture cleanup failed (non-fatal, continuing seed):', error);
  }
}

async function main() {
  await cleanupPlaywrightFixtures();

  // ── Companies ──────────────────────────────────────────────────────
  const companiesByName = new Map<string, { id: string }>();
  for (const name of COMPANIES) {
    const company = await prisma.company.upsert({
      where: { name },
      create: { name },
      update: {},
    });
    companiesByName.set(name, company);
  }

  // ── Municipalities, routes, security authorities ────────────────────
  const municipalitiesByName = new Map<string, { id: string }>();
  for (const name of MUNICIPALITIES) {
    const status = LIVE_MUNICIPALITIES.has(name) ? ('LIVE' as const) : undefined;
    // Phase 3: card-number prefix, for the live municipality only.
    const code = name === 'سبها' ? 'SBH' : undefined;
    const municipality = await prisma.municipality.upsert({
      where: { name },
      create: { name, status, code },
      update: { ...(status ? { status } : {}), ...(code ? { code } : {}) },
    });
    municipalitiesByName.set(name, municipality);
  }

  const routesByName = new Map<string, { id: string }>();
  for (const name of ROUTES) {
    const route = await prisma.route.upsert({ where: { name }, create: { name }, update: {} });
    routesByName.set(name, route);
  }

  // Each authority is tied to its one municipality; stations get their
  // authority from there (no per-station field any more).
  for (const authority of SECURITY_AUTHORITIES) {
    const municipalityId = municipalitiesByName.get(authority.municipality)!.id;
    await prisma.securityAuthority.upsert({
      where: { name: authority.name },
      create: { name: authority.name, municipalityId },
      update: { municipalityId },
    });
  }

  const vehicleTypesByName = new Map<string, { id: string }>();
  for (const name of VEHICLE_TYPES) {
    const vehicleType = await prisma.vehicleType.upsert({ where: { name }, create: { name }, update: {} });
    vehicleTypesByName.set(name, vehicleType);
  }

  // ── Permissions & Roles ────────────────────────────────────────────
  // Adds what's missing AND removes role grants rbac-catalog.ts no longer
  // lists (see rbac-sync.ts) — so a permission taken off a role in the
  // catalog is actually taken off in this database too.
  const { rolesByName } = await syncRbacCatalog(prisma);

  // ── System settings ───────────────────────────────────────────────
  for (const setting of SYSTEM_SETTINGS) {
    // Phase 5A: a rule switch the super admin has set is never put back to
    // its default by a re-seed - only its description is refreshed.
    const isRuleSwitch = setting.key.startsWith('fillup.rule.');
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      create: setting,
      update: isRuleSwitch
        ? { description: setting.description }
        : { value: setting.value, description: setting.description },
    });
  }

  // ── Exception types ────────────────────────────────────────────────
  for (const exceptionType of EXCEPTION_TYPES) {
    await prisma.exceptionType.upsert({
      where: { key: exceptionType.key },
      create: exceptionType,
      update: { name: exceptionType.name, requiresProof: exceptionType.requiresProof },
    });
  }

  // ── Stations ───────────────────────────────────────────────────────
  // Synthetic fixtures — enough to exercise RBAC/scoping and prove the
  // schema, not real data (the real list is imported, see the top of this file).
  // Two stations deliberately share stationNumber "1" across different
  // companies, demonstrating exactly the case the composite unique key
  // (companyId, stationNumber) exists to allow.
  const raheela = companiesByName.get('الراحلة')!;
  const sharara = companiesByName.get('الشرارة الذهبية')!;
  const sabhaMunicipalityId = municipalitiesByName.get('سبها')!.id;

  const stationA = await prisma.station.upsert({
    where: { internalCode: 'STN-TEST-0001' },
    create: {
      internalCode: 'STN-TEST-0001',
      stationNumber: '1',
      name: 'Test Station (Raheela) — synthetic fixture',
      companyId: raheela.id,
      municipalityId: sabhaMunicipalityId,
    },
    // Placed in سبها (live) so the scoped test accounts (employee1,
    // supervisor1) can record fill-ups here — also on an existing DB.
    update: { municipalityId: sabhaMunicipalityId },
  });

  const stationB = await prisma.station.upsert({
    where: { internalCode: 'STN-TEST-0002' },
    create: {
      internalCode: 'STN-TEST-0002',
      stationNumber: '1', // same number as stationA, different company — proves the composite key
      name: 'Test Station (Sharara) — synthetic fixture',
      companyId: sharara.id,
      municipalityId: sabhaMunicipalityId,
    },
    update: { municipalityId: sabhaMunicipalityId },
  });

  // ── Registration station (registration pivot, phase 2) ─────────────
  // A synthetic fixture in live سبها, like STN-TEST-0001 — the real list of
  // police-station registration desks is for admins to enter.
  const registrationStation = await prisma.registrationStation.upsert({
    where: { internalCode: 'REG-TEST-0001' },
    create: {
      internalCode: 'REG-TEST-0001',
      name: 'مكتب تسجيل تجريبي — synthetic fixture',
      municipalityId: sabhaMunicipalityId,
      address: 'سبها — عنوان تجريبي',
      workingHours: 'السبت–الخميس 8:00–14:00',
    },
    update: {},
  });

  // Phase 3: one desk (with its card printer) at the seeded station.
  await prisma.registrationDesk.upsert({
    where: { registrationStationId_name: { registrationStationId: registrationStation.id, name: 'مكتب 1' } },
    create: { registrationStationId: registrationStation.id, name: 'مكتب 1', printerModel: 'Test printer' },
    update: {},
  });

  // ── Test users, one per role ───────────────────────────────────────
  const testUsers = [
    { username: 'employee1', fullName: 'Test Station Employee', role: 'station_employee' },
    { username: 'supervisor1', fullName: 'Test Station Supervisor', role: 'station_supervisor' },
    { username: 'registration1', fullName: 'Test Registration Employee', role: 'registration_employee' },
    // Phase 5A: the office manager (مدير مكتب التسجيل). The username and the
    // internal role key (registration_supervisor) are unchanged so existing
    // tests and the saved logins keep working; only the Arabic label changed.
    { username: 'regsupervisor1', fullName: 'Test Registration Office Manager', role: 'registration_supervisor' },
    // Phase 5A: two municipality managers (مدير البلدية), both for سبها.
    { username: 'admin1', fullName: 'Test Municipality Manager 1', role: 'directorate_admin' },
    { username: 'admin2', fullName: 'Test Municipality Manager 2', role: 'directorate_admin' },
    { username: 'sysadmin1', fullName: 'Test System Admin', role: 'system_admin' },
  ];

  const usersByUsername = new Map<string, { id: string }>();
  for (const spec of testUsers) {
    const passwordHash = await argon2.hash('ChangeMe123!');
    const user = await prisma.user.upsert({
      where: { username: spec.username },
      create: {
        username: spec.username,
        fullName: spec.fullName,
        passwordHash,
        mustChangePassword: true,
      },
      update: {},
    });
    usersByUsername.set(spec.username, user);

    const role = rolesByName.get(spec.role)!;
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      create: { userId: user.id, roleId: role.id },
      update: {},
    });

    if (spec.username === 'employee1') {
      // Scoped to stationA only — the fixture the boundary e2e test relies on.
      await prisma.userStationScope.upsert({
        where: { userId_stationId: { userId: user.id, stationId: stationA.id } },
        create: { userId: user.id, stationId: stationA.id },
        update: {},
      });
    }

    if (spec.role === 'directorate_admin') {
      // Confined to سبها: every station, office, person and report of the
      // municipality, and nothing outside it.
      await prisma.userMunicipalityScope.upsert({
        where: { userId_municipalityId: { userId: user.id, municipalityId: sabhaMunicipalityId } },
        create: { userId: user.id, municipalityId: sabhaMunicipalityId },
        update: {},
      });
    }

    if (spec.username === 'registration1' || spec.username === 'regsupervisor1') {
      // Scoped to the one seeded registration station.
      await prisma.userRegistrationStationScope.upsert({
        where: {
          userId_registrationStationId: { userId: user.id, registrationStationId: registrationStation.id },
        },
        create: { userId: user.id, registrationStationId: registrationStation.id },
        update: {},
      });
    }

    if (spec.username === 'supervisor1') {
      // Scoped to stationA only — supervisors are station-scoped by role
      // design (no reports:view_all_stations), so the test account needs a
      // station to supervise or every station-scoped screen shows nothing.
      await prisma.userStationScope.upsert({
        where: { userId_stationId: { userId: user.id, stationId: stationA.id } },
        create: { userId: user.id, stationId: stationA.id },
        update: {},
      });
    }
  }

  // ── Owners ────────────────────────────────────────────────────────
  // Round 6: VehicleOwner now has (identityType, identityNumber) unique,
  // same shape as Driver — a real upsert instead of the old manual
  // find-then-create.
  const ownersByKey = new Map<string, { id: string }>();
  for (const spec of SEED_OWNERS) {
    const owner = await prisma.vehicleOwner.upsert({
      where: { identityType_identityNumber: { identityType: spec.identityType, identityNumber: spec.identityNumber } },
      create: {
        identityType: spec.identityType,
        identityNumber: spec.identityNumber,
        fullName: spec.fullName,
        phone: spec.phone,
      },
      update: {},
    });
    ownersByKey.set(spec.key, owner);
  }

  // ── Drivers ───────────────────────────────────────────────────────
  const driversByKey = new Map<string, { id: string }>();
  for (const spec of SEED_DRIVERS) {
    const driver = await prisma.driver.upsert({
      where: { identityType_identityNumber: { identityType: spec.identityType, identityNumber: spec.identityNumber } },
      create: {
        identityType: spec.identityType,
        identityNumber: spec.identityNumber,
        fullName: spec.fullName,
        phone: spec.phone,
      },
      update: {},
    });
    driversByKey.set(spec.key, driver);
  }

  // ── Vehicles, plate history, driver associations, fill-up history ──
  // Vehicle fixtures record their fill-up history at the two synthetic
  // stations; the rule engine counts per vehicle and owner, so which test
  // station a fixture fill-up sits at does not matter.
  const stationsByKey = new Map([
    ['A', stationA],
    ['B', stationB],
    ['THIQA', stationA],
    ['RAWWAD', stationB],
    ['MURZUQ', stationA],
    ['KATIB', stationB],
    ['AFIYA', stationA],
    ['NAMAA', stationB],
  ]);
  const recordedBy = usersByUsername.get('sysadmin1')!;

  for (const spec of SEED_VEHICLES) {
    const vehicle = await prisma.vehicle.upsert({
      where: { internalCode: spec.internalCode },
      create: {
        internalCode: spec.internalCode,
        currentPlate: spec.currentPlate,
        normalizedPlate: normalizePlate(spec.currentPlate),
        chassisNumber: spec.chassisNumber,
        vehicleTypeId: vehicleTypesByName.get(spec.vehicleType)?.id,
        // Phase 5A: `model` in the fixtures is the manufacturer, which now
        // lives in `make`; the vehicle fuel type is petrol unless stated.
        make: spec.model,
        fuelType: 'PETROL',
        color: spec.color,
        manufactureYear: spec.manufactureYear,
        usageType: spec.usageType,
        ownerId: spec.ownerKey ? ownersByKey.get(spec.ownerKey)!.id : null,
      },
      update: {},
    });

    // Plate history: V1 gets 2 rows (an older closed one, then the current
    // open one) to exercise the plate-history UI path — every other
    // vehicle gets the single current-plate row VehiclesService.create
    // would normally seed, so plate-change still has something to close.
    const plateHistoryEntries = 'plateHistory' in spec ? spec.plateHistory : [spec.currentPlate];
    for (let i = 0; i < plateHistoryEntries.length; i++) {
      const plate = plateHistoryEntries[i]!;
      const isOpen = i === plateHistoryEntries.length - 1;
      const existingRow = await prisma.vehiclePlateHistory.findFirst({ where: { vehicleId: vehicle.id, plate } });
      if (existingRow) continue;
      const stepsFromOpen = plateHistoryEntries.length - 1 - i;
      await prisma.vehiclePlateHistory.create({
        data: {
          vehicleId: vehicle.id,
          plate,
          validFrom: new Date(Date.now() - (stepsFromOpen + 1) * 30 * 24 * 60 * 60 * 1000),
          validTo: isOpen ? null : new Date(Date.now() - stepsFromOpen * 30 * 24 * 60 * 60 * 1000),
        },
      });
    }

    // Driver associations — V1 gets 2, exactly one primary.
    for (const driverSpec of spec.drivers) {
      const driver = driversByKey.get(driverSpec.key)!;
      await prisma.driverVehicle.upsert({
        where: { driverId_vehicleId: { driverId: driver.id, vehicleId: vehicle.id } },
        create: { driverId: driver.id, vehicleId: vehicle.id, isPrimary: driverSpec.isPrimary },
        update: { isPrimary: driverSpec.isPrimary },
      });
    }

    // Fill-up history — some vehicles get none at all (the "clean first
    // fill-up" path), some get one recent enough to trip the gap rule on a
    // fresh test submission, some get one old enough to be browsable
    // history without blocking a new one.
    for (const [index, fillUpSpec] of spec.fillUps.entries()) {
      const idempotencyKey = `SEED-FILLUP-${spec.key}-${index}`;
      // Round 6: fill-ups no longer require a driver — rule evaluation and
      // history are keyed to the vehicle/owner instead (see
      // docs/DESIGN_owner_based_fillups.md). driverId is still written when
      // a historical driver association exists, purely as legacy
      // attribution, never as a requirement to seed the fill-up at all.
      const primaryDriverKey = spec.drivers[0]?.key;
      const driver = primaryDriverKey ? driversByKey.get(primaryDriverKey) : undefined;
      const station = stationsByKey.get(fillUpSpec.stationKey)!;
      const occurredAt = new Date(Date.now() - fillUpSpec.daysAgo * 24 * 60 * 60 * 1000);

      await prisma.fillUpTransaction.upsert({
        where: { idempotencyKey },
        create: {
          vehicleId: vehicle.id,
          driverId: driver?.id,
          stationId: station.id,
          // Stamped like FillUpsService does: the station's municipality
          // at the time of the fill-up.
          municipalityId: station.municipalityId,
          fuelType: fillUpSpec.fuelType,
          quantityLiters: fillUpSpec.quantityLiters,
          occurredAt,
          recordedById: recordedBy.id,
          isException: false,
          identifiedBy: 'TYPED_REGISTERED',
          idempotencyKey,
        },
        update: {},
      });
    }
  }

  console.log('Seed complete.');
  console.log(`  Companies: ${COMPANIES.length}`);
  console.log('  Stations: 2 synthetic test fixtures (real stations come from stations:import)');
  console.log(`  Vehicles: ${SEED_VEHICLES.length}, Owners: ${SEED_OWNERS.length}`);
  console.log(`  Roles: ${Object.keys(ROLE_PERMISSIONS).length}`);
  console.log(`  Test users: ${testUsers.map((u) => u.username).join(', ')} (password: ChangeMe123!)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
