import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { createMunicipality, deleteMunicipalities } from './support/municipality-fixtures';

// Registration pivot, phase 4b — accounts. Every rule here is enforced by the
// API, so each is exercised through the real HTTP endpoints with real tokens:
//  - a supervisor reaches only their own employees, and never an admin, another
//    supervisor, a job beyond their own side's employee job, or themselves;
//  - nobody raises their own role, and a directorate admin cannot make or touch
//    the top-level admin account;
//  - deactivating or resetting ends the person's sessions, and a reset never
//    shows the password again;
//  - one job per person;
//  - the directorate admin sets the two stage dates and nothing else.
//
// Jobs are built from permissions and a side (the rules never read a role name),
// so this spec creates its own, mirroring the catalog's shape.
describe('Phase 4b — accounts (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authService: AuthService;

  const runId = Date.now().toString(36);
  const prefix = `e2e_p4b_${runId}`;
  const password = 'BoundaryTest123!';

  const roleIds: string[] = [];
  const userIds: string[] = [];
  let companyId: string;
  let municipalityId: string;
  let stageMunicipalityId: string;
  const stationIds: Record<'A' | 'B' | 'C', string> = { A: '', B: '', C: '' };
  const regIds: Record<'R1' | 'R2', string> = { R1: '', R2: '' };

  type RoleKey = 'fuelEmployee' | 'fuelSupervisor' | 'regEmployee' | 'regSupervisor' | 'directorate' | 'top';
  type UserKey =
    | 'dir' | 'top' | 'supA' | 'supOther' | 'supReg' | 'empA' | 'empAB' | 'empAC' | 'empC' | 'empNoPlace'
    | 'regEmp' | 'regEmpR2' | 'twoJobs';
  const role = {} as Record<RoleKey, string>;
  const user = {} as Record<UserKey, string>;
  const token = {} as Record<UserKey, string>;

  async function makeRole(
    key: RoleKey,
    kind: 'PETROL_STATION' | 'REGISTRATION' | null,
    permissionKeys: string[],
    unrestricted = false,
  ) {
    const created = await prisma.role.create({
      data: { name: `${prefix}_${key}`, kind, unrestrictedStationAccess: unrestricted },
    });
    roleIds.push(created.id);
    role[key] = created.id;
    for (const permissionKey of permissionKeys) {
      const permission = await prisma.permission.upsert({
        where: { key: permissionKey },
        create: { key: permissionKey },
        update: {},
      });
      await prisma.rolePermission.create({ data: { roleId: created.id, permissionId: permission.id } });
    }
  }

  async function makeUser(
    key: UserKey,
    roleKey: RoleKey | null,
    scope: { stations?: Array<'A' | 'B' | 'C'>; regs?: Array<'R1' | 'R2'> } = {},
  ) {
    const created = await prisma.user.create({
      data: { username: `${prefix}_${key}`, passwordHash: await argon2.hash(password), fullName: `P4B ${key}` },
    });
    userIds.push(created.id);
    user[key] = created.id;
    if (roleKey) await prisma.userRole.create({ data: { userId: created.id, roleId: role[roleKey] } });
    for (const s of scope.stations ?? []) {
      await prisma.userStationScope.create({ data: { userId: created.id, stationId: stationIds[s] } });
    }
    for (const r of scope.regs ?? []) {
      await prisma.userRegistrationStationScope.create({
        data: { userId: created.id, registrationStationId: regIds[r] },
      });
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

    companyId = (await prisma.company.create({ data: { name: `P4B Company ${runId}` } })).id;
    municipalityId = (await createMunicipality(prisma, `P4B Municipality ${runId}`)).id;
    stageMunicipalityId = (await createMunicipality(prisma, `P4B Stage ${runId}`, 'PREPARING')).id;
    for (const [i, key] of (['A', 'B', 'C'] as const).entries()) {
      stationIds[key] = (
        await prisma.station.create({
          data: {
            internalCode: `P4B-${runId}-${key}`,
            stationNumber: String(i + 1),
            name: `P4B station ${key}`,
            companyId,
            municipalityId,
          },
        })
      ).id;
    }
    for (const key of ['R1', 'R2'] as const) {
      regIds[key] = (
        await prisma.registrationStation.create({
          data: { internalCode: `P4B-${runId}-${key}`, name: `P4B office ${key}`, municipalityId, address: 'x' },
        })
      ).id;
    }

    await makeRole('fuelEmployee', 'PETROL_STATION', ['stations:read', 'fillups:create']);
    await makeRole('fuelSupervisor', 'PETROL_STATION', ['stations:read', 'fillups:create', 'users:manage_staff']);
    await makeRole('regEmployee', 'REGISTRATION', ['registration_stations:read', 'cards:issue']);
    await makeRole('regSupervisor', 'REGISTRATION', ['registration_stations:read', 'cards:issue', 'users:manage_staff']);
    // Directorate-style admin: manages users and roles, no top-level permission.
    await makeRole(
      'directorate',
      null,
      ['users:manage', 'roles:manage', 'municipalities:read', 'stations:read'],
      true,
    );
    // Top-level admin: also manages municipalities and the top-level accounts.
    await makeRole(
      'top',
      null,
      [
        'users:manage',
        'roles:manage',
        'users:manage_system_admins',
        'municipalities:read',
        'municipalities:manage',
        'stations:read',
      ],
      true,
    );

    await makeUser('dir', 'directorate');
    await makeUser('top', 'top');
    await makeUser('supA', 'fuelSupervisor', { stations: ['A', 'B'] });
    await makeUser('supOther', 'fuelSupervisor', { stations: ['A'] });
    await makeUser('supReg', 'regSupervisor', { regs: ['R1'] });
    await makeUser('empA', 'fuelEmployee', { stations: ['A'] });
    await makeUser('empAB', 'fuelEmployee', { stations: ['A', 'B'] });
    await makeUser('empAC', 'fuelEmployee', { stations: ['A', 'C'] });
    await makeUser('empC', 'fuelEmployee', { stations: ['C'] });
    await makeUser('empNoPlace', 'fuelEmployee');
    await makeUser('regEmp', 'regEmployee', { regs: ['R1'] });
    await makeUser('regEmpR2', 'regEmployee', { regs: ['R2'] });
    // A legacy account holding two jobs on the same side.
    await makeUser('twoJobs', 'fuelEmployee', { stations: ['A'] });
    await prisma.userRole.create({ data: { userId: user.twoJobs, roleId: role.fuelSupervisor } });
  });

  afterAll(async () => {
    const allUsers = await prisma.user.findMany({
      where: { username: { startsWith: prefix } },
      select: { id: true },
    });
    const ids = allUsers.map((u) => u.id);
    await prisma.auditLog.deleteMany({ where: { OR: [{ userId: { in: ids } }, { entityId: { in: ids } }] } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.userStationScope.deleteMany({ where: { userId: { in: ids } } });
    await prisma.userRegistrationStationScope.deleteMany({ where: { userId: { in: ids } } });
    await prisma.userPermission.deleteMany({ where: { userId: { in: ids } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: [municipalityId, stageMunicipalityId] } } });
    await prisma.registrationStation.deleteMany({ where: { id: { in: Object.values(regIds) } } });
    await prisma.station.deleteMany({ where: { id: { in: Object.values(stationIds) } } });
    await prisma.company.delete({ where: { id: companyId } });
    await deleteMunicipalities(prisma, [municipalityId, stageMunicipalityId]);
    await app.close();
  });

  const api = () => request(app.getHttpServer());
  const get = (as: UserKey, path: string) => api().get(`/api/v1${path}`).set('Authorization', `Bearer ${token[as]}`);
  const post = (as: UserKey, path: string, body: object = {}) =>
    api().post(`/api/v1${path}`).set('Authorization', `Bearer ${token[as]}`).send(body);
  const patch = (as: UserKey, path: string, body: object) =>
    api().patch(`/api/v1${path}`).set('Authorization', `Bearer ${token[as]}`).send(body);
  const put = (as: UserKey, path: string, body: object) =>
    api().put(`/api/v1${path}`).set('Authorization', `Bearer ${token[as]}`).send(body);

  const message = (res: request.Response) => res.body.message;

  // ── supervisors ─────────────────────────────────────────────────────

  describe('a supervisor and their own staff', () => {
    it('opens and manages an employee wholly inside their stations', async () => {
      const res = await get('supA', `/users/${user.empAB}`).expect(200);
      expect(res.body.capabilities).toMatchObject({ canView: true, canEditIdentity: true, canManageAccount: true });
      expect(res.body.capabilities.canChangeJob).toBe(false);
      await patch('supA', `/users/${user.empAB}`, { fullName: 'P4B renamed' }).expect(200);
    });

    it('is refused an employee who works only outside their stations', async () => {
      const res = await get('supA', `/users/${user.empC}`).expect(403);
      expect(message(res)).toBe('USER_OUT_OF_SCOPE');
      await patch('supA', `/users/${user.empC}`, { fullName: 'P4B nope' }).expect(403);
      await post('supA', `/users/${user.empC}/deactivate`, { reason: 'no way' }).expect(403);
      await post('supA', `/users/${user.empC}/reset-password`).expect(403);
      await get('supA', `/users/${user.empC}/activity`).expect(403);
    });

    it('can read, but not change, an employee who also works outside their stations', async () => {
      const res = await get('supA', `/users/${user.empAC}`).expect(200);
      expect(res.body.capabilities).toMatchObject({ canView: true, canManageAccount: false, readOnlyReason: 'WORKS_ELSEWHERE' });
      expect(message(await patch('supA', `/users/${user.empAC}`, { fullName: 'P4B nope' }).expect(403))).toBe('WORKS_ELSEWHERE');
      await post('supA', `/users/${user.empAC}/deactivate`, { reason: 'no way' }).expect(403);
      await put('supA', `/users/${user.empAC}/places`, { placeIds: [stationIds.A] }).expect(403);
    });

    it('does not reach an employee with no place at all, another supervisor, an admin, or the other side', async () => {
      await get('supA', `/users/${user.empNoPlace}`).expect(403);
      await get('supA', `/users/${user.supOther}`).expect(403);
      await get('supA', `/users/${user.dir}`).expect(403);
      await get('supA', `/users/${user.regEmp}`).expect(403);
      await get('supA', `/users/${user.twoJobs}`).expect(403);
    });

    it('lists only the employees it may open, and offers only its own side\'s employee job', async () => {
      const res = await get('supA', '/users?take=100').expect(200);
      const ids = res.body.items.map((i: { id: string }) => i.id);
      expect(ids).toEqual(expect.arrayContaining([user.empA, user.empAB, user.empAC]));
      for (const hidden of ['empC', 'empNoPlace', 'supOther', 'supA', 'dir', 'top', 'regEmp', 'twoJobs'] as UserKey[]) {
        expect(ids).not.toContain(user[hidden]);
      }
      const accessible = res.body.items.find((i: { id: string }) => i.id === user.empAC);
      expect(accessible.canManage).toBe(false);

      const options = await get('supA', '/users/options').expect(200);
      const offered = options.body.jobs.map((j: { id: string }) => j.id);
      expect(offered).toContain(role.fuelEmployee);
      for (const notOffered of ['fuelSupervisor', 'regEmployee', 'regSupervisor', 'directorate', 'top'] as RoleKey[]) {
        expect(offered).not.toContain(role[notOffered]);
      }
      // Whatever else is offered is also an employee job on its own side.
      for (const job of options.body.jobs) expect(job.kind).toBe('PETROL_STATION');
    });

    it('creates an employee at its own stations, never elsewhere, never another job', async () => {
      const ok = await post('supA', '/users', {
        username: `${prefix}_new1`,
        fullName: 'P4B new employee',
        roleId: role.fuelEmployee,
        placeIds: [stationIds.A, stationIds.B],
      }).expect(201);
      expect(ok.body.temporaryPassword).toMatch(/^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/);
      const created = await prisma.user.findUniqueOrThrow({
        where: { username: `${prefix}_new1` },
        include: { roles: true, stationScope: true },
      });
      expect(created.mustChangePassword).toBe(true);
      expect(created.roles.map((r) => r.roleId)).toEqual([role.fuelEmployee]);
      expect(created.stationScope.map((s) => s.stationId).sort()).toEqual([stationIds.A, stationIds.B].sort());

      const elsewhere = await post('supA', '/users', {
        username: `${prefix}_new2`,
        fullName: 'x',
        roleId: role.fuelEmployee,
        placeIds: [stationIds.C],
      }).expect(403);
      expect(message(elsewhere)).toBe('PLACES_OUTSIDE_SCOPE');
      await post('supA', '/users', { username: `${prefix}_new3`, fullName: 'x', roleId: role.fuelEmployee, placeIds: [] }).expect(400);
      expect(await prisma.user.count({ where: { username: { in: [`${prefix}_new2`, `${prefix}_new3`] } } })).toBe(0);
    });

    it('cannot create a supervisor, an admin, or an employee of the other side', async () => {
      for (const roleKey of ['fuelSupervisor', 'regEmployee', 'directorate', 'top'] as RoleKey[]) {
        const res = await post('supA', '/users', {
          username: `${prefix}_bad_${roleKey}`,
          fullName: 'x',
          roleId: role[roleKey],
          placeIds: [stationIds.A],
        }).expect(403);
        expect(message(res)).toBe('JOB_NOT_ALLOWED');
      }
      await post('supA', '/users', { username: `${prefix}_nojob`, fullName: 'x' }).expect(400);
    });

    it('cannot change a job or grant a permission, and cannot touch its own account', async () => {
      expect(message(await put('supA', `/users/${user.empAB}/job`, { roleId: role.fuelSupervisor }).expect(403))).toBe(
        'ACTION_NOT_ALLOWED',
      );
      const permission = await prisma.permission.upsert({ where: { key: 'fillups:create' }, create: { key: 'fillups:create' }, update: {} });
      await post('supA', `/users/${user.empAB}/permissions`, { permissionId: permission.id }).expect(403);
      await post('supA', `/users/${user.empAB}/roles`, { roleId: role.fuelSupervisor }).expect(403);

      expect(message(await post('supA', `/users/${user.supA}/deactivate`, { reason: 'myself' }).expect(403))).toBe('SELF_ACTION');
      await post('supA', `/users/${user.supA}/reset-password`).expect(403);
      await patch('supA', `/users/${user.supA}`, { fullName: 'me' }).expect(403);
    });

    it('a registration supervisor works the same way on registration offices', async () => {
      await get('supReg', `/users/${user.regEmp}`).expect(200);
      await get('supReg', `/users/${user.regEmpR2}`).expect(403);
      await get('supReg', `/users/${user.empA}`).expect(403);
      await post('supReg', '/users', {
        username: `${prefix}_regnew`,
        fullName: 'P4B reg new',
        roleId: role.regEmployee,
        placeIds: [regIds.R1],
      }).expect(201);
      await post('supReg', '/users', {
        username: `${prefix}_regbad`,
        fullName: 'x',
        roleId: role.regEmployee,
        placeIds: [regIds.R2],
      }).expect(403);
    });

    it('changes the places of an employee only inside its own stations', async () => {
      await put('supA', `/users/${user.empAB}/places`, { placeIds: [stationIds.A] }).expect(200);
      expect(message(await put('supA', `/users/${user.empAB}/places`, { placeIds: [stationIds.A, stationIds.C] }).expect(403))).toBe(
        'PLACES_OUTSIDE_SCOPE',
      );
      await put('supA', `/users/${user.empAB}/places`, { placeIds: [] }).expect(400);
      await put('supA', `/users/${user.empAB}/places`, { placeIds: [stationIds.A, stationIds.B] }).expect(200);
    });
  });

  // ── admins ──────────────────────────────────────────────────────────

  describe('admins and privilege escalation', () => {
    it('a directorate admin cannot create or promote someone to the top-level job', async () => {
      const created = await post('dir', '/users', {
        username: `${prefix}_topnew`,
        fullName: 'x',
        roleId: role.top,
      }).expect(403);
      expect(message(created)).toBe('JOB_NOT_ALLOWED');
      expect(message(await put('dir', `/users/${user.empA}/job`, { roleId: role.top }).expect(403))).toBe('JOB_NOT_ALLOWED');
      expect(message(await post('dir', `/users/${user.empA}/roles`, { roleId: role.top }).expect(403))).toBe('PRIVILEGED_ACCOUNT');
      // The jobs it may give do not even include the top-level one.
      const options = await get('dir', '/users/options').expect(200);
      const offered = options.body.jobs.map((j: { id: string }) => j.id);
      expect(offered).toContain(role.directorate);
      expect(offered).not.toContain(role.top);
    });

    it('a top-level admin can create the top-level job', async () => {
      await post('top', '/users', { username: `${prefix}_topok`, fullName: 'P4B top ok', roleId: role.top }).expect(201);
    });

    it('a directorate admin may read, but not change, a top-level account', async () => {
      const res = await get('dir', `/users/${user.top}`).expect(200);
      expect(res.body.capabilities).toMatchObject({ canView: true, canManageAccount: false, canChangeJob: false, readOnlyReason: 'PRIVILEGED' });
      expect(message(await post('dir', `/users/${user.top}/deactivate`, { reason: 'try it' }).expect(403))).toBe('PRIVILEGED_ACCOUNT');
      await post('dir', `/users/${user.top}/reset-password`).expect(403);
      await put('dir', `/users/${user.top}/job`, { roleId: role.directorate }).expect(403);
      await post('dir', `/users/${user.top}/permissions`, { permissionId: (await prisma.permission.findUniqueOrThrow({ where: { key: 'stations:read' } })).id }).expect(403);
      expect(await prisma.user.findUniqueOrThrow({ where: { id: user.top } })).toMatchObject({ isActive: true });
    });

    it('nobody raises their own role or permissions', async () => {
      expect(message(await put('dir', `/users/${user.dir}/job`, { roleId: role.directorate }).expect(403))).toBe('SELF_ACTION');
      expect(message(await post('dir', `/users/${user.dir}/roles`, { roleId: role.fuelEmployee }).expect(403))).toBe('SELF_ACTION');
      const permission = await prisma.permission.upsert({ where: { key: 'cards:issue' }, create: { key: 'cards:issue' }, update: {} });
      expect(message(await post('dir', `/users/${user.dir}/permissions`, { permissionId: permission.id }).expect(403))).toBe('SELF_ACTION');
      // Not even a top-level admin, and not by deactivating or resetting themselves.
      await put('top', `/users/${user.top}/job`, { roleId: role.top }).expect(403);
      await post('top', `/users/${user.top}/deactivate`, { reason: 'myself' }).expect(403);
    });

    it('lists with search and filters', async () => {
      const bySearch = await get('dir', `/users?q=${prefix}_empAB`).expect(200);
      expect(bySearch.body.items.map((i: { id: string }) => i.id)).toEqual([user.empAB]);
      expect(bySearch.body.items[0]).toMatchObject({ job: { roleId: role.fuelEmployee, kind: 'PETROL_STATION' }, placeKind: 'PETROL_STATION' });
      expect(bySearch.body.items[0].placeNames.length).toBeLessThanOrEqual(2);
      expect(bySearch.body.items[0].placeCount).toBe(2);

      const byPlace = await get('dir', `/users?placeId=${stationIds.C}&take=100`).expect(200);
      expect(byPlace.body.items.map((i: { id: string }) => i.id).sort()).toEqual([user.empAC, user.empC].sort());

      const bySide = await get('dir', `/users?side=REGISTRATION&q=${prefix}&take=100`).expect(200);
      for (const item of bySide.body.items) expect(item.job.kind).toBe('REGISTRATION');

      const admins = await get('dir', `/users?side=ADMIN&q=${prefix}&take=100`).expect(200);
      expect(admins.body.items.map((i: { id: string }) => i.id)).toEqual(expect.arrayContaining([user.dir, user.top]));

      const byRole = await get('dir', `/users?roleId=${role.fuelSupervisor}&q=${prefix}&take=100`).expect(200);
      expect(byRole.body.items.map((i: { id: string }) => i.id)).toEqual(expect.arrayContaining([user.supA, user.supOther]));
    });
  });

  // ── one job per person ──────────────────────────────────────────────

  describe('one job per person', () => {
    it('setting a job replaces the old one, and keeps the places on the same side', async () => {
      const res = await put('dir', `/users/${user.twoJobs}/job`, { roleId: role.fuelSupervisor }).expect(200);
      expect(res.body.roles).toHaveLength(1);
      expect(res.body.roles[0].roleId).toBe(role.fuelSupervisor);
      expect(res.body.places.map((p: { id: string }) => p.id)).toEqual([stationIds.A]);
    });

    it('moving to the other side drops the old places and needs the new ones', async () => {
      const missing = await put('dir', `/users/${user.empC}/job`, { roleId: role.regEmployee }).expect(400);
      expect(message(missing)).toBe('PLACES_REQUIRED');
      const res = await put('dir', `/users/${user.empC}/job`, { roleId: role.regEmployee, placeIds: [regIds.R1] }).expect(200);
      expect(res.body.roles).toHaveLength(1);
      expect(res.body.placeKind).toBe('REGISTRATION');
      expect(await prisma.userStationScope.count({ where: { userId: user.empC } })).toBe(0);
      expect(await prisma.userRegistrationStationScope.count({ where: { userId: user.empC } })).toBe(1);
    });

    it('an administration job carries no places', async () => {
      const res = await put('dir', `/users/${user.empNoPlace}/job`, { roleId: role.directorate }).expect(200);
      expect(res.body.places).toEqual([]);
      await put('dir', `/users/${user.empNoPlace}/job`, { roleId: role.directorate, placeIds: [stationIds.A] }).expect(400);
    });
  });

  // ── account actions ─────────────────────────────────────────────────

  describe('deactivate, reactivate, reset, unlock', () => {
    it('deactivating needs a reason, ends the sessions, and blocks the very next request', async () => {
      await authService.issueTokenPair(user.empA, `${prefix}_empA`);
      await get('empA', '/auth/me').expect(200);

      await post('supA', `/users/${user.empA}/deactivate`, {}).expect(400);
      await post('supA', `/users/${user.empA}/deactivate`, { reason: 'ab' }).expect(400);
      await post('supA', `/users/${user.empA}/deactivate`, { reason: 'Left the company' }).expect(200);

      expect(await prisma.refreshToken.count({ where: { userId: user.empA, revokedAt: null } })).toBe(0);
      await get('empA', '/auth/me').expect(401);
      const row = await prisma.auditLog.findFirstOrThrow({ where: { entityId: user.empA, action: 'DEACTIVATE_USER' } });
      expect(row.userId).toBe(user.supA);
      expect(row.newValue).toEqual({ reason: 'Left the company' });

      expect(message(await post('supA', `/users/${user.empA}/deactivate`, { reason: 'twice over' }).expect(409))).toBe('ALREADY_INACTIVE');
      await post('supA', `/users/${user.empA}/reactivate`, { reason: 'Back from leave' }).expect(200);
      await get('empA', '/auth/me').expect(200);
      expect(message(await post('supA', `/users/${user.empA}/reactivate`, { reason: 'again again' }).expect(409))).toBe('ALREADY_ACTIVE');
      expect(await prisma.auditLog.count({ where: { entityId: user.empA, action: 'REACTIVATE_USER' } })).toBe(1);
    });

    it('a reset sets must-change, clears the lockout, ends sessions, and never exposes the password again', async () => {
      await prisma.user.update({
        where: { id: user.empAB },
        data: { failedLoginAttempts: 5, lockedUntil: new Date(Date.now() + 600_000), mustChangePassword: false },
      });
      await authService.issueTokenPair(user.empAB, `${prefix}_empAB`);

      const res = await post('supA', `/users/${user.empAB}/reset-password`).expect(200);
      expect(res.headers['cache-control']).toContain('no-store');
      const temporary: string = res.body.temporaryPassword;
      expect(temporary).toMatch(/^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/);

      const after = await prisma.user.findUniqueOrThrow({ where: { id: user.empAB } });
      expect(after).toMatchObject({ mustChangePassword: true, failedLoginAttempts: 0, lockedUntil: null });
      expect(await argon2.verify(after.passwordHash, temporary)).toBe(true);
      expect(after.passwordHash).not.toContain(temporary);
      expect(await prisma.refreshToken.count({ where: { userId: user.empAB, revokedAt: null } })).toBe(0);

      // Nothing else returns it, and the audit trail never holds it.
      const detail = await get('supA', `/users/${user.empAB}`).expect(200);
      const activity = await get('supA', `/users/${user.empAB}/activity`).expect(200);
      const list = await get('supA', '/users?take=100').expect(200);
      for (const body of [detail.body, activity.body, list.body]) {
        expect(JSON.stringify(body)).not.toContain(temporary);
        expect(JSON.stringify(body)).not.toContain('passwordHash');
      }
      const rows = await prisma.auditLog.findMany({ where: { entityId: user.empAB } });
      expect(rows.some((r) => r.action === 'RESET_PASSWORD')).toBe(true);
      expect(JSON.stringify(rows)).not.toContain(temporary);

      // The old access token is refused right away (must change first), and
      // the temporary password logs in, flagged must-change.
      await get('empAB', '/users/options').expect(403);
      const login = await api().post('/api/v1/auth/login').send({ username: `${prefix}_empAB`, password: temporary }).expect(200);
      expect(login.body.mustChangePassword).toBe(true);
      const loggedIn = await prisma.user.findUniqueOrThrow({ where: { id: user.empAB } });
      expect(loggedIn.lastLoginAt).not.toBeNull();
    });

    it('unlocks a locked account', async () => {
      await prisma.user.update({ where: { id: user.empA }, data: { failedLoginAttempts: 5, lockedUntil: new Date(Date.now() + 600_000) } });
      const before = await get('supA', `/users/${user.empA}`).expect(200);
      expect(before.body.status).toBe('locked');
      await post('supA', `/users/${user.empA}/unlock`).expect(200);
      expect(await prisma.user.findUniqueOrThrow({ where: { id: user.empA } })).toMatchObject({ failedLoginAttempts: 0, lockedUntil: null });
      expect(await prisma.auditLog.count({ where: { entityId: user.empA, action: 'UNLOCK_USER' } })).toBe(1);
    });

    it('changing a job ends the person\'s sessions', async () => {
      await authService.issueTokenPair(user.regEmpR2, `${prefix}_regEmpR2`);
      await put('dir', `/users/${user.regEmpR2}/job`, { roleId: role.regSupervisor }).expect(200);
      expect(await prisma.refreshToken.count({ where: { userId: user.regEmpR2, revokedAt: null } })).toBe(0);
      expect(await prisma.auditLog.count({ where: { entityId: user.regEmpR2, action: 'CHANGE_JOB' } })).toBe(1);
    });

    it('records who did what, with the reason, in the person\'s activity', async () => {
      const res = await get('supA', `/users/${user.empA}/activity`).expect(200);
      const actions = res.body.map((r: { action: string }) => r.action);
      expect(actions).toEqual(expect.arrayContaining(['DEACTIVATE_USER', 'REACTIVATE_USER', 'UNLOCK_USER']));
      expect(res.body.find((r: { action: string }) => r.action === 'DEACTIVATE_USER')).toMatchObject({
        reason: 'Left the company',
        actorName: 'P4B supA',
      });
      expect(actions).not.toContain('LOGIN');
    });

    it('editing the profile never writes the phone number into the audit trail', async () => {
      await patch('supA', `/users/${user.empAB}`, { phone: '0912345678' }).expect(200);
      const rows = await prisma.auditLog.findMany({ where: { entityId: user.empAB, action: 'UPDATE' } });
      expect(JSON.stringify(rows)).not.toContain('0912345678');
      expect(await prisma.user.findUniqueOrThrow({ where: { id: user.empAB } })).toMatchObject({ phone: '0912345678' });
    });
  });

  // ── the activation switch ───────────────────────────────────────────

  describe('the municipality activation switch', () => {
    it('is refused for the directorate admin (no municipalities:manage), whatever it is asked to do', async () => {
      await patch('dir', `/municipalities/${stageMunicipalityId}`, { status: 'LIVE' }).expect(403);
      await patch('dir', `/municipalities/${stageMunicipalityId}`, { name: 'renamed' }).expect(403);
      expect((await prisma.municipality.findUniqueOrThrow({ where: { id: stageMunicipalityId } })).status).toBe('PREPARING');
    });

    it('a user with no municipalities permission is refused too', async () => {
      await patch('supA', `/municipalities/${stageMunicipalityId}`, { status: 'LIVE' }).expect(403);
    });

    it('the manage permission switches on (date and who recorded, audited) and off (reason required)', async () => {
      await prisma.securityAuthority.create({ data: { name: `P4B authority ${runId}`, municipalityId: stageMunicipalityId } });
      const on = await patch('top', `/municipalities/${stageMunicipalityId}`, { status: 'LIVE' }).expect(200);
      expect(on.body.status).toBe('LIVE');
      expect(on.body.activatedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const row = await prisma.municipality.findUniqueOrThrow({ where: { id: stageMunicipalityId } });
      expect(row.activatedAt).not.toBeNull();
      expect(row.activatedById).toBe(user.top);
      expect(await prisma.auditLog.count({ where: { entityId: stageMunicipalityId, action: 'ACTIVATE' } })).toBe(1);

      await patch('top', `/municipalities/${stageMunicipalityId}`, { status: 'PREPARING' }).expect(400);
      await patch('top', `/municipalities/${stageMunicipalityId}`, { status: 'PREPARING', reason: 'P4B: switched off' }).expect(200);
      expect(await prisma.auditLog.count({ where: { entityId: stageMunicipalityId, action: 'DEACTIVATE' } })).toBe(1);
    });

    it('the removed stage-date and typed-name fields are refused as unknown', async () => {
      await patch('top', `/municipalities/${stageMunicipalityId}`, { awarenessStartDate: '2098-12-01' }).expect(400);
      await patch('top', `/municipalities/${stageMunicipalityId}`, { confirmName: 'x', status: 'LIVE' }).expect(400);
    });
  });

  it('every account action is audited with who did it', async () => {
    const actions = await prisma.auditLog.findMany({
      where: { entityId: { in: Object.values(user) }, userId: { not: null } },
      select: { action: true },
    });
    const seen = new Set(actions.map((a) => a.action));
    for (const action of ['DEACTIVATE_USER', 'REACTIVATE_USER', 'RESET_PASSWORD', 'UNLOCK_USER', 'CHANGE_JOB', 'SET_PLACES', 'UPDATE']) {
      expect(seen).toContain(action);
    }
  });
});
