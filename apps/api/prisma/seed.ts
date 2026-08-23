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
  { key: 'drivers:manage', description: 'Create/update the driver registry' },
  { key: 'owners:manage', description: 'Create/update the vehicle owner registry' },
  { key: 'vehicles:manage', description: 'Create/update vehicles, plate changes, driver associations' },
];

// drivers:manage/owners:manage/vehicles:manage follow the same single-tier
// pattern as users:manage (one permission gates read+write) rather than the
// read/manage split used by companies:*/stations:*, since there's no
// station-scoped "read" use case for this registry data yet.
//
// station_employee does NOT get these in M2: by analogy to stations:read
// (the only thing station_employee currently holds), read access to this
// registry is earned by a role that *manages* something, not by the role
// that only records fill-ups. Fill-up creation (M3) will need drivers/
// vehicles lookup from station_employee — deliberately left as a decision
// for M3, since it may want a narrower, search-only permission rather than
// full drivers:manage/vehicles:manage. See the M2 scoping report.
const ROLE_PERMISSIONS: Record<string, string[]> = {
  station_employee: ['stations:read'],
  station_supervisor: [
    'stations:read',
    'stations:manage',
    'drivers:manage',
    'owners:manage',
    'vehicles:manage',
  ],
  directorate_admin: [
    'companies:read',
    'stations:read',
    'stations:manage',
    'reports:view_all_stations',
    'drivers:manage',
    'owners:manage',
    'vehicles:manage',
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
];

async function main() {
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
