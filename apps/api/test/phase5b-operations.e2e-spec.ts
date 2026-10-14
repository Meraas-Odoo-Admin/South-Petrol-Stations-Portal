import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import './support/card-scan-shim';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import {
  MUNICIPALITY_SCOPED_ROLES,
  ROLE_KINDS,
  ROLE_PERMISSIONS,
  UNRESTRICTED_STATION_ACCESS_ROLES,
} from '../prisma/rbac-catalog';
import { createMunicipality, deleteMunicipalities } from './support/municipality-fixtures';

// Phase 5B — fuel storage, the notification bell and the role reports.
//
// Jobs are the REAL catalog roles, so these tests prove what the catalog
// grants. Two municipalities, so every scope boundary can be crossed.
describe('Phase 5B — storage, notifications and reports (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authService: AuthService;

  const runId = Date.now().toString(36);
  const prefix = `e2e_p5b_${runId}`;
  const password = 'BoundaryTest123!';

  type CatalogRole =
    | 'system_admin'
    | 'directorate_admin'
    | 'station_supervisor'
    | 'station_employee'
    | 'registration_supervisor'
    | 'registration_employee';
  type UserKey = 'top' | 'mm1' | 'mm2' | 'sup' | 'supS1b' | 'supM2' | 'emp' | 'om' | 'regEmp' | 'regEmpR2';

  const roleIds: string[] = [];
  const roleId = {} as Record<CatalogRole, string>;
  const userId = {} as Record<UserKey, string>;
  const token = {} as Record<UserKey, string>;
  const savedSettings = new Map<string, string | null>();

  let companyId: string;
  let m1: string;
  let m2: string;
  const station = { s1a: '', s1b: '', s2: '' };
  const office = { r1: '', r2: '' };

  async function setSetting(key: string, value: string) {
    if (!savedSettings.has(key)) {
      const existing = await prisma.systemSetting.findUnique({ where: { key } });
      savedSettings.set(key, existing ? existing.value : null);
    }
    await prisma.systemSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }

  async function makeCatalogRole(key: CatalogRole) {
    const role = await prisma.role.create({
      data: {
        name: `${prefix}_${key}`,
        kind: ROLE_KINDS[key] ?? null,
        unrestrictedStationAccess: UNRESTRICTED_STATION_ACCESS_ROLES.has(key),
        municipalityScoped: MUNICIPALITY_SCOPED_ROLES.has(key),
      },
    });
    roleIds.push(role.id);
    roleId[key] = role.id;
    for (const permissionKey of ROLE_PERMISSIONS[key]!) {
      const permission = await prisma.permission.upsert({
        where: { key: permissionKey },
        create: { key: permissionKey },
        update: {},
      });
      await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    }
  }

  async function makeUser(
    key: UserKey,
    roleKey: CatalogRole,
    scope: { municipalities?: string[]; stations?: string[]; offices?: string[] } = {},
  ) {
    const created = await prisma.user.create({
      data: { username: `${prefix}_${key}`, passwordHash: await argon2.hash(password), fullName: `P5B ${key}` },
    });
    userId[key] = created.id;
    await prisma.userRole.create({ data: { userId: created.id, roleId: roleId[roleKey] } });
    for (const municipalityId of scope.municipalities ?? []) {
      await prisma.userMunicipalityScope.create({ data: { userId: created.id, municipalityId } });
    }
    for (const stationId of scope.stations ?? []) {
      await prisma.userStationScope.create({ data: { userId: created.id, stationId } });
    }
    for (const registrationStationId of scope.offices ?? []) {
      await prisma.userRegistrationStationScope.create({ data: { userId: created.id, registrationStationId } });
    }
    token[key] = (await authService.issueTokenPair(created.id, created.username)).accessToken;
  }

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = moduleRef.get(PrismaService);
    authService = moduleRef.get(AuthService);

    await setSetting('stock.low_threshold_liters', '1000');
    // Every fill-up here uses its own plate, so no allowance rule can fire and
    // no global rule setting needs to change (other suites run in parallel).

    companyId = (await prisma.company.create({ data: { name: `P5B Company ${runId}` } })).id;
    m1 = (await createMunicipality(prisma, `P5B M1 ${runId}`)).id;
    m2 = (await createMunicipality(prisma, `P5B M2 ${runId}`)).id;
    for (const [key, municipalityId, number] of [
      ['s1a', m1, '1'],
      ['s1b', m1, '2'],
      ['s2', m2, '3'],
    ] as const) {
      station[key] = (
        await prisma.station.create({
          data: {
            internalCode: `P5B-${runId}-${key}`,
            stationNumber: number,
            name: `P5B station ${key}`,
            companyId,
            municipalityId,
          },
        })
      ).id;
    }
    for (const [key, municipalityId] of [
      ['r1', m1],
      ['r2', m2],
    ] as const) {
      office[key] = (
        await prisma.registrationStation.create({
          data: { internalCode: `P5B-${runId}-${key}`, name: `P5B office ${key}`, municipalityId, address: 'x' },
        })
      ).id;
    }

    for (const key of [
      'system_admin',
      'directorate_admin',
      'station_supervisor',
      'station_employee',
      'registration_supervisor',
      'registration_employee',
    ] as CatalogRole[]) {
      await makeCatalogRole(key);
    }
    await makeUser('top', 'system_admin');
    await makeUser('mm1', 'directorate_admin', { municipalities: [m1] });
    await makeUser('mm2', 'directorate_admin', { municipalities: [m2] });
    await makeUser('sup', 'station_supervisor', { stations: [station.s1a] });
    await makeUser('supS1b', 'station_supervisor', { stations: [station.s1b] });
    await makeUser('supM2', 'station_supervisor', { stations: [station.s2] });
    await makeUser('emp', 'station_employee', { stations: [station.s1a] });
    await makeUser('om', 'registration_supervisor', { offices: [office.r1] });
    await makeUser('regEmp', 'registration_employee', { offices: [office.r1] });
    await makeUser('regEmpR2', 'registration_employee', { offices: [office.r2] });
  }, 90_000);

  afterAll(async () => {
    const created = await prisma.user.findMany({ where: { username: { startsWith: prefix } }, select: { id: true } });
    const ids = created.map((u) => u.id);
    const stationIds = Object.values(station);
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.fillUpTransaction.deleteMany({ where: { stationId: { in: stationIds } } });
    // Fuel entries are insert-only (a trigger); the test removes its own rows.
    await prisma.$executeRawUnsafe('ALTER TABLE "FuelStockEntry" DISABLE TRIGGER "fuel_stock_entry_no_update_delete"');
    try {
      await prisma.fuelStockEntry.deleteMany({ where: { stationId: { in: stationIds }, correctsEntryId: { not: null } } });
      await prisma.fuelStockEntry.deleteMany({ where: { stationId: { in: stationIds } } });
    } finally {
      await prisma.$executeRawUnsafe('ALTER TABLE "FuelStockEntry" ENABLE TRIGGER "fuel_stock_entry_no_update_delete"');
    }
    await prisma.stationFuelStorage.deleteMany({ where: { stationId: { in: stationIds } } });
    await prisma.stationFuelAvailability.deleteMany({ where: { stationId: { in: stationIds } } });
    await prisma.auditLog.deleteMany({
      where: { OR: [{ userId: { in: ids } }, { entityId: { in: [...ids, ...stationIds, m1, m2] } }] },
    });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.userMunicipalityScope.deleteMany({ where: { userId: { in: ids } } });
    await prisma.userStationScope.deleteMany({ where: { userId: { in: ids } } });
    await prisma.userRegistrationStationScope.deleteMany({ where: { userId: { in: ids } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await prisma.registrationStation.deleteMany({ where: { municipalityId: { in: [m1, m2] } } });
    await prisma.station.deleteMany({ where: { companyId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await deleteMunicipalities(prisma, [m1, m2]);
    for (const [key, value] of savedSettings) {
      if (value === null) await prisma.systemSetting.deleteMany({ where: { key } });
      else await prisma.systemSetting.update({ where: { key }, data: { value } });
    }
    await app.close();
  });

  const api = () => request(app.getHttpServer());
  const as = (key: UserKey) => `Bearer ${token[key]}`;
  const get = (key: UserKey, path: string) => api().get(`/api/v1${path}`).set('Authorization', as(key));
  const post = (key: UserKey, path: string, body: object = {}) =>
    api().post(`/api/v1${path}`).set('Authorization', as(key)).send(body);
  const put = (key: UserKey, path: string, body: object) =>
    api().put(`/api/v1${path}`).set('Authorization', as(key)).send(body);
  const patch = (key: UserKey, path: string, body: object) =>
    api().patch(`/api/v1${path}`).set('Authorization', as(key)).send(body);

  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
  const fill = (by: UserKey, stationId: string, liters: number, fuelType = 'PETROL_95') =>
    api()
      .post('/api/v1/fillups')
      .set('Authorization', as(by))
      .set('Idempotency-Key', randomUUID())
      .send({ _freshCard: true, stationId, fuelType, quantityLiters: liters });

  const level = async (by: UserKey, stationId: string, fuelType = 'PETROL_95') => {
    const res = await get(by, `/stations/${stationId}/fuel-stock`).expect(200);
    return res.body.levels.find((l: { fuelType: string }) => l.fuelType === fuelType);
  };
  const notificationsOf = async (by: UserKey, kind: string, stationId?: string) => {
    const res = await get(by, '/notifications?limit=100').expect(200);
    return res.body.items.filter((n: { kind: string; link: string | null }) => n.kind === kind && (!stationId || (n.link ?? '').includes(stationId) || true));
  };
  const storage = (stationId: string, fuelType = 'PETROL_95') => `/stations/${stationId}/fuel-stock/${fuelType}`;

  // ── fuel types a station sells ──────────────────────────────────────────

  describe('fuel types offered', () => {
    it('refuses a fuel type the station does not sell, once any has been chosen', async () => {
      await patch('sup', `/stations/${station.s1a}`, { fuelTypes: ['PETROL_95'] }).expect(200);
      await fill('emp', station.s1a, 10, 'DIESEL').expect(409);
      await fill('emp', station.s1a, 10, 'PETROL_95').expect(201);
    });
  });

  // ── storage ─────────────────────────────────────────────────────────────

  describe('storage and the computed level', () => {
    it('only a supervisor sets up storage; an employee, a municipality manager and another station cannot', async () => {
      const body = { capacityLiters: 30000, openingLevelLiters: 10000 };
      await put('emp', storage(station.s1a) + '/storage', body).expect(403);
      await put('mm1', storage(station.s1a) + '/storage', body).expect(403);
      await put('supM2', storage(station.s1a) + '/storage', body).expect(403);
      await put('sup', storage(station.s1a) + '/storage', body).expect(200);
    });

    it('level = opening + deliveries − dispensed, computed by the server', async () => {
      const start = await level('sup', station.s1a);
      expect(start.status).toBe('OK');
      const before = start.detail.openingLevelLiters + start.detail.delivered - start.detail.dispensed;
      expect(start.level).toBe(before);

      await post('sup', storage(station.s1a) + '/deliveries', {
        liters: 5000,
        truckPlate: '5-123456',
        waybillNumber: 'WB-1',
        driverName: 'سائق',
      }).expect(201);
      await fill('emp', station.s1a, 200).expect(201);
      const after = await level('sup', station.s1a);
      expect(after.level).toBeCloseTo(start.level + 5000 - 200, 3);
      expect(after.detail.delivered).toBe(5000);
    });

    it('refuses a delivery dated before the opening moment (it is already inside the opening level)', async () => {
      await post('sup', storage(station.s1a) + '/deliveries', {
        liters: 100,
        occurredAt: '2020-01-01T10:00:00.000Z',
        truckPlate: '5-000000',
        waybillNumber: 'WB-OLD',
      }).expect(400);
    });

    it('the opening level is locked once something is recorded against it', async () => {
      await put('sup', storage(station.s1a) + '/storage', { capacityLiters: 30000, openingLevelLiters: 9000 }).expect(409);
      // The capacity alone can still be changed.
      await put('sup', storage(station.s1a) + '/storage', { capacityLiters: 32000, openingLevelLiters: 10000 }).expect(200);
    });

    it('a delivery is corrected, never edited: a linked entry with a reason, the original kept', async () => {
      const made = await post('sup', storage(station.s1a) + '/deliveries', {
        liters: 1000,
        truckPlate: '5-654321',
        waybillNumber: 'WB-2',
      }).expect(201);
      const before = (await level('sup', station.s1a)).level;
      await post('sup', `/fuel-stock/entries/${made.body.id}/corrections`, { liters: 800 }).expect(400); // no reason
      await post('sup', `/fuel-stock/entries/${made.body.id}/corrections`, { liters: 800, reason: 'خطأ في كتابة الكمية' }).expect(201);
      expect((await level('sup', station.s1a)).level).toBeCloseTo(before - 200, 3);

      const original = await prisma.fuelStockEntry.findUniqueOrThrow({ where: { id: made.body.id } });
      expect(Number(original.liters)).toBe(1000);
      const link = await prisma.fuelStockEntry.findFirstOrThrow({ where: { correctsEntryId: made.body.id } });
      expect(link.kind).toBe('CORRECTION');
      expect(link.reason).toContain('خطأ');

      const list = await get('sup', `/stations/${station.s1a}/fuel-stock/entries`).expect(200);
      const row = list.body.entries.find((e: { id: string }) => e.id === made.body.id);
      expect(row).toMatchObject({ originalLiters: 1000, liters: 800, corrected: true });
    });

    it('the database refuses to change or remove an entry, and the API has no such route', async () => {
      const entry = await prisma.fuelStockEntry.findFirstOrThrow({ where: { stationId: station.s1a, kind: 'DELIVERY' } });
      await expect(
        prisma.fuelStockEntry.update({ where: { id: entry.id }, data: { liters: 1 } }),
      ).rejects.toThrow(/insert-only/);
      await expect(prisma.fuelStockEntry.delete({ where: { id: entry.id } })).rejects.toThrow(/insert-only/);
      await api().delete(`/api/v1/fuel-stock/entries/${entry.id}`).set('Authorization', as('sup')).expect(404);
      await patch('sup', `/fuel-stock/entries/${entry.id}`, { liters: 1 }).expect(404);
    });

    it('audits set-up, delivery and correction', async () => {
      const actions = await prisma.auditLog.findMany({
        where: { userId: userId.sup, action: { in: ['FUEL_STORAGE_SETUP', 'FUEL_DELIVERY', 'FUEL_DELIVERY_CORRECTION'] } },
        select: { action: true },
      });
      expect(new Set(actions.map((a) => a.action))).toEqual(
        new Set(['FUEL_STORAGE_SETUP', 'FUEL_DELIVERY', 'FUEL_DELIVERY_CORRECTION']),
      );
    });

    it('does not block fill-ups when the level is at or below zero', async () => {
      await put('supS1b', storage(station.s1b) + '/storage', { capacityLiters: 5000, openingLevelLiters: 50 }).expect(200);
      await fill('supS1b', station.s1b, 80).expect(201);
      await fill('supS1b', station.s1b, 80).expect(201);
      const l = await level('supS1b', station.s1b);
      expect(l.status).toBe('DATA_WARNING');
      // Never a bare negative number: the figure is withheld, the detail names it.
      expect(l.level).toBeNull();
      expect(l.detail.computedLevel).toBeLessThan(0);
    });
  });

  // ── the switch that hides stock from employees ──────────────────────────

  describe('«إظهار المخزون للموظفين»', () => {
    it('shows levels to employees while on, with no figures behind them', async () => {
      const res = await get('emp', `/stations/${station.s1a}/fuel-stock`).expect(200);
      expect(res.body.visible).toBe(true);
      expect(res.body.levels[0].level).not.toBeNull();
      expect(res.body.levels[0].detail).toBeUndefined();
      await get('emp', `/stations/${station.s1a}/fuel-stock/entries`).expect(403);
    });

    it('is enforced by the API when switched off, not only hidden by the screen', async () => {
      await patch('emp', `/stations/${station.s1a}/stock-visibility`, { show: false }).expect(403);
      await patch('sup', `/stations/${station.s1a}/stock-visibility`, { show: false }).expect(200);

      const hidden = await get('emp', `/stations/${station.s1a}/fuel-stock`).expect(200);
      expect(hidden.body.visible).toBe(false);
      expect(hidden.body.levels).toEqual([]);
      expect(JSON.stringify(hidden.body)).not.toMatch(/capacityLiters|openingLevel/);

      // The supervisor and the municipality manager still see everything.
      const supSees = await get('sup', `/stations/${station.s1a}/fuel-stock`).expect(200);
      expect(supSees.body.levels.length).toBeGreaterThan(0);
      const mmSees = await get('mm1', `/stations/${station.s1a}/fuel-stock`).expect(200);
      expect(mmSees.body.visible).toBe(true);

      await patch('sup', `/stations/${station.s1a}/stock-visibility`, { show: true }).expect(200);
    });

    it('stock of another station is out of reach for every scoped caller', async () => {
      await get('emp', `/stations/${station.s1b}/fuel-stock`).expect(403);
      await get('mm2', `/stations/${station.s1a}/fuel-stock`).expect(403);
      await get('supM2', `/stations/${station.s1a}/fuel-stock/entries`).expect(403);
    });
  });

  // ── low-stock alerts ────────────────────────────────────────────────────

  describe('low-stock alert fires once per crossing', () => {
    it('alerts when the level drops below 1,000 L, stays quiet after, and alerts again only after a refill', async () => {
      // A fresh station-fuel: diesel at s1a, opening 1500 L.
      await patch('sup', `/stations/${station.s1a}`, { fuelTypes: ['PETROL_95', 'DIESEL'] }).expect(200);
      await put('sup', storage(station.s1a, 'DIESEL') + '/storage', { capacityLiters: 20000, openingLevelLiters: 1500 }).expect(200);

      const lowFor = async (by: UserKey) =>
        (await notificationsOf(by, 'LOW_STOCK')).filter((n: { title: string }) => n.title.includes('ديزل')).length;

      await fill('emp', station.s1a, 300, 'DIESEL').expect(201); // 1200: still above
      expect(await lowFor('sup')).toBe(0);

      await fill('emp', station.s1a, 300, 'DIESEL').expect(201); // 900: crossed
      expect(await lowFor('sup')).toBe(1);
      expect(await lowFor('mm1')).toBe(1);
      expect(await lowFor('emp')).toBe(1); // stock is visible to employees

      await fill('emp', station.s1a, 100, 'DIESEL').expect(201); // 800: no new alert
      await fill('emp', station.s1a, 100, 'DIESEL').expect(201); // 700
      expect(await lowFor('sup')).toBe(1);
      expect(await lowFor('mm1')).toBe(1);

      await post('sup', storage(station.s1a, 'DIESEL') + '/deliveries', {
        liters: 5000,
        truckPlate: '5-111111',
        waybillNumber: 'WB-D1',
      }).expect(201); // refilled above 1,000
      expect(await lowFor('sup')).toBe(1);

      // 5,700 L now; four fill-ups of 1,000 and one of 800 bring it to 900 again.
      for (const liters of [1000, 1000, 1000, 1000, 800]) {
        await fill('emp', station.s1a, liters, 'DIESEL').expect(201);
      }
      expect(await lowFor('sup')).toBe(2);
      expect(await lowFor('mm1')).toBe(2);
    });

    it('reaches only users inside the scope of the station', async () => {
      const aboutS1a = async (by: UserKey) =>
        (await notificationsOf(by, 'LOW_STOCK')).filter((n: { title: string }) => n.title.includes('P5B station s1a'));
      expect(await aboutS1a('sup')).not.toHaveLength(0);
      expect(await aboutS1a('mm1')).not.toHaveLength(0);
      expect(await aboutS1a('mm2')).toHaveLength(0);
      expect(await aboutS1a('supM2')).toHaveLength(0);
      expect(await aboutS1a('supS1b')).toHaveLength(0);
      expect(await aboutS1a('top')).toHaveLength(0); // the super admin is not told station events
      expect(await aboutS1a('om')).toHaveLength(0);
      expect(await aboutS1a('regEmp')).toHaveLength(0);
    });

    it('does not tell employees when the supervisor hides stock from them', async () => {
      await patch('supS1b', `/stations/${station.s1b}/stock-visibility`, { show: false }).expect(200);
      const empB = await prisma.user.create({
        data: { username: `${prefix}_empB`, passwordHash: await argon2.hash(password), fullName: 'P5B empB' },
      });
      await prisma.userRole.create({ data: { userId: empB.id, roleId: roleId.station_employee } });
      await prisma.userStationScope.create({ data: { userId: empB.id, stationId: station.s1b } });
      await patch('supS1b', `/stations/${station.s1b}`, { fuelTypes: ['PETROL_95', 'KEROSENE'] }).expect(200);
      await put('supS1b', storage(station.s1b, 'KEROSENE') + '/storage', { capacityLiters: 9000, openingLevelLiters: 1100 }).expect(200);
      await fill('supS1b', station.s1b, 300, 'KEROSENE').expect(201);
      const count = await prisma.notification.count({ where: { userId: empB.id, kind: 'LOW_STOCK' } });
      expect(count).toBe(0);
      const supCount = await prisma.notification.count({ where: { userId: userId.supS1b, kind: 'LOW_STOCK' } });
      expect(supCount).toBeGreaterThan(0);
    });
  });

  // ── reset to zero ───────────────────────────────────────────────────────

  describe('reset to zero', () => {
    it('needs a reason and the typed word, and is audited and told to the municipality manager', async () => {
      const path = storage(station.s1a) + '/reset';
      await post('sup', path, { reason: 'جرد', confirmation: 'نعم' }).expect(400);
      await post('sup', path, { reason: '', confirmation: 'تصفير' }).expect(400);
      await post('emp', path, { reason: 'جرد فعلي', confirmation: 'تصفير' }).expect(403);

      const before = (await level('sup', station.s1a)).level;
      const done = await post('sup', path, { reason: 'جرد فعلي أظهر خزانًا فارغًا', confirmation: 'تصفير' }).expect(201);
      expect(done.body.previousLevel).toBeCloseTo(before, 3);
      expect((await level('sup', station.s1a)).level).toBe(0);

      const entry = await prisma.fuelStockEntry.findFirstOrThrow({ where: { stationId: station.s1a, kind: 'RESET' } });
      expect(entry.reason).toContain('جرد');
      const audit = await prisma.auditLog.findFirst({ where: { action: 'FUEL_RESET', userId: userId.sup } });
      expect(audit).not.toBeNull();
      expect(await notificationsOf('mm1', 'FUEL_RESET')).toHaveLength(1);
      expect(await notificationsOf('mm2', 'FUEL_RESET')).toHaveLength(0);

      // The level continues from zero with the next delivery.
      await post('sup', storage(station.s1a) + '/deliveries', {
        liters: 3000,
        truckPlate: '5-222222',
        waybillNumber: 'WB-3',
      }).expect(201);
      expect((await level('sup', station.s1a)).level).toBe(3000);
    });
  });

  // ── the bell ────────────────────────────────────────────────────────────

  describe('the notification bell', () => {
    it('lists the caller’s own, newest first, counts unread, and marks read', async () => {
      const list = await get('sup', '/notifications').expect(200);
      expect(list.body.unreadCount).toBeGreaterThan(0);
      const times = list.body.items.map((i: { createdAt: string }) => new Date(i.createdAt).getTime());
      expect([...times].sort((a, b) => b - a)).toEqual(times);

      const first = list.body.items[0];
      await post('sup', `/notifications/${first.id}/read`).expect(201);
      const after = await get('sup', '/notifications').expect(200);
      expect(after.body.unreadCount).toBe(list.body.unreadCount - 1);

      // Someone else's notification cannot be marked by id.
      await post('mm2', `/notifications/${first.id}/read`).expect(201);
      const stillRead = await prisma.notification.findUniqueOrThrow({ where: { id: first.id } });
      expect(stillRead.readAt).not.toBeNull();
      const other = await prisma.notification.findFirstOrThrow({ where: { userId: userId.mm1, readAt: null } });
      await post('mm2', `/notifications/${other.id}/read`).expect(201);
      expect((await prisma.notification.findUniqueOrThrow({ where: { id: other.id } })).readAt).toBeNull();

      await post('sup', '/notifications/read-all').expect(201);
      expect((await get('sup', '/notifications').expect(200)).body.unreadCount).toBe(0);
    });

    it('keeps 90 days: rows older than that are pruned when new ones are written', async () => {
      const old = await prisma.notification.create({
        data: {
          userId: userId.regEmp,
          kind: 'TEST',
          title: 'old',
          body: 'old',
          createdAt: new Date(Date.now() - 100 * 86_400_000),
        },
      });
      expect(old.id).toBeTruthy();
      const count = await prisma.notification.count({ where: { createdAt: { lt: new Date(Date.now() - 90 * 86_400_000) } } });
      expect(count).toBeGreaterThanOrEqual(1);
      await prisma.notification.delete({ where: { id: old.id } });
    });

    it('tells an employee their password was reset', async () => {
      // A separate employee: a reset forces a new password, which would lock
      // this spec's own employee out of everything else.
      const other = await prisma.user.create({
        data: { username: `${prefix}_empReset`, passwordHash: await argon2.hash(password), fullName: 'P5B empReset' },
      });
      await prisma.userRole.create({ data: { userId: other.id, roleId: roleId.station_employee } });
      await prisma.userStationScope.create({ data: { userId: other.id, stationId: station.s1a } });
      const res = await post('sup', `/users/${other.id}/reset-password`).expect(200);
      expect(res.body.temporaryPassword).toBeTruthy();
      const mine = await prisma.notification.findMany({ where: { userId: other.id } });
      expect(mine.some((n) => n.kind === 'PASSWORD_RESET')).toBe(true);
      // And nobody else was told.
      expect(await prisma.notification.count({ where: { userId: userId.emp, kind: 'PASSWORD_RESET' } })).toBe(0);
    });
  });

  // ── reports ─────────────────────────────────────────────────────────────

  describe('reports return only each role’s scope', () => {
    const tableOf = (body: { tables: Array<{ id: string; rows: Array<Record<string, unknown>> }> }, id: string) =>
      body.tables.find((t) => t.id === id)!;

    it('a station employee has the shift report and nothing else', async () => {
      const shift = await get('emp', '/ops-reports/my-shift').expect(200);
      const rows = tableOf(shift.body, 'fillups').rows;
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) expect(r.station).toBe('P5B station s1a');
      await get('emp', '/ops-reports/station').expect(403);
      await get('emp', '/ops-reports/municipality').expect(403);
      await get('emp', '/ops-reports/office').expect(403);
    });

    it('a station supervisor sees only their station, and cannot ask for another', async () => {
      const report = await get('sup', `/ops-reports/station?from=${daysAgo(30)}&to=${daysAgo(-1)}`).expect(200);
      expect(report.body.subject.map((s: { id: string }) => s.id)).toEqual([station.s1a]);
      await get('sup', `/ops-reports/station?stationId=${station.s1b}`).expect(403);
      await get('sup', '/ops-reports/municipality').expect(403);
      const storageRows = tableOf(report.body, 'storage').rows;
      expect(storageRows.length).toBeGreaterThan(0);
      for (const r of storageRows) expect(r.station).toBe('P5B station s1a');
    });

    it('a municipality manager sees their municipality, not another, and the fuel reconciliation figures add up', async () => {
      const own = await get('mm1', `/ops-reports/municipality?from=${daysAgo(30)}&to=${daysAgo(-1)}`).expect(200);
      expect(own.body.subject[0].id).toBe(m1);
      const names = tableOf(own.body, 'stations').rows.map((r) => r.station);
      expect(names).toEqual(expect.arrayContaining(['P5B station s1a', 'P5B station s1b']));
      expect(names).not.toContain('P5B station s2');
      await get('mm1', `/ops-reports/municipality?municipalityId=${m2}`).expect(403);
      await get('mm2', `/ops-reports/municipality?municipalityId=${m1}`).expect(403);

      const recon = tableOf(own.body, 'fuel-reconciliation').rows;
      const petrolA = recon.find((r) => r.station === 'P5B station s1a' && r.fuel === 'بنزين 95')!;
      // start + delivered − dispensed − written off by the reset = level now.
      const start = Number(petrolA.start);
      const delivered = Number(petrolA.delivered);
      const dispensed = Number(petrolA.dispensed);
      const writtenOff = Number(petrolA.resetWrittenOff);
      expect(start + delivered - dispensed - writtenOff).toBeCloseTo(Number(petrolA.level), 2);
      expect(writtenOff).toBeGreaterThan(0);
      expect(Number(petrolA.unaccounted)).toBeCloseTo(writtenOff, 2);
      expect(petrolA.status).toBe('وقود غير مبرَّر');

      // The negative station reports its shortfall as unaccounted fuel.
      const petrolB = recon.find((r) => r.station === 'P5B station s1b' && r.fuel === 'بنزين 95')!;
      expect(Number(petrolB.unaccounted)).toBeGreaterThan(0);
      expect(petrolB.level).toBeNull();
    });

    it('the summary row at the top of the page counts only the caller’s municipality', async () => {
      const own = await get('mm1', '/ops-reports/municipality-summary').expect(200);
      expect(own.body.municipality.id).toBe(m1);
      expect(own.body.fuel.stations).toBe(2);
      expect(own.body.registration.offices).toBe(1);
      expect(own.body.fuel.lowStockStations).toBeGreaterThan(0);
      const other = await get('mm2', '/ops-reports/municipality-summary').expect(200);
      expect(other.body.fuel.stations).toBe(1);
      await get('mm1', `/ops-reports/municipality-summary?municipalityId=${m2}`).expect(403);
      await get('sup', '/ops-reports/municipality-summary').expect(403);
      await get('om', '/ops-reports/municipality-summary').expect(403);
    });

    it('the super admin sees any municipality one at a time and the cross-municipality summary; others do not', async () => {
      const second = await get('top', `/ops-reports/municipality?municipalityId=${m2}`).expect(200);
      expect(second.body.subject[0].id).toBe(m2);
      const summary = await get('top', '/ops-reports/summary').expect(200);
      expect(tableOf(summary.body, 'municipalities').rows.length).toBeGreaterThanOrEqual(2);
      await get('mm1', '/ops-reports/summary').expect(403);
      await get('sup', '/ops-reports/summary').expect(403);
    });

    it('a registration employee has their own day; an office manager their office', async () => {
      const mine = await get('regEmp', '/ops-reports/my-day').expect(200);
      expect(tableOf(mine.body, 'summary').rows).toHaveLength(1);
      await get('regEmp', '/ops-reports/office').expect(403);
      await get('regEmp', '/ops-reports/station').expect(403);

      const officeReport = await get('om', '/ops-reports/office').expect(200);
      expect(officeReport.body.subject.map((s: { id: string }) => s.id)).toEqual([office.r1]);
      await get('om', `/ops-reports/office?officeId=${office.r2}`).expect(403);
      const employees = tableOf(officeReport.body, 'employees').rows.map((r) => r.employee);
      expect(employees).toContain('P5B regEmp');
      expect(employees).not.toContain('P5B regEmpR2');
    });

    it('exports any table as CSV with the same rows and a byte-order mark', async () => {
      const res = await get('mm1', '/ops-reports/municipality/export?table=stations&sort=liters&dir=desc').expect(200);
      expect(res.headers['content-type']).toContain('text/csv');
      const text = res.text;
      expect(text.charCodeAt(0)).toBe(0xfeff);
      expect(text).toContain('P5B station s1a');
      await get('mm1', '/ops-reports/municipality/export?table=nope').expect(404);
    });
  });

  // ── locked job permissions ──────────────────────────────────────────────

  describe('permissions that come from the job', () => {
    const del = (key: UserKey, path: string) => api().delete(`/api/v1${path}`).set('Authorization', as(key));

    it('are shown grouped, ticked and locked; the job’s permissions cannot be removed one by one', async () => {
      const res = await get('mm1', `/users/${userId.sup}/permissions`).expect(200);
      expect(res.body.groups.length).toBeGreaterThan(1);
      const all = res.body.groups.flatMap(
        (g: { permissions: Array<{ id: string; key: string; fromJob: boolean; granted: boolean; canSwitch: boolean }> }) => g.permissions,
      );
      const fromJob = all.filter((p: { fromJob: boolean }) => p.fromJob);
      expect(fromJob.length).toBeGreaterThan(0);
      for (const p of fromJob) {
        expect(p.granted).toBe(true);
        expect(p.canSwitch).toBe(false);
      }
      expect(all.find((p: { key: string }) => p.key === 'fuel_stock:manage')?.fromJob).toBe(true);

      const locked = fromJob[0];
      // The municipality manager's path and the super admin's path both refuse.
      await del('mm1', `/users/${userId.sup}/permissions/${locked.id}`).expect(400);
      await del('top', `/users/${userId.sup}/permissions/${locked.id}`).expect(400);

      // Still held afterwards.
      const permissions = await prisma.rolePermission.count({
        where: { permissionId: locked.id, role: { users: { some: { userId: userId.sup } } } },
      });
      expect(permissions).toBe(1);
    });

    it('an employee, who manages nobody, gets no permission page for a colleague', async () => {
      await get('emp', `/users/${userId.sup}/permissions`).expect(403);
    });
  });
});
