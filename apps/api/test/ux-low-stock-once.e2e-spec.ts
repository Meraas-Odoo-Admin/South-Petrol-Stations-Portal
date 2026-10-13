import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { NotificationsService } from '../src/notifications/notifications.service';
import { ROLE_PERMISSIONS } from '../prisma/rbac-catalog';
import { createMunicipality, deleteMunicipalities } from './support/municipality-fixtures';

// UX round: ONE event reaches each person ONCE, however many levels they belong
// to. A person who is scoped to the station AND to its municipality (so they are
// in the supervisor tier and the manager tier) gets exactly one low-stock
// notification for one crossing - and a second one only for a second crossing.
describe('One notification per person per event (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let notifications: NotificationsService;

  const runId = Date.now().toString(36);
  const password = 'BoundaryTest123!';
  const userIds: string[] = [];
  const roleIds: string[] = [];
  const tokens = new Map<string, string>();
  let municipalityId: string;
  let companyId: string;
  let stationId: string;
  let plate = 300000;

  async function makeUser(key: string, permissions: string[], scope: { station?: boolean; municipality?: boolean }) {
    const role = await prisma.role.create({ data: { name: `e2e_ls_${key}_${runId}`, kind: null } });
    roleIds.push(role.id);
    for (const permissionKey of permissions) {
      const p = await prisma.permission.upsert({ where: { key: permissionKey }, create: { key: permissionKey }, update: {} });
      await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: p.id } });
    }
    const user = await prisma.user.create({
      data: { username: `e2e_ls_${key}_${runId}`, passwordHash: await argon2.hash(password), fullName: `LS ${key} ${runId}` },
    });
    userIds.push(user.id);
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    if (scope.station) await prisma.userStationScope.create({ data: { userId: user.id, stationId } });
    if (scope.municipality) await prisma.userMunicipalityScope.create({ data: { userId: user.id, municipalityId } });
    const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ username: user.username, password }).expect(200);
    tokens.set(key, res.body.accessToken);
    return user.id;
  }

  const call = (method: 'get' | 'put' | 'post' | 'patch', key: string, path: string, body?: object) => {
    const r = request(app.getHttpServer())[method](`/api/v1${path}`).set('Authorization', `Bearer ${tokens.get(key)}`);
    return body ? r.send(body) : r;
  };
  const fill = (key: string, liters: number) =>
    request(app.getHttpServer())
      .post('/api/v1/fillups')
      .set('Authorization', `Bearer ${tokens.get(key)}`)
      .set('Idempotency-Key', randomUUID())
      .send({ plate: `7-${plate++}`, stationId, fuelType: 'DIESEL', quantityLiters: liters });
  const lowStock = async (key: string) => {
    const res = await call('get', key, '/notifications?limit=100').expect(200);
    return res.body.items.filter((n: { kind: string }) => n.kind === 'LOW_STOCK');
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = moduleRef.get(PrismaService);
    notifications = moduleRef.get(NotificationsService);

    municipalityId = (await createMunicipality(prisma, `E2E LS Municipality ${runId}`)).id;
    companyId = (await prisma.company.create({ data: { name: `E2E LS Co ${runId}` } })).id;
    stationId = (
      await prisma.station.create({
        data: { internalCode: `LS-${runId}`, stationNumber: '1', name: `E2E LS station ${runId}`, companyId, municipalityId },
      })
    ).id;
    await prisma.stationFuelAvailability.create({ data: { stationId, fuelType: 'DIESEL', isAvailable: true } });

    // Everything a station supervisor and a municipality manager can do and be told.
    const both = [...new Set([...ROLE_PERMISSIONS.station_supervisor!, ...ROLE_PERMISSIONS.directorate_admin!])];
    await makeUser('both', both, { station: true, municipality: true });
    // The same permissions at ONE level each, as the controls.
    await makeUser('stationOnly', ROLE_PERMISSIONS.station_supervisor!, { station: true });
    await makeUser('municipalityOnly', ROLE_PERMISSIONS.directorate_admin!, { municipality: true });
  }, 120_000);

  afterAll(async () => {
    // Fuel-stock entries are insert-only (a trigger); the spec removes its own rows as the other specs do.
    await prisma.$executeRawUnsafe('ALTER TABLE "FuelStockEntry" DISABLE TRIGGER "fuel_stock_entry_no_update_delete"');
    try {
      await prisma.fuelStockEntry.deleteMany({ where: { stationId, correctsEntryId: { not: null } } });
      await prisma.fuelStockEntry.deleteMany({ where: { stationId } });
    } finally {
      await prisma.$executeRawUnsafe('ALTER TABLE "FuelStockEntry" ENABLE TRIGGER "fuel_stock_entry_no_update_delete"');
    }
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.fillUpTransaction.deleteMany({ where: { stationId } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userStationScope.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userMunicipalityScope.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await prisma.stationFuelStorage.deleteMany({ where: { stationId } });
    await prisma.stationFuelAvailability.deleteMany({ where: { stationId } });
    await prisma.station.deleteMany({ where: { id: stationId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await deleteMunicipalities(prisma, [municipalityId]);
    await app.close();
  });

  it('the service sends one person in two tiers one notification, with the first tier\'s link', async () => {
    const before = await prisma.notification.count({ where: { userId: userIds[0]!, kind: 'E2E_ONCE' } });
    const created = await notifications.notifyScopeOnce(
      { stationId },
      { kind: 'E2E_ONCE', title: 'اختبار', body: 'مرة واحدة', entityType: 'Station', entityId: stationId },
      [
        { permissions: ['notifications:station_events'], link: '/my-station' },
        { permissions: ['notifications:municipality_events'], link: '/manage' },
      ],
    );
    // 'both' (two tiers), 'stationOnly' and 'municipalityOnly': three people, three rows.
    expect(created).toBe(3);
    const rows = await prisma.notification.findMany({ where: { userId: userIds[0]!, kind: 'E2E_ONCE' } });
    expect(rows).toHaveLength(before + 1);
    expect(rows[0]!.link).toBe('/my-station');
    expect(await prisma.notification.count({ where: { userId: { in: userIds }, kind: 'E2E_ONCE' } })).toBe(3);
  });

  it('one low-stock crossing reaches a user in scope at two levels exactly once', async () => {
    await call('put', 'both', `/stations/${stationId}/fuel-stock/DIESEL/storage`, {
      capacityLiters: 20000,
      openingLevelLiters: 1500,
    }).expect(200);
    // Above the 1,000 L threshold: nothing yet.
    expect(await lowStock('both')).toHaveLength(0);

    await fill('both', 300).expect(201); // 1200
    await fill('both', 300).expect(201); // 900: the crossing
    expect(await lowStock('both')).toHaveLength(1);
    // The people at one level each are told exactly once as well.
    expect(await lowStock('stationOnly')).toHaveLength(1);
    expect(await lowStock('municipalityOnly')).toHaveLength(1);

    // And in the database: one row per person, not one per tier.
    for (const id of userIds) {
      expect(await prisma.notification.count({ where: { userId: id, kind: 'LOW_STOCK', entityId: stationId } })).toBe(1);
    }
  }, 90_000);

  it('staying low sends nothing more, and a refill then a second crossing is a second notification', async () => {
    await fill('both', 100).expect(201); // 800: no new alert
    expect(await lowStock('both')).toHaveLength(1);

    await call('post', 'both', `/stations/${stationId}/fuel-stock/DIESEL/deliveries`, {
      liters: 5000,
      truckPlate: '5-222222',
      waybillNumber: `WB-LS-${runId}`,
    }).expect(201);
    for (const liters of [1000, 1000, 1000, 1000, 900]) await fill('both', liters).expect(201);

    expect(await lowStock('both')).toHaveLength(2);
    expect(await prisma.notification.count({ where: { userId: userIds[0]!, kind: 'LOW_STOCK', entityId: stationId } })).toBe(2);
  }, 120_000);
});
