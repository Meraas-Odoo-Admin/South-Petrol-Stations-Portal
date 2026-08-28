import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

// Company attribution for these two groups is still pending the client's
// answer — see docs/OPEN_ITEMS.md items #1 and #2. We deliberately do not
// guess; anything seeded under them is flagged loudly instead.
const FLAGGED_COMPANY_NAMES = new Set(['مكاتب مبيعات الجنوبية', 'نفط ليبيا / الطرق السريعة']);

const COMPANIES = [
  'ليبيا نفط',
  'الراحلة',
  'الشرارة الذهبية',
  'الطرق السريعة',
  'الثقة الدولية',
  'البريقة',
];

const PERMISSIONS = [
  { key: 'companies:read', description: 'View companies' },
  { key: 'companies:manage', description: 'Create/update companies' },
  { key: 'stations:read', description: 'View stations (subject to station scope)' },
  { key: 'stations:manage', description: 'Create/update stations' },
  { key: 'users:manage', description: 'Create/update users and station scope' },
  { key: 'roles:manage', description: 'Assign/remove roles' },
  { key: 'reports:view_all_stations', description: 'View directorate-wide reports' },
  {
    key: 'reports:view',
    description:
      'View per-station reports (daily report, violations list, driver/vehicle history)',
  },
  { key: 'drivers:manage', description: 'Create/update ANY existing driver record — full registry edit rights' },
  {
    key: 'drivers:create',
    description:
      'Create a new driver record only (no edit rights on existing records) — narrower than drivers:manage, for roles that only need the inline "no match, add a new driver" flow (item 10)',
  },
  { key: 'owners:manage', description: 'Create/update the vehicle owner registry' },
  { key: 'vehicles:manage', description: 'Create/update vehicles, plate changes, driver associations' },
  { key: 'drivers:read', description: 'Look up the driver registry (read-only)' },
  { key: 'vehicles:read', description: 'Look up the vehicle registry (read-only)' },
  { key: 'fillups:create', description: 'Record a fill-up, including one submitted with an exception' },
  // Seeded for role-table completeness (docs/IMPLEMENTATION_PLAN.md §5 lists
  // it against station_supervisor) — no endpoint uses it in M3.
  // FillUpTransaction is append-only, same precedent as no-delete on
  // stations/users/drivers/owners/vehicles and the insert-only audit log.
  // What "editing" a fill-up would even mean (correcting a typo? voiding a
  // bad entry?) isn't specified anywhere in the plan — needs a decision
  // before anything is built against this permission.
  { key: 'fillups:update', description: '(Unused in M3 — see comment above.)' },
  { key: 'fillups:approve_exception', description: 'Approve a requested fill-up exception' },
  {
    key: 'vehicles:request_change',
    description:
      'Request a chassisNumber/registrationBooklet change on a vehicle that already has one set (first-time sets need no request — see VehiclesService.setOrRequestChange)',
  },
  {
    key: 'vehicles:approve_change',
    description: 'Approve or reject a pending vehicle chassis/registration-booklet change request',
  },
  { key: 'settings:manage', description: 'View/edit tunable SystemSetting values (admin panel)' },
  { key: 'audit:view', description: 'View the audit log (admin panel)' },
  {
    key: 'exception_types:manage',
    description: 'Create/update fill-up exception categories (admin panel)',
  },
  {
    key: 'standing_exceptions:manage',
    description: 'Grant/revoke a standing (ongoing) rule exemption for a driver and/or vehicle',
  },
  {
    key: 'drivers:reveal_identity',
    description:
      'Reveal a driver\'s unmasked national/administrative ID on demand (audited — action REVEAL_NATIONAL_ID)',
  },
];

// drivers:manage/owners:manage/vehicles:manage follow the same single-tier
// pattern as users:manage (one permission gates read+write) rather than the
// read/manage split used by companies:*/stations:*, since there's no
// station-scoped "read" use case for this registry data yet.
//
// M3 resolves the gap M2 deliberately left open: GET /drivers and
// GET /vehicles now require drivers:read/vehicles:read instead of the
// :manage tier (recording a fill-up needs to look up an existing
// driver/vehicle, not edit the registry). Every role that already held
// :manage is granted the matching :read explicitly — PermissionsGuard
// checks the exact permission string, not a tier hierarchy, so holding
// :manage does not imply :read.
const ROLE_PERMISSIONS: Record<string, string[]> = {
  station_employee: [
    'stations:read',
    'drivers:read',
    'vehicles:read',
    'fillups:create',
    // Added so the "no match, add a new driver" flow reachable inline
    // from the fill-up recording screen actually works for the role that
    // records fill-ups in the first place — item 10, station-level driver
    // creation. Originally granted the full drivers:manage tier, which was
    // a real over-grant (it also gates PATCH /drivers/:id — edit rights on
    // ANY existing driver record, not just creating new ones). Narrowed to
    // the create-only permission per explicit correction — this role gets
    // no path to edit an existing driver's record.
    'drivers:create',
  ],
  station_supervisor: [
    'stations:read',
    'stations:manage',
    'drivers:manage',
    'drivers:create',
    'drivers:read',
    'owners:manage',
    'vehicles:manage',
    'vehicles:read',
    'vehicles:request_change',
    'vehicles:approve_change',
    'fillups:create',
    'fillups:update',
    'fillups:approve_exception',
    'standing_exceptions:manage',
    'drivers:reveal_identity',
    // Supervisors review what their station recorded — same reasoning as
    // fillups:approve_exception (employees record, supervisors review).
    'reports:view',
  ],
  directorate_admin: [
    'companies:read',
    'stations:read',
    'stations:manage',
    'reports:view_all_stations',
    'reports:view',
    'drivers:manage',
    'drivers:create',
    'drivers:read',
    'owners:manage',
    'vehicles:manage',
    'vehicles:read',
    'vehicles:request_change',
    'vehicles:approve_change',
    // Same as station_supervisor. The §5 role table only lists
    // reports:view_all_stations for this role, but directorate_admin
    // already holds manage-tier permissions in every other domain beyond
    // what that table lists (companies:manage-adjacent reads,
    // stations:manage, drivers:manage, owners:manage, vehicles:manage) —
    // the table is "Example permissions", not an exhaustive spec (see the
    // M3 review report). Withholding fillups:* alone would have been the
    // inconsistent choice, not this.
    'fillups:create',
    'fillups:update',
    'fillups:approve_exception',
    'standing_exceptions:manage',
    'drivers:reveal_identity',
    'settings:manage',
    'audit:view',
    'exception_types:manage',
    'users:manage',
    'roles:manage',
  ],
  system_admin: PERMISSIONS.map((p) => p.key),
};

// The only roles that see every station regardless of UserStationScope.
// station_employee/station_supervisor stay at the schema default (false) —
// both are exercised as scoped-to-one-station in the e2e boundary test.
const UNRESTRICTED_STATION_ACCESS_ROLES = new Set(['directorate_admin', 'system_admin']);

const SYSTEM_SETTINGS = [
  { key: 'fillup.max_per_week', value: '3', description: 'Max fill-ups per vehicle per week' },
  {
    key: 'fillup.min_gap_days',
    value: '2',
    description: 'Minimum days between two fill-ups for the same vehicle',
  },
  // PLACEHOLDER values (same numbers as the vehicle-level defaults) — the
  // aggregate per-driver cap is a confirmed requirement (docs/OPEN_ITEMS.md:
  // "Multi-vehicle drivers need both a per-vehicle cap and an aggregate
  // per-driver cap") but the actual numbers, and even whether the two caps
  // should be independent, are NOT confirmed. Change these rows, not code,
  // once the client answers.
  {
    key: 'fillup.max_per_week_per_driver',
    value: '3',
    description: 'PLACEHOLDER — max fill-ups per driver per week, across all their vehicles',
  },
  {
    key: 'fillup.min_gap_days_per_driver',
    value: '2',
    description: 'PLACEHOLDER — minimum days between two fill-ups for the same driver, across all their vehicles',
  },
  {
    key: 'fillup.week_window_mode',
    value: 'rolling',
    description: "'rolling' (last 7 days) or 'fixed' (calendar week starting fillup.week_start_day)",
  },
  // Unused while week_window_mode = 'rolling'. Placeholder pending §13's
  // still-open week-start-day question — 6 = Saturday, matching the Libyan
  // work week, but not client-confirmed.
  {
    key: 'fillup.week_start_day',
    value: '6',
    description: 'PLACEHOLDER, unused while week_window_mode=rolling — 0=Sunday..6=Saturday',
  },
  // NEW — not in the original client questionnaire either; a reasonable
  // placeholder like the two driver-level caps above, pending real numbers.
  {
    key: 'fillup.max_liters_per_week_per_driver',
    value: '300',
    description:
      'PLACEHOLDER — max total liters a single driver (by national/administrative ID) can be issued per week, across all their vehicles',
  },
];

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
const SEED_OWNERS = [
  { key: 'O1', fullName: 'عبدالسلام محمد الزنتاني', nationalId: '119700000011', phone: '091-1000011' },
  { key: 'O2', fullName: 'فاطمة علي المصراتي', nationalId: '219750000012', phone: '092-1000012' },
] as const;

const SEED_DRIVERS = [
  { key: 'D1', identityType: 'NATIONAL_ID', identityNumber: '119850000001', fullName: 'محمد عبدالسلام الزنتاني', phone: '091-2000001' },
  { key: 'D2', identityType: 'NATIONAL_ID', identityNumber: '219900000002', fullName: 'خديجة إبراهيم المصراتي', phone: '092-2000002' },
  { key: 'D3', identityType: 'NATIONAL_ID', identityNumber: '117800000003', fullName: 'عمر يوسف الفزاني', phone: '093-2000003' },
  { key: 'D4', identityType: 'ADMINISTRATIVE_ID', identityNumber: '919950000004', fullName: 'يوسف الطاهر الطارقي', phone: '094-2000004' },
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
    model: 'تويوتا لاندكروزر',
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
    model: 'كيا سيراتو',
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
    vehicleType: 'نقل',
    model: 'تويوتا هايلوكس',
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
    model: 'هيونداي إلنترا',
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
    vehicleType: 'حكومية',
    model: 'تويوتا لاندكروزر',
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
    model: 'نيسان صني',
    color: 'فضي',
    manufactureYear: 2018,
    usageType: 'PRIVATE',
    ownerKey: 'O2',
    drivers: [{ key: 'D6', isPrimary: true }],
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
  },
  {
    key: 'OTHER_NO_PROOF',
    name: 'Other, no proof required (synthetic placeholder — not a real client-confirmed category)',
    requiresProof: false,
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
    const [pwVehicles, pwDrivers, pwStations, pwCompanies, pwUsers] = await Promise.all([
      prisma.vehicle.findMany({ where: { internalCode: { startsWith: 'PW-VEH-' } } }),
      prisma.driver.findMany({ where: { fullName: { startsWith: 'PW Test Driver ' } } }),
      prisma.station.findMany({ where: { internalCode: { startsWith: 'PW-STN-' } } }),
      prisma.company.findMany({ where: { name: { startsWith: 'PW Test Co ' } } }),
      prisma.user.findMany({ where: { username: { startsWith: 'pw_needschange_' } } }),
    ]);
    const vehicleIds = pwVehicles.map((v) => v.id);
    const driverIds = pwDrivers.map((d) => d.id);
    const stationIds = pwStations.map((s) => s.id);
    const companyIds = pwCompanies.map((c) => c.id);
    const userIds = pwUsers.map((u) => u.id);

    if (!vehicleIds.length && !driverIds.length && !stationIds.length && !companyIds.length && !userIds.length) {
      return;
    }

    const fillUpFilter = {
      OR: [
        { vehicleId: { in: vehicleIds } },
        { driverId: { in: driverIds } },
        { stationId: { in: stationIds } },
      ],
    };
    await prisma.exception.deleteMany({ where: { fillUpTransaction: fillUpFilter } });
    await prisma.fillUpTransaction.deleteMany({ where: fillUpFilter });
    await prisma.driverVehicle.deleteMany({
      where: { OR: [{ vehicleId: { in: vehicleIds } }, { driverId: { in: driverIds } }] },
    });
    await prisma.vehiclePlateHistory.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.vehicleChassisHistory.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.vehicleBookletHistory.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.vehicleChangeRequest.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.vehicle.deleteMany({ where: { id: { in: vehicleIds } } });
    await prisma.driver.deleteMany({ where: { id: { in: driverIds } } });
    await prisma.userStationScope.deleteMany({
      where: { OR: [{ stationId: { in: stationIds } }, { userId: { in: userIds } }] },
    });
    await prisma.station.deleteMany({ where: { id: { in: stationIds } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });

    console.log(
      `  🧹 Cleaned up Playwright e2e fixtures: ${vehicleIds.length} vehicles, ${driverIds.length} drivers, ${stationIds.length} stations, ${companyIds.length} companies, ${userIds.length} throwaway users.`,
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

  // ── Permissions & Roles ────────────────────────────────────────────
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      create: permission,
      update: { description: permission.description },
    });
  }

  const rolesByName = new Map<string, { id: string }>();
  for (const [roleName, permissionKeys] of Object.entries(ROLE_PERMISSIONS)) {
    const unrestrictedStationAccess = UNRESTRICTED_STATION_ACCESS_ROLES.has(roleName);
    const role = await prisma.role.upsert({
      where: { name: roleName },
      create: { name: roleName, unrestrictedStationAccess },
      update: { unrestrictedStationAccess },
    });
    rolesByName.set(roleName, role);

    for (const key of permissionKeys) {
      const permission = await prisma.permission.findUniqueOrThrow({ where: { key } });
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        create: { roleId: role.id, permissionId: permission.id },
        update: {},
      });
    }
  }

  // ── System settings ───────────────────────────────────────────────
  for (const setting of SYSTEM_SETTINGS) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      create: setting,
      update: { value: setting.value, description: setting.description },
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
  // We do not have the client's real station list yet (docs/OPEN_ITEMS.md
  // #1, #2, #3, #10 are all still pending). These are synthetic fixtures —
  // enough to exercise RBAC/scoping and prove the schema, not real data.
  // Two stations deliberately share stationNumber "1" across different
  // companies, demonstrating exactly the case the composite unique key
  // (companyId, stationNumber) exists to allow.
  const raheela = companiesByName.get('الراحلة')!;
  const sharara = companiesByName.get('الشرارة الذهبية')!;

  const stationA = await prisma.station.upsert({
    where: { internalCode: 'STN-TEST-0001' },
    create: {
      internalCode: 'STN-TEST-0001',
      stationNumber: '1',
      name: 'Test Station (Raheela) — synthetic fixture',
      companyId: raheela.id,
    },
    update: {},
  });

  const stationB = await prisma.station.upsert({
    where: { internalCode: 'STN-TEST-0002' },
    create: {
      internalCode: 'STN-TEST-0002',
      stationNumber: '1', // same number as stationA, different company — proves the composite key
      name: 'Test Station (Sharara) — synthetic fixture',
      companyId: sharara.id,
    },
    update: {},
  });

  // ── Test users, one per role ───────────────────────────────────────
  const testUsers = [
    { username: 'employee1', fullName: 'Test Station Employee', role: 'station_employee' },
    { username: 'supervisor1', fullName: 'Test Station Supervisor', role: 'station_supervisor' },
    { username: 'admin1', fullName: 'Test Directorate Admin', role: 'directorate_admin' },
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
  // VehicleOwner.nationalId has no unique constraint (unlike Driver's
  // (identityType, identityNumber)), so idempotency is a manual
  // find-then-create rather than a real upsert.
  const ownersByKey = new Map<string, { id: string }>();
  for (const spec of SEED_OWNERS) {
    const owner =
      (await prisma.vehicleOwner.findFirst({ where: { nationalId: spec.nationalId } })) ??
      (await prisma.vehicleOwner.create({
        data: { fullName: spec.fullName, nationalId: spec.nationalId, phone: spec.phone },
      }));
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
  const stationsByKey = new Map([
    ['A', stationA],
    ['B', stationB],
  ]);
  const recordedBy = usersByUsername.get('sysadmin1')!;

  for (const spec of SEED_VEHICLES) {
    const vehicle = await prisma.vehicle.upsert({
      where: { internalCode: spec.internalCode },
      create: {
        internalCode: spec.internalCode,
        currentPlate: spec.currentPlate,
        chassisNumber: spec.chassisNumber,
        vehicleType: spec.vehicleType,
        model: spec.model,
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
      const primaryDriverKey = spec.drivers[0]?.key;
      if (!primaryDriverKey) continue; // no driver to attribute the fill-up to
      const driver = driversByKey.get(primaryDriverKey)!;
      const station = stationsByKey.get(fillUpSpec.stationKey)!;
      const occurredAt = new Date(Date.now() - fillUpSpec.daysAgo * 24 * 60 * 60 * 1000);

      await prisma.fillUpTransaction.upsert({
        where: { idempotencyKey },
        create: {
          vehicleId: vehicle.id,
          driverId: driver.id,
          stationId: station.id,
          fuelType: fillUpSpec.fuelType,
          quantityLiters: fillUpSpec.quantityLiters,
          occurredAt,
          recordedById: recordedBy.id,
          isException: false,
          idempotencyKey,
        },
        update: {},
      });
    }
  }

  console.log('Seed complete.');
  console.log(`  Companies: ${COMPANIES.length}`);
  console.log(`  Roles: ${Object.keys(ROLE_PERMISSIONS).length}`);
  console.log(`  Test users: ${testUsers.map((u) => u.username).join(', ')} (password: ChangeMe123!)`);
  console.log(
    `  ⚠ Station company attribution still pending client answer for: ${[...FLAGGED_COMPANY_NAMES].join(', ')} — no rows seeded for these yet (docs/OPEN_ITEMS.md #1, #2).`,
  );
  console.log(
    '  ⚠ Seeded stations are synthetic test fixtures, not the real station list (docs/OPEN_ITEMS.md #3, #10 still pending).',
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
