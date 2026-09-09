import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { PERMISSIONS, ROLE_PERMISSIONS, UNRESTRICTED_STATION_ACCESS_ROLES, SYSTEM_SETTINGS } from './rbac-catalog';

const prisma = new PrismaClient();

// A real production alternative to `prisma db seed` (seed.ts), which
// creates demo companies/stations/vehicles/owners/test accounts that have
// no place in a genuine deployment. This script seeds ONLY what the app
// cannot function without — the RBAC catalog (Permission/Role/
// RolePermission rows; a user with no role has zero permissions, and
// PermissionsGuard checks the exact permission string against these
// tables, not a hardcoded role check) and the tunable SystemSetting rows
// the fill-up rule engine reads at request time and throws on if missing
// (see SystemSettingsService — "SystemSetting is not seeded" is a real
// crash, not a soft default) — then creates exactly ONE real system_admin
// account. Everything else (companies, stations, municipalities, vehicle
// types, exception types, additional users, ...) is left for that admin
// to create through the app's own admin UI, which is the whole point of
// running this instead of the demo seed.
//
// Usage (from apps/api):
//   BOOTSTRAP_ADMIN_USERNAME=realadmin BOOTSTRAP_ADMIN_PASSWORD='a-real-password' \
//     npx ts-node --transpile-only prisma/bootstrap-prod.ts
//
// Safe to re-run: every write here is an upsert, so running it again
// (e.g. after a schema update added a new permission) only fills in
// what's missing — it never touches or resets the admin account's
// password once created.
async function main() {
  const username = process.env.BOOTSTRAP_ADMIN_USERNAME;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const fullName = process.env.BOOTSTRAP_ADMIN_FULLNAME || username;

  if (!username || !password) {
    throw new Error(
      'Set BOOTSTRAP_ADMIN_USERNAME and BOOTSTRAP_ADMIN_PASSWORD before running this script.',
    );
  }
  if (password.length < 8) {
    throw new Error('BOOTSTRAP_ADMIN_PASSWORD must be at least 8 characters.');
  }

  // ── Permissions & Roles — identical logic to seed.ts's own block ────
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

  // ── The one real admin account ──────────────────────────────────────
  const passwordHash = await argon2.hash(password);
  const user = await prisma.user.upsert({
    where: { username },
    create: {
      username,
      fullName: fullName!,
      passwordHash,
      mustChangePassword: true,
    },
    // Never overwrite an existing account's password by re-running this
    // script — only fullName, in case it was a placeholder the first time.
    update: { fullName: fullName! },
  });

  const systemAdminRole = rolesByName.get('system_admin')!;
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: systemAdminRole.id } },
    create: { userId: user.id, roleId: systemAdminRole.id },
    update: {},
  });

  console.log('Bootstrap complete.');
  console.log(`  Permissions: ${PERMISSIONS.length}`);
  console.log(`  Roles: ${Object.keys(ROLE_PERMISSIONS).length}`);
  console.log(`  System settings: ${SYSTEM_SETTINGS.length}`);
  console.log(`  Admin account: ${username} (system_admin role, must change password on first login)`);
  console.log('  No companies, stations, or demo data were created — add them from the admin UI.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
