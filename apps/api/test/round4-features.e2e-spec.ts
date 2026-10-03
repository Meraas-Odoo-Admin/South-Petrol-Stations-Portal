import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

// Round 4 client feedback: new endpoints added to support new frontend
// behavior (fuel-price-driven cost field, vehicle weekly-usage bar, the
// settings page's real impact banner, and the "add new setting"
// affordance). Each of these is genuinely new server behavior, not a fix
// to something already covered — the round 4 instructions explicitly call
// for test coverage here, not just for the bug fixes.
//
// Round 6: the "GET /drivers search and standing-exception filter" block
// that used to live here was removed along with the Driver management
// endpoints (see docs/DESIGN_owner_based_fillups.md) — fill-ups no longer
// require driver identity, and there is no more drivers:read permission
// to test a scoping boundary against.
describe('Round 4 features (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const runId = Date.now().toString(36);
  const password = 'BoundaryTest123!';

  const usernameFillupCreator = `e2e_r4_fillup_${runId}`;
  const usernameSettingsAdmin = `e2e_r4_settings_${runId}`;
  const usernameNoPerm = `e2e_r4_noperm_${runId}`;

  let fillupCreatorUserId: string;
  let settingsAdminUserId: string;
  let noPermUserId: string;
  let fillupCreatorRoleId: string;
  let settingsAdminRoleId: string;

  let company: { id: string };
  let station: { id: string };
  let vehicleId: string;
  let ownerWithExceptionId: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    prisma = moduleRef.get(PrismaService);

    // ── SystemSetting fixtures — the three fuel prices this round added,
    // plus the weekly-cap settings the weekly-usage/impact endpoints read.
    const settings: Array<[string, string]> = [
      ['fillup.max_per_week', '3'],
      ['fillup.min_gap_days', '2'],
      ['fillup.max_per_week_per_owner', '3'],
      ['fillup.min_gap_days_per_owner', '2'],
      ['fillup.max_liters_per_week_per_owner', '300'],
      ['fillup.week_window_mode', 'rolling'],
      ['fillup.week_start_day', '6'],
      ['fillup.price_per_liter.PETROL_95', '0.15'],
      ['fillup.price_per_liter.DIESEL', '0.10'],
      ['fillup.price_per_liter.KEROSENE', '0.05'],
    ];
    for (const [key, value] of settings) {
      await prisma.systemSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
    }

    company = await prisma.company.create({ data: { name: `E2E R4 Company ${runId}` } });
    station = await prisma.station.create({
      data: { internalCode: `E2E-R4-${runId}`, stationNumber: '1', name: 'E2E R4 Station', companyId: company.id },
    });

    const vehicle = await prisma.vehicle.create({
      data: { internalCode: `E2E-R4-VEH-${runId}`, currentPlate: `E2E-R4-PLATE-${runId}` },
    });
    vehicleId = vehicle.id;

    const ownerWithException = await prisma.vehicleOwner.create({
      data: {
        identityType: 'NATIONAL_ID',
        identityNumber: `e2e-r4-2-${runId}`,
        fullName: `E2E R4 Exception Owner ${runId}`,
        phone: `092${runId}`,
      },
    });
    ownerWithExceptionId = ownerWithException.id;
    await prisma.standingException.create({
      data: {
        ownerId: ownerWithExceptionId,
        rules: ['OWNER_WEEKLY_CAP_REACHED'],
        reason: 'E2E fixture — active standing exception',
        grantedById: (
          await prisma.user.upsert({
            where: { username: `e2e_r4_granter_${runId}` },
            create: { username: `e2e_r4_granter_${runId}`, passwordHash: await argon2.hash(password), fullName: 'E2E Granter' },
            update: {},
          })
        ).id,
      },
    });

    // ── Roles/permissions ────────────────────────────────────────────────
    const fillupsCreatePermission = await prisma.permission.upsert({
      where: { key: 'fillups:create' },
      create: { key: 'fillups:create' },
      update: {},
    });
    const vehiclesReadPermission = await prisma.permission.upsert({
      where: { key: 'vehicles:read' },
      create: { key: 'vehicles:read' },
      update: {},
    });
    const settingsManagePermission = await prisma.permission.upsert({
      where: { key: 'settings:manage' },
      create: { key: 'settings:manage' },
      update: {},
    });
    const fillupCreatorRole = await prisma.role.create({
      data: { name: `e2e_r4_fillup_role_${runId}`, unrestrictedStationAccess: true },
    });
    fillupCreatorRoleId = fillupCreatorRole.id;
    await prisma.rolePermission.createMany({
      data: [
        { roleId: fillupCreatorRole.id, permissionId: fillupsCreatePermission.id },
        { roleId: fillupCreatorRole.id, permissionId: vehiclesReadPermission.id },
      ],
    });

    const settingsAdminRole = await prisma.role.create({ data: { name: `e2e_r4_settings_role_${runId}` } });
    settingsAdminRoleId = settingsAdminRole.id;
    await prisma.rolePermission.create({ data: { roleId: settingsAdminRole.id, permissionId: settingsManagePermission.id } });

    async function createUser(username: string) {
      return prisma.user.create({
        data: { username, passwordHash: await argon2.hash(password), fullName: `E2E R4 ${username}` },
      });
    }

    const fillupCreatorUser = await createUser(usernameFillupCreator);
    fillupCreatorUserId = fillupCreatorUser.id;
    await prisma.userRole.create({ data: { userId: fillupCreatorUser.id, roleId: fillupCreatorRole.id } });

    const settingsAdminUser = await createUser(usernameSettingsAdmin);
    settingsAdminUserId = settingsAdminUser.id;
    await prisma.userRole.create({ data: { userId: settingsAdminUser.id, roleId: settingsAdminRole.id } });

    const noPermUser = await createUser(usernameNoPerm);
    noPermUserId = noPermUser.id;
  }, 30_000);

  afterAll(async () => {
    const allUserIds = [fillupCreatorUserId, settingsAdminUserId, noPermUserId];
    await prisma.standingException.deleteMany({ where: { ownerId: { in: [ownerWithExceptionId] } } });
    await prisma.user.deleteMany({ where: { username: `e2e_r4_granter_${runId}` } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.userStationScope.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: allUserIds } } });
    await prisma.rolePermission.deleteMany({
      where: { roleId: { in: [fillupCreatorRoleId, settingsAdminRoleId] } },
    });
    await prisma.role.deleteMany({ where: { id: { in: [fillupCreatorRoleId, settingsAdminRoleId] } } });
    await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
    await prisma.vehicleOwner.deleteMany({ where: { id: ownerWithExceptionId } });
    await prisma.station.delete({ where: { id: station.id } });
    await prisma.company.delete({ where: { id: company.id } });
    await prisma.systemSetting.deleteMany({ where: { key: { startsWith: 'e2e_r4_' } } });
    await app.close();
  });

  const tokenCache = new Map<string, string>();
  async function login(username: string): Promise<string> {
    const cached = tokenCache.get(username);
    if (cached) return cached;
    const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ username, password }).expect(200);
    tokenCache.set(username, res.body.accessToken);
    return res.body.accessToken;
  }

  // ── GET /fillups/fuel-prices ─────────────────────────────────────────
  describe('GET /fillups/fuel-prices', () => {
    it('returns the configured per-fuel-type prices for an actor holding fillups:create', async () => {
      const token = await login(usernameFillupCreator);
      const res = await request(app.getHttpServer())
        .get('/api/v1/fillups/fuel-prices')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body).toEqual({ PETROL_95: 0.15, DIESEL: 0.1, KEROSENE: 0.05 });
    });

    it('blocks an actor without fillups:create', async () => {
      const token = await login(usernameNoPerm);
      await request(app.getHttpServer())
        .get('/api/v1/fillups/fuel-prices')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });

  // ── GET /vehicles/:id/weekly-usage ───────────────────────────────────
  describe('GET /vehicles/:id/weekly-usage', () => {
    it('reports 0 used against the configured weekly cap for a vehicle with no fill-ups', async () => {
      const token = await login(usernameFillupCreator);
      const res = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${vehicleId}/weekly-usage`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body).toEqual({ used: 0, max: 3, windowStart: expect.any(String) });
    });

    it('blocks an actor without vehicles:read', async () => {
      const token = await login(usernameNoPerm);
      await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${vehicleId}/weekly-usage`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });

  // ── GET /system-settings/:key/impact ─────────────────────────────────
  describe('GET /system-settings/:key/impact', () => {
    it('returns { noLongerViolating: null } for a setting with no computable impact', async () => {
      const token = await login(usernameSettingsAdmin);
      const res = await request(app.getHttpServer())
        .get('/api/v1/system-settings/fillup.min_gap_days/impact')
        .query({ value: 5 })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body).toEqual({ noLongerViolating: null });
    });

    it('computes a real (possibly zero) count for a weekly-cap setting, not a fabricated number', async () => {
      const token = await login(usernameSettingsAdmin);
      const res = await request(app.getHttpServer())
        .get('/api/v1/system-settings/fillup.max_per_week/impact')
        .query({ value: 10 })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body).toEqual({ noLongerViolating: expect.any(Number) });
    });

    it('requires a numeric value query parameter', async () => {
      const token = await login(usernameSettingsAdmin);
      await request(app.getHttpServer())
        .get('/api/v1/system-settings/fillup.max_per_week/impact')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });

    it('blocks an actor without settings:manage', async () => {
      const token = await login(usernameNoPerm);
      await request(app.getHttpServer())
        .get('/api/v1/system-settings/fillup.max_per_week/impact')
        .query({ value: 10 })
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });

  // ── POST /system-settings (create) ───────────────────────────────────
  describe('POST /system-settings', () => {
    const newKey = `e2e_r4_test.new_rule_${runId}`;

    it('creates a new setting row for an actor holding settings:manage', async () => {
      const token = await login(usernameSettingsAdmin);
      await request(app.getHttpServer())
        .post('/api/v1/system-settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ key: newKey, value: '42', description: 'E2E test row' })
        .expect(201);

      const found = await prisma.systemSetting.findUnique({ where: { key: newKey } });
      expect(found?.value).toBe('42');
    });

    it('rejects creating the same key twice', async () => {
      const token = await login(usernameSettingsAdmin);
      await request(app.getHttpServer())
        .post('/api/v1/system-settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ key: newKey, value: '99' })
        .expect(409);
    });

    it('rejects a key that is not dotted lower_snake_case', async () => {
      const token = await login(usernameSettingsAdmin);
      await request(app.getHttpServer())
        .post('/api/v1/system-settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ key: 'NotAValidKey', value: '1' })
        .expect(400);
    });

    it('blocks an actor without settings:manage', async () => {
      const token = await login(usernameNoPerm);
      await request(app.getHttpServer())
        .post('/api/v1/system-settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ key: `${newKey}_other`, value: '1' })
        .expect(403);
    });
  });

});
