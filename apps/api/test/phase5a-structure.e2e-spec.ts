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
import { nationalId, randomChassis, randomDigits, vehicleBody } from './support/registration-fixtures';

// Phase 5A — municipalities are the core, each level owns the level below it,
// rules can be switched, owners and vehicles follow the final field rules.
//
// The jobs here are the REAL catalog roles (rbac-catalog.ts): permissions,
// side and scope flags are copied from it, so these tests prove what the
// catalog actually grants rather than a hand-made look-alike.
describe('Phase 5A — structure, rules, owners and vehicles (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authService: AuthService;

  const runId = Date.now().toString(36);
  const prefix = `e2e_p5a_${runId}`;
  const password = 'BoundaryTest123!';

  type CatalogRole =
    | 'system_admin'
    | 'directorate_admin'
    | 'station_supervisor'
    | 'station_employee'
    | 'registration_supervisor'
    | 'registration_employee';
  type UserKey = 'top' | 'mm1' | 'mm2' | 'sup' | 'supM2' | 'om' | 'omM2' | 'emp' | 'empS1b' | 'regEmp' | 'regEmpR2';

  const roleId = {} as Record<CatalogRole, string>;
  const roleIds: string[] = [];
  const userId = {} as Record<UserKey, string>;
  const token = {} as Record<UserKey, string>;
  const extraUserIds: string[] = [];

  let companyId: string;
  let m1: string;
  let m2: string;
  const station = { s1a: '', s1b: '', s2: '' };
  const office = { r1a: '', r2: '' };
  const createdMunicipalities: string[] = [];
  const createdCompanyIds: string[] = [];
  const vehicleIds: string[] = [];
  const ownerIds: string[] = [];
  const savedSettings = new Map<string, string | null>();

  const SETTING_DEFAULTS: Record<string, string> = {
    'fillup.max_per_week': '3',
    'fillup.min_gap_days': '2',
    'fillup.max_per_week_per_owner': '3',
    'fillup.min_gap_days_per_owner': '2',
    'fillup.max_liters_per_week_per_owner': '100000',
    'fillup.week_window_mode': 'rolling',
    'fillup.week_start_day': '6',
    'fillup.rule.vehicle_gap.enabled': 'true',
    'fillup.rule.vehicle_weekly.enabled': 'true',
    'fillup.rule.owner_gap.enabled': 'true',
    'fillup.rule.owner_weekly.enabled': 'true',
    'fillup.rule.owner_liters.enabled': 'false',
  };

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
      data: { username: `${prefix}_${key}`, passwordHash: await argon2.hash(password), fullName: `P5A ${key}` },
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

    for (const [key, value] of Object.entries(SETTING_DEFAULTS)) await setSetting(key, value);

    companyId = (await prisma.company.create({ data: { name: `P5A Company ${runId}` } })).id;
    m1 = (await createMunicipality(prisma, `P5A M1 ${runId}`)).id;
    m2 = (await createMunicipality(prisma, `P5A M2 ${runId}`)).id;
    for (const [key, municipalityId, number] of [
      ['s1a', m1, '1'],
      ['s1b', m1, '2'],
      ['s2', m2, '3'],
    ] as const) {
      station[key] = (
        await prisma.station.create({
          data: {
            internalCode: `P5A-${runId}-${key}`,
            stationNumber: number,
            name: `P5A station ${key}`,
            companyId,
            municipalityId,
          },
        })
      ).id;
    }
    for (const [key, municipalityId] of [
      ['r1a', m1],
      ['r2', m2],
    ] as const) {
      office[key] = (
        await prisma.registrationStation.create({
          data: { internalCode: `P5A-${runId}-${key}`, name: `P5A office ${key}`, municipalityId, address: 'x' },
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
    await makeUser('supM2', 'station_supervisor', { stations: [station.s2] });
    await makeUser('om', 'registration_supervisor', { offices: [office.r1a] });
    await makeUser('omM2', 'registration_supervisor', { offices: [office.r2] });
    await makeUser('emp', 'station_employee', { stations: [station.s1a] });
    await makeUser('empS1b', 'station_employee', { stations: [station.s1b] });
    await makeUser('regEmp', 'registration_employee', { offices: [office.r1a] });
    await makeUser('regEmpR2', 'registration_employee', { offices: [office.r2] });
  }, 90_000);

  afterAll(async () => {
    const created = await prisma.user.findMany({ where: { username: { startsWith: prefix } }, select: { id: true } });
    const ids = [...new Set([...created.map((u) => u.id), ...extraUserIds])];
    const stationIds = Object.values(station);
    await prisma.exception.deleteMany({ where: { fillUpTransaction: { stationId: { in: stationIds } } } });
    await prisma.fillUpTransaction.deleteMany({ where: { stationId: { in: stationIds } } });
    await prisma.vehiclePlateHistory.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.vehicleChassisHistory.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.vehicleBookletHistory.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.vehicle.deleteMany({ where: { id: { in: vehicleIds } } });
    await prisma.vehicleOwner.deleteMany({ where: { id: { in: ownerIds } } });
    await prisma.duplicateCatch.deleteMany({ where: { userId: { in: ids } } });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { userId: { in: ids } },
          { entityId: { in: [...ids, ...stationIds, ...Object.values(office), m1, m2, ...createdMunicipalities] } },
        ],
      },
    });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.userMunicipalityScope.deleteMany({ where: { userId: { in: ids } } });
    await prisma.userStationScope.deleteMany({ where: { userId: { in: ids } } });
    await prisma.userRegistrationStationScope.deleteMany({ where: { userId: { in: ids } } });
    await prisma.userPermission.deleteMany({ where: { userId: { in: ids } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await prisma.registrationStation.deleteMany({ where: { municipalityId: { in: [m1, m2] } } });
    await prisma.station.deleteMany({ where: { companyId } });
    await prisma.company.deleteMany({ where: { id: { in: [companyId, ...createdCompanyIds] } } });
    await deleteMunicipalities(prisma, [m1, m2, ...createdMunicipalities]);
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
  const patch = (key: UserKey, path: string, body: object) =>
    api().patch(`/api/v1${path}`).set('Authorization', as(key)).send(body);
  const del = (key: UserKey, path: string) => api().delete(`/api/v1${path}`).set('Authorization', as(key));

  const newUserBody = (tag: string, jobRoleId: string, placeIds: string[]) => ({
    username: `${prefix}_new_${tag}`,
    fullName: `P5A new ${tag}`,
    roleId: jobRoleId,
    placeIds,
  });

  async function createPerson(by: UserKey, tag: string, jobRoleId: string, placeIds: string[]) {
    const res = await post(by, '/users', newUserBody(tag, jobRoleId, placeIds));
    if (res.status === 201) extraUserIds.push(res.body.id);
    return res;
  }

  // ── the levels: each creates only the one directly below it ─────────────

  describe('who creates whom', () => {
    it('the super admin creates a municipality manager, assigned to exactly one municipality', async () => {
      const res = await createPerson('top', 'mm_ok', roleId.directorate_admin, [m1]);
      expect(res.status).toBe(201);
      expect(typeof res.body.temporaryPassword).toBe('string');

      const detail = await get('top', `/users/${res.body.id}`).expect(200);
      expect(detail.body.placeKind).toBe('MUNICIPALITY');
      expect(detail.body.places.map((p: { id: string }) => p.id)).toEqual([m1]);
      expect(detail.body.sees).toBe('MUNICIPALITY');
    });

    it('a municipality manager needs a municipality: none, or two, is refused', async () => {
      const none = await post('top', '/users', { ...newUserBody('mm_none', roleId.directorate_admin, []) });
      expect(none.status).toBe(400);
      expect(none.body.message).toBe('PLACES_REQUIRED');

      const two = await post('top', '/users', newUserBody('mm_two', roleId.directorate_admin, [m1, m2]));
      expect(two.status).toBe(400);
      expect(two.body.message).toBe('ONE_MUNICIPALITY_ONLY');
    });

    it('a municipality manager creates supervisors and office managers inside their municipality', async () => {
      const supervisor = await createPerson('mm1', 'sup_ok', roleId.station_supervisor, [station.s1a, station.s1b]);
      expect(supervisor.status).toBe(201);
      const manager = await createPerson('mm1', 'om_ok', roleId.registration_supervisor, [office.r1a]);
      expect(manager.status).toBe(201);
    });

    it("a municipality manager cannot create a person on their own level, above it, or an employee", async () => {
      for (const [tag, job, places] of [
        ['mm_beside', roleId.directorate_admin, [m1]],
        ['top_above', roleId.system_admin, []],
        ['emp_direct', roleId.station_employee, [station.s1a]],
        ['reg_emp_direct', roleId.registration_employee, [office.r1a]],
      ] as const) {
        const res = await post('mm1', '/users', newUserBody(tag, job, [...places]));
        expect({ tag, status: res.status, message: res.body.message }).toEqual({
          tag,
          status: 403,
          message: 'JOB_NOT_ALLOWED',
        });
      }
    });

    it("a municipality manager cannot reach another municipality's stations or offices", async () => {
      const station2 = await post('mm1', '/users', newUserBody('sup_other', roleId.station_supervisor, [station.s2]));
      expect(station2.status).toBe(403);
      expect(station2.body.message).toBe('PLACES_OUTSIDE_SCOPE');
      const office2 = await post('mm1', '/users', newUserBody('om_other', roleId.registration_supervisor, [office.r2]));
      expect(office2.status).toBe(403);
      expect(office2.body.message).toBe('PLACES_OUTSIDE_SCOPE');
    });

    it('a station supervisor creates employees at their own station only', async () => {
      const ok = await createPerson('sup', 'emp_ok', roleId.station_employee, [station.s1a]);
      expect(ok.status).toBe(201);

      // beside (another supervisor), above (a municipality manager), the other side.
      for (const [tag, job, places] of [
        ['sup_beside', roleId.station_supervisor, [station.s1a]],
        ['mm_above', roleId.directorate_admin, [m1]],
        ['reg_side', roleId.registration_employee, [office.r1a]],
      ] as const) {
        const res = await post('sup', '/users', newUserBody(tag, job, [...places]));
        expect({ tag, status: res.status }).toEqual({ tag, status: 403 });
      }
      // The same municipality, but not their station.
      const elsewhere = await post('sup', '/users', newUserBody('emp_s1b', roleId.station_employee, [station.s1b]));
      expect(elsewhere.status).toBe(403);
      expect(elsewhere.body.message).toBe('PLACES_OUTSIDE_SCOPE');
    });

    it('an office manager creates registration employees at their own office only', async () => {
      const ok = await createPerson('om', 'regemp_ok', roleId.registration_employee, [office.r1a]);
      expect(ok.status).toBe(201);

      const above = await post('om', '/users', newUserBody('om_beside', roleId.registration_supervisor, [office.r1a]));
      expect(above.status).toBe(403);
      const elsewhere = await post('om', '/users', newUserBody('regemp_r2', roleId.registration_employee, [office.r2]));
      expect(elsewhere.status).toBe(403);
      expect(elsewhere.body.message).toBe('PLACES_OUTSIDE_SCOPE');
    });

    it('an employee creates nobody', async () => {
      await post('emp', '/users', newUserBody('by_emp', roleId.station_employee, [station.s1a])).expect(403);
      await post('regEmp', '/users', newUserBody('by_regemp', roleId.registration_employee, [office.r1a])).expect(403);
    });
  });

  // ── the municipality-manager boundary ────────────────────────────────────

  describe('a municipality manager is confined to their municipality', () => {
    it('sees only their own municipality, and 403s every call that names another', async () => {
      const list = await get('mm1', '/municipalities').expect(200);
      expect(list.body.map((m: { id: string }) => m.id)).toEqual([m1]);

      await get('mm1', `/municipalities/${m2}`).expect(403);
      await get('mm1', `/municipalities/${m2}/overview`).expect(403);
      await patch('mm1', `/municipalities/${m2}`, { name: 'not theirs' }).expect(403);
      // They may not rename, switch or archive even their own: that is the super admin's.
      await patch('mm1', `/municipalities/${m1}`, { name: 'renamed' }).expect(403);
      await post('mm1', `/municipalities/${m1}/archive`, { reason: 'not mine to do' }).expect(403);
      await post('mm1', '/municipalities', { name: `P5A nope ${runId}` }).expect(403);
    });

    it('cannot switch their own municipality on or off: the activation switch belongs to the super admin', async () => {
      await patch('mm1', `/municipalities/${m1}`, { status: 'LIVE' }).expect(403);
      await patch('mm1', `/municipalities/${m1}`, { status: 'PREPARING', reason: 'not mine to do' }).expect(403);
    });

    it("lists only their municipality's stations and offices, and refuses the rest", async () => {
      const stations = await get('mm1', '/stations').expect(200);
      const ids = stations.body.map((s: { id: string }) => s.id);
      expect(ids).toEqual(expect.arrayContaining([station.s1a, station.s1b]));
      expect(ids).not.toContain(station.s2);
      await get('mm1', `/stations/${station.s2}`).expect(403);
      await patch('mm1', `/stations/${station.s2}`, { name: 'hijack' }).expect(403);
      await post('mm1', `/stations/${station.s2}/archive`, { reason: 'not mine to do' }).expect(403);

      const offices = await get('mm1', '/registration-stations').expect(200);
      const officeIds = offices.body.map((o: { id: string }) => o.id);
      expect(officeIds).toContain(office.r1a);
      expect(officeIds).not.toContain(office.r2);
      await get('mm1', `/registration-stations/${office.r2}`).expect(403);
      await patch('mm1', `/registration-stations/${office.r2}`, { name: 'hijack' }).expect(403);
    });

    it('cannot create a station or an office in another municipality, and needs one for their own', async () => {
      const stationBody = (municipalityId?: string) => ({
        stationNumber: '77',
        name: `P5A new station ${runId}`,
        companyId,
        ...(municipalityId ? { municipalityId } : {}),
      });
      await post('mm1', '/stations', stationBody(m2)).expect(403);
      const none = await post('mm1', '/stations', stationBody());
      // Phase 5C: the municipality is a required field of the request itself.
      expect(none.status).toBe(400);
      expect(JSON.stringify(none.body.message)).toContain('municipalityId');

      const ok = await post('mm1', '/stations', stationBody(m1));
      expect(ok.status).toBe(201);
      await prisma.station.update({ where: { id: ok.body.id }, data: { companyId } });
      await post('mm1', '/registration-stations', { name: 'x', municipalityId: m2, address: 'y' }).expect(403);
      const office1 = await post('mm1', '/registration-stations', { name: `P5A office ${runId}`, municipalityId: m1, address: 'y' });
      expect(office1.status).toBe(201);
    });

    it("lists and opens only people of their municipality, and cannot touch the super admin or themselves", async () => {
      const list = await get('mm1', '/users?take=100').expect(200);
      const ids = list.body.items.map((u: { id: string }) => u.id);
      expect(ids).toContain(userId.sup);
      for (const hidden of [userId.supM2, userId.omM2, userId.top, userId.mm1, userId.mm2, userId.emp]) {
        expect(ids).not.toContain(hidden);
      }

      const outside = await get('mm1', `/users/${userId.supM2}`);
      expect(outside.status).toBe(403);
      expect(outside.body.message).toBe('USER_OUT_OF_SCOPE');
      await patch('mm1', `/users/${userId.supM2}`, { fullName: 'nope' }).expect(403);
      await post('mm1', `/users/${userId.supM2}/archive`, { reason: 'not mine to do' }).expect(403);
      await post('mm1', `/users/${userId.supM2}/reset-password`).expect(403);
      await get('mm1', `/users/${userId.top}`).expect(403);
      await get('mm1', `/users/${userId.mm2}`).expect(403);
      // Their own account: read-only, never raised.
      const self = await get('mm1', `/users/${userId.mm1}`).expect(200);
      expect(self.body.capabilities.canChangeJob).toBe(false);
      await post('mm1', `/users/${userId.mm1}/archive`, { reason: 'myself' }).expect(403);
    });

    it('cannot record, or read, anything at a station of another municipality', async () => {
      const dashboard = await get('mm1', '/reports/dashboard').expect(200);
      const perStation = dashboard.body.perStation.map((s: { stationId: string }) => s.stationId);
      expect(perStation).not.toContain(station.s2);
      await get('mm1', `/reports/daily?stationId=${station.s2}`).expect(403);
      await post('emp', '/fillups', { vehicleId: vehicleIds[0] ?? 'x', stationId: station.s2, fuelType: 'PETROL_95', quantityLiters: 10 })
        .set('Idempotency-Key', randomUUID())
        .expect(403);
    });

    it('overview shows their municipality and nothing of another', async () => {
      const res = await get('mm1', `/municipalities/${m1}/overview`).expect(200);
      // The overview is counts; the lists are paged (places, people, activity).
      expect(res.body.counts.stations).toBeGreaterThanOrEqual(2);
      expect(res.body.people.total).toBeGreaterThan(0);
      const places = await get('mm1', `/municipalities/${m1}/places?take=100`).expect(200);
      const ids = places.body.items.map((s: { id: string }) => s.id);
      expect(ids).toEqual(expect.arrayContaining([station.s1a, station.s1b]));
      expect(ids).not.toContain(station.s2);
      await get('mm1', `/municipalities/${m2}/places`).expect(403);
      await get('mm1', `/municipalities/${m1}/activity`).expect(200);
    });
  });

  // ── companies are shared across municipalities ───────────────────────────

  describe('companies', () => {
    it('a municipality manager may create a company, but not edit or archive one', async () => {
      const created = await post('mm1', '/companies', { name: `P5A Co ${runId}` });
      expect(created.status).toBe(201);
      createdCompanyIds.push(created.body.id);

      await patch('mm1', `/companies/${created.body.id}`, { name: `P5A Co renamed ${runId}` }).expect(403);
      await patch('mm1', `/companies/${created.body.id}`, { isActive: false }).expect(403);
      // Even the company they just made, and a company of another municipality's stations.
      await patch('mm1', `/companies/${companyId}`, { isActive: false }).expect(403);
      expect((await prisma.company.findUniqueOrThrow({ where: { id: created.body.id } })).isActive).toBe(true);
    });

    it('the super admin edits and archives a company', async () => {
      const id = createdCompanyIds[0]!;
      await patch('top', `/companies/${id}`, { name: `P5A Co renamed ${runId}` }).expect(200);
      const archived = await patch('top', `/companies/${id}`, { isActive: false }).expect(200);
      expect(archived.body.isActive).toBe(false);
    });

    it('nobody below the municipality manager creates one', async () => {
      await post('sup', '/companies', { name: `P5A Co nope ${runId}` }).expect(403);
      await post('om', '/companies', { name: `P5A Co nope ${runId}` }).expect(403);
    });
  });

  // ── permissions: only within the set supervisor-level jobs may hold ───────

  describe("a municipality manager adjusting a supervisor's permissions", () => {
    it("grants within the set, refuses outside it, and nobody below them grants anything", async () => {
      const cardsCancel = await prisma.permission.upsert({
        where: { key: 'cards:cancel' },
        create: { key: 'cards:cancel' },
        update: {},
      });
      const usersManage = await prisma.permission.upsert({
        where: { key: 'users:manage' },
        create: { key: 'users:manage' },
        update: {},
      });
      const viewAll = await prisma.permission.upsert({
        where: { key: 'reports:view_all_stations' },
        create: { key: 'reports:view_all_stations' },
        update: {},
      });

      // Inside the set: held by the office-manager job in the catalog.
      await post('mm1', `/users/${userId.sup}/permissions`, { permissionId: cardsCancel.id }).expect(201);
      const granted = await prisma.userPermission.count({ where: { userId: userId.sup, permissionId: cardsCancel.id } });
      expect(granted).toBe(1);
      await del('mm1', `/users/${userId.sup}/permissions/${cardsCancel.id}`).expect(200);

      // Outside it: a people-management lever, and a directorate-wide one.
      for (const permission of [usersManage, viewAll]) {
        const res = await post('mm1', `/users/${userId.sup}/permissions`, { permissionId: permission.id });
        expect({ key: permission.key, status: res.status, message: res.body.message }).toEqual({
          key: permission.key,
          status: 403,
          message: 'PERMISSION_NOT_DELEGABLE',
        });
      }

      // Not for their own person, not for an employee, not for another municipality.
      await post('mm1', `/users/${userId.emp}/permissions`, { permissionId: cardsCancel.id }).expect(403);
      await post('mm1', `/users/${userId.supM2}/permissions`, { permissionId: cardsCancel.id }).expect(403);
      // A supervisor, or anyone else below the super admin, grants nothing.
      await post('sup', `/users/${userId.emp}/permissions`, { permissionId: cardsCancel.id }).expect(403);
      await post('om', `/users/${userId.regEmp}/permissions`, { permissionId: cardsCancel.id }).expect(403);
    });
  });

  // ── archive keeps history, restore brings it back ─────────────────────────

  describe('"delete" means archive', () => {
    let ownerId: string;
    let vehicleId: string;
    const plate = `5-${randomDigits(7)}`;

    async function ensureVehicle() {
      if (vehicleId) return;
      const owner = await post('regEmp', '/owners', {
        registrationStationId: office.r1a,
        fullName: 'مالك للأرشفة',
        identityType: 'NATIONAL_ID',
        identityNumber: nationalId('1'),
        phone: '0911111111',
      }).expect(201);
      ownerId = owner.body.id;
      ownerIds.push(ownerId);
      const vehicle = await post(
        'regEmp',
        '/vehicles',
        vehicleBody({ registrationStationId: office.r1a, ownerId, currentPlate: plate }),
      ).expect(201);
      vehicleId = vehicle.body.id;
      vehicleIds.push(vehicleId);
    }

    it('an archived station leaves daily screens and takes no fill-up, while its history stays', async () => {
      await ensureVehicle();
      const fill = (stationId: string, key = randomUUID()) =>
        api()
          .post('/api/v1/fillups')
          .set('Authorization', as('emp'))
          .set('Idempotency-Key', key)
          .send({ vehicleId, stationId, fuelType: 'PETROL_95', quantityLiters: 20 });
      await fill(station.s1a).expect(201);
      const historyBefore = await prisma.fillUpTransaction.count({ where: { stationId: station.s1a } });
      expect(historyBefore).toBe(1);

      const archived = await post('mm1', `/stations/${station.s1a}/archive`, { reason: 'تجربة الأرشفة' }).expect(200);
      expect(archived.body.archivedAt).not.toBeNull();

      // Gone from the daily list; under the archived filter instead.
      const daily = await get('mm1', '/stations').expect(200);
      expect(daily.body.map((s: { id: string }) => s.id)).not.toContain(station.s1a);
      const onlyArchived = await get('mm1', '/stations?archived=only').expect(200);
      expect(onlyArchived.body.map((s: { id: string }) => s.id)).toEqual([station.s1a]);

      // No new fill-up, and the history is exactly as it was.
      const refused = await fill(station.s1a);
      expect(refused.status).toBe(409);
      expect(refused.body.message).toBe('STATION_ARCHIVED');
      expect(await prisma.fillUpTransaction.count({ where: { stationId: station.s1a } })).toBe(historyBefore);
      // A supervisor does not get to ask for the archived list.
      const supList = await get('sup', '/stations?archived=only').expect(200);
      expect(supList.body.map((s: { id: string }) => s.id)).not.toContain(station.s1a);

      const restored = await post('mm1', `/stations/${station.s1a}/restore`, { reason: 'عودة للعمل' }).expect(200);
      expect(restored.body.archivedAt).toBeNull();
      expect((await get('mm1', '/stations').expect(200)).body.map((s: { id: string }) => s.id)).toContain(station.s1a);
      const audit = await prisma.auditLog.findMany({ where: { entityType: 'Station', entityId: station.s1a } });
      expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(['ARCHIVE', 'RESTORE']));
    });

    it('an archived office takes no registration; its vehicles and cards stay', async () => {
      await ensureVehicle();
      await post('mm1', `/registration-stations/${office.r1a}/archive`, { reason: 'تجربة الأرشفة' }).expect(200);
      const refused = await post(
        'regEmp',
        '/vehicles',
        vehicleBody({ registrationStationId: office.r1a, ownerId, currentPlate: `6-${randomDigits(7)}` }),
      );
      expect(refused.status).toBe(409);
      expect(refused.body.message).toBe('REGISTRATION_STATION_ARCHIVED');
      expect(await prisma.vehicle.count({ where: { id: vehicleId } })).toBe(1);

      expect((await get('mm1', '/registration-stations').expect(200)).body.map((o: { id: string }) => o.id)).not.toContain(office.r1a);
      await post('mm1', `/registration-stations/${office.r1a}/restore`, { reason: 'عودة للعمل' }).expect(200);
      await post(
        'regEmp',
        '/vehicles',
        vehicleBody({ registrationStationId: office.r1a, ownerId, currentPlate: `6-${randomDigits(7)}` }),
      ).expect(201).then((res) => vehicleIds.push(res.body.id));
    });

    it("an archived person cannot work, leaves the lists, keeps their history, and is restored by the level above", async () => {
      const created = await createPerson('mm1', 'to_archive', roleId.station_supervisor, [station.s1a]);
      expect(created.status).toBe(201);
      const id: string = created.body.id;
      // A new account must change its password first; skip that for this test.
      await prisma.user.update({ where: { id }, data: { mustChangePassword: false } });
      const tokenBefore = (await authService.issueTokenPair(id, `${prefix}_new_to_archive`)).accessToken;
      await api().get('/api/v1/stations').set('Authorization', `Bearer ${tokenBefore}`).expect(200);

      const archived = await post('mm1', `/users/${id}/archive`, { reason: 'ترك العمل' }).expect(200);
      expect(archived.body.status).toBe('archived');
      // The session ends at once, not when the access token runs out.
      await api().get('/api/v1/stations').set('Authorization', `Bearer ${tokenBefore}`).expect(401);

      const daily = await get('mm1', '/users?take=100').expect(200);
      expect(daily.body.items.map((u: { id: string }) => u.id)).not.toContain(id);
      const onlyArchived = await get('mm1', '/users?status=archived&take=100').expect(200);
      expect(onlyArchived.body.items.map((u: { id: string }) => u.id)).toContain(id);
      expect(await prisma.user.count({ where: { id } })).toBe(1);

      // Nobody below the level that archived them can bring them back.
      await post('sup', `/users/${id}/restore`, { reason: 'محاولة غير مسموحة' }).expect(403);
      const restored = await post('mm1', `/users/${id}/restore`, { reason: 'عاد للعمل' }).expect(200);
      expect(restored.body.status).not.toBe('archived');
      const tokenAfter = (await authService.issueTokenPair(id, `${prefix}_new_to_archive`)).accessToken;
      await api().get('/api/v1/stations').set('Authorization', `Bearer ${tokenAfter}`).expect(200);
      const audit = await prisma.auditLog.findMany({ where: { entityType: 'User', entityId: id } });
      expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(['ARCHIVE_USER', 'RESTORE_USER']));
    });

    it('an archived municipality is hidden from daily screens, takes no fill-up, and comes back', async () => {
      const name = `P5A archive ${runId}`;
      const created = await post('top', '/municipalities', { name }).expect(201);
      createdMunicipalities.push(created.body.id);

      // A LIVE municipality is archived only with its name typed.
      await patch('top', `/municipalities/${created.body.id}`, { status: 'LIVE' }).expect(200);
      const noName = await post('top', `/municipalities/${created.body.id}/archive`, { reason: 'تجربة الأرشفة' });
      expect(noName.status).toBe(400);
      expect(noName.body.message).toBe('CONFIRMATION_NAME_MISMATCH');

      const archived = await post('top', `/municipalities/${created.body.id}/archive`, {
        reason: 'تجربة الأرشفة',
        confirmName: name,
      }).expect(200);
      expect(archived.body.archivedAt).not.toBeNull();
      const daily = await get('top', '/municipalities').expect(200);
      expect(daily.body.map((m: { id: string }) => m.id)).not.toContain(created.body.id);
      const onlyArchived = await get('top', '/municipalities?archived=only').expect(200);
      expect(onlyArchived.body.map((m: { id: string }) => m.id)).toContain(created.body.id);
      await patch('top', `/municipalities/${created.body.id}`, { name: `${name} renamed` }).expect(409);

      await post('top', `/municipalities/${created.body.id}/restore`, { reason: 'عودة' }).expect(200);
      expect((await get('top', '/municipalities').expect(200)).body.map((m: { id: string }) => m.id)).toContain(
        created.body.id,
      );
    });
  });

  // ── fill-up rule switches ─────────────────────────────────────────────────

  describe('rule switches', () => {
    it('only the super admin switches a rule; the change is audited and validated', async () => {
      const key = 'fillup.rule.owner_liters.enabled';
      for (const who of ['mm1', 'sup', 'om', 'emp'] as UserKey[]) {
        const res = await patch(who, `/system-settings/${key}`, { value: 'true' });
        expect({ who, status: res.status }).toEqual({ who, status: 403 });
      }
      const bad = await patch('top', `/system-settings/${key}`, { value: 'yes' });
      expect(bad.status).toBe(400);
      expect(bad.body.message).toBe('RULE_SWITCH_VALUE_INVALID');

      await patch('top', `/system-settings/${key}`, { value: 'true' }).expect(200);
      expect((await prisma.systemSetting.findUniqueOrThrow({ where: { key } })).value).toBe('true');
      const audit = await prisma.auditLog.findFirst({
        where: { entityType: 'SystemSetting', entityId: key, userId: userId.top },
        orderBy: { createdAt: 'desc' },
      });
      expect(audit?.newValue).toMatchObject({ value: 'true' });
      await patch('top', `/system-settings/${key}`, { value: 'false' }).expect(200);
    });

    it('a switched-off rule is skipped completely, and the preview says the same as the submit', async () => {
      const owner = await post('regEmp', '/owners', {
        registrationStationId: office.r1a,
        fullName: 'مالك لقواعد التعبئة',
        identityType: 'NATIONAL_ID',
        identityNumber: nationalId('2'),
        phone: '0922222222',
      }).expect(201);
      ownerIds.push(owner.body.id);
      const vehicle = await post(
        'regEmp',
        '/vehicles',
        vehicleBody({ registrationStationId: office.r1a, ownerId: owner.body.id, currentPlate: `7-${randomDigits(7)}` }),
      ).expect(201);
      vehicleIds.push(vehicle.body.id);

      const fill = () =>
        api()
          .post('/api/v1/fillups')
          .set('Authorization', as('empS1b'))
          .set('Idempotency-Key', randomUUID())
          .send({ vehicleId: vehicle.body.id, stationId: station.s1b, fuelType: 'PETROL_95', quantityLiters: 15 });
      const preview = () =>
        get('empS1b', `/fillups/rule-preview?stationId=${station.s1b}&vehicleId=${vehicle.body.id}`);

      await fill().expect(201);
      // The same day again: the minimum gap rejects it - in the preview and the submit alike.
      const previewOn = await preview().expect(200);
      expect(previewOn.body.checks.find((c: { reason: string }) => c.reason === 'VEHICLE_GAP_TOO_SHORT').passed).toBe(false);
      expect((await fill()).status).toBe(422);

      await patch('top', '/system-settings/fillup.rule.vehicle_gap.enabled', { value: 'false' }).expect(200);
      const previewOff = await preview().expect(200);
      // The owner-liters rule is off by default; the gap rule was just switched off.
      expect(previewOff.body.disabledRules).toEqual(
        expect.arrayContaining(['VEHICLE_GAP_TOO_SHORT', 'LITERS_PER_PERSON_CAP_REACHED']),
      );
      expect(previewOff.body.checks.map((c: { reason: string }) => c.reason)).not.toContain('VEHICLE_GAP_TOO_SHORT');
      // The vehicle's own gap no longer decides: the next rule in order does -
      // the same one in the preview and in the submit.
      const failing = previewOff.body.checks.filter((c: { passed: boolean }) => !c.passed);
      expect(failing.map((c: { reason: string }) => c.reason)).toEqual(['OWNER_GAP_TOO_SHORT']);
      const stillRefused = await fill();
      expect(stillRefused.status).toBe(422);
      expect(stillRefused.body.reason).toBe('OWNER_GAP_TOO_SHORT');

      await patch('top', '/system-settings/fillup.rule.owner_gap.enabled', { value: 'false' }).expect(200);
      const previewBothOff = await preview().expect(200);
      expect(previewBothOff.body.checks.every((c: { passed: boolean }) => c.passed)).toBe(true);
      await fill().expect(201);

      await patch('top', '/system-settings/fillup.rule.vehicle_gap.enabled', { value: 'true' }).expect(200);
      await patch('top', '/system-settings/fillup.rule.owner_gap.enabled', { value: 'true' }).expect(200);
    });
  });

  // ── owners: national ID rules, administrative IDs ────────────────────────

  describe('owners', () => {
    const ownerBody = (over: Record<string, unknown> = {}) => ({
      registrationStationId: office.r1a,
      fullName: 'مالك تجريبي',
      identityType: 'NATIONAL_ID',
      identityNumber: nationalId('1'),
      phone: '0933333333',
      ...over,
    });

    it('the provisional driver\'s-license path is gone', async () => {
      const res = await post('regEmp', '/owners', ownerBody({ identityType: 'DRIVERS_LICENSE', identityNumber: 'AB123456' }));
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body.message)).toContain('نوع الهوية');
      const none = await post('regEmp', '/owners', ownerBody({ identityType: undefined, identityNumber: undefined }));
      expect(none.status).toBe(400);
    });

    it.each([
      ['digit 1 is 3', '319900123456', 'يجب أن يبدأ بالرقم 1'],
      ['year 1899', '118990123456', 'سنة الميلاد في الرقم الوطني (1899)'],
      ['a year in the future', '129990123456', 'سنة الميلاد في الرقم الوطني (2999)'],
      ['under 18', `1${new Date().getUTCFullYear() - 10}0123456`, 'أقل من 18 سنة'],
      ['11 digits', '11990012345', '12 رقمًا'],
      ['13 digits', '1199001234567', '12 رقمًا'],
    ])('refuses a national ID — %s — with its Arabic message', async (_label, identityNumber, expected) => {
      const res = await post('regEmp', '/owners', ownerBody({ identityNumber }));
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body.message)).toContain(expected);
    });

    it('accepts any check digit, Arabic-Indic digits normalised, and +218 phones normalised', async () => {
      const id = nationalId('1');
      const arabicIndic = id.replace(/\d/g, (d) => String.fromCharCode(0x0660 + Number(d)));
      const res = await post('regEmp', '/owners', ownerBody({ identityNumber: arabicIndic, phone: '+218912345678' }));
      expect(res.status).toBe(201);
      ownerIds.push(res.body.id);
      expect(res.body.identityNumber).toBe(id);
      expect(res.body.phone).toBe('0912345678');
    });

    it('requires a Libyan mobile for an individual, and an Arabic name', async () => {
      expect((await post('regEmp', '/owners', ownerBody({ phone: '0971234567' }))).status).toBe(400);
      expect((await post('regEmp', '/owners', ownerBody({ fullName: 'Mohamed Ali' }))).status).toBe(400);
    });

    // Phase 6: only individuals are registered. The institution fields are
    // refused as unknown, and every owner is held to the owner-level rules.
    it('no longer registers an institution: ownerKind and the responsible driver are refused', async () => {
      const res = await post('regEmp', '/owners', {
        registrationStationId: office.r1a,
        ownerKind: 'INSTITUTION',
        fullName: 'مصرف الاختبار',
        responsibleDriverNationalId: nationalId('1'),
      });
      expect(res.status).toBe(400);
      expect((await post('regEmp', '/owners', { ...ownerBody(), responsibleDriverName: 'سائق' })).status).toBe(400);
    });

    it("an owner's second vehicle is held to the owner-level rules, with nothing skipped", async () => {
      const individual = await post('regEmp', '/owners', ownerBody()).expect(201);
      ownerIds.push(individual.body.id);

      const makeVehicle = async (ownerId: string) => {
        const res = await post(
          'regEmp',
          '/vehicles',
          vehicleBody({ registrationStationId: office.r1a, ownerId, currentPlate: `8-${randomDigits(7)}` }),
        ).expect(201);
        vehicleIds.push(res.body.id);
        return res.body.id as string;
      };
      const fill = (vehicleId: string) =>
        api()
          .post('/api/v1/fillups')
          .set('Authorization', as('empS1b'))
          .set('Idempotency-Key', randomUUID())
          .send({ vehicleId, stationId: station.s1b, fuelType: 'PETROL_95', quantityLiters: 20 });

      const [personA, personB] = [await makeVehicle(individual.body.id), await makeVehicle(individual.body.id)];
      await fill(personA).expect(201);
      const preview = await get('empS1b', `/fillups/rule-preview?stationId=${station.s1b}&vehicleId=${personB}`).expect(200);
      expect(preview.body.skippedRules).toEqual([]);
      const blocked = await fill(personB);
      expect(blocked.status).toBe(422);
      expect(blocked.body.reason).toBe('OWNER_GAP_TOO_SHORT');
    });
  });

  // ── vehicles ──────────────────────────────────────────────────────────────

  describe('vehicles', () => {
    let ownerId: string;
    beforeAll(async () => {
      const owner = await post('regEmp', '/owners', {
        registrationStationId: office.r1a,
        fullName: 'مالك المركبات',
        identityType: 'NATIONAL_ID',
        identityNumber: nationalId('1'),
        phone: '0944444444',
      }).expect(201);
      ownerId = owner.body.id;
      ownerIds.push(ownerId);
    });

    const register = (over: Record<string, unknown>) =>
      post('regEmp', '/vehicles', vehicleBody({ registrationStationId: office.r1a, ownerId, ...over }));

    it('keeps 5-123456N and 5-123456 as two different plates, and refuses the N plate twice', async () => {
      const serial = randomDigits(6).replace(/^0/, '1');
      const plain = await register({ currentPlate: `5-${serial}` });
      expect(plain.status).toBe(201);
      vehicleIds.push(plain.body.id);
      const withN = await register({ currentPlate: `5-${serial}N` });
      expect(withN.status).toBe(201);
      vehicleIds.push(withN.body.id);
      expect(plain.body.normalizedPlate).toBe(`5-${serial}`);
      expect(withN.body.normalizedPlate).toBe(`5-${serial}N`);

      const again = await register({ currentPlate: `5 ${serial} n` });
      expect(again.status).toBe(409);
      expect(again.body.message).toBe('VEHICLE_DUPLICATE');
      expect(again.body.details.conflicts[0].vehicle.id).toBe(withN.body.id);

      // The duplicate lookup tells them apart too.
      const lookup = await get('regEmp', `/vehicles/duplicate-check?currentPlate=5-${serial}N`).expect(200);
      expect(lookup.body.conflicts[0].vehicle.id).toBe(withN.body.id);
    });

    it('accepts a non-standard chassis only with the tick, and records the tick', async () => {
      const short = randomChassis(12);
      const without = await register({ currentPlate: `9-${randomDigits(7)}`, chassisNumber: short });
      expect(without.status).toBe(400);
      expect(JSON.stringify(without.body.message)).toContain('17 خانة');

      const withTick = await register({ currentPlate: `9-${randomDigits(7)}`, chassisNumber: short, chassisNonStandard: true });
      expect(withTick.status).toBe(201);
      vehicleIds.push(withTick.body.id);
      expect(withTick.body.chassisNonStandard).toBe(true);
      expect(withTick.body.chassisNumber).toBe(short);

      // Outside 6–20 characters even the tick does not help.
      for (const length of [5, 21]) {
        const res = await register({
          currentPlate: `9-${randomDigits(7)}`,
          chassisNumber: randomChassis(length),
          chassisNonStandard: true,
        });
        expect({ length, status: res.status }).toEqual({ length, status: 400 });
      }
      // Lower case is upper-cased automatically.
      const lower = randomChassis(17).toLowerCase();
      const ok = await register({ currentPlate: `9-${randomDigits(7)}`, chassisNumber: lower });
      expect(ok.status).toBe(201);
      vehicleIds.push(ok.body.id);
      expect(ok.body.chassisNumber).toBe(lower.toUpperCase());
    });

    it('refuses a duplicate chassis, naming the vehicle that already has it', async () => {
      const chassis = randomChassis();
      const first = await register({ currentPlate: `9-${randomDigits(7)}`, chassisNumber: chassis });
      expect(first.status).toBe(201);
      vehicleIds.push(first.body.id);
      const second = await register({ currentPlate: `9-${randomDigits(7)}`, chassisNumber: chassis.toLowerCase() });
      expect(second.status).toBe(409);
      expect(second.body.details.conflicts).toEqual([
        {
          field: 'chassisNumber',
          vehicle: { id: first.body.id, internalCode: first.body.internalCode, currentPlate: first.body.currentPlate },
        },
      ]);
    });

    it('requires every field, with the make and model as free text', async () => {
      for (const field of ['make', 'model', 'color', 'manufactureYear', 'fuelType', 'registrationBooklet', 'chassisNumber']) {
        const body = vehicleBody({ registrationStationId: office.r1a, ownerId, currentPlate: `9-${randomDigits(7)}` }) as Record<string, unknown>;
        delete body[field];
        const res = await post('regEmp', '/vehicles', body);
        expect({ field, status: res.status }).toEqual({ field, status: 400 });
      }
      const free = await register({ currentPlate: `9-${randomDigits(7)}`, make: 'Toyota Land Cruiser', model: 'GXR 4.0 V6', color: 'لون خاص' });
      expect(free.status).toBe(201);
      vehicleIds.push(free.body.id);
      expect(free.body.make).toBe('Toyota Land Cruiser');
      expect(free.body.model).toBe('GXR 4.0 V6');
    });

    it('checks the manufacturing year range', async () => {
      for (const [year, status] of [
        [1949, 400],
        [new Date().getUTCFullYear() + 2, 400],
        [1950, 201],
        [new Date().getUTCFullYear() + 1, 201],
      ] as const) {
        const res = await register({ currentPlate: `9-${randomDigits(7)}`, manufactureYear: year });
        expect({ year, status: res.status }).toEqual({ year, status });
        if (res.status === 201) vehicleIds.push(res.body.id);
      }
    });

    it('warns, never blocks, when the fuel does not match the vehicle, and records it', async () => {
      const diesel = await register({ currentPlate: `9-${randomDigits(7)}`, fuelType: 'DIESEL' });
      expect(diesel.status).toBe(201);
      vehicleIds.push(diesel.body.id);

      const previewMismatch = await get(
        'empS1b',
        `/fillups/rule-preview?stationId=${station.s1b}&vehicleId=${diesel.body.id}&fuelType=PETROL_95`,
      ).expect(200);
      expect(previewMismatch.body.fuelMismatch).toBe(true);
      expect(previewMismatch.body.vehicleFuelType).toBe('DIESEL');
      const previewMatch = await get(
        'empS1b',
        `/fillups/rule-preview?stationId=${station.s1b}&vehicleId=${diesel.body.id}&fuelType=DIESEL`,
      ).expect(200);
      expect(previewMatch.body.fuelMismatch).toBe(false);

      const wrong = await api()
        .post('/api/v1/fillups')
        .set('Authorization', as('empS1b'))
        .set('Idempotency-Key', randomUUID())
        .send({ vehicleId: diesel.body.id, stationId: station.s1b, fuelType: 'PETROL_95', quantityLiters: 25 })
        .expect(201);
      expect(wrong.body.fuelMismatch).toBe(true);
      const stored = await prisma.fillUpTransaction.findUniqueOrThrow({ where: { id: wrong.body.id } });
      expect(stored.fuelMismatch).toBe(true);
    });
  });
});
