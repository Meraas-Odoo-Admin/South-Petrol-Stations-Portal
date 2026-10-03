import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { PERMISSIONS, ROLE_PERMISSIONS, SYSTEM_SETTINGS } from './rbac-catalog';
import { syncRbacCatalog } from './rbac-sync';

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
// crash, not a soft default) — plus the one live municipality, سبها, with
// its security authority (registration pivot, phase 1: Sabha goes live
// first; there's no admin UI for municipalities yet) — then creates
// exactly ONE real system_admin account. Everything else (companies,
// stations, other municipalities, vehicle
// types, exception types, additional users, ...) is left for that admin
// to create through the app's own admin UI, which is the whole point of
// running this instead of the demo seed.
//
// Usage (from apps/api):
//   BOOTSTRAP_ADMIN_USERNAME=realadmin BOOTSTRAP_ADMIN_PASSWORD='a-real-password' \
//     npx ts-node --transpile-only prisma/bootstrap-prod.ts
//
// Safe to re-run: running it again (e.g. after rbac-catalog.ts changed)
// makes role permissions match the catalog — adding new grants AND
// removing ones the catalog dropped, logging each removal — creates any
// missing settings without overwriting tuned values, and never touches or
// resets the admin account's password once created.
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

  // ── Permissions & Roles — same sync seed.ts uses ────────────────────
  // Adds what's missing AND removes role grants rbac-catalog.ts no longer
  // lists (see rbac-sync.ts) — so a permission taken off a role in the
  // catalog is actually taken off in this database too.
  const { rolesByName } = await syncRbacCatalog(prisma);

  // ── System settings ───────────────────────────────────────────────
  for (const setting of SYSTEM_SETTINGS) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      create: setting,
      // Never overwrite a value on re-run: this script is re-run on a LIVE
      // deployment (e.g. to pick up rbac-catalog.ts changes), and an
      // admin may have tuned these rule numbers since. Only the
      // description is refreshed; new keys are still created above.
      update: { description: setting.description },
    });
  }

  // ── سبها: the live municipality and its security authority ─────────
  // One authority per municipality (docs/OPEN_ITEMS.md #4). Upserts, so a
  // re-run only fills in what's missing — and re-asserts LIVE, which is
  // this deployment's intended state for سبها.
  const sabha = await prisma.municipality.upsert({
    where: { name: 'سبها' },
    create: { name: 'سبها', status: 'LIVE', code: 'SBH' },
    update: { status: 'LIVE', code: 'SBH' },
  });
  await prisma.securityAuthority.upsert({
    where: { name: 'مديرية أمن سبها' },
    create: { name: 'مديرية أمن سبها', municipalityId: sabha.id },
    update: { municipalityId: sabha.id },
  });

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
  console.log('  Live municipality: سبها (security authority: مديرية أمن سبها)');
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
