import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { CARD_NUMBER_REGEX } from '../src/cards/card-number';
import { isExactCardSize, pdfPageSizesMm } from '../src/cards/render/pdf-page-size';
import { createMunicipality, deleteMunicipalities } from './support/municipality-fixtures';

// Registration pivot, phase 3 — the printed vehicle card, end to end:
// issuing (one active card per vehicle, enforced by the database), card
// number format/uniqueness, printing (PDF + audit), the failed-print path,
// cancelling, every scan outcome, and the separation rule (a petrol-station
// role can scan but never issue or print).
describe('Vehicle cards (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const runId = Date.now().toString(36);
  const password = 'BoundaryTest123!';
  const letters = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const muniCode = 'Q' + Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
  const usernames = {
    registrar: `e2e_vc_registrar_${runId}`,
    supervisor: `e2e_vc_supervisor_${runId}`,
    pump: `e2e_vc_pump_${runId}`,
    admin: `e2e_vc_admin_${runId}`,
  };
  const userIds: Record<keyof typeof usernames, string> = { registrar: '', supervisor: '', pump: '', admin: '' };
  const roleIds: string[] = [];

  let municipalityId: string;
  let authorityId: string;
  let stationId: string;
  let otherStationId: string;
  let deskId: string;
  let otherDeskId: string;
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

    municipalityId = (await createMunicipality(prisma, `E2E VC Municipality ${runId}`)).id;
    await prisma.municipality.update({ where: { id: municipalityId }, data: { code: muniCode } });
    authorityId = (
      await prisma.securityAuthority.create({ data: { name: `E2E VC Authority ${runId}`, municipalityId } })
    ).id;
    const station = (label: string) =>
      prisma.registrationStation.create({
        data: { internalCode: `E2E-VC-${label}-${runId}`, name: `E2E VC ${label}`, municipalityId, address: 'E2E' },
      });
    stationId = (await station('IN')).id;
    otherStationId = (await station('OUT')).id;
    deskId = (await prisma.registrationDesk.create({ data: { registrationStationId: stationId, name: 'Desk A' } })).id;
    otherDeskId = (
      await prisma.registrationDesk.create({ data: { registrationStationId: otherStationId, name: 'Desk B' } })
    ).id;

    for (let i = 0; i < 4; i++) {
      const v = await prisma.vehicle.create({
        data: {
          internalCode: `E2E-VC-VEH-${i}-${runId}`,
          currentPlate: `7-${Math.floor(Math.random() * 1e7).toString().padStart(7, '0')}`,
          model: 'تويوتا هايلكس',
          color: 'أبيض',
        },
      });
      vehicleIds.push(v.id);
    }

    const grant = async (roleId: string, keys: string[]) => {
      for (const key of keys) {
        const p = await prisma.permission.upsert({ where: { key }, create: { key }, update: {} });
        await prisma.rolePermission.create({ data: { roleId, permissionId: p.id } });
      }
    };
    const role = async (name: string, kind: 'PETROL_STATION' | 'REGISTRATION' | null, keys: string[], unrestricted = false) => {
      const r = await prisma.role.create({ data: { name: `${name}_${runId}`, kind, unrestrictedStationAccess: unrestricted } });
      roleIds.push(r.id);
      await grant(r.id, keys);
      return r.id;
    };
    // Test-only copies of the catalog roles' card permissions.
    const registrarRole = await role('e2e_vc_registrar', 'REGISTRATION', ['cards:read', 'cards:issue', 'registration_stations:read']);
    const supervisorRole = await role('e2e_vc_supervisor', 'REGISTRATION', ['cards:read', 'cards:issue', 'cards:cancel', 'registration_stations:read']);
    const pumpRole = await role('e2e_vc_pump', 'PETROL_STATION', ['cards:scan', 'fillups:create']);
    const adminRole = await role('e2e_vc_admin', null, ['registration_stations:read', 'registration_stations:manage', 'registration_desks:manage'], true);

    const user = async (key: keyof typeof usernames, roleId: string) => {
      const u = await prisma.user.create({
        data: { username: usernames[key], passwordHash: await argon2.hash(password), fullName: usernames[key] },
      });
      userIds[key] = u.id;
      await prisma.userRole.create({ data: { userId: u.id, roleId } });
    };
    await user('registrar', registrarRole);
    await user('supervisor', supervisorRole);
    await user('pump', pumpRole);
    await user('admin', adminRole);
    for (const key of ['registrar', 'supervisor'] as const) {
      await prisma.userRegistrationStationScope.create({ data: { userId: userIds[key], registrationStationId: stationId } });
    }
  });

  afterAll(async () => {
    const ids = Object.values(userIds);
    await prisma.cardPrint.deleteMany({ where: { registrationStationId: { in: [stationId, otherStationId] } } });
    await prisma.vehicleCard.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.vehicle.deleteMany({ where: { id: { in: vehicleIds } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: ids } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.userRegistrationStationScope.deleteMany({ where: { userId: { in: ids } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await prisma.registrationDesk.deleteMany({ where: { registrationStationId: { in: [stationId, otherStationId] } } });
    await prisma.registrationStation.deleteMany({ where: { id: { in: [stationId, otherStationId] } } });
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
  // Collects a binary (PDF) response body — superagent's parser hands us
  // the raw response stream.
  const binary = (res: request.Response, cb: (err: Error | null, body: unknown) => void) => {
    const stream = res as unknown as NodeJS.ReadableStream;
    const chunks: Buffer[] = [];
    stream.on('data', (c: Buffer) => chunks.push(c));
    stream.on('end', () => cb(null, Buffer.concat(chunks)));
  };
  const pageCount = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
  const issueBody = (reason = 'FIRST_ISSUE', desk = deskId, station = stationId) => ({
    registrationStationId: station,
    deskId: desk,
    reason,
  });
  const audits = (entityId: string) => prisma.auditLog.findMany({ where: { entityType: 'VehicleCard', entityId } });

  let firstCard: { id: string; cardNumber: string };
  let replacementCard: { id: string; cardNumber: string };

  // ── Desks ──────────────────────────────────────────────────────────

  it("lets admins add desks and registration staff list only their own station's", async () => {
    const admin = await as('admin');
    const created = await admin
      .post(`/registration-stations/${stationId}/desks`, { name: 'Desk C', printerModel: 'Evolis Primacy 2' })
      .expect(201);
    expect(created.body.printerModel).toBe('Evolis Primacy 2');
    await admin.post(`/registration-stations/${stationId}/desks`, { name: 'Desk C' }).expect(409);

    const registrar = await as('registrar');
    const own = await registrar.get(`/registration-stations/${stationId}/desks`).expect(200);
    expect(own.body.map((d: { name: string }) => d.name)).toEqual(expect.arrayContaining(['Desk A', 'Desk C']));
    await registrar.get(`/registration-stations/${otherStationId}/desks`).expect(403);
    await registrar.post(`/registration-stations/${stationId}/desks`, { name: 'Nope' }).expect(403);
  });

  // ── Issuing ────────────────────────────────────────────────────────

  it('issues a first card: random <code>-XXXXXXXX number, a snapshot of what is printed, and an audit row', async () => {
    const registrar = await as('registrar');
    const res = await registrar.post(`/vehicles/${vehicleIds[0]!}/cards`, issueBody()).expect(201);
    firstCard = res.body;
    expect(res.body.cardNumber).toMatch(CARD_NUMBER_REGEX);
    expect(res.body.cardNumber.startsWith(`${muniCode}-`)).toBe(true);
    expect(res.body.status).toBe('ACTIVE');
    expect(res.body.reason).toBe('FIRST_ISSUE');
    expect(res.body.printedVehicleLine).toBe('تويوتا هايلكس — أبيض');
    expect(res.body.printedOfficeName).toBe(`E2E VC Authority ${runId}`);
    expect(res.body.printedStationCode).toBe(`E2E-VC-IN-${runId}`);
    expect(res.body.printedIssueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(res.body.registrationStation.id).toBe(stationId);
    expect(res.body.desk.id).toBe(deskId);
    expect(res.body.issuedBy.id).toBe(userIds.registrar);
    expect(res.body.needsReissue).toBe(false);
    expect((await audits(firstCard.id)).map((a) => a.action)).toEqual(['ISSUE_CARD']);
  });

  it('refuses a second FIRST_ISSUE, a replacement with nothing to replace, an out-of-scope station and a desk of another station', async () => {
    const registrar = await as('registrar');
    expect((await registrar.post(`/vehicles/${vehicleIds[0]!}/cards`, issueBody()).expect(409)).body.message).toBe(
      'FIRST_ISSUE_NOT_ALLOWED',
    );
    expect((await registrar.post(`/vehicles/${vehicleIds[1]!}/cards`, issueBody('LOST')).expect(409)).body.message).toBe(
      'NO_CARD_TO_REPLACE',
    );
    await registrar.post(`/vehicles/${vehicleIds[1]!}/cards`, issueBody('FIRST_ISSUE', otherDeskId, otherStationId)).expect(403);
    expect(
      (await registrar.post(`/vehicles/${vehicleIds[1]!}/cards`, issueBody('FIRST_ISSUE', otherDeskId)).expect(409)).body
        .message,
    ).toBe('DESK_NOT_AVAILABLE');
    // FAILED_PRINT only ever comes from the failed-print path.
    await registrar.post(`/vehicles/${vehicleIds[1]!}/cards`, issueBody('FAILED_PRINT')).expect(400);
  });

  it('a replacement marks the old card REPLACED in the same step — exactly one active card per vehicle', async () => {
    const registrar = await as('registrar');
    const res = await registrar
      .post(`/vehicles/${vehicleIds[0]!}/cards`, { ...issueBody('LOST'), reasonNote: 'فُقدت في السوق' })
      .expect(201);
    replacementCard = res.body;
    expect(res.body.cardNumber).not.toBe(firstCard.cardNumber);
    const cards = await prisma.vehicleCard.findMany({ where: { vehicleId: vehicleIds[0]! } });
    expect(cards.filter((c) => c.status === 'ACTIVE').map((c) => c.id)).toEqual([replacementCard.id]);
    expect(cards.find((c) => c.id === firstCard.id)?.status).toBe('REPLACED');
    expect((await audits(firstCard.id)).map((a) => a.action).sort()).toEqual(['ISSUE_CARD', 'REPLACE_CARD']);
  });

  it('the database itself refuses a second active card and a duplicate card number', async () => {
    const base = {
      vehicleId: vehicleIds[0]!,
      registrationStationId: stationId,
      deskId,
      issuedById: userIds.registrar,
      reason: 'LOST' as const,
      printedPlate: 'x',
      printedVehicleLine: 'x',
      printedOfficeName: 'x',
      printedIssueDate: '2026-01-01',
      printedStationCode: 'x',
    };
    // A second ACTIVE card for the same vehicle — unique activeForVehicleId.
    await expect(
      prisma.vehicleCard.create({
        data: { ...base, cardNumber: `${muniCode}-ZZZZZZZ2`, status: 'ACTIVE', activeForVehicleId: vehicleIds[0]! },
      }),
    ).rejects.toThrow();
    // ACTIVE without the marker — the CHECK constraint.
    await expect(
      prisma.vehicleCard.create({ data: { ...base, cardNumber: `${muniCode}-ZZZZZZZ3`, status: 'ACTIVE', activeForVehicleId: null } }),
    ).rejects.toThrow();
    // Same card number twice.
    await expect(
      prisma.vehicleCard.create({ data: { ...base, cardNumber: replacementCard.cardNumber, status: 'REPLACED' } }),
    ).rejects.toThrow();
  });

  it('card numbers stay unique and well-formed across many issues', async () => {
    const registrar = await as('registrar');
    const seen = new Set<string>([firstCard.cardNumber, replacementCard.cardNumber]);
    let current = (await registrar.post(`/vehicles/${vehicleIds[1]!}/cards`, issueBody()).expect(201)).body;
    seen.add(current.cardNumber);
    for (let i = 0; i < 12; i++) {
      current = (await registrar.post(`/vehicles/${vehicleIds[1]!}/cards`, issueBody('DAMAGED')).expect(201)).body;
      expect(current.cardNumber).toMatch(CARD_NUMBER_REGEX);
      seen.add(current.cardNumber);
    }
    expect(seen.size).toBe(15);
    expect(await prisma.vehicleCard.count({ where: { vehicleId: vehicleIds[1]!, status: 'ACTIVE' } })).toBe(1);
  });

  // ── Printing ───────────────────────────────────────────────────────

  it('prints the card as a PDF (full and black-only) and audits every print', async () => {
    const registrar = await as('registrar');
    const full = await registrar.post(`/cards/${replacementCard.id}/print`, { mode: 'full' }).buffer(true).parse(binary).expect(200);
    expect(full.headers['content-type']).toBe('application/pdf');
    expect((full.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    expect(pageCount(full.body as Buffer)).toBe(2);
    // Card printers need the page to be the card: 53.98 x 85.60 mm to 0.01 mm.
    const fullSizes = await pdfPageSizesMm(full.body as Buffer);
    expect(fullSizes).toHaveLength(2);
    for (const size of fullSizes) expect(isExactCardSize(size, 0.01)).toBe(true);

    const black = await registrar.post(`/cards/${replacementCard.id}/print`, { mode: 'black' }).buffer(true).parse(binary).expect(200);
    expect(pageCount(black.body as Buffer)).toBe(1);
    for (const size of await pdfPageSizesMm(black.body as Buffer)) expect(isExactCardSize(size, 0.01)).toBe(true);

    const prints = (await audits(replacementCard.id)).filter((a) => a.action === 'PRINT_CARD');
    expect(prints.map((a) => (a.newValue as { mode: string }).mode).sort()).toEqual(['black', 'full']);

    // Each print uses up a blank card, so each is recorded for the stock reconciliation.
    const recorded = await prisma.cardPrint.findMany({ where: { cardId: replacementCard.id } });
    expect(recorded).toHaveLength(2);
    for (const row of recorded) {
      expect(row).toMatchObject({ kind: 'CARD', registrationStationId: stationId, deskId, printedById: userIds.registrar });
    }
  });

  it('a replaced card can no longer be printed', async () => {
    const registrar = await as('registrar');
    expect((await registrar.post(`/cards/${firstCard.id}/print`).expect(409)).body.message).toBe('CARD_NOT_ACTIVE');
  });

  it('separation: a petrol-station role can neither issue nor print a card', async () => {
    const pump = await as('pump');
    await pump.post(`/vehicles/${vehicleIds[2]!}/cards`, issueBody()).expect(403);
    await pump.post(`/cards/${replacementCard.id}/print`).expect(403);
    await pump.post(`/cards/${replacementCard.id}/failed-print`).expect(403);
    await pump.get(`/cards/test-card?registrationStationId=${stationId}`).expect(403);
    expect(await prisma.vehicleCard.count({ where: { vehicleId: vehicleIds[2]! } })).toBe(0);
  });

  it('serves a test card for desk setup', async () => {
    const registrar = await as('registrar');
    const before = await prisma.cardPrint.count({ where: { registrationStationId: stationId, kind: 'TEST' } });
    const res = await registrar
      .get(`/cards/test-card?registrationStationId=${stationId}&deskId=${deskId}`)
      .buffer(true)
      .parse(binary)
      .expect(200);
    expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    for (const size of await pdfPageSizesMm(res.body as Buffer)) expect(isExactCardSize(size, 0.01)).toBe(true);

    // A test card uses up a blank too: recorded against the desk, with its audit row.
    const rows = await prisma.cardPrint.findMany({ where: { registrationStationId: stationId, kind: 'TEST' } });
    expect(rows).toHaveLength(before + 1);
    expect(rows.at(-1)).toMatchObject({ deskId, cardId: null, printedById: userIds.registrar });
    expect(await prisma.auditLog.count({ where: { action: 'PRINT_TEST_CARD', entityId: deskId } })).toBeGreaterThanOrEqual(1);

    // A desk is required, it must be at this station, and the station must be in scope.
    await registrar.get(`/cards/test-card?registrationStationId=${stationId}`).expect(400);
    await registrar.get(`/cards/test-card?registrationStationId=${stationId}&deskId=not-a-desk`).expect(404);
    await registrar.get(`/cards/test-card?registrationStationId=${otherStationId}&deskId=${deskId}`).expect(403);
    expect(await prisma.cardPrint.count({ where: { registrationStationId: stationId, kind: 'TEST' } })).toBe(before + 1);
  });

  // ── Failed print ───────────────────────────────────────────────────

  it('failed print: the misprinted card is cancelled on the spot and a new number is issued', async () => {
    const registrar = await as('registrar');
    const first = (await registrar.post(`/vehicles/${vehicleIds[2]!}/cards`, issueBody()).expect(201)).body;
    const res = await registrar.post(`/cards/${first.id}/failed-print`).expect(201);
    expect(res.body.cardNumber).not.toBe(first.cardNumber);
    expect(res.body.reason).toBe('FAILED_PRINT');
    expect(res.body.status).toBe('ACTIVE');
    expect(res.body.desk.id).toBe(deskId);
    const old = await prisma.vehicleCard.findUniqueOrThrow({ where: { id: first.id } });
    expect(old.status).toBe('CANCELLED');
    expect(old.cancelReason).toBe('FAILED_PRINT');
    expect(old.cancelledById).toBe(userIds.registrar);
    expect((await audits(first.id)).map((a) => a.action).sort()).toEqual(['CANCEL_CARD', 'ISSUE_CARD']);
    expect((await audits(res.body.id)).map((a) => a.action)).toEqual(['ISSUE_CARD']);
    // The misprinted card is dead at the pump.
    const pump = await as('pump');
    expect((await pump.get(`/cards/scan/${first.cardNumber}`).expect(409)).body.message).toBe('CARD_REVOKED');
  });

  it('every blank-consuming print is counted: a card print, a reprint, the failed-print path and a test card', async () => {
    const registrar = await as('registrar');
    const count = async (kind: 'CARD' | 'TEST') => prisma.cardPrint.count({ where: { registrationStationId: stationId, kind } });
    const [cardBefore, testBefore] = [await count('CARD'), await count('TEST')];

    const card = (await registrar.post(`/vehicles/${vehicleIds[3] ?? vehicleIds[2]!}/cards`, issueBody()).expect(201)).body;
    // Issuing alone prints nothing: the blank is used when the card is printed.
    expect(await count('CARD')).toBe(cardBefore);

    await registrar.post(`/cards/${card.id}/print`, { mode: 'full' }).buffer(true).parse(binary).expect(200); // the first print
    await registrar.post(`/cards/${card.id}/print`, { mode: 'full' }).buffer(true).parse(binary).expect(200); // a reprint
    const replacement = (await registrar.post(`/cards/${card.id}/failed-print`).expect(201)).body; // "not printed properly"
    // The failed print itself consumed no further blank; its replacement does, when printed.
    expect(await count('CARD')).toBe(cardBefore + 2);
    await registrar.post(`/cards/${replacement.id}/print`, { mode: 'full' }).buffer(true).parse(binary).expect(200);
    await registrar.get(`/cards/test-card?registrationStationId=${stationId}&deskId=${deskId}`).buffer(true).parse(binary).expect(200);

    expect(await count('CARD')).toBe(cardBefore + 3);
    expect(await count('TEST')).toBe(testBefore + 1);
    // Total blanks the system recorded as used by this office, in this test: 4.
    const rows = await prisma.cardPrint.findMany({ where: { OR: [{ cardId: card.id }, { cardId: replacement.id }, { kind: 'TEST', registrationStationId: stationId }] } });
    expect(rows.filter((r) => r.cardId === card.id || r.cardId === replacement.id)).toHaveLength(3);
  }, 120_000);

  // ── Scanning ───────────────────────────────────────────────────────

  describe('scan outcomes (cards:scan, never audited)', () => {
    it('active card → the vehicle', async () => {
      const pump = await as('pump');
      const res = await pump.get(`/cards/scan/${replacementCard.cardNumber.toLowerCase()}`).expect(200);
      expect(res.body.vehicle.id).toBe(vehicleIds[0]!);
      expect(res.body.needsReissue).toBe(false);
      expect(res.body.vehicle.model).toBe('تويوتا هايلكس');
    });

    it("active but the vehicle's printed details changed → the vehicle, flagged needsReissue", async () => {
      await prisma.vehicle.update({ where: { id: vehicleIds[0]! }, data: { color: 'أسود' } });
      const pump = await as('pump');
      const res = await pump.get(`/cards/scan/${replacementCard.cardNumber}`).expect(200);
      expect(res.body.vehicle.id).toBe(vehicleIds[0]!);
      expect(res.body.needsReissue).toBe(true);
      // The registration side sees the same flag on the vehicle's card list.
      const registrar = await as('registrar');
      const list = await registrar.get(`/vehicles/${vehicleIds[0]!}/cards`).expect(200);
      expect(list.body[0].needsReissue).toBe(true);
    });

    it('replaced card → refused', async () => {
      const pump = await as('pump');
      const res = await pump.get(`/cards/scan/${firstCard.cardNumber}`).expect(409);
      expect(res.body.message).toBe('CARD_REVOKED');
      expect(res.body.details).toEqual({ status: 'REPLACED' });
    });

    it('unknown code, and the old internalCode QR codes → not a card from this system', async () => {
      const pump = await as('pump');
      expect((await pump.get(`/cards/scan/${muniCode}-22222222`).expect(404)).body.message).toBe('CARD_NOT_FOUND');
      const vehicle = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleIds[0]! } });
      expect((await pump.get(`/cards/scan/${vehicle.internalCode}`).expect(404)).body.message).toBe('CARD_NOT_FOUND');
      expect((await pump.get('/cards/scan/V-000123').expect(404)).body.message).toBe('CARD_NOT_FOUND');
    });

    it('scanning writes no audit row, and registration roles cannot use the scan lookup', async () => {
      // (The pump user's only audit rows are its own LOGINs.)
      expect(await prisma.auditLog.count({ where: { userId: userIds.pump, entityType: 'VehicleCard' } })).toBe(0);
      const registrar = await as('registrar');
      await registrar.get(`/cards/scan/${replacementCard.cardNumber}`).expect(403);
    });
  });

  // ── Cancelling without a replacement ───────────────────────────────

  it('only cards:cancel holders cancel a card outright; it then scans as revoked', async () => {
    const registrar = await as('registrar');
    await registrar.post(`/cards/${replacementCard.id}/cancel`, { reason: 'بلاغ سرقة المركبة' }).expect(403);

    const supervisor = await as('supervisor');
    const res = await supervisor.post(`/cards/${replacementCard.id}/cancel`, { reason: 'بلاغ سرقة المركبة' }).expect(200);
    expect(res.body.status).toBe('CANCELLED');
    expect(res.body.cancelledBy.id).toBe(userIds.supervisor);
    expect(await prisma.vehicleCard.count({ where: { vehicleId: vehicleIds[0]!, status: 'ACTIVE' } })).toBe(0);
    expect((await audits(replacementCard.id)).some((a) => a.action === 'CANCEL_CARD')).toBe(true);

    const pump = await as('pump');
    const scan = await pump.get(`/cards/scan/${replacementCard.cardNumber}`).expect(409);
    expect(scan.body.details).toEqual({ status: 'CANCELLED' });

    // With no active card left, a replacement is still possible (history exists).
    await registrar.post(`/vehicles/${vehicleIds[0]!}/cards`, issueBody('DETAILS_CHANGED')).expect(201);
  });
});
