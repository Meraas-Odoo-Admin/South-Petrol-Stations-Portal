import { PrismaClient } from '@prisma/client';

// Phase 6: a fill-up is recorded from a CARD SCAN. The only other way in is the
// emergency override, which the specs that test it send explicitly.
//
// Most e2e specs, however, are about rules, scope, idempotency, exceptions or
// reports, not about how the vehicle was identified: they name the vehicle by
// `vehicleId`. Importing this file makes those requests card scans without
// touching every body: just before a request to POST /fillups or
// GET /fillups/rule-preview is sent, a `vehicleId` (with no cardNumber and no
// override) is swapped for the number of a card issued to that vehicle, and a
// card made only for this request is removed once the response is back.
// A spec that wants the refusal itself sends `emergencyOverride`, a plate, or a
// vehicleId of a vehicle that does not exist, none of which are rewritten.
//
// `_freshCard: true` in a body stands for "a vehicle nobody has filled up
// before": a new vehicle with its own card is made for the request and removed
// with the rest at the end of the spec file.
//
// The rows this needs (an office, a desk, an issuer) are created on first use
// and removed after the spec file's last test.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Test = require('supertest/lib/test') as { prototype: Record<string, unknown> };

const prisma = new PrismaClient();
let fixture: { municipalityId: string; officeId: string; deskId: string; userId: string } | null = null;
const tag = `shim${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
const freshVehicleIds: string[] = [];

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
function randomCardNumber(): string {
  return `ZZ-${Array.from({ length: 8 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('')}`;
}

async function ensureFixture() {
  if (fixture) return fixture;
  const municipality = await prisma.municipality.create({ data: { name: `e2e card shim ${tag}`, status: 'LIVE' }, select: { id: true } });
  const office = await prisma.registrationStation.create({
    data: { internalCode: `RS-${tag}`, name: `e2e card shim office ${tag}`, municipalityId: municipality.id, address: 'e2e' },
    select: { id: true },
  });
  const desk = await prisma.registrationDesk.create({ data: { registrationStationId: office.id, name: 'shim' }, select: { id: true } });
  const user = await prisma.user.create({
    data: { username: `e2e_card_shim_${tag}`, passwordHash: 'x', fullName: 'e2e card shim' },
    select: { id: true },
  });
  fixture = { municipalityId: municipality.id, officeId: office.id, deskId: desk.id, userId: user.id };
  return fixture;
}

async function issueCard(vehicleId: string, plate: string): Promise<{ id: string; cardNumber: string }> {
  const f = await ensureFixture();
  const cardNumber = randomCardNumber();
  const card = await prisma.vehicleCard.create({
    data: {
      cardNumber,
      vehicleId,
      registrationStationId: f.officeId,
      deskId: f.deskId,
      issuedById: f.userId,
      reason: 'FIRST_ISSUE',
      status: 'ACTIVE',
      activeForVehicleId: vehicleId,
      printedPlate: plate,
      printedVehicleLine: 'e2e',
      printedOfficeName: 'e2e',
      printedIssueDate: '2026-01-01',
      printedStationCode: 'ZZ',
    },
    select: { id: true },
  });
  return { id: card.id, cardNumber };
}

// The number of an ACTIVE card for the vehicle, and a cleanup for it. Returns
// null when the vehicle does not exist.
async function cardFor(vehicleId: string): Promise<{ cardNumber: string; remove: () => Promise<void> } | null> {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { id: true, currentPlate: true } });
  if (!vehicle) return null;
  const existing = await prisma.vehicleCard.findFirst({ where: { vehicleId, status: 'ACTIVE' }, select: { cardNumber: true } });
  if (existing) return { cardNumber: existing.cardNumber, remove: async () => undefined };
  const card = await issueCard(vehicleId, vehicle.currentPlate);
  return {
    cardNumber: card.cardNumber,
    remove: async () => void (await prisma.vehicleCard.delete({ where: { id: card.id } }).catch(() => undefined)),
  };
}

async function freshCardNumber(): Promise<string> {
  const n = `${tag}${freshVehicleIds.length}${Math.random().toString(36).slice(2, 6)}`;
  const plate = `7-${Math.floor(Math.random() * 9e6 + 1e6)}${freshVehicleIds.length}`;
  const vehicle = await prisma.vehicle.create({
    data: { internalCode: `E2E-SHIM-${n}`, currentPlate: plate },
    select: { id: true },
  });
  freshVehicleIds.push(vehicle.id);
  return (await issueCard(vehicle.id, plate)).cardNumber;
}

type Req = {
  method: string;
  url: string;
  _data?: Record<string, unknown>;
  qs?: Record<string, unknown>;
};

function isFillUpPath(url: string): boolean {
  const path = url.split('?')[0] ?? '';
  return /\/fillups(\/rule-preview)?$/.test(path);
}

const originalEnd = Test.prototype.end as (this: unknown, fn?: (err: unknown, res: unknown) => void) => unknown;
Test.prototype.end = function patchedEnd(this: Req, fn?: (err: unknown, res: unknown) => void) {
  // eslint-disable-next-line @typescript-eslint/no-this-alias
  const self = this;
  if (!isFillUpPath(self.url ?? '')) return originalEnd.call(self, fn);
  const isGet = self.method?.toUpperCase() === 'GET';
  // A query written into the URL itself (`?vehicleId=...`) is moved to the query object.
  if (isGet && self.url.includes('?')) {
    const [path, search] = self.url.split('?') as [string, string];
    const parsed = Object.fromEntries(new URLSearchParams(search));
    self.qs = { ...parsed, ...(self.qs ?? {}) };
    self.url = path;
  }
  const carrier = isGet ? self.qs : self._data;
  if (carrier && carrier._freshCard === true) {
    delete carrier._freshCard;
    freshCardNumber()
      .then((cardNumber) => {
        carrier.cardNumber = cardNumber;
      })
      .then(
        () => originalEnd.call(self, fn),
        (e: unknown) => fn?.(e, undefined),
      );
    return self;
  }
  if (!carrier || typeof carrier.vehicleId !== 'string' || carrier.cardNumber || carrier.emergencyOverride || carrier.plate) {
    return originalEnd.call(self, fn);
  }
  const vehicleId = carrier.vehicleId;
  let remove: (() => Promise<void>) | null = null;
  cardFor(vehicleId)
    .then((card) => {
      if (card) {
        delete carrier.vehicleId;
        carrier.cardNumber = card.cardNumber;
        remove = card.remove;
      }
    })
    .catch(() => undefined)
    .then(() => {
      originalEnd.call(self, (err: unknown, res: unknown) => {
        const done = () => fn?.(err, res);
        if (remove) void remove().then(done, done);
        else done();
      });
    });
  return self;
};

afterAll(async () => {
  if (fixture) {
    const f = fixture;
    if (freshVehicleIds.length > 0) {
      await prisma.exception.deleteMany({ where: { fillUpTransaction: { vehicleId: { in: freshVehicleIds } } } }).catch(() => undefined);
      await prisma.fillUpTransaction.deleteMany({ where: { vehicleId: { in: freshVehicleIds } } }).catch(() => undefined);
    }
    await prisma.vehicleCard.deleteMany({ where: { issuedById: f.userId } }).catch(() => undefined);
    if (freshVehicleIds.length > 0) {
      await prisma.vehiclePlateHistory.deleteMany({ where: { vehicleId: { in: freshVehicleIds } } }).catch(() => undefined);
      await prisma.vehicle.deleteMany({ where: { id: { in: freshVehicleIds } } }).catch(() => undefined);
    }
    await prisma.registrationDesk.deleteMany({ where: { registrationStationId: f.officeId } }).catch(() => undefined);
    await prisma.registrationStation.deleteMany({ where: { id: f.officeId } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: f.userId } }).catch(() => undefined);
    await prisma.securityAuthority.deleteMany({ where: { municipalityId: f.municipalityId } }).catch(() => undefined);
    await prisma.municipality.deleteMany({ where: { id: f.municipalityId } }).catch(() => undefined);
    fixture = null;
  }
  await prisma.$disconnect();
});
