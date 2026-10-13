import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { createMunicipality, deleteMunicipalities } from './support/municipality-fixtures';

// UX round, item 4: vehicles are global, so a registration employee in ANY
// office reprints or re-issues ANY vehicle's card. The print is counted against
// the PRINTING employee's office and desk; the old card is cancelled/replaced;
// every action is audited; and an employee still cannot act at an office that
// is not theirs.
describe('Cards from another office (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const runId = Date.now().toString(36);
  const password = 'BoundaryTest123!';
  const letters = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const muniCode = 'Q' + Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
  const usernames = { atA: `e2e_xo_a_${runId}`, atB: `e2e_xo_b_${runId}` };
  const userIds = { atA: '', atB: '' };
  const roleIds: string[] = [];
  let municipalityId: string;
  let authorityId: string;
  let officeA: string;
  let officeB: string;
  let deskA: string;
  let deskB: string;
  const vehicleIds: string[] = [];

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = moduleRef.get(PrismaService);

    municipalityId = (await createMunicipality(prisma, `E2E XO Municipality ${runId}`)).id;
    await prisma.municipality.update({ where: { id: municipalityId }, data: { code: muniCode } });
    authorityId = (await prisma.securityAuthority.create({ data: { name: `E2E XO Authority ${runId}`, municipalityId } })).id;
    const office = (label: string) =>
      prisma.registrationStation.create({
        data: { internalCode: `E2E-XO-${label}-${runId}`, name: `E2E XO ${label}`, municipalityId, address: 'E2E' },
      });
    officeA = (await office('A')).id;
    officeB = (await office('B')).id;
    deskA = (await prisma.registrationDesk.create({ data: { registrationStationId: officeA, name: 'Desk A' } })).id;
    deskB = (await prisma.registrationDesk.create({ data: { registrationStationId: officeB, name: 'Desk B' } })).id;

    // Vehicles registered at office A.
    for (let i = 0; i < 3; i++) {
      const v = await prisma.vehicle.create({
        data: {
          internalCode: `E2E-XO-VEH-${i}-${runId}`,
          currentPlate: `7-${Math.floor(Math.random() * 1e7).toString().padStart(7, '0')}`,
          model: 'تويوتا هايلكس',
          color: 'أبيض',
          registeredAtRegistrationStationId: officeA,
        },
      });
      vehicleIds.push(v.id);
    }

    const role = await prisma.role.create({ data: { name: `e2e_xo_registrar_${runId}`, kind: 'REGISTRATION' } });
    roleIds.push(role.id);
    for (const key of ['cards:read', 'cards:issue', 'registration_stations:read']) {
      const p = await prisma.permission.upsert({ where: { key }, create: { key }, update: {} });
      await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: p.id } });
    }
    for (const [key, office] of [['atA', officeA], ['atB', officeB]] as const) {
      const u = await prisma.user.create({
        data: { username: usernames[key], passwordHash: await argon2.hash(password), fullName: usernames[key] },
      });
      userIds[key] = u.id;
      await prisma.userRole.create({ data: { userId: u.id, roleId: role.id } });
      await prisma.userRegistrationStationScope.create({ data: { userId: u.id, registrationStationId: office } });
    }
  });

  afterAll(async () => {
    const ids = Object.values(userIds);
    await prisma.cardPrint.deleteMany({ where: { registrationStationId: { in: [officeA, officeB] } } });
    await prisma.vehicleCard.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.vehicle.deleteMany({ where: { id: { in: vehicleIds } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: ids } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.userRegistrationStationScope.deleteMany({ where: { userId: { in: ids } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await prisma.registrationDesk.deleteMany({ where: { registrationStationId: { in: [officeA, officeB] } } });
    await prisma.registrationStation.deleteMany({ where: { id: { in: [officeA, officeB] } } });
    await prisma.securityAuthority.deleteMany({ where: { id: authorityId } });
    await deleteMunicipalities(prisma, [municipalityId]);
    await app.close();
  });

  const tokens = new Map<string, string>();
  async function as(key: keyof typeof usernames) {
    if (!tokens.has(key)) {
      const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ username: usernames[key], password }).expect(200);
      tokens.set(key, res.body.accessToken);
    }
    const token = tokens.get(key)!;
    const server = app.getHttpServer();
    return {
      get: (path: string) => request(server).get(`/api/v1${path}`).set('Authorization', `Bearer ${token}`),
      post: (path: string, body: object = {}) => request(server).post(`/api/v1${path}`).set('Authorization', `Bearer ${token}`).send(body),
    };
  }
  const binary = (res: request.Response, cb: (err: Error | null, body: unknown) => void) => {
    const stream = res as unknown as NodeJS.ReadableStream;
    const chunks: Buffer[] = [];
    stream.on('data', (c: Buffer) => chunks.push(c));
    stream.on('end', () => cb(null, Buffer.concat(chunks)));
  };
  const prints = (office: string) => prisma.cardPrint.count({ where: { registrationStationId: office, kind: 'CARD' } });

  async function issueAtA(vehicleId: string) {
    const a = await as('atA');
    return (await a.post(`/vehicles/${vehicleId}/cards`, { registrationStationId: officeA, deskId: deskA, reason: 'FIRST_ISSUE' }).expect(201)).body;
  }

  it("an employee at office B reprints a card office A issued, and the print is counted at office B's desk", async () => {
    const card = await issueAtA(vehicleIds[0]!);
    const b = await as('atB');
    const [aBefore, bBefore] = [await prints(officeA), await prints(officeB)];

    await b
      .post(`/cards/${card.id}/print`, { mode: 'full', registrationStationId: officeB, deskId: deskB })
      .buffer(true)
      .parse(binary)
      .expect(200);

    expect(await prints(officeB)).toBe(bBefore + 1);
    expect(await prints(officeA)).toBe(aBefore);
    const row = await prisma.cardPrint.findFirst({ where: { cardId: card.id }, orderBy: { printedAt: 'desc' } });
    expect(row).toMatchObject({ registrationStationId: officeB, deskId: deskB, printedById: userIds.atB });

    const audit = await prisma.auditLog.findMany({ where: { entityType: 'VehicleCard', entityId: card.id, action: 'PRINT_CARD' } });
    expect(audit).toHaveLength(1);
    expect(audit[0]!.userId).toBe(userIds.atB);
    expect(audit[0]!.newValue).toMatchObject({ printedAtRegistrationStationId: officeB, printedAtDeskId: deskB });
  }, 60_000);

  it('the card stays office A\'s record; the reprint changes nothing about the card', async () => {
    const [card] = await prisma.vehicleCard.findMany({ where: { vehicleId: vehicleIds[0]! } });
    expect(card).toMatchObject({ registrationStationId: officeA, status: 'ACTIVE' });
  });

  it('an employee cannot print at an office that is not theirs, nor leave the office out for a card of another office', async () => {
    const [card] = await prisma.vehicleCard.findMany({ where: { vehicleId: vehicleIds[0]! } });
    const b = await as('atB');
    // Naming office A (not theirs) is refused, and so is the old behaviour of
    // "the card's own office" when that office is not theirs.
    await b.post(`/cards/${card!.id}/print`, { registrationStationId: officeA, deskId: deskA }).expect(403);
    await b.post(`/cards/${card!.id}/print`, {}).expect(403);
    // A desk of another office is not available.
    expect(
      (await b.post(`/cards/${card!.id}/print`, { registrationStationId: officeB, deskId: deskA }).expect(409)).body.message,
    ).toBe('DESK_NOT_AVAILABLE');
    // Without a desk for another office's card: not available either.
    expect((await b.post(`/cards/${card!.id}/print`, { registrationStationId: officeB }).expect(409)).body.message).toBe(
      'DESK_NOT_AVAILABLE',
    );
  });

  it('an employee at office B issues a NEW card for a vehicle registered at office A: the old one is replaced, the new one is office B\'s', async () => {
    const first = await issueAtA(vehicleIds[1]!);
    const b = await as('atB');
    const res = await b
      .post(`/vehicles/${vehicleIds[1]!}/cards`, {
        registrationStationId: officeB,
        deskId: deskB,
        reason: 'LOST',
        reasonNote: 'فُقدت البطاقة',
      })
      .expect(201);
    expect(res.body).toMatchObject({ status: 'ACTIVE', reason: 'LOST', reasonNote: 'فُقدت البطاقة' });
    expect(res.body.registrationStation.id).toBe(officeB);
    expect(res.body.desk.id).toBe(deskB);
    expect(res.body.issuedBy.id).toBe(userIds.atB);

    const old = await prisma.vehicleCard.findUniqueOrThrow({ where: { id: first.id } });
    expect(old.status).toBe('REPLACED');
    expect(old.activeForVehicleId).toBeNull();
    const actions = await prisma.auditLog.findMany({
      where: { userId: userIds.atB, entityType: 'VehicleCard', entityId: { in: [first.id, res.body.id] } },
    });
    expect(actions.map((a) => a.action).sort()).toEqual(['ISSUE_CARD', 'REPLACE_CARD']);

    // Printing the new card is counted at office B as well.
    const before = await prints(officeB);
    await b.post(`/cards/${res.body.id}/print`, { mode: 'full', registrationStationId: officeB, deskId: deskB }).buffer(true).parse(binary).expect(200);
    expect(await prints(officeB)).toBe(before + 1);
  }, 60_000);

  it('the reason is still required for a new card, and an employee cannot issue at an office that is not theirs', async () => {
    const b = await as('atB');
    await b.post(`/vehicles/${vehicleIds[1]!}/cards`, { registrationStationId: officeB, deskId: deskB }).expect(400);
    await b
      .post(`/vehicles/${vehicleIds[1]!}/cards`, { registrationStationId: officeA, deskId: deskA, reason: 'LOST' })
      .expect(403);
  });

  it('"not printed properly" from office B on a card office A issued: cancelled, and a new card is issued at office B', async () => {
    const card = await issueAtA(vehicleIds[2]!);
    const b = await as('atB');
    const res = await b.post(`/cards/${card.id}/failed-print`, { registrationStationId: officeB, deskId: deskB }).expect(201);
    expect(res.body.registrationStation.id).toBe(officeB);
    expect(res.body.reason).toBe('FAILED_PRINT');
    const old = await prisma.vehicleCard.findUniqueOrThrow({ where: { id: card.id } });
    expect(old).toMatchObject({ status: 'CANCELLED', cancelledById: userIds.atB, cancelReason: 'FAILED_PRINT' });
  }, 60_000);
});
