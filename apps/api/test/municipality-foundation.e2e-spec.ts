import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { createMunicipality, deleteMunicipalities } from './support/municipality-fixtures';

// Registration pivot, phase 1 — the municipality foundation, end to end
// through the real Prisma-backed repository (the rule engine's own
// per-municipality logic is unit-tested in fill-up-rule-engine.spec.ts):
//  - every fill-up is stamped with its station's municipality, and the
//    stamp never moves when the station's municipality is later corrected;
//  - allowances are counted per vehicle per municipality, and
//    GET /fillups/rule-preview agrees with the real submit;
//  - no fill-up at a station with no municipality, or in a PREPARING one;
//  - PREPARING municipalities' stations are admin-only;
//  - one security authority per municipality, required before going LIVE;
//  - the station form no longer accepts a per-station authority.
describe('Municipality foundation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const runId = Date.now().toString(36);
  const password = 'BoundaryTest123!';
  const usernameRecorder = `e2e_mf_recorder_${runId}`;
  const usernameAdmin = `e2e_mf_admin_${runId}`;

  let recorderUserId: string;
  let adminUserId: string;
  const roleIds: string[] = [];

  let company: { id: string };
  let muniA: { id: string };
  let muniB: { id: string };
  let muniC: { id: string };
  let muniPreparing: { id: string };
  let stationA: { id: string };
  let stationB: { id: string };
  let stationMoving: { id: string };
  let stationPreparing: { id: string };
  let stationOutOfScope: { id: string };
  const vehicleIds: string[] = [];
  let exceptionTypeId: string;
  const createdMunicipalityIds: string[] = [];

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = moduleRef.get(PrismaService);

    const settings: Array<[string, string]> = [
      ['fillup.max_per_week', '3'],
      ['fillup.min_gap_days', '2'],
      ['fillup.max_per_week_per_owner', '3'],
      ['fillup.min_gap_days_per_owner', '2'],
      ['fillup.max_liters_per_week_per_owner', '100000'],
      ['fillup.week_window_mode', 'rolling'],
      ['fillup.week_start_day', '6'],
    ];
    for (const [key, value] of settings) {
      await prisma.systemSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
    }
    const exceptionType = await prisma.exceptionType.upsert({
      where: { key: 'E2E_MF_EXCEPTION_TYPE' },
      create: { key: 'E2E_MF_EXCEPTION_TYPE', name: 'E2E municipality-foundation exception', requiresProof: false },
      update: {},
    });
    exceptionTypeId = exceptionType.id;

    company = await prisma.company.create({ data: { name: `E2E MF Company ${runId}` } });
    muniA = await createMunicipality(prisma, `E2E MF A ${runId}`);
    muniB = await createMunicipality(prisma, `E2E MF B ${runId}`);
    muniC = await createMunicipality(prisma, `E2E MF C ${runId}`);
    muniPreparing = await createMunicipality(prisma, `E2E MF Preparing ${runId}`, 'PREPARING');

    let stationNumber = 0;
    const createStation = (label: string, municipalityId: string) =>
      prisma.station.create({
        data: {
          internalCode: `E2E-MF-${label}-${runId}`,
          stationNumber: String(++stationNumber),
          name: `E2E MF ${label}`,
          companyId: company.id,
          municipalityId,
        },
      });
    stationA = await createStation('A', muniA.id);
    stationB = await createStation('B', muniB.id);
    stationMoving = await createStation('MOVING', muniA.id);
    stationPreparing = await createStation('PREP', muniPreparing.id);
    stationOutOfScope = await createStation('OUTSCOPE', muniA.id);

    for (let i = 1; i <= 4; i++) {
      const vehicle = await prisma.vehicle.create({
        data: { internalCode: `E2E-MF-VEH-${i}-${runId}`, currentPlate: `E2E-MF-PLATE-${i}-${runId}` },
      });
      vehicleIds.push(vehicle.id);
    }

    const permission = (key: string) =>
      prisma.permission.upsert({ where: { key }, create: { key }, update: {} });
    const grant = async (roleId: string, keys: string[]) => {
      for (const key of keys) {
        const p = await permission(key);
        await prisma.rolePermission.create({ data: { roleId, permissionId: p.id } });
      }
    };

    // Scoped station employee: every test station except stationOutOfScope.
    const recorderRole = await prisma.role.create({ data: { name: `e2e_mf_recorder_role_${runId}` } });
    roleIds.push(recorderRole.id);
    await grant(recorderRole.id, ['fillups:create', 'fillups:record_exception', 'stations:read']);

    // Admin: the station/municipality/authority admin screens.
    const adminRole = await prisma.role.create({
      data: { name: `e2e_mf_admin_role_${runId}`, unrestrictedStationAccess: true },
    });
    roleIds.push(adminRole.id);
    await grant(adminRole.id, [
      'stations:read',
      'stations:manage',
      'stations:create',
      'stations:view_preparing',
      'municipalities:read',
      'municipalities:manage',
      'security_authorities:read',
      'security_authorities:manage',
    ]);

    const createUser = async (username: string) =>
      prisma.user.create({
        data: { username, passwordHash: await argon2.hash(password), fullName: `E2E MF ${username}` },
      });

    const recorder = await createUser(usernameRecorder);
    recorderUserId = recorder.id;
    await prisma.userRole.create({ data: { userId: recorder.id, roleId: recorderRole.id } });
    for (const station of [stationA, stationB, stationMoving, stationPreparing]) {
      await prisma.userStationScope.create({ data: { userId: recorder.id, stationId: station.id } });
    }

    const admin = await createUser(usernameAdmin);
    adminUserId = admin.id;
    await prisma.userRole.create({ data: { userId: admin.id, roleId: adminRole.id } });
  });

  afterAll(async () => {
    const userIds = [recorderUserId, adminUserId];
    await prisma.exception.deleteMany({ where: { fillUpTransaction: { vehicleId: { in: vehicleIds } } } });
    await prisma.fillUpTransaction.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userStationScope.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await prisma.vehicle.deleteMany({ where: { id: { in: vehicleIds } } });
    await prisma.station.deleteMany({ where: { companyId: company.id } });
    await prisma.company.delete({ where: { id: company.id } });
    await deleteMunicipalities(prisma, [muniA.id, muniB.id, muniC.id, muniPreparing.id, ...createdMunicipalityIds]);
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

  let keyCounter = 0;
  async function submit(
    vehicleId: string,
    stationId: string,
    expectedStatus: number,
    extra: Record<string, unknown> = {},
  ) {
    const token = await login(usernameRecorder);
    return request(app.getHttpServer())
      .post('/api/v1/fillups')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `e2e-mf-${runId}-${++keyCounter}`)
      .send({ vehicleId, stationId, fuelType: 'PETROL_95', quantityLiters: 20, ...extra })
      .expect(expectedStatus);
  }
  async function preview(vehicleId: string, stationId: string, expectedStatus: number) {
    const token = await login(usernameRecorder);
    return request(app.getHttpServer())
      .get('/api/v1/fillups/rule-preview')
      .query({ vehicleId, stationId })
      .set('Authorization', `Bearer ${token}`)
      .expect(expectedStatus);
  }
  const vehicle = (index: number) => vehicleIds[index]!;
  const firstFailing = (checks: Array<{ reason: string; passed: boolean }>) =>
    checks.find((c) => !c.passed)?.reason ?? null;

  // ── Stamping and per-municipality allowances ──────────────────────────

  describe('per-municipality allowances through the real repository', () => {
    let firstFillUpAt: string;

    it('stamps a fill-up with its station\'s municipality', async () => {
      const res = await submit(vehicle(0), stationA.id, 201);
      expect(res.body.municipalityId).toBe(muniA.id);
      firstFillUpAt = res.body.occurredAt;
    });

    it('allows the same vehicle in municipality B the same day — preview and submit agree', async () => {
      const previewRes = await preview(vehicle(0), stationB.id, 200);
      expect(firstFailing(previewRes.body.checks)).toBeNull();

      const res = await submit(vehicle(0), stationB.id, 201);
      expect(res.body.municipalityId).toBe(muniB.id);
    });

    it('blocks a second fill-up back in municipality A (gap rule), citing the A fill-up — preview and submit agree', async () => {
      const previewRes = await preview(vehicle(0), stationA.id, 200);
      expect(firstFailing(previewRes.body.checks)).toBe('VEHICLE_GAP_TOO_SHORT');
      const weekly = previewRes.body.checks.find((c: { reason: string }) => c.reason === 'VEHICLE_WEEKLY_CAP_REACHED');
      expect(weekly.actual).toBe(1); // only A's fill-up counts in A — not B's

      const res = await submit(vehicle(0), stationA.id, 422);
      expect(res.body.reason).toBe('VEHICLE_GAP_TOO_SHORT');
      expect(res.body.trigger.occurredAt).toBe(firstFillUpAt);
    });

    it('an exception-mode fill-up is stamped too', async () => {
      const res = await submit(vehicle(0), stationA.id, 201, {
        exceptionTypeId,
        reason: 'E2E: exception fill-up in A',
      });
      expect(res.body.isException).toBe(true);
      expect(res.body.municipalityId).toBe(muniA.id);
    });

    it('keeps a past fill-up\'s municipality when an admin later corrects the station\'s municipality', async () => {
      const first = await submit(vehicle(1), stationMoving.id, 201);
      expect(first.body.municipalityId).toBe(muniA.id);

      const adminToken = await login(usernameAdmin);
      await request(app.getHttpServer())
        .patch(`/api/v1/stations/${stationMoving.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ municipalityId: muniC.id })
        .expect(200);

      const stored = await prisma.fillUpTransaction.findUniqueOrThrow({ where: { id: first.body.id } });
      expect(stored.municipalityId).toBe(muniA.id);

      // The station is now in C: a new fill-up there is stamped C and draws
      // on C's separate allowance, so the same-day fill-up is allowed.
      const second = await submit(vehicle(1), stationMoving.id, 201);
      expect(second.body.municipalityId).toBe(muniC.id);
    });
  });

  // ── Refusals ──────────────────────────────────────────────────────────

  describe('stations that cannot take fill-ups', () => {
    it('refuses a fill-up in a PREPARING municipality — exception mode included', async () => {
      const res = await submit(vehicle(2), stationPreparing.id, 409);
      expect(res.body.message).toBe('MUNICIPALITY_NOT_LIVE');
      const asException = await submit(vehicle(2), stationPreparing.id, 409, {
        exceptionTypeId,
        reason: 'E2E: must still be refused',
      });
      expect(asException.body.message).toBe('MUNICIPALITY_NOT_LIVE');
      await preview(vehicle(2), stationPreparing.id, 409);
      expect(await prisma.fillUpTransaction.count({ where: { vehicleId: vehicle(2) } })).toBe(0);
    });
  });

  // ── rule-preview input + station-scoping boundary (CLAUDE.md rule 3) ──

  describe('GET /fillups/rule-preview', () => {
    it('requires stationId', async () => {
      const token = await login(usernameRecorder);
      await request(app.getHttpServer())
        .get('/api/v1/fillups/rule-preview')
        .query({ vehicleId: vehicle(3) })
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });

    it('403s for a station outside the caller\'s scope', async () => {
      await preview(vehicle(3), stationOutOfScope.id, 403);
    });
  });

  // ── Visibility of PREPARING municipalities' stations ─────────────────

  describe('station visibility', () => {
    it('hides a PREPARING municipality\'s stations from non-admins, even in scope', async () => {
      const token = await login(usernameRecorder);
      const list = await request(app.getHttpServer())
        .get('/api/v1/stations')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const ids = list.body.map((s: { id: string }) => s.id);
      expect(ids).toEqual(expect.arrayContaining([stationA.id, stationB.id]));
      expect(ids).not.toContain(stationPreparing.id);

      await request(app.getHttpServer())
        .get(`/api/v1/stations/${stationPreparing.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('shows them on admin screens (stations:view_preparing)', async () => {
      const token = await login(usernameAdmin);
      const list = await request(app.getHttpServer())
        .get('/api/v1/stations')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(list.body.map((s: { id: string }) => s.id)).toContain(stationPreparing.id);
    });

    it('shows a station\'s security authority through its municipality', async () => {
      const token = await login(usernameAdmin);
      await prisma.securityAuthority.create({
        data: { name: `E2E MF Authority A ${runId}`, municipalityId: muniA.id },
      });
      const res = await request(app.getHttpServer())
        .get(`/api/v1/stations/${stationA.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.municipality.securityAuthority.name).toBe(`E2E MF Authority A ${runId}`);
      expect(res.body).not.toHaveProperty('securityAuthority');
    });

    it('no longer accepts a per-station security authority', async () => {
      const token = await login(usernameAdmin);
      await request(app.getHttpServer())
        .patch(`/api/v1/stations/${stationA.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ securityAuthorityId: 'anything' })
        .expect(400);
    });
  });

  // ── Security authority per municipality, and going LIVE ──────────────

  describe('security authorities and municipality status', () => {
    // Phase 5A: a municipality's directorate is created WITH it, never picked
    // or forgotten later.
    it('creates the municipality\'s security directorate automatically, named after it', async () => {
      const token = await login(usernameAdmin);
      const name = `E2E MF Created ${runId}`;
      const res = await request(app.getHttpServer())
        .post('/api/v1/municipalities')
        .set('Authorization', `Bearer ${token}`)
        .send({ name })
        .expect(201);
      createdMunicipalityIds.push(res.body.id);
      expect(res.body.status).toBe('PREPARING');
      expect(res.body.securityAuthority.name).toBe(`مديرية أمن ${name}`);

      const stored = await prisma.securityAuthority.findUnique({ where: { municipalityId: res.body.id } });
      expect(stored?.name).toBe(`مديرية أمن ${name}`);
    });

    it('has no separate create for authorities any more', async () => {
      const token = await login(usernameAdmin);
      await request(app.getHttpServer())
        .post('/api/v1/security-authorities')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: `E2E MF Manual ${runId}`, municipalityId: muniPreparing.id })
        .expect(404);
    });

    it('lets the super admin rename the directorate, through its municipality', async () => {
      const token = await login(usernameAdmin);
      const id = createdMunicipalityIds[0]!;
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/municipalities/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ securityAuthorityName: `E2E MF Renamed ${runId}` })
        .expect(200);
      expect(res.body.securityAuthority.name).toBe(`E2E MF Renamed ${runId}`);
    });

    it('a municipality created before that rule gets its directorate at the moment it goes LIVE', async () => {
      const token = await login(usernameAdmin);
      expect(await prisma.securityAuthority.findUnique({ where: { municipalityId: muniPreparing.id } })).toBeNull();

      const live = await request(app.getHttpServer())
        .patch(`/api/v1/municipalities/${muniPreparing.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'LIVE' })
        .expect(200);
      expect(live.body.status).toBe('LIVE');
      expect(live.body.securityAuthority.name).toBe(`مديرية أمن E2E MF Preparing ${runId}`);

      const audit = await prisma.auditLog.findFirst({
        where: { entityType: 'Municipality', entityId: muniPreparing.id, userId: adminUserId },
      });
      expect(audit).not.toBeNull();
    });

    it('a station in a municipality that has just gone LIVE can take fill-ups', async () => {
      const res = await submit(vehicle(3), stationPreparing.id, 201);
      expect(res.body.municipalityId).toBe(muniPreparing.id);
    });

    it('switching LIVE back to PREPARING requires typing the municipality\'s exact name', async () => {
      const token = await login(usernameAdmin);
      const patch = (body: object) =>
        request(app.getHttpServer())
          .patch(`/api/v1/municipalities/${muniPreparing.id}`)
          .set('Authorization', `Bearer ${token}`)
          .send(body);

      const missing = await patch({ status: 'PREPARING' }).expect(400);
      expect(missing.body.message).toBe('CONFIRMATION_NAME_MISMATCH');
      await patch({ status: 'PREPARING', confirmName: 'wrong name' }).expect(400);
      expect((await prisma.municipality.findUniqueOrThrow({ where: { id: muniPreparing.id } })).status).toBe('LIVE');

      const ok = await patch({ status: 'PREPARING', confirmName: `E2E MF Preparing ${runId}` }).expect(200);
      expect(ok.body.status).toBe('PREPARING');
    });
  });
});
