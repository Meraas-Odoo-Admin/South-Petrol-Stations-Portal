import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { PERMISSIONS, ROLE_PERMISSIONS, SYSTEM_SETTINGS } from './rbac-catalog';
import { syncRbacCatalog } from './rbac-sync';

const prisma = new PrismaClient();

// A real production alternative to `prisma db seed` (seed.ts), which
// creates test fixtures and test accounts that have no place in a genuine
// deployment. This script seeds ONLY what the app cannot function without:
//
//  - the RBAC catalog (Permission/Role/RolePermission rows; a user with no
//    role has zero permissions, and PermissionsGuard checks the exact
//    permission string against these tables, not a hardcoded role check);
//  - the tunable SystemSetting rows the fill-up rule engine reads at request
//    time and throws on if missing (SystemSettingsService — "SystemSetting is
//    not seeded" is a real crash, not a soft default);
//  - the one live municipality, سبها, with its security authority
//    (مديرية أمن سبها);
//  - exactly ONE super admin (the system_admin role), who must change the
//    password at first login.
//
// It never creates the test accounts (employee1, admin1, ...): those come
// only from seed.ts, which is not run in production.
//
// Everything else follows the go-live order in infra/DEPLOYMENT.md: the super
// admin creates the municipality managers, Sabha's stations are loaded with
// `stations:import`, and the managers create offices and supervisors.
//
// Defaults it leaves in place (rbac-catalog.ts SYSTEM_SETTINGS, never
// overwritten on a re-run): the five rule switches on except owner liters,
// low fuel threshold 1,000 L, and no stage dates for سبها (grace stage).
//
// Usage (from the repo root):
//   BOOTSTRAP_ADMIN_USERNAME=realadmin BOOTSTRAP_ADMIN_PASSWORD='a-real-password' \
//     pnpm --filter @fuel-tracking/api bootstrap:prod
//
// Safe to re-run: running it again (e.g. after rbac-catalog.ts changed)
// makes role permissions match the catalog — adding new grants AND
// removing ones the catalog dropped, logging each removal — creates any
// missing settings without overwriting tuned values, and never touches or
// resets the super admin's password once created.
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

  const systemAdminRole = rolesByName.get('system_admin')!;

  // ── The one super admin ─────────────────────────────────────────────
  // "Exactly one": a run with a DIFFERENT username does not quietly add
  // another super admin. More of them are created in the app, by the first
  // one, on purpose. Checked before anything below is written.
  const existingSuperAdmins = await prisma.user.findMany({
    where: { roles: { some: { roleId: systemAdminRole.id } } },
    select: { username: true },
  });
  if (existingSuperAdmins.length > 0 && !existingSuperAdmins.some((u) => u.username === username)) {
    throw new Error(
      `A super admin already exists (${existingSuperAdmins.map((u) => u.username).join(', ')}). ` +
        'Bootstrap creates exactly one; create further super admins in the app.',
    );
  }

  // ── System settings ───────────────────────────────────────────────
  for (const setting of SYSTEM_SETTINGS) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      create: setting,
      // Never overwrite a value on re-run: this script is re-run on a LIVE
      // deployment (e.g. to pick up rbac-catalog.ts changes), and the super
      // admin may have tuned these numbers and switches since. Only the
      // description is refreshed; new keys are still created above.
      update: { description: setting.description },
    });
  }

  // ── سبها: the live municipality and its security authority ─────────
  // One authority per municipality (docs/OPEN_ITEMS.md #4). Upserts, so a
  // re-run only fills in what's missing — and re-asserts LIVE, which is
  // this deployment's intended state for سبها. Stage dates are left alone:
  // none at go-live (grace), and the super admin sets them later.
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

  // ── The super admin account ───────────────────────────────────────────
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
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
  console.log(`  Super admin: ${username} (system_admin role, must change password on first login)`);
  console.log('  No test accounts, stations or demo data were created.');
  console.log('  Next: infra/DEPLOYMENT.md, go-live steps 2-6.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
