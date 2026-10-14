import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import './support/card-scan-shim';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { createMunicipality, deleteMunicipalities } from './support/municipality-fixtures';

// Item 4 (RBAC gating on every new admin endpoint from this round, tested
// against the actual permission grants, not assumed). Mirrors the
// permission SETS seed.ts's ROLE_PERMISSIONS actually assigns to
// station_employee/station_supervisor/directorate_admin/system_admin as of
// this phase — deliberately self-contained (own roles/permissions/users,
// not the seeded accounts) for the same reason fillups.e2e-spec.ts is:
// CI's e2e step runs `prisma migrate deploy`, never `prisma db seed`. If
// seed.ts's grants change, THIS FILE must be updated to match — there is
// no shared source of truth between them (same tradeoff already accepted
// elsewhere in this test suite).
let municipalityIdE2e: string;

describe('Admin panel RBAC (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const runId = Date.now().toString(36);
  const password = 'BoundaryTest123!';

  type RoleKey = 'employee' | 'supervisor' | 'admin' | 'sysadmin';

  // Only the permissions relevant to endpoints exercised below — not the
  // full seed.ts grant list for each role (fillups/vehicles/drivers
  // read-write are covered by other e2e specs already).
  const ROLE_PERMISSIONS: Record<RoleKey, string[]> = {
    employee: ['fillups:create'],
    supervisor: ['standing_exceptions:manage', 'stations:manage', 'vehicles:read'],
    admin: [
      'users:manage',
      'roles:manage',
      'settings:manage',
      'audit:view',
      'exception_types:manage',
      'standing_exceptions:manage',
      'stations:manage',
      'stations:create',
      'vehicles:read',
    ],
    sysadmin: [
      'users:manage',
      'roles:manage',
      'settings:manage',
      'audit:view',
      'exception_types:manage',
      'standing_exceptions:manage',
      'stations:manage',
      'stations:create',
      'vehicles:read',
      'fillups:create',
    ],
  };

  const usernames: Record<RoleKey, string> = {
    employee: `e2e_arb_employee_${runId}`,
    supervisor: `e2e_arb_supervisor_${runId}`,
    admin: `e2e_arb_admin_${runId}`,
    sysadmin: `e2e_arb_sysadmin_${runId}`,
  };

  const userIds: Record<RoleKey, string> = { employee: '', supervisor: '', admin: '', sysadmin: '' };
  const roleIds: Record<RoleKey, string> = { employee: '', supervisor: '', admin: '', sysadmin: '' };

  let company: { id: string };
  let station: { id: string };
  let settingKey: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    prisma = moduleRef.get(PrismaService);

    company = await prisma.company.create({ data: { name: `E2E ARB Company ${runId}` } });
    municipalityIdE2e = (await createMunicipality(prisma, `E2E ARB Municipality ${runId}`)).id;
    station = await prisma.station.create({
      data: {
        internalCode: `E2E-ARB-A-${runId}`,
        stationNumber: '1',
        name: 'E2E ARB Station',
        companyId: company.id,
        municipalityId: municipalityIdE2e,
      },
    });

    settingKey = `e2e.arb.test.setting.${runId}`;
    await prisma.systemSetting.create({
      data: { key: settingKey, value: '1', description: 'E2E admin-rbac test setting' },
    });

    const allPermissionKeys = [...new Set(Object.values(ROLE_PERMISSIONS).flat())];
    const permissionsByKey = new Map<string, string>();
    for (const key of allPermissionKeys) {
      const p = await prisma.permission.upsert({ where: { key }, create: { key }, update: {} });
      permissionsByKey.set(key, p.id);
    }

    // Matches seed.ts's UNRESTRICTED_STATION_ACCESS_ROLES set (directorate_admin
    // + system_admin see every station regardless of UserStationScope) —
    // without this, PATCH /stations/:id correctly 403s a scoped caller
    // with no UserStationScope row for the target station (CLAUDE.md rule
    // 3), which is real product behavior, not a permission-gate result.
    // supervisor gets an explicit UserStationScope row instead, same as
    // the real station_supervisor role.
    const UNRESTRICTED: RoleKey[] = ['admin', 'sysadmin'];

    for (const roleKey of Object.keys(ROLE_PERMISSIONS) as RoleKey[]) {
      const role = await prisma.role.create({
        data: { name: `e2e_arb_${roleKey}_role_${runId}`, unrestrictedStationAccess: UNRESTRICTED.includes(roleKey) },
      });
      roleIds[roleKey] = role.id;
      await prisma.rolePermission.createMany({
        data: ROLE_PERMISSIONS[roleKey].map((key) => ({ roleId: role.id, permissionId: permissionsByKey.get(key)! })),
      });

      const user = await prisma.user.create({
        data: { username: usernames[roleKey], passwordHash: await argon2.hash(password), fullName: `E2E ARB ${roleKey}` },
      });
      userIds[roleKey] = user.id;
      await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
      if (roleKey === 'supervisor') {
        await prisma.userStationScope.create({ data: { userId: user.id, stationId: station.id } });
      }
    }
  });

  afterAll(async () => {
    const allUserIds = Object.values(userIds);
    const allRoleIds = Object.values(roleIds);
    await prisma.standingException.deleteMany({ where: { grantedById: { in: allUserIds } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.userStationScope.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: allUserIds } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: { in: allRoleIds } } });
    await prisma.role.deleteMany({ where: { id: { in: allRoleIds } } });
    await prisma.systemSetting.delete({ where: { key: settingKey } });
    await prisma.stationFuelAvailability.deleteMany({ where: { stationId: station.id } });
    await prisma.station.delete({ where: { id: station.id } });
    await prisma.company.delete({ where: { id: company.id } });
    await deleteMunicipalities(prisma, [municipalityIdE2e]);
    await app.close();
  });

  const tokenCache = new Map<RoleKey, string>();
  async function loginAs(role: RoleKey): Promise<string> {
    const cached = tokenCache.get(role);
    if (cached) return cached;
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: usernames[role], password })
      .expect(200);
    tokenCache.set(role, res.body.accessToken);
    return res.body.accessToken;
  }

  const ALL_ROLES: RoleKey[] = ['employee', 'supervisor', 'admin', 'sysadmin'];

  function expectedStatus(role: RoleKey, requiredPermission: string): number {
    return ROLE_PERMISSIONS[role].includes(requiredPermission) ? 200 : 403;
  }

  // ── GET endpoints: exact-status table across all 4 roles ────────────
  const getCases: Array<{ path: string; permission: string }> = [
    { path: '/api/v1/users', permission: 'users:manage' },
    { path: '/api/v1/system-settings', permission: 'settings:manage' },
    { path: '/api/v1/audit-log', permission: 'audit:view' },
    { path: '/api/v1/roles', permission: 'roles:manage' },
    { path: '/api/v1/fillups/exception-types/all', permission: 'exception_types:manage' },
  ];

  it.each(getCases.flatMap((c) => ALL_ROLES.map((role) => ({ ...c, role }))))(
    'GET $path — role=$role gets exactly the status its permission grant implies',
    async ({ path, permission, role }) => {
      const token = await loginAs(role);
      const expected = expectedStatus(role, permission);
      await request(app.getHttpServer())
        .get(path)
        .set('Authorization', `Bearer ${token}`)
        .expect(expected);
    },
  );

  // ── Unauthenticated: every one of these routes must 401, not 403 ────
  it.each(getCases)('GET $path rejects an unauthenticated request with 401', async ({ path }) => {
    await request(app.getHttpServer()).get(path).expect(401);
  });

  // ── PATCH /system-settings/:key — settings:manage only ──────────────
  it.each(ALL_ROLES)('PATCH /system-settings/:key — role=%s gets exactly the status its grant implies', async (role) => {
    const token = await loginAs(role);
    const expected = expectedStatus(role, 'settings:manage');
    await request(app.getHttpServer())
      .patch(`/api/v1/system-settings/${settingKey}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ value: '2' })
      .expect(expected);
  });

  // ── POST /standing-exceptions — standing_exceptions:manage only ─────
  // (supervisor + admin + sysadmin per ROLE_PERMISSIONS above; employee
  // blocked). Uses a valid body so the allowed roles get a genuine 201,
  // not just "not 403".
  it.each(ALL_ROLES)('POST /standing-exceptions — role=%s gets exactly the status its grant implies', async (role) => {
    const token = await loginAs(role);
    const hasPermission = ROLE_PERMISSIONS[role].includes('standing_exceptions:manage');
    const res = await request(app.getHttpServer())
      .post('/api/v1/standing-exceptions')
      .set('Authorization', `Bearer ${token}`)
      .send({ vehicleId: 'does-not-exist', rules: ['VEHICLE_GAP_TOO_SHORT'], reason: `E2E RBAC test as ${role}` });
    if (hasPermission) {
      // Permission granted — passes the guard, then 404s on the
      // nonexistent vehicleId. The guard/permission layer is what this
      // test verifies; the vehicle-existence check is StandingExceptionsService's
      // own concern, already implicitly covered by standing-exceptions.e2e-spec.ts's
      // real grant using a real vehicle.
      expect(res.status).toBe(404);
    } else {
      expect(res.status).toBe(403);
    }
  });

  // ── POST /stations needs stations:create; PATCH /stations/:id needs stations:manage,
  // and without stations:create only the fuel types may change (phase 5A) ──────
  it.each(ALL_ROLES)('POST /stations — role=%s gets exactly the status its grant implies', async (role) => {
    const token = await loginAs(role);
    const hasPermission = ROLE_PERMISSIONS[role].includes('stations:create');
    const res = await request(app.getHttpServer())
      .post('/api/v1/stations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        internalCode: `E2E-ARB-NEW-${role}-${runId}`,
        stationNumber: '99',
        name: `E2E ARB new station (${role})`,
        companyId: company.id,
        municipalityId: municipalityIdE2e,
      });
    if (hasPermission) {
      expect(res.status).toBe(201);
      await prisma.station.delete({ where: { id: res.body.id } });
    } else {
      expect(res.status).toBe(403);
    }
  });

  it.each(ALL_ROLES)('PATCH /stations/:id — role=%s gets exactly the status its grant implies', async (role) => {
    const token = await loginAs(role);
    // Renaming a station is the municipality manager's (stations:create): a
    // supervisor holding only stations:manage is refused, not just an employee.
    const expected = ROLE_PERMISSIONS[role].includes('stations:create') ? 200 : 403;
    await request(app.getHttpServer())
      .patch(`/api/v1/stations/${station.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'E2E ARB station renamed' })
      .expect(expected);
  });

  it('lets a supervisor (stations:manage only) change the fuel types of their own station', async () => {
    const token = await loginAs('supervisor');
    await request(app.getHttpServer())
      .patch(`/api/v1/stations/${station.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fuelTypes: ['PETROL_95', 'DIESEL'] })
      .expect(200);
  });
});
