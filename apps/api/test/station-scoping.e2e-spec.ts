import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

// The acceptance bar for M1 (docs/IMPLEMENTATION_PLAN.md §8, §11): a
// station_employee scoped to one station must not be able to read another
// station's data, even by guessing its ID directly — enforced in the
// service layer, not the controller or the UI (CLAUDE.md rule 3).
describe('Station scoping boundary (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const runId = Date.now().toString(36);
  const usernameEmployee = `e2e_employee_${runId}`;
  const usernameSupervisor = `e2e_supervisor_${runId}`;
  const password = 'BoundaryTest123!';

  let companyA: { id: string };
  let companyB: { id: string };
  let stationA: { id: string };
  let stationB: { id: string };
  let employeeUserId: string;
  let supervisorUserId: string;

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

    // Two companies, two stations sharing the SAME stationNumber — exactly
    // the case docs/OPEN_ITEMS.md describes as expected, not an error.
    companyA = await prisma.company.create({ data: { name: `E2E Company A ${runId}` } });
    companyB = await prisma.company.create({ data: { name: `E2E Company B ${runId}` } });

    stationA = await prisma.station.create({
      data: {
        internalCode: `E2E-A-${runId}`,
        stationNumber: '99',
        name: 'E2E Station A',
        companyId: companyA.id,
      },
    });
    stationB = await prisma.station.create({
      data: {
        internalCode: `E2E-B-${runId}`,
        stationNumber: '99', // same number, different company — must be allowed
        name: 'E2E Station B',
        companyId: companyB.id,
      },
    });

    const role = await prisma.role.upsert({
      where: { name: 'station_employee' },
      create: { name: 'station_employee' },
      update: {},
    });
    const permission = await prisma.permission.upsert({
      where: { key: 'stations:read' },
      create: { key: 'stations:read' },
      update: {},
    });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
      create: { roleId: role.id, permissionId: permission.id },
      update: {},
    });

    const employeeUser = await prisma.user.create({
      data: {
        username: usernameEmployee,
        passwordHash: await argon2.hash(password),
        fullName: 'E2E Boundary Test Employee',
      },
    });
    employeeUserId = employeeUser.id;

    await prisma.userRole.create({ data: { userId: employeeUser.id, roleId: role.id } });
    // Scoped to Station A ONLY — this is the boundary under test.
    await prisma.userStationScope.create({
      data: { userId: employeeUser.id, stationId: stationA.id },
    });

    // A second scoped user with a *write* permission — the mutation path
    // (StationsService.update) must enforce the same boundary as the read
    // path, not just gate on @RequirePermission.
    const supervisorRole = await prisma.role.upsert({
      where: { name: 'station_supervisor' },
      create: { name: 'station_supervisor' },
      update: {},
    });
    const manageStationsPermission = await prisma.permission.upsert({
      where: { key: 'stations:manage' },
      create: { key: 'stations:manage' },
      update: {},
    });
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: supervisorRole.id, permissionId: manageStationsPermission.id },
      },
      create: { roleId: supervisorRole.id, permissionId: manageStationsPermission.id },
      update: {},
    });

    const supervisorUser = await prisma.user.create({
      data: {
        username: usernameSupervisor,
        passwordHash: await argon2.hash(password),
        fullName: 'E2E Boundary Test Supervisor',
      },
    });
    supervisorUserId = supervisorUser.id;

    await prisma.userRole.create({ data: { userId: supervisorUser.id, roleId: supervisorRole.id } });
    // Scoped to Station A ONLY, same as the employee above.
    await prisma.userStationScope.create({
      data: { userId: supervisorUser.id, stationId: stationA.id },
    });
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { userId: { in: [employeeUserId, supervisorUserId] } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: [employeeUserId, supervisorUserId] } } });
    await prisma.userStationScope.deleteMany({
      where: { userId: { in: [employeeUserId, supervisorUserId] } },
    });
    await prisma.userRole.deleteMany({ where: { userId: { in: [employeeUserId, supervisorUserId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [employeeUserId, supervisorUserId] } } });
    await prisma.station.delete({ where: { id: stationA.id } });
    await prisma.station.delete({ where: { id: stationB.id } });
    await prisma.company.delete({ where: { id: companyA.id } });
    await prisma.company.delete({ where: { id: companyB.id } });
    await app.close();
  });

  async function loginAsEmployee(): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: usernameEmployee, password })
      .expect(200);
    return res.body.accessToken;
  }

  async function loginAsSupervisor(): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: usernameSupervisor, password })
      .expect(200);
    return res.body.accessToken;
  }

  it('lets the scoped employee read their own station', async () => {
    const accessToken = await loginAsEmployee();

    const res = await request(app.getHttpServer())
      .get(`/api/v1/stations/${stationA.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.id).toBe(stationA.id);
  });

  it('blocks the scoped employee from reading another station by guessing its ID', async () => {
    const accessToken = await loginAsEmployee();

    await request(app.getHttpServer())
      .get(`/api/v1/stations/${stationB.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
  });

  it('excludes the out-of-scope station from the list endpoint too', async () => {
    const accessToken = await loginAsEmployee();

    const res = await request(app.getHttpServer())
      .get('/api/v1/stations')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const ids = res.body.map((s: { id: string }) => s.id);
    expect(ids).toContain(stationA.id);
    expect(ids).not.toContain(stationB.id);
  });

  it('rejects unauthenticated requests to stations entirely', async () => {
    await request(app.getHttpServer()).get('/api/v1/stations').expect(401);
  });

  it('blocks a scoped supervisor with stations:manage from updating another station by guessing its ID', async () => {
    const accessToken = await loginAsSupervisor();

    await request(app.getHttpServer())
      .patch(`/api/v1/stations/${stationB.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Hijacked name' })
      .expect(403);
  });
});
