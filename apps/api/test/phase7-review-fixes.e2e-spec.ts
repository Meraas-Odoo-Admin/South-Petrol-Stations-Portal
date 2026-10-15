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
import { randomBooklet, randomChassis, randomDigits } from './support/registration-fixtures';

// Phase 7 (Mohamed's review, 14 Oct 2026), the API side:
//  1. the administrative number is 10 digits starting with 5 or 6; a booklet
//     number is digits only; a plate has no N;
//  2. «رقم/مرجع الإثبات» is gone from every DTO (and nothing requires it);
//  3. desks and printers are gone (endpoints, and a card needs no desk), and
//     the municipality manager issues and prints cards in the offices of their
//     own municipality — 403 in another;
//  4. «اليوم» for a municipality manager with no station named is their
//     municipality's stations, not an error.
// Roles are copies of the catalog's (rbac-catalog.ts), so these tests check the
// grants as they ship.
describe('Phase 7 review fixes (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authService: AuthService;

  const runId = Date.now().toString(36);
  const prefix = `e2e_p7_${runId}`;
  const roleIds: string[] = [];
  const roleId: Record<string, string> = {};
  const userId: Record<string, string> = {};
  const token: Record<string, string> = {};

  let muniA: string;
  let muniB: string;
  let companyId: string;
  let stationA: string;
  let stationB: string;
  let officeA: string;
  let officeB: string;
  const ownerIds: string[] = [];
  const vehicleIds: string[] = [];
  const exceptionTypeIds: string[] = [];

  type CatalogRole = 'registration_employee' | 'directorate_admin' | 'station_supervisor';

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
      const permission = await prisma.permission.upsert({ where: { key: permissionKey }, create: { key: permissionKey }, update: {} });
      await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    }
  }

  async function makeUser(
    key: string,
    roleKey: CatalogRole,
    scope: { municipalities?: string[]; stations?: string[]; offices?: string[] } = {},
  ) {
    const created = await prisma.user.create({
      data: { username: `${prefix}_${key}`, passwordHash: await argon2.hash('Phase7Test123!'), fullName: `P7 ${key}` },
    });
    userId[key] = created.id;
    await prisma.userRole.create({ data: { userId: created.id, roleId: roleId[roleKey]! } });
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

  const api = () => request(app.getHttpServer());
  const auth = (key: string) => ({ Authorization: `Bearer ${token[key]}` });
  const arabicTag = () => Array.from({ length: 5 }, () => 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي'[Math.floor(Math.random() * 28)]).join('');

  async function registerOwner(body: Record<string, unknown>) {
    const res = await api()
      .post('/api/v1/owners')
      .set(auth('registrar'))
      .send({ registrationStationId: officeA, fullName: `مالك المرحلة السابعة ${arabicTag()}`, phone: '0910000000', ...body });
    if (res.status === 201) ownerIds.push(res.body.id);
    return res;
  }

  async function registerVehicle(ownerId: string, body: Record<string, unknown> = {}) {
    const res = await api()
      .post('/api/v1/vehicles')
      .set(auth('registrar'))
      .send({
        registrationStationId: officeA,
        ownerId,
        currentPlate: `7-${randomDigits(6).replace(/^0/, '1')}`,
        chassisNumber: randomChassis(),
        registrationBooklet: randomBooklet(),
        make: 'تويوتا',
        model: 'كامري',
        color: 'ابيض',
        manufactureYear: 2020,
        fuelType: 'PETROL',
        ...body,
      });
    if (res.status === 201) vehicleIds.push(res.body.id);
    return res;
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

    // Cards need a municipality code and a security authority.
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const code = () => Array.from({ length: 5 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
    muniA = (await prisma.municipality.create({ data: { name: `${prefix} A`, status: 'LIVE', code: code() } })).id;
    muniB = (await prisma.municipality.create({ data: { name: `${prefix} B`, status: 'LIVE', code: code() } })).id;
    await prisma.securityAuthority.create({ data: { name: `${prefix} authority A`, municipalityId: muniA } });
    await prisma.securityAuthority.create({ data: { name: `${prefix} authority B`, municipalityId: muniB } });
    companyId = (await prisma.company.create({ data: { name: `${prefix} company` } })).id;
    stationA = (
      await prisma.station.create({ data: { internalCode: `${prefix}-SA`, stationNumber: '1', name: 'P7 A', companyId, municipalityId: muniA } })
    ).id;
    stationB = (
      await prisma.station.create({ data: { internalCode: `${prefix}-SB`, stationNumber: '2', name: 'P7 B', companyId, municipalityId: muniB } })
    ).id;
    officeA = (
      await prisma.registrationStation.create({ data: { internalCode: `${prefix}-RA`, name: `مكتب أ ${runId}`, municipalityId: muniA, address: 'أ' } })
    ).id;
    officeB = (
      await prisma.registrationStation.create({ data: { internalCode: `${prefix}-RB`, name: `مكتب ب ${runId}`, municipalityId: muniB, address: 'ب' } })
    ).id;

    for (const key of ['registration_employee', 'directorate_admin', 'station_supervisor'] as const) await makeCatalogRole(key);
    await makeUser('registrar', 'registration_employee', { offices: [officeA] });
    await makeUser('managerA', 'directorate_admin', { municipalities: [muniA] });
    await makeUser('supervisorA', 'station_supervisor', { stations: [stationA] });
  });

  afterAll(async () => {
    const userIds = Object.values(userId);
    const fillUps = await prisma.fillUpTransaction.findMany({ where: { stationId: { in: [stationA, stationB] } }, select: { id: true } });
    const fIds = fillUps.map((f) => f.id);
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.exception.deleteMany({ where: { fillUpTransactionId: { in: fIds } } });
    await prisma.fillUpTransaction.deleteMany({ where: { id: { in: fIds } } });
    await prisma.exceptionType.deleteMany({ where: { id: { in: exceptionTypeIds } } });
    const cards = await prisma.vehicleCard.findMany({ where: { vehicleId: { in: vehicleIds } }, select: { id: true } });
    await prisma.cardPrint.deleteMany({ where: { cardId: { in: cards.map((c) => c.id) } } });
    await prisma.vehicleCard.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.vehicleChangeRequest.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.ownerChangeRequest.deleteMany({ where: { ownerId: { in: ownerIds } } });
    await prisma.vehiclePlateHistory.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.vehicle.deleteMany({ where: { id: { in: vehicleIds } } });
    await prisma.vehicleOwner.deleteMany({ where: { id: { in: ownerIds } } });
    await prisma.duplicateCatch.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userMunicipalityScope.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userStationScope.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userRegistrationStationScope.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await prisma.registrationStation.deleteMany({ where: { id: { in: [officeA, officeB] } } });
    await prisma.station.deleteMany({ where: { id: { in: [stationA, stationB] } } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await prisma.securityAuthority.deleteMany({ where: { municipalityId: { in: [muniA, muniB] } } });
    await prisma.municipality.deleteMany({ where: { id: { in: [muniA, muniB] } } });
    await app.close();
  });

  // ── 1. field rules ──────────────────────────────────────────────────

  describe('identity and vehicle field rules', () => {
    it('accepts a 10-digit administrative number starting with 5 or 6', async () => {
      for (const first of ['5', '6']) {
        const res = await registerOwner({ identityType: 'ADMINISTRATIVE_ID', identityNumber: `${first}${randomDigits(9)}` });
        expect(res.status).toBe(201);
      }
    });

    it('refuses the old 12-digit «9…» form and any other first digit', async () => {
      for (const identityNumber of [`9${randomDigits(11)}`, `7${randomDigits(9)}`, `5${randomDigits(8)}`]) {
        const res = await registerOwner({ identityType: 'ADMINISTRATIVE_ID', identityNumber });
        expect(res.status).toBe(400);
      }
    });

    it('refuses a booklet number with letters, and a plate with an N', async () => {
      const owner = await registerOwner({ identityType: 'ADMINISTRATIVE_ID', identityNumber: `5${randomDigits(9)}` });
      expect((await registerVehicle(owner.body.id, { registrationBooklet: `AB${randomDigits(6)}` })).status).toBe(400);
      expect((await registerVehicle(owner.body.id, { currentPlate: `7-${randomDigits(5)}N` })).status).toBe(400);
      expect((await registerVehicle(owner.body.id)).status).toBe(201);
    });
  });

  // ── 2. no proof reference ───────────────────────────────────────────

  describe('«رقم/مرجع الإثبات» is gone', () => {
    let vehicleId: string;
    let ownerId: string;

    beforeAll(async () => {
      ownerId = (await registerOwner({ identityType: 'ADMINISTRATIVE_ID', identityNumber: `6${randomDigits(9)}` })).body.id;
      vehicleId = (await registerVehicle(ownerId)).body.id;
    });

    it('a vehicle change request needs only the value and a reason', async () => {
      const res = await api()
        .post(`/api/v1/vehicles/${vehicleId}/change-requests`)
        .set(auth('registrar'))
        .send({ changeType: 'BOOKLET_CHANGE', requestedValue: randomBooklet(), reason: 'خطأ في الإدخال' });
      expect(res.status).toBe(201);
      const stored = await prisma.vehicleChangeRequest.findFirstOrThrow({ where: { vehicleId } });
      expect(stored.proofReference).toBeNull();
    });

    it('refuses a proofReference sent anyway (no such field)', async () => {
      const res = await api()
        .post(`/api/v1/vehicles/${vehicleId}/change-requests`)
        .set(auth('registrar'))
        .send({ changeType: 'BOOKLET_CHANGE', requestedValue: randomBooklet(), reason: 'x', proofReference: 'REF-1' });
      expect(res.status).toBe(400);
    });

    it('an owner identity correction needs no proof reference', async () => {
      const res = await api()
        .post(`/api/v1/owners/${ownerId}/change-requests`)
        .set(auth('registrar'))
        .send({ identityType: 'ADMINISTRATIVE_ID', identityNumber: `5${randomDigits(9)}`, reason: 'تصحيح' });
      expect(res.status).toBe(201);
      expect(res.body.proofReference).toBeNull();
    });

    it('an exception type has no «يتطلب مرجع إثبات» switch', async () => {
      const ok = await api()
        .post('/api/v1/fillups/exception-types')
        .set(auth('managerA'))
        .send({ key: `${prefix}_ok`, name: 'نوع المرحلة السابعة' });
      expect(ok.status).toBe(201);
      exceptionTypeIds.push(ok.body.id);
      const refused = await api()
        .post('/api/v1/fillups/exception-types')
        .set(auth('managerA'))
        .send({ key: `${prefix}_proof`, name: 'نوع بإثبات', requiresProof: true });
      expect(refused.status).toBe(400);
    });
  });

  // ── 3. desks and cards ──────────────────────────────────────────────

  describe('cards without desks; the municipality manager issues cards', () => {
    it('the desk endpoints are gone', async () => {
      expect((await api().get(`/api/v1/registration-stations/${officeA}/desks`).set(auth('managerA'))).status).toBe(404);
      expect((await api().post(`/api/v1/registration-stations/${officeA}/desks`).set(auth('managerA')).send({ name: 'x' })).status).toBe(404);
    });

    it('a registration employee issues a card with no desk; a deskId is refused', async () => {
      const owner = await registerOwner({ identityType: 'ADMINISTRATIVE_ID', identityNumber: `5${randomDigits(9)}` });
      const vehicle = await registerVehicle(owner.body.id);
      const withDesk = await api()
        .post(`/api/v1/vehicles/${vehicle.body.id}/cards`)
        .set(auth('registrar'))
        .send({ registrationStationId: officeA, deskId: 'any', reason: 'FIRST_ISSUE' });
      expect(withDesk.status).toBe(400);
      const res = await api()
        .post(`/api/v1/vehicles/${vehicle.body.id}/cards`)
        .set(auth('registrar'))
        .send({ registrationStationId: officeA, reason: 'FIRST_ISSUE' });
      expect(res.status).toBe(201);
      const card = await prisma.vehicleCard.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(card.deskId).toBeNull();
      expect(card.issuedById).toBe(userId.registrar);
    });

    it('the municipality manager issues and prints a card in an office of their municipality, under their name', async () => {
      const owner = await registerOwner({ identityType: 'ADMINISTRATIVE_ID', identityNumber: `6${randomDigits(9)}` });
      const vehicle = await registerVehicle(owner.body.id);
      const issued = await api()
        .post(`/api/v1/vehicles/${vehicle.body.id}/cards`)
        .set(auth('managerA'))
        .send({ registrationStationId: officeA, reason: 'FIRST_ISSUE' });
      expect(issued.status).toBe(201);
      expect(issued.body.issuedBy.id).toBe(userId.managerA);

      const printed = await api()
        .post(`/api/v1/cards/${issued.body.id}/print`)
        .set(auth('managerA'))
        .send({ registrationStationId: officeA, mode: 'black' });
      expect(printed.status).toBe(200);
      const print = await prisma.cardPrint.findFirstOrThrow({ where: { cardId: issued.body.id } });
      expect(print.printedById).toBe(userId.managerA);
      expect(print.registrationStationId).toBe(officeA);
      expect(print.deskId).toBeNull();
      const audit = await prisma.auditLog.findFirst({ where: { userId: userId.managerA, action: 'PRINT_CARD', entityId: issued.body.id } });
      expect(audit).not.toBeNull();
    }, 120_000);

    it('…and gets 403 in an office of another municipality', async () => {
      const owner = await registerOwner({ identityType: 'ADMINISTRATIVE_ID', identityNumber: `5${randomDigits(9)}` });
      const vehicle = await registerVehicle(owner.body.id);
      const res = await api()
        .post(`/api/v1/vehicles/${vehicle.body.id}/cards`)
        .set(auth('managerA'))
        .send({ registrationStationId: officeB, reason: 'FIRST_ISSUE' });
      expect(res.status).toBe(403);
    });
  });

  // ── 4. «اليوم» for the municipality manager ─────────────────────────

  describe('«اليوم» for a municipality manager', () => {
    beforeAll(async () => {
      const owner = await registerOwner({ identityType: 'ADMINISTRATIVE_ID', identityNumber: `6${randomDigits(9)}` });
      const vehicle = await registerVehicle(owner.body.id);
      const base = {
        vehicleId: vehicle.body.id,
        fuelType: 'PETROL_95' as const,
        quantityLiters: 20,
        recordedById: userId.supervisorA!,
        identifiedBy: 'CARD_SCAN' as const,
      };
      await prisma.fillUpTransaction.create({ data: { ...base, stationId: stationA, municipalityId: muniA, idempotencyKey: `${prefix}-a1` } });
      await prisma.fillUpTransaction.create({ data: { ...base, stationId: stationA, municipalityId: muniA, idempotencyKey: `${prefix}-a2` } });
      await prisma.fillUpTransaction.create({ data: { ...base, stationId: stationB, municipalityId: muniB, idempotencyKey: `${prefix}-b1` } });
    });

    it('with «جميع المحطات» (no station named) shows every station of their municipality, and only those', async () => {
      const res = await api().get('/api/v1/reports/daily').set(auth('managerA')).query({ skip: 0, take: 25 });
      expect(res.status).toBe(200);
      const stationIds = new Set(res.body.rows.map((r: { station: { id: string } }) => r.station.id));
      expect(stationIds.has(stationA)).toBe(true);
      expect(stationIds.has(stationB)).toBe(false);
      expect(res.body.totalFillUps).toBe(2);
    });

    it('a station of another municipality is refused', async () => {
      const res = await api().get('/api/v1/reports/daily').set(auth('managerA')).query({ stationId: stationB });
      expect(res.status).toBe(403);
    });
  });
});
