// Dev only: SYNTHETIC activity, so the phase 4c reports have something to show.
//
//   pnpm seed:dev-activity              generate about three weeks of activity
//   pnpm seed:dev-activity --scale 10   ten times the volume (for measuring query speed)
//   pnpm seed:dev-activity --reset      remove everything this script generated
//
// What it makes, all clearly synthetic:
//  - two extra registration offices (SYN-REG-2, SYN-REG-3) beside the seeded one,
//    with desks, and synthetic employees at all three offices (usernames syn_*,
//    who cannot log in);
//  - vehicles registered, cards issued, reprints, failed prints, test-card prints,
//    duplicates caught and corrections requested, day by day;
//  - blank-card stock entries, with ONE DELIBERATE SHORTFALL at the seeded office
//    (15 cards fewer than the prints explain), so the unaccounted-cards signal shows;
//  - fill-ups at Sabha stations, with and without a card scan, cardless ones
//    falling as cards are issued.
//
// Everything is marked: usernames syn_*, vehicle codes SYN-*, office codes SYN-REG-*,
// fill-up keys syn-*, and stock-entry notes starting "[synthetic]". Phase 5 removes
// it with the rest of the test data; --reset removes it now.
//
// It REFUSES to run when NODE_ENV is production or the database is not on this
// machine, exactly like reset:test-users.
import { PrismaClient, Prisma } from '@prisma/client';
import { devScriptRefusal } from '../src/common/utils/local-database';
import { tripoliDay } from '../src/common/utils/grace-stage';
import { addDays, tripoliMidnight } from '../src/common/utils/tripoli';

const SYN = '[synthetic]';
const DAYS = 21;

function parseArgs() {
  const args = process.argv.slice(2);
  const scaleIndex = args.indexOf('--scale');
  return { reset: args.includes('--reset'), scale: scaleIndex >= 0 ? Math.max(1, Number(args[scaleIndex + 1]) || 1) : 1 };
}

// A small seeded random generator, so every run produces the same data.
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function resetSynthetic(prisma: PrismaClient) {
  const users = await prisma.user.findMany({ where: { username: { startsWith: 'syn_' } }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  const offices = await prisma.registrationStation.findMany({ where: { internalCode: { startsWith: 'SYN-REG-' } }, select: { id: true } });
  const officeIds = offices.map((o) => o.id);
  const vehicles = await prisma.vehicle.findMany({ where: { internalCode: { startsWith: 'SYN-' } }, select: { id: true } });
  const vehicleIds = vehicles.map((v) => v.id);

  await prisma.fillUpTransaction.deleteMany({ where: { idempotencyKey: { startsWith: 'syn-' } } });
  await prisma.cardPrint.deleteMany({ where: { OR: [{ printedById: { in: userIds } }, { registrationStationId: { in: officeIds } }] } });
  await prisma.vehicleChangeRequest.deleteMany({ where: { OR: [{ requestedById: { in: userIds } }, { vehicleId: { in: vehicleIds } }] } });
  await prisma.vehicleCard.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
  await prisma.vehicle.deleteMany({ where: { id: { in: vehicleIds } } });
  await prisma.duplicateCatch.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { registrationStationId: { in: officeIds } }] } });
  // Stock entries are insert-only (a database trigger). This dev-only reset lifts
  // the guard for the synthetic rows alone, then puts it back.
  await prisma.$executeRawUnsafe('ALTER TABLE "StockEntry" DISABLE TRIGGER "stock_entry_no_update_delete"');
  try {
    const where: Prisma.StockEntryWhereInput = {
      OR: [{ registrationStationId: { in: officeIds } }, { reason: { startsWith: SYN } }, { createdById: { in: userIds } }],
    };
    await prisma.stockEntry.deleteMany({ where: { AND: [where, { correctsEntryId: { not: null } }] } });
    await prisma.stockEntry.deleteMany({ where });
  } finally {
    await prisma.$executeRawUnsafe('ALTER TABLE "StockEntry" ENABLE TRIGGER "stock_entry_no_update_delete"');
  }
  await prisma.auditLog.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { entityId: { startsWith: 'syn_' } }] } });
  await prisma.userRegistrationStationScope.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.registrationDesk.deleteMany({ where: { registrationStationId: { in: officeIds } } });
  await prisma.registrationStation.deleteMany({ where: { id: { in: officeIds } } });
  console.log(`Removed synthetic activity: ${userIds.length} users, ${officeIds.length} offices, ${vehicleIds.length} vehicles.`);
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const refusal = devScriptRefusal(process.env);
    if (refusal) {
      console.error(`Refusing to generate synthetic activity: ${refusal}`);
      process.exitCode = 1;
      return;
    }
    const { reset, scale } = parseArgs();
    if (reset) return await resetSynthetic(prisma);

    if (await prisma.user.findFirst({ where: { username: { startsWith: 'syn_' } } })) {
      console.log('Synthetic activity is already there. Run with --reset first to regenerate it.');
      return;
    }

    const random = rng(20261011);
    const between = (lo: number, hi: number) => lo + Math.floor(random() * (hi - lo + 1));
    const pick = <T>(list: T[]): T => list[Math.floor(random() * list.length)]!;

    // ── What the data hangs off ─────────────────────────────────────────
    const municipality =
      (await prisma.municipality.findFirst({ where: { name: 'سبها', status: 'LIVE' } })) ?? (await prisma.municipality.findFirst({ where: { status: 'LIVE' } }));
    if (!municipality) throw new Error('No live municipality: run the seed first.');
    const roles = await prisma.role.findMany({ where: { name: { in: ['registration_employee', 'registration_supervisor'] } } });
    const employeeRole = roles.find((r) => r.name === 'registration_employee');
    const supervisorRole = roles.find((r) => r.name === 'registration_supervisor');
    if (!employeeRole || !supervisorRole) throw new Error('Registration roles are missing: run the seed first.');

    const seededOffice =
      (await prisma.registrationStation.findUnique({ where: { internalCode: 'REG-TEST-0001' } })) ??
      (await prisma.registrationStation.findFirst({ where: { municipalityId: municipality.id, internalCode: { not: { startsWith: 'SYN-' } } } }));
    if (!seededOffice) throw new Error('No registration office: run the seed first.');
    const seededSupervisor = await prisma.user.findUnique({ where: { username: 'regsupervisor1' } });

    const mkOffice = (n: number) =>
      prisma.registrationStation.create({
        data: {
          internalCode: `SYN-REG-${n}`,
          name: `مكتب تسجيل تجريبي ${n} — بيانات اصطناعية`,
          municipalityId: municipality.id,
          address: 'عنوان اصطناعي للتجربة',
          workingHours: 'السبت–الخميس 8:00–14:00',
        },
      });
    const office2 = await mkOffice(2);
    const office3 = await mkOffice(3);
    const offices = [seededOffice, office2, office3];
    const volume = [14, 9, 5];

    const desks: string[] = [];
    for (const office of offices) {
      const existing = await prisma.registrationDesk.findFirst({ where: { registrationStationId: office.id, isActive: true } });
      desks.push(existing?.id ?? (await prisma.registrationDesk.create({ data: { registrationStationId: office.id, name: 'مكتب ١', printerModel: 'طابعة اصطناعية' } })).id);
    }

    // Synthetic employees (they cannot log in: no usable password).
    const hash = '$argon2id$v=19$m=65536,t=3,p=4$c3ludGhldGlj$c3ludGhldGljc3ludGhldGljc3ludGhldGlj';
    const staff: Array<{ id: string; office: number }[]> = [[], [], []];
    const supervisors: Array<string | null> = [seededSupervisor?.id ?? null, null, null];
    for (let o = 0; o < 3; o++) {
      for (const [i, name] of ['أ', 'ب', 'ج'].entries()) {
        const deactivated = o === 2 && i === 2;
        const user = await prisma.user.create({
          data: {
            username: `syn_reg_o${o + 1}_${'abc'[i]}`,
            passwordHash: hash,
            fullName: `موظف تسجيل اصطناعي ${o + 1}-${name}`,
            isActive: !deactivated,
            lastLoginAt: deactivated ? null : new Date(Date.now() - between(1, 9) * 86_400_000),
          },
        });
        await prisma.userRole.create({ data: { userId: user.id, roleId: employeeRole.id } });
        await prisma.userRegistrationStationScope.create({ data: { userId: user.id, registrationStationId: offices[o]!.id } });
        staff[o]!.push({ id: user.id, office: o });
      }
      if (o > 0) {
        const sup = await prisma.user.create({
          data: {
            username: `syn_reg_o${o + 1}_sup`,
            passwordHash: hash,
            fullName: `مشرف تسجيل اصطناعي ${o + 1}`,
            lastLoginAt: new Date(Date.now() - between(0, 3) * 86_400_000),
          },
        });
        await prisma.userRole.create({ data: { userId: sup.id, roleId: supervisorRole.id } });
        await prisma.userRegistrationStationScope.create({ data: { userId: sup.id, registrationStationId: offices[o]!.id } });
        supervisors[o] = sup.id;
      }
    }

    const today = tripoliDay(new Date());
    const days = Array.from({ length: DAYS }, (_, i) => addDays(today, -(DAYS - 1 - i)));
    const at = (day: string, hour: number, minute = 0) => new Date(tripoliMidnight(day).getTime() + (hour * 60 + minute) * 60_000);
    const now = Date.now();

    // ── Registration activity, day by day ───────────────────────────────
    let vehicleN = 0;
    let cardN = 0;
    const vehicles: Prisma.VehicleCreateManyInput[] = [];
    const cards: Prisma.VehicleCardCreateManyInput[] = [];
    const prints: Prisma.CardPrintCreateManyInput[] = [];
    const audits: Prisma.AuditLogCreateManyInput[] = [];
    const duplicates: Prisma.DuplicateCatchCreateManyInput[] = [];
    const changes: Prisma.VehicleChangeRequestCreateManyInput[] = [];
    const cardedVehicles: Array<{ id: string; plate: string; cardAt: number }> = [];
    const uncardedVehicles: Array<{ id: string; plate: string }> = [];

    for (const [dayIndex, day] of days.entries()) {
      for (let o = 0; o < 3; o++) {
        const office = offices[o]!;
        const count = Math.max(1, Math.round(volume[o]! * scale * (0.6 + random() * 0.8) * (0.7 + (dayIndex / DAYS) * 0.6)));
        for (let k = 0; k < count; k++) {
          vehicleN += 1;
          const employee = pick(staff[o]!.filter((_, idx) => !(o === 2 && idx === 2)));
          const when = at(day, between(8, 13), between(0, 59));
          if (when.getTime() > now) continue;
          const id = `syn_v_${vehicleN}`;
          const plate = `${between(1, 9)}-${String(8_000_000 + vehicleN).padStart(7, '0')}`;
          vehicles.push({
            id,
            internalCode: `SYN-V-${vehicleN}`,
            currentPlate: plate,
            normalizedPlate: plate,
            model: pick(['تويوتا هايلكس', 'هيونداي النترا', 'كيا سيراتو', 'نيسان صني']),
            color: pick(['أبيض', 'فضي', 'أسود']),
            registeredAtRegistrationStationId: office.id,
            registeredById: employee.id,
            createdAt: when,
          });
          audits.push({ userId: employee.id, action: 'CREATE', entityType: 'Vehicle', entityId: id, newValue: { plate }, createdAt: when });

          // About one in ten registered vehicles has not been issued a card yet.
          if (random() < 0.1) {
            uncardedVehicles.push({ id, plate });
            continue;
          }
          const failed = random() < 0.04;
          const issueAt = new Date(when.getTime() + between(4, 25) * 60_000);
          const deskId = desks[o]!;
          const issue = (reason: 'FIRST_ISSUE' | 'FAILED_PRINT', status: 'ACTIVE' | 'CANCELLED', atTime: Date) => {
            cardN += 1;
            const cardId = `syn_c_${cardN}`;
            cards.push({
              id: cardId,
              cardNumber: `SYN-${String(cardN).padStart(8, '0')}`,
              vehicleId: id,
              registrationStationId: office.id,
              deskId,
              issuedById: employee.id,
              issuedAt: atTime,
              reason,
              status,
              activeForVehicleId: status === 'ACTIVE' ? id : null,
              cancelledAt: status === 'CANCELLED' ? new Date(atTime.getTime() + 4 * 60_000) : null,
              cancelledById: status === 'CANCELLED' ? employee.id : null,
              cancelReason: status === 'CANCELLED' ? 'FAILED_PRINT' : null,
              printedPlate: plate,
              printedVehicleLine: 'اصطناعي',
              printedOfficeName: office.name,
              printedIssueDate: day,
              printedStationCode: office.internalCode,
              createdAt: atTime,
            });
            audits.push({ userId: employee.id, action: 'ISSUE_CARD', entityType: 'VehicleCard', entityId: cardId, newValue: { reason }, createdAt: atTime });
            return cardId;
          };
          const printIt = (cardId: string, atTime: Date, mode = 'full') => {
            prints.push({ registrationStationId: office.id, deskId, kind: 'CARD', cardId, printedById: employee.id, printedAt: atTime });
            audits.push({ userId: employee.id, action: 'PRINT_CARD', entityType: 'VehicleCard', entityId: cardId, newValue: { cardNumber: `SYN-${cardId}`, mode }, createdAt: atTime });
          };

          if (failed) {
            // A misprint: the first card is wasted, its replacement is printed again.
            const bad = issue('FIRST_ISSUE', 'CANCELLED', issueAt);
            printIt(bad, new Date(issueAt.getTime() + 60_000));
            const good = issue('FAILED_PRINT', 'ACTIVE', new Date(issueAt.getTime() + 5 * 60_000));
            printIt(good, new Date(issueAt.getTime() + 6 * 60_000));
            cardedVehicles.push({ id, plate, cardAt: issueAt.getTime() });
          } else {
            const cardId = issue('FIRST_ISSUE', 'ACTIVE', issueAt);
            printIt(cardId, new Date(issueAt.getTime() + 60_000));
            if (random() < 0.05) printIt(cardId, new Date(issueAt.getTime() + 20 * 60_000)); // a reprint
            cardedVehicles.push({ id, plate, cardAt: issueAt.getTime() });
          }
        }

        // Duplicates caught, test cards and corrections.
        for (let d = 0; d < between(0, Math.max(1, Math.round(2 * scale))); d++) {
          const employee = pick(staff[o]!);
          duplicates.push({ registrationStationId: office.id, userId: employee.id, fields: pick([['PLATE'], ['CHASSIS'], ['PLATE', 'BOOKLET'], ['BOOKLET']]), occurredAt: at(day, between(8, 13), between(0, 59)) });
        }
        if (dayIndex % 7 === 0) {
          const employee = pick(staff[o]!);
          prints.push({ registrationStationId: office.id, deskId: desks[o]!, kind: 'TEST', printedById: employee.id, printedAt: at(day, 8, 10) });
        }
      }
    }
    // A few corrections, with their outcomes (against vehicles registered at the office).
    for (const [i, vehicle] of vehicles.filter((_, idx) => idx % 37 === 0).entries()) {
      const requester = staff.flat().find((s) => s.id === vehicle.registeredById);
      if (!requester) continue;
      changes.push({
        vehicleId: vehicle.id!,
        changeType: 'CHASSIS_CHANGE',
        currentValue: 'old',
        requestedValue: `new-${i}`,
        reason: 'تصحيح خطأ إملائي (اصطناعي)',
        proofReference: 'SYN',
        status: pick(['PENDING', 'APPROVED', 'APPROVED', 'REJECTED']) as 'PENDING' | 'APPROVED' | 'REJECTED',
        requestedById: requester.id,
        createdAt: new Date((vehicle.createdAt as Date).getTime() + 3_600_000),
      });
    }

    const chunk = async <T>(rows: T[], insert: (rows: T[]) => Promise<unknown>, size = 2000) => {
      for (let i = 0; i < rows.length; i += size) await insert(rows.slice(i, i + size));
    };
    await chunk(vehicles, (r) => prisma.vehicle.createMany({ data: r }));
    await chunk(cards, (r) => prisma.vehicleCard.createMany({ data: r }));
    await chunk(prints, (r) => prisma.cardPrint.createMany({ data: r }));
    await chunk(duplicates, (r) => prisma.duplicateCatch.createMany({ data: r }));
    await chunk(changes, (r) => prisma.vehicleChangeRequest.createMany({ data: r }));
    await chunk(audits, (r) => prisma.auditLog.createMany({ data: r }));

    // ── Blank-card stock, with one deliberate shortfall ─────────────────
    const stockAt = (daysAgo: number, hour: number) => at(addDays(today, -daysAgo), hour);
    const printsBetween = (officeId: string, from: Date, to: Date) =>
      prisma.cardPrint.count({ where: { registrationStationId: officeId, printedAt: { gt: from, lte: to } } });
    const stockPlans: Array<{ office: number; start: number; shortfall: number; by: string | null; windows: boolean }> = [
      { office: 0, start: 900 * scale, shortfall: 15, by: supervisors[0] ?? staff[0]![0]!.id, windows: true },
      { office: 1, start: 700 * scale, shortfall: 0, by: supervisors[1]!, windows: true },
      { office: 2, start: 300 * scale, shortfall: 0, by: supervisors[2]!, windows: false },
    ];
    for (const plan of stockPlans) {
      const office = offices[plan.office]!;
      const make = (kind: 'RECEIVED' | 'COUNT', quantity: number, occurredAt: Date, note: string) =>
        prisma.stockEntry.create({
          data: { registrationStationId: office.id, kind, quantity, occurredAt, reason: `${SYN} ${note}`, createdById: plan.by! },
        });
      const t0 = stockAt(14, 8);
      const t1 = stockAt(7, 8);
      const t2 = stockAt(1, 20);
      await make('COUNT', plan.start, t0, 'جرد افتتاحي');
      if (!plan.windows) {
        await make('RECEIVED', 200 * scale, stockAt(10, 10), 'دفعة واردة');
        continue;
      }
      const received = 500 * scale;
      await make('RECEIVED', received, stockAt(10, 10), 'دفعة واردة');
      const printed1 = await printsBetween(office.id, t0, t1);
      const count1 = plan.start + received - printed1; // matches the prints: fine
      await make('COUNT', count1, t1, 'جرد أسبوعي');
      const printed2 = await printsBetween(office.id, t1, t2);
      // The shortfall: more blanks left the box than the system recorded printing.
      const count2 = count1 - printed2 - plan.shortfall;
      await make('COUNT', count2, t2, plan.shortfall ? 'جرد أسبوعي (نقص مقصود في بيانات التجربة)' : 'جرد أسبوعي');
    }

    // ── Fill-ups, with and without a card ───────────────────────────────
    const stations = await prisma.station.findMany({
      where: { municipalityId: municipality.id, status: 'ACTIVE' },
      orderBy: { internalCode: 'asc' },
      take: 6,
      select: { id: true },
    });
    const recorder = (await prisma.user.findUnique({ where: { username: 'employee1' } }))?.id ?? staff[0]![0]!.id;
    // A pool of plates that have no vehicle record: the cars still to register.
    const unregistered = Array.from({ length: 400 * scale }, (_, i) => `${between(1, 9)}-${String(6_000_000 + i).padStart(7, '0')}`);
    const fillUps: Prisma.FillUpTransactionCreateManyInput[] = [];
    let fillN = 0;
    for (const [dayIndex, day] of days.entries()) {
      const cardShare = 0.05 + (dayIndex / (DAYS - 1)) * 0.35; // cards slowly take over
      for (const station of stations) {
        const total = Math.round(between(14, 30) * scale);
        for (let k = 0; k < total; k++) {
          const when = at(day, between(6, 21), between(0, 59));
          if (when.getTime() > now) continue;
          fillN += 1;
          const base = {
            stationId: station.id,
            municipalityId: municipality.id,
            fuelType: 'PETROL_95' as const,
            quantityLiters: between(15, 45),
            occurredAt: when,
            recordedById: recorder,
            idempotencyKey: `syn-f-${fillN}`,
          };
          const eligible = cardedVehicles.filter((v) => v.cardAt < when.getTime());
          const r = random();
          if (r < cardShare && eligible.length > 0) {
            fillUps.push({ ...base, identifiedBy: 'CARD_SCAN', vehicleId: pick(eligible).id });
          } else if (r < cardShare + 0.08 && uncardedVehicles.length > 0) {
            fillUps.push({ ...base, identifiedBy: 'TYPED_REGISTERED', vehicleId: pick(uncardedVehicles).id });
          } else if (random() < 0.004) {
            const plate = pick(unregistered);
            fillUps.push({ ...base, identifiedBy: 'EMERGENCY_OVERRIDE', typedPlate: plate, normalizedPlate: plate, overrideReason: 'حالة طارئة (اصطناعية)' });
          } else {
            const plate = pick(unregistered);
            fillUps.push({ ...base, identifiedBy: 'TYPED_UNREGISTERED', typedPlate: plate, normalizedPlate: plate });
          }
        }
      }
    }
    await chunk(fillUps, (r) => prisma.fillUpTransaction.createMany({ data: r, skipDuplicates: true }));

    console.log(
      `Synthetic activity generated (${DAYS} days, scale ${scale}): ${vehicles.length} vehicles, ${cards.length} cards, ` +
        `${prints.length} prints, ${duplicates.length} duplicates caught, ${changes.length} corrections, ${fillUps.length} fill-ups, ` +
        `with one deliberate card-stock shortfall of ${stockPlans[0]!.shortfall} at ${offices[0]!.name}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
