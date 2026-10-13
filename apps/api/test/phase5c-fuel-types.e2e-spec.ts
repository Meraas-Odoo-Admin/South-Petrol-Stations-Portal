import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import request from 'supertest';
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

// Client decision (Phase 5C): the municipality manager (from the station's page
// in «إدارة المحطات») and the station supervisor (in «محطتي») both set the fuel
// types a station sells - each only within their own municipality / station,
// and every change is audited. Real catalog roles, as in the 5A spec.
describe('Fuel types: who may set them (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authService: AuthService;

  const runId = Date.now().toString(36);
  const prefix = `e2e_p5cft_${runId}`;
  const roleIds: string[] = [];
  const userIds: string[] = [];
  const token: Record<string, string> = {};
  let companyId: string;
  let m1: string;
  let m2: string;
  const station = { s1a: '', s1b: '', s2: '' };

  async function makeUser(key: string, roleKey: 'directorate_admin' | 'station_supervisor', scope: { municipalities?: string[]; stations?: string[] }) {
    const role = await prisma.role.create({
      data: {
        name: `${prefix}_${key}`,
        kind: ROLE_KINDS[roleKey] ?? null,
        unrestrictedStationAccess: UNRESTRICTED_STATION_ACCESS_ROLES.has(roleKey),
        municipalityScoped: MUNICIPALITY_SCOPED_ROLES.has(roleKey),
      },
    });
    roleIds.push(role.id);
    for (const permissionKey of ROLE_PERMISSIONS[roleKey]!) {
      const permission = await prisma.permission.upsert({
        where: { key: permissionKey },
        create: { key: permissionKey },
        update: {},
      });
      await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    }
    const user = await prisma.user.create({
      data: { username: `${prefix}_${key}`, passwordHash: await argon2.hash('BoundaryTest123!'), fullName: `P5C ${key}` },
    });
    userIds.push(user.id);
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    for (const municipalityId of scope.municipalities ?? []) {
      await prisma.userMunicipalityScope.create({ data: { userId: user.id, municipalityId } });
    }
    for (const stationId of scope.stations ?? []) {
      await prisma.userStationScope.create({ data: { userId: user.id, stationId } });
    }
    token[key] = (await authService.issueTokenPair(user.id, user.username)).accessToken;
  }

  const patch = (key: string, stationId: string, body: object) =>
    request(app.getHttpServer())
      .patch(`/api/v1/stations/${stationId}`)
      .set('Authorization', `Bearer ${token[key]}`)
      .send(body);

  const sold = async (stationId: string) =>
    (await prisma.stationFuelAvailability.findMany({ where: { stationId, isAvailable: true } }))
      .map((f) => f.fuelType)
      .sort();

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

    companyId = (await prisma.company.create({ data: { name: `P5C FT Company ${runId}` } })).id;
    m1 = (await createMunicipality(prisma, `P5C FT M1 ${runId}`)).id;
    m2 = (await createMunicipality(prisma, `P5C FT M2 ${runId}`)).id;
    for (const [key, municipalityId, number] of [
      ['s1a', m1, '1'],
      ['s1b', m1, '2'],
      ['s2', m2, '3'],
    ] as const) {
      station[key] = (
        await prisma.station.create({
          data: {
            internalCode: `P5CFT-${runId}-${key}`,
            stationNumber: number,
            name: `P5C FT station ${key}`,
            companyId,
            municipalityId,
          },
        })
      ).id;
    }
    await makeUser('mm1', 'directorate_admin', { municipalities: [m1] });
    await makeUser('sup', 'station_supervisor', { stations: [station.s1a] });
  });

  afterAll(async () => {
    const stationIds = Object.values(station);
    await prisma.stationFuelAvailability.deleteMany({ where: { stationId: { in: stationIds } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userStationScope.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userMunicipalityScope.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await prisma.station.deleteMany({ where: { id: { in: stationIds } } });
    await prisma.company.delete({ where: { id: companyId } });
    await deleteMunicipalities(prisma, [m1, m2]);
    await app.close();
  });

  it('a municipality manager sets the fuel types of a station in their own municipality, and it is audited', async () => {
    await patch('mm1', station.s1b, { fuelTypes: ['PETROL_95', 'DIESEL'] }).expect(200);
    expect(await sold(station.s1b)).toEqual(['DIESEL', 'PETROL_95']);

    await patch('mm1', station.s1b, { fuelTypes: ['DIESEL'] }).expect(200);
    expect(await sold(station.s1b)).toEqual(['DIESEL']);

    const audit = await prisma.auditLog.findMany({
      where: { entityType: 'Station', entityId: station.s1b, userId: userIds[0] },
      orderBy: { createdAt: 'asc' },
    });
    expect(audit).toHaveLength(2);
    expect(audit[1]!.oldValue).toMatchObject({ fuelTypes: ['DIESEL', 'PETROL_95'] });
    expect(audit[1]!.newValue).toMatchObject({ fuelTypes: ['DIESEL'] });
  });

  it('a municipality manager gets 403 for another municipality\'s station, and nothing changes', async () => {
    await patch('mm1', station.s2, { fuelTypes: ['PETROL_95'] }).expect(403);
    expect(await sold(station.s2)).toEqual([]);
  });

  it('a supervisor sets the fuel types of their own station only, and it is audited', async () => {
    await patch('sup', station.s1a, { fuelTypes: ['PETROL_95'] }).expect(200);
    expect(await sold(station.s1a)).toEqual(['PETROL_95']);

    // Same municipality, a different station: not theirs.
    await patch('sup', station.s1b, { fuelTypes: ['PETROL_95'] }).expect(403);
    await patch('sup', station.s2, { fuelTypes: ['PETROL_95'] }).expect(403);
    expect(await sold(station.s1b)).toEqual(['DIESEL']);
    expect(await sold(station.s2)).toEqual([]);

    const audit = await prisma.auditLog.findMany({
      where: { entityType: 'Station', entityId: station.s1a, userId: userIds[1] },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]!.newValue).toMatchObject({ fuelTypes: ['PETROL_95'] });
  });

  it('a supervisor can change nothing about the station but its fuel types', async () => {
    await patch('sup', station.s1a, { name: 'renamed' }).expect(403);
  });

  it('the ownership field is gone: it is refused as an unknown field', async () => {
    await patch('mm1', station.s1b, { ownershipType: 'PRIVATE' }).expect(400);
  });
});
