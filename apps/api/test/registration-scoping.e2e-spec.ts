import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { createMunicipality, deleteMunicipalities } from './support/municipality-fixtures';
import { nationalIdTail, vehicleBody } from './support/registration-fixtures';

// Registration pivot, phase 2 — the registration-station boundary test
// (CLAUDE.md rule 3), the counterpart of station-scoping.e2e-spec.ts:
//  - a registration employee sees and registers at ONLY their scoped
//    registration stations, enforced server-side;
//  - registration is refused at a closed/temporarily closed station, or in
//    a PREPARING municipality;
//  - every registered vehicle records where and by whom;
//  - duplicate plate/chassis/booklet are reported field by field, naming the
//    vehicle each one already belongs to.
describe('Registration stations — scoping boundary (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const runId = Date.now().toString(36);
  const password = 'BoundaryTest123!';
  const usernameRegistrar = `e2e_rs_registrar_${runId}`;
  const usernameAdmin = `e2e_rs_admin_${runId}`;
  const roleIds: string[] = [];
  const userIds: string[] = [];
  let registrarId: string;

  let liveMunicipalityId: string;
  let preparingMunicipalityId: string;
  const stations: Record<'inScope' | 'outOfScope' | 'closed' | 'tempClosed' | 'preparing', string> = {
    inScope: '',
    outOfScope: '',
    closed: '',
    tempClosed: '',
    preparing: '',
  };

  const randomDigits = (n: number) => Math.floor(Math.random() * 10 ** n).toString().padStart(n, '0');
  const plate = `7-${randomDigits(7)}`;
  const chassis = `1HGBH41JXMN${randomDigits(6)}`;
  const booklet = randomDigits(8); // Phase 7: digits only
  let ownerId: string;
  let vehicleId: string;
  let vehicleInternalCode: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = moduleRef.get(PrismaService);

    liveMunicipalityId = (await createMunicipality(prisma, `E2E RS Live ${runId}`)).id;
    preparingMunicipalityId = (await createMunicipality(prisma, `E2E RS Preparing ${runId}`, 'PREPARING')).id;

    const createStation = async (
      label: string,
      municipalityId: string,
      status: 'ACTIVE' | 'TEMPORARILY_CLOSED' | 'CLOSED' = 'ACTIVE',
    ) =>
      (
        await prisma.registrationStation.create({
          data: {
            internalCode: `E2E-RS-${label}-${runId}`,
            name: `E2E RS ${label}`,
            municipalityId,
            address: 'E2E',
            status,
          },
        })
      ).id;
    stations.inScope = await createStation('IN', liveMunicipalityId);
    stations.outOfScope = await createStation('OUT', liveMunicipalityId);
    stations.closed = await createStation('CLOSED', liveMunicipalityId, 'CLOSED');
    stations.tempClosed = await createStation('TEMP', liveMunicipalityId, 'TEMPORARILY_CLOSED');
    stations.preparing = await createStation('PREP', preparingMunicipalityId);

    const grant = async (roleId: string, keys: string[]) => {
      for (const key of keys) {
        const permission = await prisma.permission.upsert({ where: { key }, create: { key }, update: {} });
        await prisma.rolePermission.create({ data: { roleId, permissionId: permission.id } });
      }
    };

    // Mirrors rbac-catalog.ts's registration_employee (a test-only copy, so
    // this spec never depends on or mutates the seeded role).
    const registrarRole = await prisma.role.create({
      data: { name: `e2e_rs_registrar_role_${runId}`, kind: 'REGISTRATION' },
    });
    roleIds.push(registrarRole.id);
    await grant(registrarRole.id, [
      'registration_stations:read',
      'vehicles:read',
      'vehicles:manage',
      'owners:read',
      'owners:manage',
    ]);

    const adminRole = await prisma.role.create({
      data: { name: `e2e_rs_admin_role_${runId}`, unrestrictedStationAccess: true },
    });
    roleIds.push(adminRole.id);
    await grant(adminRole.id, ['registration_stations:read', 'registration_stations:manage']);

    const createUser = async (username: string, roleId: string) => {
      const user = await prisma.user.create({
        data: { username, passwordHash: await argon2.hash(password), fullName: `E2E RS ${username}` },
      });
      userIds.push(user.id);
      await prisma.userRole.create({ data: { userId: user.id, roleId } });
      return user;
    };

    const registrar = await createUser(usernameRegistrar, registrarRole.id);
    registrarId = registrar.id;
    for (const id of [stations.inScope, stations.closed, stations.tempClosed, stations.preparing]) {
      await prisma.userRegistrationStationScope.create({ data: { userId: registrar.id, registrationStationId: id } });
    }
    await createUser(usernameAdmin, adminRole.id);
  });

  afterAll(async () => {
    const createdStationIds = await prisma.registrationStation.findMany({
      where: { OR: [{ municipalityId: liveMunicipalityId }, { municipalityId: preparingMunicipalityId }] },
      select: { id: true },
    });
    const allStationIds = createdStationIds.map((s) => s.id);
    await prisma.duplicateCatch.deleteMany({ where: { registrationStationId: { in: allStationIds } } });
    await prisma.vehiclePlateHistory.deleteMany({ where: { vehicle: { registeredById: registrarId } } });
    await prisma.vehicle.deleteMany({ where: { registeredById: registrarId } });
    if (ownerId) await prisma.vehicleOwner.deleteMany({ where: { id: ownerId } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userRegistrationStationScope.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await prisma.registrationStation.deleteMany({ where: { id: { in: allStationIds } } });
    await deleteMunicipalities(prisma, [liveMunicipalityId, preparingMunicipalityId]);
    await app.close();
  });

  const tokens = new Map<string, string>();
  async function login(username: string): Promise<string> {
    const cached = tokens.get(username);
    if (cached) return cached;
    const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ username, password }).expect(200);
    tokens.set(username, res.body.accessToken);
    return res.body.accessToken;
  }
  async function asRegistrar(method: 'get' | 'post', path: string, body?: object) {
    const token = await login(usernameRegistrar);
    const req = request(app.getHttpServer())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token}`);
    return body ? req.send(body) : req;
  }
  const ownerBody = (registrationStationId: string, identityDigits = nationalIdTail()) => ({
    registrationStationId,
    fullName: 'مالك تجريبي للتسجيل',
    identityType: 'NATIONAL_ID',
    identityNumber: `1${identityDigits}`,
    phone: '0912345678',
  });

  // ── Reading registration stations ─────────────────────────────────────

  it('lists only the registrar\'s scoped registration stations, and 403s an out-of-scope one', async () => {
    const list = await asRegistrar('get', '/registration-stations');
    expect(list.status).toBe(200);
    const ids = list.body.map((s: { id: string }) => s.id);
    expect(ids).toEqual(
      expect.arrayContaining([stations.inScope, stations.closed, stations.tempClosed, stations.preparing]),
    );
    expect(ids).not.toContain(stations.outOfScope);

    expect((await asRegistrar('get', `/registration-stations/${stations.outOfScope}`)).status).toBe(403);
    expect((await asRegistrar('get', `/registration-stations/${stations.inScope}`)).status).toBe(200);
  });

  // ── Registering an owner ─────────────────────────────────────────────

  it('refuses to register an owner at an out-of-scope registration station, and creates nothing', async () => {
    const digits = nationalIdTail();
    const res = await asRegistrar('post', '/owners', ownerBody(stations.outOfScope, digits));
    expect(res.status).toBe(403);
    expect(
      await prisma.vehicleOwner.count({ where: { identityType: 'NATIONAL_ID', identityNumber: `1${digits}` } }),
    ).toBe(0);
  });

  it('registers an owner at an in-scope station, recording the station in the audit entry, and finds them by exact identity', async () => {
    const body = ownerBody(stations.inScope);
    const res = await asRegistrar('post', '/owners', body);
    expect(res.status).toBe(201);
    ownerId = res.body.id;

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityType: 'VehicleOwner', entityId: ownerId, action: 'CREATE' },
    });
    expect(audit.userId).toBe(registrarId);
    expect((audit.newValue as { registrationStationId: string }).registrationStationId).toBe(stations.inScope);

    const found = await asRegistrar(
      'get',
      `/owners?identityType=NATIONAL_ID&identityNumber=${body.identityNumber}`,
    );
    expect(found.status).toBe(200);
    expect(found.body.map((o: { id: string }) => o.id)).toEqual([ownerId]);
  });

  // ── Registering a vehicle ────────────────────────────────────────────

  it('registers a vehicle at an in-scope station and records where and by whom', async () => {
    const res = await asRegistrar(
      'post',
      '/vehicles',
      vehicleBody({
        registrationStationId: stations.inScope,
        ownerId,
        currentPlate: plate,
        chassisNumber: chassis,
        registrationBooklet: booklet,
      }),
    );
    expect(res.status).toBe(201);
    vehicleId = res.body.id;
    vehicleInternalCode = res.body.internalCode;
    expect(res.body.registeredAtRegistrationStationId).toBe(stations.inScope);
    expect(res.body.registeredById).toBe(registrarId);
  });

  it('refuses registration out of scope (403) and at closed / temporarily closed stations; a not-activated municipality still registers', async () => {
    const vehicleAt = (registrationStationId: string) =>
      asRegistrar('post', '/vehicles', vehicleBody({ registrationStationId, ownerId, currentPlate: `7-${randomDigits(7)}` }));

    expect((await vehicleAt(stations.outOfScope)).status).toBe(403);

    for (const id of [stations.closed, stations.tempClosed]) {
      const res = await vehicleAt(id);
      expect(res.status).toBe(409);
      expect(res.body.message).toBe('REGISTRATION_STATION_NOT_ACTIVE');
    }

    // Phase 6: the activation switch gates nothing, registration included.
    const preparing = await vehicleAt(stations.preparing);
    expect(preparing.status).toBe(201);

    // Owners are refused the same way.
    const ownerAtClosed = await asRegistrar('post', '/owners', ownerBody(stations.closed));
    expect(ownerAtClosed.status).toBe(409);

    expect(await prisma.vehicle.count({ where: { registeredById: registrarId } })).toBe(2);
  });

  it('requires a registration station on every registration', async () => {
    expect((await asRegistrar('post', '/vehicles', vehicleBody({ ownerId, currentPlate: `7-${randomDigits(7)}` }))).status).toBe(400);
    const { registrationStationId: _omit, ...noStation } = ownerBody(stations.inScope);
    expect((await asRegistrar('post', '/owners', noStation)).status).toBe(400);
  });

  // ── Duplicate checks ─────────────────────────────────────────────────

  it('reports every clashing field and the vehicle it already belongs to — before saving and on save', async () => {
    const caught = () => prisma.duplicateCatch.count({ where: { registrationStationId: stations.inScope, userId: registrarId } });
    const caughtBefore = await caught();
    const check = await asRegistrar(
      'get',
      `/vehicles/duplicate-check?currentPlate=${plate}&chassisNumber=${chassis}&registrationBooklet=${booklet}`,
    );
    expect(check.status).toBe(200);
    expect(check.body.conflicts.map((c: { field: string }) => c.field).sort()).toEqual(
      ['chassisNumber', 'currentPlate', 'registrationBooklet'],
    );
    for (const conflict of check.body.conflicts) {
      expect(conflict.vehicle).toEqual({ id: vehicleId, internalCode: vehicleInternalCode, currentPlate: plate });
    }

    const clean = await asRegistrar('get', `/vehicles/duplicate-check?currentPlate=7-${randomDigits(7)}`);
    expect(clean.body.conflicts).toEqual([]);
    // The as-you-type lookup is not a registration attempt: nothing is recorded.
    expect(await caught()).toBe(caughtBefore);

    const save = await asRegistrar(
      'post',
      '/vehicles',
      vehicleBody({ registrationStationId: stations.inScope, ownerId, currentPlate: plate }),
    );
    expect(save.status).toBe(409);
    expect(save.body.message).toBe('VEHICLE_DUPLICATE');
    expect(save.body.details.conflicts).toEqual([
      { field: 'currentPlate', vehicle: { id: vehicleId, internalCode: vehicleInternalCode, currentPlate: plate } },
    ]);

    // A refused registration is a duplicate caught: recorded for the office report, with who and where.
    expect(await caught()).toBe(caughtBefore + 1);
    const row = await prisma.duplicateCatch.findFirstOrThrow({
      where: { registrationStationId: stations.inScope, userId: registrarId },
      orderBy: { occurredAt: 'desc' },
    });
    expect(row.fields).toEqual(['PLATE']);
    expect(await prisma.auditLog.count({ where: { action: 'DUPLICATE_CAUGHT', entityId: stations.inScope, userId: registrarId } })).toBeGreaterThanOrEqual(1);
  });

  // ── Managing registration stations ───────────────────────────────────

  it('lets only registration_stations:manage create and edit stations, with a generated code and an audit trail', async () => {
    const registrarCreate = await asRegistrar('post', '/registration-stations', {
      name: 'nope',
      municipalityId: liveMunicipalityId,
      address: 'x',
    });
    expect(registrarCreate.status).toBe(403);

    const adminToken = await login(usernameAdmin);
    const created = await request(app.getHttpServer())
      .post('/api/v1/registration-stations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `E2E RS Admin-created ${runId}`,
        municipalityId: liveMunicipalityId,
        address: 'شارع تجريبي',
        latitude: 27.0377,
        longitude: 14.4283,
        contactPhone: '071-2345678',
        workingHours: 'السبت–الخميس 8:00–14:00',
      })
      .expect(201);
    expect(created.body.internalCode).toMatch(/^REG-\d{6}$/);
    expect(created.body.municipality.id).toBe(liveMunicipalityId);

    const closed = await request(app.getHttpServer())
      .patch(`/api/v1/registration-stations/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'TEMPORARILY_CLOSED', statusNote: 'صيانة' })
      .expect(200);
    expect(closed.body.status).toBe('TEMPORARILY_CLOSED');

    const audits = await prisma.auditLog.findMany({
      where: { entityType: 'RegistrationStation', entityId: created.body.id },
    });
    expect(audits.map((a) => a.action).sort()).toEqual(['CREATE', 'UPDATE']);
    // Never log the contact phone (CLAUDE.md rule 10).
    expect(JSON.stringify(audits)).not.toContain('2345678');
  });
});
