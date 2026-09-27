import { PrismaClient } from '@prisma/client';
import { ROLE_KINDS, ROLE_PERMISSIONS } from '../prisma/rbac-catalog';
import { syncRbacCatalog, type RbacCatalog } from '../prisma/rbac-sync';

// Registration pivot, phase 2: seed.ts and bootstrap-prod.ts used to only
// upsert role grants, so taking a permission off a role in rbac-catalog.ts
// never took it off an existing database. syncRbacCatalog (shared by both
// scripts) now also removes stale grants. Exercised here against the real
// database with a test-only catalog, so no seeded role is touched.
describe('RBAC catalog sync (e2e)', () => {
  const prisma = new PrismaClient();
  const runId = Date.now().toString(36);
  const roleName = `e2e_sync_role_${runId}`;
  const untouchedRoleName = `e2e_sync_untouched_${runId}`;
  const keep = `e2e_sync:keep_${runId}`;
  const drop = `e2e_sync:drop_${runId}`;
  let userId: string;

  const catalog = (grants: string[]): RbacCatalog => ({
    permissions: [{ key: keep }, { key: drop }],
    rolePermissions: { [roleName]: grants },
    roleKinds: { [roleName]: 'PETROL_STATION' },
    unrestrictedRoles: new Set(),
  });

  beforeAll(async () => {
    // An "already-seeded database": the role holds both permissions, and a
    // user holds `drop` as a per-user grant too.
    await syncRbacCatalog(prisma, catalog([keep, drop]), () => undefined);
    const dropPermission = await prisma.permission.findUniqueOrThrow({ where: { key: drop } });
    const untouched = await prisma.role.create({ data: { name: untouchedRoleName } });
    await prisma.rolePermission.create({ data: { roleId: untouched.id, permissionId: dropPermission.id } });
    userId = (
      await prisma.user.create({ data: { username: `e2e_sync_user_${runId}`, passwordHash: 'x', fullName: 'sync' } })
    ).id;
    await prisma.userPermission.create({ data: { userId, permissionId: dropPermission.id, grantedById: userId } });
  });

  afterAll(async () => {
    const roles = await prisma.role.findMany({ where: { name: { in: [roleName, untouchedRoleName] } } });
    await prisma.userPermission.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.rolePermission.deleteMany({ where: { roleId: { in: roles.map((r) => r.id) } } });
    await prisma.role.deleteMany({ where: { id: { in: roles.map((r) => r.id) } } });
    await prisma.permission.deleteMany({ where: { key: { in: [keep, drop] } } });
    await prisma.$disconnect();
  });

  const grantsOf = async (name: string) =>
    (
      await prisma.rolePermission.findMany({
        where: { role: { name } },
        include: { permission: { select: { key: true } } },
      })
    )
      .map((g) => g.permission.key)
      .sort();

  it('removes a grant the catalog dropped, logs it, and leaves per-user grants and other roles alone', async () => {
    expect(await grantsOf(roleName)).toEqual([drop, keep].sort());

    const lines: string[] = [];
    const result = await syncRbacCatalog(prisma, catalog([keep]), (line) => lines.push(line));

    expect(result.removed).toEqual([{ role: roleName, permission: drop }]);
    expect(lines.some((l) => l.includes(`removed ${drop} from role ${roleName}`))).toBe(true);
    expect(await grantsOf(roleName)).toEqual([keep]);

    // Per-user grants are an admin's individual decision — untouched.
    expect(await prisma.userPermission.count({ where: { userId, permission: { key: drop } } })).toBe(1);
    // A role the catalog doesn't define is never compared or pruned.
    expect(await grantsOf(untouchedRoleName)).toEqual([drop]);
    // The role's kind is synced from the catalog too.
    expect((await prisma.role.findUniqueOrThrow({ where: { name: roleName } })).kind).toBe('PETROL_STATION');
  });

  it('is a no-op on a second run', async () => {
    const result = await syncRbacCatalog(prisma, catalog([keep]), () => undefined);
    expect(result.removed).toEqual([]);
  });

  // The real catalog — pinned so the separation can't quietly erode.
  describe('rbac-catalog.ts', () => {
    const REGISTRATION_ONLY = ['vehicles:manage', 'owners:manage', 'vehicles:request_change', 'owners:request_change'];

    it('gives the registration roles no fillups:* permission at all', () => {
      for (const role of ['registration_employee', 'registration_supervisor']) {
        expect(ROLE_KINDS[role]).toBe('REGISTRATION');
        expect(ROLE_PERMISSIONS[role]!.filter((p) => p.startsWith('fillups:'))).toEqual([]);
      }
      expect(ROLE_PERMISSIONS.registration_supervisor).toEqual(
        expect.arrayContaining(['vehicles:approve_change', 'owners:approve_change', 'owners:reveal_identity']),
      );
    });

    it('gives the petrol-station roles no registration permission, but keeps vehicles:read for the fill-up lookup', () => {
      for (const role of ['station_employee', 'station_supervisor']) {
        expect(ROLE_KINDS[role]).toBe('PETROL_STATION');
        const grants = ROLE_PERMISSIONS[role]!;
        expect(grants.filter((p) => [...REGISTRATION_ONLY, 'vehicles:approve_change', 'owners:approve_change'].includes(p))).toEqual([]);
        expect(grants).toContain('vehicles:read');
        expect(grants).toContain('fillups:create');
      }
      // Owner LOOKUP only where it's needed: the supervisor's daily-report
      // owner filter. The pump employee has no owner search at all.
      expect(ROLE_PERMISSIONS.station_supervisor).toContain('owners:read');
      expect(ROLE_PERMISSIONS.station_employee).not.toContain('owners:read');
    });
  });
});
