import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { createMunicipality, deleteMunicipalities } from './support/municipality-fixtures';

// Registration pivot, phase 2 — separation of duties, enforced server-side:
// no user may be on both the petrol-station side and the registration side.
// A side comes from a role's `kind` (data, not role names) or from a scope
// of that kind. Admin roles (no kind) combine with anything.
describe('Role separation — petrol station vs registration (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const runId = Date.now().toString(36);
  const password = 'BoundaryTest123!';
  const usernameAdmin = `e2e_sep_admin_${runId}`;

  const roleIds: string[] = [];
  const userIds: string[] = [];
  let petrolRoleId: string;
  let registrationRoleId: string;
  let adminKindlessRoleId: string;
  let petrolUserId: string;
  let registrationUserId: string;
  let companyId: string;
  let stationId: string;
  let municipalityId: string;
  let registrationStationId: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = moduleRef.get(PrismaService);

    const createRole = async (name: string, kind: 'PETROL_STATION' | 'REGISTRATION' | null) => {
      const role = await prisma.role.create({ data: { name: `${name}_${runId}`, kind } });
      roleIds.push(role.id);
      return role.id;
    };
    petrolRoleId = await createRole('e2e_sep_petrol', 'PETROL_STATION');
    registrationRoleId = await createRole('e2e_sep_registration', 'REGISTRATION');
    adminKindlessRoleId = await createRole('e2e_sep_kindless', null);

    // The acting admin — holds roles:manage + users:manage.
    const actorRole = await prisma.role.create({
      data: { name: `e2e_sep_actor_${runId}`, unrestrictedStationAccess: true },
    });
    roleIds.push(actorRole.id);
    for (const key of ['roles:manage', 'users:manage']) {
      const permission = await prisma.permission.upsert({ where: { key }, create: { key }, update: {} });
      await prisma.rolePermission.create({ data: { roleId: actorRole.id, permissionId: permission.id } });
    }

    const createUser = async (username: string, roleId?: string) => {
      const user = await prisma.user.create({
        data: { username, passwordHash: await argon2.hash(password), fullName: username },
      });
      userIds.push(user.id);
      if (roleId) await prisma.userRole.create({ data: { userId: user.id, roleId } });
      return user.id;
    };
    await createUser(usernameAdmin, actorRole.id);
    petrolUserId = await createUser(`e2e_sep_petrol_user_${runId}`, petrolRoleId);
    registrationUserId = await createUser(`e2e_sep_registration_user_${runId}`, registrationRoleId);

    companyId = (await prisma.company.create({ data: { name: `E2E SEP Company ${runId}` } })).id;
    municipalityId = (await createMunicipality(prisma, `E2E SEP Municipality ${runId}`)).id;
    stationId = (
      await prisma.station.create({
        data: { internalCode: `E2E-SEP-${runId}`, stationNumber: '1', name: 'E2E SEP', companyId, municipalityId },
      })
    ).id;
    registrationStationId = (
      await prisma.registrationStation.create({
        data: { internalCode: `E2E-SEP-REG-${runId}`, name: 'E2E SEP REG', municipalityId, address: 'E2E' },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userStationScope.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userRegistrationStationScope.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await prisma.station.delete({ where: { id: stationId } });
    await prisma.company.delete({ where: { id: companyId } });
    await prisma.registrationStation.delete({ where: { id: registrationStationId } });
    await deleteMunicipalities(prisma, [municipalityId]);
    await app.close();
  });

  let token: string;
  async function asAdmin() {
    if (!token) {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ username: usernameAdmin, password })
        .expect(200);
      token = res.body.accessToken;
    }
    return token;
  }
  const post = async (path: string, body: object) =>
    request(app.getHttpServer()).post(`/api/v1${path}`).set('Authorization', `Bearer ${await asAdmin()}`).send(body);

  it('refuses a registration role for a user who holds a petrol-station role, with a clear reason', async () => {
    const res = await post(`/users/${petrolUserId}/roles`, { roleId: registrationRoleId });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('ROLE_SEPARATION_CONFLICT');
    expect(res.body.details).toEqual({
      existingSide: 'PETROL_STATION',
      requestedSide: 'REGISTRATION',
      conflictingRole: `e2e_sep_petrol_${runId}`,
    });
    expect(await prisma.userRole.count({ where: { userId: petrolUserId, roleId: registrationRoleId } })).toBe(0);
  });

  it('refuses a petrol-station role for a user who holds a registration role', async () => {
    const res = await post(`/users/${registrationUserId}/roles`, { roleId: petrolRoleId });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('ROLE_SEPARATION_CONFLICT');
    expect(res.body.details.existingSide).toBe('REGISTRATION');
  });

  it('refuses scopes from the other side too', async () => {
    const regScope = await post(`/users/${petrolUserId}/registration-station-scope`, { registrationStationId });
    expect(regScope.status).toBe(409);
    expect(regScope.body.message).toBe('ROLE_SEPARATION_CONFLICT');

    const petrolScope = await post(`/users/${registrationUserId}/station-scope`, { stationId });
    expect(petrolScope.status).toBe(409);
    expect(petrolScope.body.message).toBe('ROLE_SEPARATION_CONFLICT');
  });

  it('allows same-side scopes, and a kindless (admin) role alongside either side', async () => {
    expect((await post(`/users/${petrolUserId}/station-scope`, { stationId })).status).toBe(201);
    expect(
      (await post(`/users/${registrationUserId}/registration-station-scope`, { registrationStationId })).status,
    ).toBe(201);
    expect((await post(`/users/${petrolUserId}/roles`, { roleId: adminKindlessRoleId })).status).toBe(201);
    expect((await post(`/users/${registrationUserId}/roles`, { roleId: adminKindlessRoleId })).status).toBe(201);
  });

  it('a user placed on one side by a scope alone cannot then be given a role from the other side', async () => {
    const scopedOnlyId = (
      await prisma.user.create({
        data: { username: `e2e_sep_scoped_${runId}`, passwordHash: 'x', fullName: 'scoped only' },
      })
    ).id;
    userIds.push(scopedOnlyId);
    expect(
      (await post(`/users/${scopedOnlyId}/registration-station-scope`, { registrationStationId })).status,
    ).toBe(201);
    const res = await post(`/users/${scopedOnlyId}/roles`, { roleId: petrolRoleId });
    expect(res.status).toBe(409);
    expect(res.body.details).toEqual({
      existingSide: 'REGISTRATION',
      requestedSide: 'PETROL_STATION',
      conflictingRole: null,
    });
  });
});
