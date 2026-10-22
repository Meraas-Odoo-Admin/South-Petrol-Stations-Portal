import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, VehicleChangeType, VehicleUsageType } from '@prisma/client';
import { checkBooklet, checkChassis, isBookletPlaceholder, normalizeBooklet, normalizeChassis, normalizePlate, plateSearchTerm } from '@fuel-tracking/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { UpdateVehicleIdentityDto } from './dto/update-vehicle-identity.dto';
import { FindVehiclesQueryDto, OwnerIdentityStatusFilter, VehicleSortField } from './dto/find-vehicles-query.dto';
import { PlateChangeDto } from './dto/plate-change.dto';
import { CreateVehicleChangeRequestDto } from './dto/create-change-request.dto';
import { RejectVehicleChangeRequestDto } from './dto/reject-change-request.dto';
import { FindChangeRequestsQueryDto } from './dto/find-change-requests-query.dto';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { resolveWeekWindowStrategy } from '../fillups/rule-engine/week-window.strategy';
import { RegistrationStationsService } from '../registration-stations/registration-stations.service';
import { DuplicateCheckQueryDto } from './dto/duplicate-check-query.dto';
import { NotificationsService } from '../notifications/notifications.service';

// One clash between a value being registered and an already-registered
// vehicle — which field, and whose vehicle it is. The registration screen
// shows these before saving (GET /vehicles/duplicate-check), and create()
// returns the same shape under a VEHICLE_DUPLICATE 409's `details`.
export interface VehicleDuplicate {
  field: 'currentPlate' | 'chassisNumber' | 'registrationBooklet';
  vehicle: { id: string; internalCode: string; currentPlate: string };
}

// The single field on Vehicle that a given changeType targets, and (for the
// @unique history-tracked fields) the parallel history table it's tracked
// in once a value has been approved-changed at least once. Centralizing
// this mapping is what keeps setOrRequestChange/approveChangeRequest
// generic across every change type instead of near-duplicate code paths.
// OWNER_CHANGE/USAGE_TYPE_CHANGE/VEHICLE_TYPE_CHANGE have no @unique
// constraint and no history table — many vehicles legitimately share the
// same owner/usage-type/vehicle-type, so there's nothing to conflict-check
// or archive, only the field itself to update. USAGE_TYPE_CHANGE is
// deprecated (round 14 — see VehicleChangeType's schema comment) but stays
// wired here so any already-pending request of that type can still be
// approved/rejected cleanly; ChangeRequestForm.tsx no longer offers it.
const CHANGE_TYPE_FIELD: Record<
  VehicleChangeType,
  'chassisNumber' | 'registrationBooklet' | 'ownerId' | 'usageType' | 'currentPlate' | 'vehicleTypeId'
> = {
  [VehicleChangeType.CHASSIS_CHANGE]: 'chassisNumber',
  [VehicleChangeType.BOOKLET_CHANGE]: 'registrationBooklet',
  [VehicleChangeType.OWNER_CHANGE]: 'ownerId',
  [VehicleChangeType.USAGE_TYPE_CHANGE]: 'usageType',
  [VehicleChangeType.PLATE_CHANGE]: 'currentPlate',
  [VehicleChangeType.VEHICLE_TYPE_CHANGE]: 'vehicleTypeId',
};

// After review (19 Oct 2026): the plate is not among them — two vehicles may
// share a plate number; the chassis number tells them apart.
const UNIQUE_CHANGE_TYPES: Set<VehicleChangeType> = new Set([
  VehicleChangeType.CHASSIS_CHANGE,
  VehicleChangeType.BOOKLET_CHANGE,
]);

// Prisma's findUnique `where` requires a literal known unique-field key —
// a computed `{ [field]: value }` doesn't type-check against
// VehicleWhereUniqueInput, hence the explicit branch here rather than at
// every call site. Only meaningful for the @unique fields — callers must
// check UNIQUE_CHANGE_TYPES before invoking this for a change type with no
// uniqueness constraint to check.
function findVehicleByChangeValue(
  prisma: PrismaService,
  changeType: VehicleChangeType,
  value: string,
) {
  switch (changeType) {
    case VehicleChangeType.CHASSIS_CHANGE:
      return prisma.vehicle.findUnique({ where: { chassisNumber: value } });
    case VehicleChangeType.BOOKLET_CHANGE:
      // «000000» (an unknown booklet number) may repeat (after review, 22 Oct 2026).
      if (isBookletPlaceholder(value)) return Promise.resolve(null);
      return prisma.vehicle.findFirst({ where: { registrationBooklet: value } });
    case VehicleChangeType.PLATE_CHANGE:
      // Matched by the normalized plate too: the same plate typed another
      // way is still the same plate.
      return prisma.vehicle.findFirst({
        where: { OR: plateMatchClauses(value) },
      });
    default:
      throw new Error(`findVehicleByChangeValue called for a non-unique changeType: ${changeType}`);
  }
}

// A vehicle's stored text OR its canonical plate matches. A plate with no
// canonical form (no separator) can only match by its exact text — it must
// never match the rows whose normalizedPlate is NULL.
function plateMatchClauses(plate: string): Prisma.VehicleWhereInput[] {
  const normalized = normalizePlate(plate);
  return [{ currentPlate: plate }, ...(normalized ? [{ normalizedPlate: normalized }] : [])];
}

// A computed `{ [field]: value }` can't type-check against
// Prisma.VehicleUpdateInput once the field union includes usageType (a real
// enum, not a plain string like the others) — build the typed update
// object explicitly instead of trusting the dynamic key.
function buildChangeUpdateData(changeType: VehicleChangeType, value: string): Prisma.VehicleUpdateInput {
  switch (changeType) {
    case VehicleChangeType.CHASSIS_CHANGE:
      return { chassisNumber: value };
    case VehicleChangeType.BOOKLET_CHANGE:
      return { registrationBooklet: value };
    case VehicleChangeType.PLATE_CHANGE:
      return { currentPlate: value, normalizedPlate: normalizePlate(value) };
    case VehicleChangeType.OWNER_CHANGE:
      return { owner: { connect: { id: value } } };
    case VehicleChangeType.USAGE_TYPE_CHANGE:
      return { usageType: value as VehicleUsageType };
    case VehicleChangeType.VEHICLE_TYPE_CHANGE:
      return { vehicleType: { connect: { id: value } } };
  }
}

// After review (19 Oct 2026), the plate-sharing rules:
//  - a plate number is shared by two vehicles at most (it repeats once);
//  - the two must be of different vehicle types — so a vehicle sharing a
//    plate must have a type, and the other one must have one too.
// Checked inside the transaction that writes the plate or the type, after the
// per-plate lock (re-entrant, the same one registration takes), so two
// registrations at once can't both slip in.
async function assertPlateMayBeShared(
  tx: Prisma.TransactionClient,
  normalizedPlate: string | null,
  vehicleTypeId: string | null,
  exceptVehicleId?: string,
) {
  if (!normalizedPlate) return;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'plate:' + normalizedPlate}))`;
  const others = await tx.vehicle.findMany({
    where: { normalizedPlate, ...(exceptVehicleId ? { id: { not: exceptVehicleId } } : {}) },
    select: { internalCode: true, vehicleTypeId: true, vehicleType: { select: { name: true } } },
    take: 3,
  });
  if (others.length === 0) return;
  if (others.length >= 2) {
    throw new ConflictException({ message: 'PLATE_SHARED_LIMIT', details: { vehicles: others.map((o) => o.internalCode) } });
  }
  const other = others[0]!;
  if (!other.vehicleTypeId) {
    throw new ConflictException({ message: 'PLATE_SHARED_OTHER_NO_TYPE', details: { vehicle: other.internalCode } });
  }
  if (!vehicleTypeId) {
    throw new ConflictException({ message: 'PLATE_SHARED_TYPE_REQUIRED', details: { otherType: other.vehicleType?.name ?? null } });
  }
  if (vehicleTypeId === other.vehicleTypeId) {
    throw new ConflictException({ message: 'PLATE_SHARED_SAME_TYPE', details: { otherType: other.vehicleType?.name ?? null } });
  }
}

// Writes one identity change and keeps its history: the plate, chassis and
// booklet each close their current history row and open a new one, so fill-up
// history is never orphaned. Shared by an approved change request and by the
// direct edit (after review, 18 Oct 2026). Uniqueness is checked by the caller.
async function applyIdentityChange(tx: Prisma.TransactionClient, vehicleId: string, changeType: VehicleChangeType, value: string) {
  if (changeType === VehicleChangeType.CHASSIS_CHANGE) {
    const currentHistoryRow = await tx.vehicleChassisHistory.findFirst({
      where: { vehicleId: vehicleId, validTo: null },
      orderBy: { validFrom: 'desc' },
    });
    if (currentHistoryRow) {
      await tx.vehicleChassisHistory.update({
        where: { id: currentHistoryRow.id },
        data: { validTo: new Date() },
      });
    }
    await tx.vehicleChassisHistory.create({
      data: { vehicleId: vehicleId, chassisNumber: value },
    });
    // The tick that lets a chassis number be non-standard follows the
    // value now on the vehicle (not 17 characters, or holding I/O/Q).
    await tx.vehicle.update({
      where: { id: vehicleId },
      data: {
        chassisNonStandard:
          value.length !== 17 || /[IOQ]/.test(value),
      },
    });
  } else if (changeType === VehicleChangeType.BOOKLET_CHANGE) {
    const currentHistoryRow = await tx.vehicleBookletHistory.findFirst({
      where: { vehicleId: vehicleId, validTo: null },
      orderBy: { validFrom: 'desc' },
    });
    if (currentHistoryRow) {
      await tx.vehicleBookletHistory.update({
        where: { id: currentHistoryRow.id },
        data: { validTo: new Date() },
      });
    }
    await tx.vehicleBookletHistory.create({
      data: { vehicleId: vehicleId, registrationBooklet: value },
    });
  } else if (changeType === VehicleChangeType.PLATE_CHANGE) {
    // Same close-old/open-new pattern as changePlate() below — a
    // change-request-approved plate change must leave the same
    // unbroken VehiclePlateHistory trail a direct change would.
    const currentHistoryRow = await tx.vehiclePlateHistory.findFirst({
      where: { vehicleId: vehicleId, validTo: null },
      orderBy: { validFrom: 'desc' },
    });
    if (currentHistoryRow) {
      await tx.vehiclePlateHistory.update({
        where: { id: currentHistoryRow.id },
        data: { validTo: new Date() },
      });
    }
    await tx.vehiclePlateHistory.create({
      data: { vehicleId: vehicleId, plate: value },
    });
  }
  // OWNER_CHANGE/USAGE_TYPE_CHANGE/VEHICLE_TYPE_CHANGE: no dedicated
  // history table (see CHANGE_TYPE_FIELD's own comment) — the field
  // update below plus this request row's own audit trail is the
  // complete record.

  await tx.vehicle.update({
    where: { id: vehicleId },
    data: buildChangeUpdateData(changeType, value),
  });
}

@Injectable()
export class VehiclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SystemSettingsService,
    private readonly registrationStations: RegistrationStationsService,
    private readonly notifications: NotificationsService,
  ) {}

  // Phase 4c: a registration attempt refused because the plate, chassis number
  // or booklet already belongs to a vehicle. Kept (with who and where) so the
  // office report can show how many duplicates each office caught. Nothing
  // earlier was recorded, so reports say "recorded since" the migration date.
  // The as-you-type duplicate lookup (findDuplicates) is not an attempt and is
  // not recorded.
  private async recordDuplicateCatch(
    registrationStationId: string,
    userId: string,
    conflictFields: Array<VehicleDuplicate['field']>,
  ): Promise<void> {
    const names: Record<VehicleDuplicate['field'], string> = {
      currentPlate: 'PLATE',
      chassisNumber: 'CHASSIS',
      registrationBooklet: 'BOOKLET',
    };
    const fields = [...new Set(conflictFields.map((f) => names[f]))];
    const row = await this.prisma.duplicateCatch.create({ data: { registrationStationId, userId, fields } });
    await this.audit.log({
      userId,
      action: 'DUPLICATE_CAUGHT',
      entityType: 'RegistrationStation',
      entityId: registrationStationId,
      newValue: { fields, duplicateCatchId: row.id },
    });
  }

  // `conflicts` refuse the registration (the chassis number, the booklet);
  // `samePlate` only warns (after review, 19 Oct 2026): a plate number may
  // belong to more than one vehicle, told apart by their chassis numbers.
  async findDuplicates(
    values: DuplicateCheckQueryDto,
  ): Promise<{
    conflicts: VehicleDuplicate[];
    samePlate: Array<VehicleDuplicate['vehicle'] & { chassisNumber: string | null; vehicleType: { name: string } | null }>;
  }> {
    const select = { id: true, internalCode: true, currentPlate: true } as const;
    const checks: Array<[VehicleDuplicate['field'], Promise<VehicleDuplicate['vehicle'] | null>]> = [];
    // By the normalized plate (and the stored text, for rows that predate
    // the column): `8-1234567`, `8 1234567` and `٨-١٢٣٤٥٦٧` are one plate.
    const samePlate = values.currentPlate
      ? await this.prisma.vehicle.findMany({
          where: { OR: plateMatchClauses(values.currentPlate) },
          select: { ...select, chassisNumber: true, vehicleType: { select: { name: true } } },
          take: 5,
        })
      : [];
    if (values.chassisNumber) {
      checks.push(['chassisNumber', this.prisma.vehicle.findUnique({ where: { chassisNumber: values.chassisNumber }, select })]);
    }
    // «000000» (an unknown booklet number) may repeat (after review, 22 Oct 2026).
    if (values.registrationBooklet && !isBookletPlaceholder(values.registrationBooklet)) {
      checks.push([
        'registrationBooklet',
        this.prisma.vehicle.findFirst({ where: { registrationBooklet: values.registrationBooklet }, select }),
      ]);
    }
    const conflicts: VehicleDuplicate[] = [];
    for (const [field, lookup] of checks) {
      const vehicle = await lookup;
      if (vehicle) {
        conflicts.push({ field, vehicle });
      }
    }
    return { conflicts, samePlate };
  }

  // Round 4 feedback item 5: the vehicle detail page shows "X من Y تعبئات
  // مسموح بها هذا الأسبوع" — reuses the exact same week-window logic the
  // rule engine itself uses (rolling vs fixed, per fillup.week_window_mode)
  // rather than a second, possibly-diverging notion of "this week".
  async getWeeklyUsage(vehicleId: string) {
    const [maxPerWeek, weekWindowMode, weekStartDay] = await Promise.all([
      this.settings.getNumber('fillup.max_per_week'),
      this.settings.getString('fillup.week_window_mode'),
      this.settings.getNumber('fillup.week_start_day'),
    ]);
    const now = new Date();
    const windowStart = resolveWeekWindowStrategy(weekWindowMode).windowStart(now, weekStartDay);
    const used = await this.prisma.fillUpTransaction.count({
      where: { vehicleId, occurredAt: { gte: windowStart, lte: now } },
    });
    return { used, max: maxPerWeek, windowStart: windowStart.toISOString() };
  }

  // Round 5 feedback: "the internal code field shouldn't be something the
  // user types — find the existing generation logic and reuse it." There
  // wasn't one (confirmed — CreateVehicleDto.internalCode was a plain
  // required text field with no generator anywhere), so this is new. Uses
  // vehicle count as the starting point, then probes forward past any
  // already-taken code (possible if a caller explicitly supplied one
  // outside this sequence, e.g. VEH-SEED-* fixtures) rather than trusting
  // count+1 to be free — cheap since collisions should be rare in practice.
  private async generateInternalCode(): Promise<string> {
    const count = await this.prisma.vehicle.count();
    for (let offset = 0; offset < 20; offset++) {
      const candidate = `V-${String(count + 1 + offset).padStart(6, '0')}`;
      const existing = await this.prisma.vehicle.findUnique({ where: { internalCode: candidate } });
      if (!existing) {
        return candidate;
      }
    }
    throw new Error('Could not generate a unique vehicle internal code after 20 attempts.');
  }

  // Registration pivot, phase 2: registering a vehicle is a registration-
  // station action — scoped, refused at a closed station or in a
  // preparing municipality, and recorded (where + who) on the vehicle.
  async create(dto: CreateVehicleDto, actorId: string) {
    const { registrationStationId, ...vehicleFields } = dto;
    await this.registrationStations.assertCanRegisterAt(registrationStationId, actorId);

    const internalCode = dto.internalCode?.trim() || (await this.generateInternalCode());

    // Only re-check uniqueness for an explicitly-supplied code —
    // generateInternalCode() above already confirmed its own candidate is
    // free, and re-checking it here would just be a redundant query.
    if (dto.internalCode?.trim()) {
      const existingByCode = await this.prisma.vehicle.findUnique({
        where: { internalCode },
      });
      if (existingByCode) {
        throw new ConflictException('internalCode is already in use.');
      }
    }

    // Every clashing field at once (not first-failure-wins), each naming
    // the vehicle it already belongs to — the screen shows them all.
    const { conflicts } = await this.findDuplicates(dto);
    if (conflicts.length > 0) {
      await this.recordDuplicateCatch(registrationStationId, actorId, conflicts.map((c) => c.field));
      throw new ConflictException({ message: 'VEHICLE_DUPLICATE', details: { conflicts } });
    }

    if (dto.ownerId) {
      const owner = await this.prisma.vehicleOwner.findUnique({ where: { id: dto.ownerId } });
      if (!owner) {
        throw new NotFoundException('Vehicle owner not found.');
      }
      await this.assertOwnerHasRoom(dto.ownerId);
    }

    // Required and real (after review, 19 Oct 2026): an active vehicle type.
    const vehicleType = await this.prisma.vehicleType.findUnique({ where: { id: dto.vehicleTypeId }, select: { isActive: true } });
    if (!vehicleType || !vehicleType.isActive) {
      throw new BadRequestException('VEHICLE_TYPE_INVALID');
    }

    // The DTO already refuses a plate that can't be split into a city code
    // and a serial number; this keeps the service honest if called directly.
    const normalizedPlate = normalizePlate(dto.currentPlate);
    if (!normalizedPlate) {
      throw new BadRequestException('PLATE_INVALID');
    }

    return this.prisma.$transaction(async (tx) => {
      // Serializes against a fill-up being recorded for this same plate
      // (FillUpsService takes the same per-plate lock), so a fill-up can't
      // slip in between the link below and the commit and stay unlinked.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'plate:' + normalizedPlate}))`;
      // After review (19 Oct 2026): another vehicle may already have this plate
      // number. Then earlier unregistered fill-ups of the plate are not given
      // to the new one (they may be the other vehicle's).
      await assertPlateMayBeShared(tx, normalizedPlate, dto.vehicleTypeId ?? null);
      const plateShared = Boolean(await tx.vehicle.findFirst({ where: { normalizedPlate }, select: { id: true } }));

      const vehicle = await tx.vehicle.create({
        data: {
          ...vehicleFields,
          // 'PETROL' | 'DIESEL' from the DTO; the column is the Prisma enum.
          fuelType: vehicleFields.fuelType,
          chassisNonStandard: vehicleFields.chassisNonStandard ?? false,
          normalizedPlate,
          internalCode,
          registeredAtRegistrationStationId: registrationStationId,
          registeredById: actorId,
        },
      });

      // Phase 4a: fill-ups recorded earlier for this plate while it was
      // unregistered (grace / awareness) join the new vehicle, in this same
      // transaction, so its history and its limits carry on without a gap.
      // ONLY the vehicle link is added — typedPlate, identifiedBy and the
      // stamped municipality stay exactly as recorded.
      const linked = plateShared
        ? { count: 0 }
        : await tx.fillUpTransaction.updateMany({
            where: { vehicleId: null, normalizedPlate },
            data: { vehicleId: vehicle.id },
          });

      // Seed the plate history with the vehicle's initial plate so
      // plate-change always has a current (validTo: null) row to close.
      await tx.vehiclePlateHistory.create({
        data: { vehicleId: vehicle.id, plate: vehicle.currentPlate },
      });

      await this.audit.log(
        {
          userId: actorId,
          action: 'CREATE',
          entityType: 'Vehicle',
          entityId: vehicle.id,
          newValue: {
            internalCode: vehicle.internalCode,
            currentPlate: vehicle.currentPlate,
            registeredAtRegistrationStationId: registrationStationId,
          },
        },
        tx,
      );
      if (linked.count > 0) {
        await this.audit.log(
          {
            userId: actorId,
            action: 'LINK_UNREGISTERED_FILLUPS',
            entityType: 'Vehicle',
            entityId: vehicle.id,
            newValue: { linkedFillUps: linked.count, normalizedPlate },
          },
          tx,
        );
      }

      return { ...vehicle, linkedFillUps: linked.count };
    });
  }

  // Round 11 item 2: real filters/sorting, not the visual-pass placeholder
  // this used to be — usageType moved server-side (was client-side-only
  // over one loaded page, an explicit prior scope cut, now reconsidered
  // deliberately per the round's own instruction), plus brand and the new
  // owner-identity-status filter (verified/provisional/missing — ties
  // directly to item 1's mandatory-owner change). `owner` is now included
  // in the response too — the client asked for the vehicle to read as a
  // profile with its owner, not a bare row. Sort defaults to newest-
  // vehicle-first (createdAt desc); internalCode/currentPlate sorting is
  // a plain column order. Sorting by "most recent fill-up" needs an
  // aggregate join this round didn't build — see VehicleSortField's own
  // comment and docs/OPEN_ITEMS.md; requesting it isn't possible yet
  // since the DTO's enum doesn't expose it, not silently ignored.
  async findAll(query: FindVehiclesQueryDto) {
    const ownerIdentityFilter: Record<OwnerIdentityStatusFilter, object> = {
      [OwnerIdentityStatusFilter.VERIFIED]: {
        owner: { identityType: { in: ['NATIONAL_ID', 'ADMINISTRATIVE_ID'] } },
      },
      [OwnerIdentityStatusFilter.MISSING]: { ownerId: null },
    };

    const sortOrderBy: Record<VehicleSortField, object> = {
      [VehicleSortField.CREATED_AT]: { createdAt: 'desc' },
      [VehicleSortField.INTERNAL_CODE]: { internalCode: 'asc' },
      [VehicleSortField.CURRENT_PLATE]: { currentPlate: 'asc' },
    };

    // «لوحات مكررة»: the plates (normalized) that more than one vehicle has.
    const repeatedPlates = query.duplicatePlate
      ? (
          await this.prisma.$queryRaw<Array<{ normalizedPlate: string }>>`
            SELECT "normalizedPlate" FROM "Vehicle"
            WHERE "normalizedPlate" IS NOT NULL
            GROUP BY "normalizedPlate" HAVING COUNT(*) > 1`
        ).map((r) => r.normalizedPlate)
      : null;

    const where: Prisma.VehicleWhereInput = {
        ...(repeatedPlates ? { normalizedPlate: { in: repeatedPlates } } : {}),
        internalCode: query.internalCode ? { contains: query.internalCode } : undefined,
        // Plates match on the normalized form too, so a plate typed with a
        // different separator or in Arabic-Indic digits still finds it.
        ...(query.currentPlate
          ? {
              AND: [
                {
                  OR: [
                    { currentPlate: { contains: query.currentPlate } },
                    ...(plateSearchTerm(query.currentPlate)
                      ? [{ normalizedPlate: { contains: plateSearchTerm(query.currentPlate) } }]
                      : []),
                  ],
                },
              ],
            }
          : {}),
        chassisNumber: query.chassisNumber ? { contains: query.chassisNumber } : undefined,
        usageType: query.usageType,
        make: query.brand ? { equals: query.brand } : undefined,
        vehicleTypeId: query.vehicleTypeId,
        ...(query.ownerIdentityStatus ? ownerIdentityFilter[query.ownerIdentityStatus] : {}),
        // Independent OR search — a caller who doesn't know whether their
        // typed term is an internal code, plate, chassis number, or the
        // owner's own name/ID (the "find this vehicle or its owner" use
        // case from this list and the fill-up form's lookup search) needs
        // all of them tried, not ANDed against the precise fields above.
        OR: query.search
          ? [
              { internalCode: { contains: query.search, mode: 'insensitive' } },
              { currentPlate: { contains: query.search, mode: 'insensitive' } },
              ...(plateSearchTerm(query.search) ? [{ normalizedPlate: { contains: plateSearchTerm(query.search) } }] : []),
              { chassisNumber: { contains: query.search, mode: 'insensitive' } },
              { registrationBooklet: { contains: query.search, mode: 'insensitive' } },
              { owner: { fullName: { contains: query.search, mode: 'insensitive' } } },
              { owner: { identityNumber: { contains: query.search } } },
            ]
          : undefined,
    };
    const include = {
      owner: {
        select: {
          id: true,
          fullName: true,
          identityType: true,
          identityNumber: true,
          phone: true,
          responsibleDriverName: true,
          responsibleDriverPhone: true,
        },
      },
      vehicleType: { select: { id: true, name: true } },
    } satisfies Prisma.VehicleInclude;
    // Repeated plates: each plate's vehicles side by side.
    const orderBy = repeatedPlates
      ? [{ normalizedPlate: 'asc' as const }, { createdAt: 'asc' as const }]
      : sortOrderBy[query.sort ?? VehicleSortField.CREATED_AT];
    const skip = query.skip ?? 0;
    const take = query.take ?? 50;

    // `paged`: one page and the total («1–20 من 340»); otherwise the bare page
    // of rows the pickers use. Either way, never more than `take` (<= 100).
    if (query.paged) {
      const [total, items] = await Promise.all([
        this.prisma.vehicle.count({ where }),
        this.prisma.vehicle.findMany({ where, include, skip, take, orderBy }),
      ]);
      return { total, skip, take, items };
    }
    return this.prisma.vehicle.findMany({ where, include, skip, take, orderBy });
  }

  async findOne(id: string) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id } });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found.');
    }
    return vehicle;
  }

  // Separate from findOne — that one stays a lean single-row lookup used
  // internally by update/changePlate/addDriver/etc (no reason to pay for
  // plate history + driver joins on every internal call). This is only for
  // GET /vehicles/:id, the actual detail page — plate history (oldest
  // first, so "history" reads chronologically) was previously not
  // returned by the API at all, so the vehicle detail page had nowhere to
  // source it from (item 6). Round 6: `drivers` dropped from this include
  // — the owner (with identityType/identityNumber) is now the identity
  // that matters, not a driver association (see
  // docs/DESIGN_owner_based_fillups.md).
  async findOneDetailed(id: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true,
            fullName: true,
            identityType: true,
            identityNumber: true,
            phone: true,
            responsibleDriverName: true,
            responsibleDriverPhone: true,
          },
        },
        vehicleType: { select: { id: true, name: true } },
        plateHistory: { orderBy: { validFrom: 'asc' } },
        // After review (19 Oct 2026, oversight): who registered it, and where.
        registeredBy: { select: { id: true, fullName: true, username: true } },
        registeredAtRegistrationStation: { select: { id: true, name: true } },
      },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found.');
    }
    return vehicle;
  }

  // Cosmetic-only — every field that actually feeds FillUpRuleEngine, or
  // could plausibly need to (see VehicleChangeType's schema comment), is
  // no longer accepted here at all (UpdateVehicleDto no longer declares
  // them, and the global ValidationPipe's forbidNonWhitelisted:true rejects
  // one outright if a caller still sends it). Round 12 moved ownerId/
  // usageType off this path; round 14 also moved vehicleTypeId off it —
  // the client asked that changing a vehicle's type require the same
  // approval as chassis/booklet/plate/owner, so it now only travels
  // through POST /vehicles/:id/change-requests (VEHICLE_TYPE_CHANGE).
  async update(id: string, dto: UpdateVehicleDto, actorId: string) {
    const before = await this.findOne(id);

    return this.prisma.$transaction(async (tx) => {
      const vehicle = await tx.vehicle.update({ where: { id }, data: dto });

      await this.audit.log(
        {
          userId: actorId,
          action: 'UPDATE',
          entityType: 'Vehicle',
          entityId: vehicle.id,
          oldValue: {
            make: before.make,
            model: before.model,
            color: before.color,
            manufactureYear: before.manufactureYear,
            fuelType: before.fuelType,
          },
          newValue: {
            make: vehicle.make,
            model: vehicle.model,
            color: vehicle.color,
            manufactureYear: vehicle.manufactureYear,
            fuelType: vehicle.fuelType,
          },
        },
        tx,
      );

      return vehicle;
    });
  }

  // After review (19 Oct 2026): «ضوابط المالك» — an owner may have at most
  // registration.max_vehicles_per_owner vehicles (0 = no limit). Checked
  // whenever a vehicle is given to an owner: registering it, the direct edit,
  // and approving an older owner-change request. `exceptVehicleId`: the vehicle
  // being moved, if it is already counted (it never is: it belongs to someone else).
  private async assertOwnerHasRoom(ownerId: string, exceptVehicleId?: string) {
    let max = 0;
    try {
      max = await this.settings.getNumber('registration.max_vehicles_per_owner');
    } catch {
      // A database the migration has not reached yet: no limit, as before.
      return;
    }
    if (!Number.isFinite(max) || max <= 0) return;
    const count = await this.prisma.vehicle.count({
      where: { ownerId, ...(exceptVehicleId ? { id: { not: exceptVehicleId } } : {}) },
    });
    if (count >= max) {
      throw new ConflictException({ message: 'OWNER_VEHICLE_LIMIT', details: { limit: max, count } });
    }
  }

  // After review (18 Oct 2026): «تعديل» changes the identity fields directly
  // for whoever may approve such changes — no request. Each field sent and
  // different is checked with the registration's rules, must not belong to
  // another vehicle, and is written with its history (applyIdentityChange),
  // all in one transaction with one audit entry naming every change.
  async updateIdentity(id: string, dto: UpdateVehicleIdentityDto, actorId: string) {
    const before = await this.findOne(id);
    const changes: Array<{ type: VehicleChangeType; field: string; from: string | null; to: string }> = [];

    if (dto.currentPlate !== undefined && dto.currentPlate.trim() !== before.currentPlate) {
      const plate = dto.currentPlate.trim();
      if (!normalizePlate(plate)) throw new BadRequestException('PLATE_INVALID');
      if (normalizePlate(plate) !== normalizePlate(before.currentPlate)) {
        changes.push({ type: VehicleChangeType.PLATE_CHANGE, field: 'currentPlate', from: before.currentPlate, to: plate });
      }
    }
    if (dto.chassisNumber !== undefined) {
      const chassis = normalizeChassis(dto.chassisNumber);
      if (chassis !== (before.chassisNumber ?? '')) {
        const check = checkChassis(chassis, dto.chassisNonStandard === true);
        if (!check.ok) throw new BadRequestException({ message: 'CHASSIS_INVALID', details: { code: check.code } });
        changes.push({ type: VehicleChangeType.CHASSIS_CHANGE, field: 'chassisNumber', from: before.chassisNumber, to: chassis });
      }
    }
    if (dto.registrationBooklet !== undefined) {
      const booklet = normalizeBooklet(dto.registrationBooklet);
      if (booklet !== (before.registrationBooklet ?? '')) {
        const check = checkBooklet(booklet);
        if (!check.ok) throw new BadRequestException({ message: 'BOOKLET_INVALID', details: { code: check.code } });
        changes.push({ type: VehicleChangeType.BOOKLET_CHANGE, field: 'registrationBooklet', from: before.registrationBooklet, to: booklet });
      }
    }
    if (dto.ownerId !== undefined && dto.ownerId !== (before.ownerId ?? '')) {
      const owner = await this.prisma.vehicleOwner.findUnique({ where: { id: dto.ownerId } });
      if (!owner) throw new NotFoundException('Vehicle owner not found.');
      await this.assertOwnerHasRoom(dto.ownerId, id);
      changes.push({ type: VehicleChangeType.OWNER_CHANGE, field: 'ownerId', from: before.ownerId, to: dto.ownerId });
    }
    if (dto.vehicleTypeId !== undefined && dto.vehicleTypeId !== (before.vehicleTypeId ?? '')) {
      const type = await this.prisma.vehicleType.findUnique({ where: { id: dto.vehicleTypeId } });
      if (!type) throw new NotFoundException('Vehicle type not found.');
      changes.push({ type: VehicleChangeType.VEHICLE_TYPE_CHANGE, field: 'vehicleTypeId', from: before.vehicleTypeId, to: dto.vehicleTypeId });
    }
    if (changes.length === 0) return before;

    for (const change of changes) {
      if (!UNIQUE_CHANGE_TYPES.has(change.type)) continue;
      const existing = await findVehicleByChangeValue(this.prisma, change.type, change.to);
      if (existing && existing.id !== id) {
        throw new ConflictException({ message: 'IDENTITY_IN_USE', details: { field: change.field } });
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const plateChange = changes.find((c) => c.type === VehicleChangeType.PLATE_CHANGE);
      const typeChange = changes.find((c) => c.type === VehicleChangeType.VEHICLE_TYPE_CHANGE);
      if (plateChange || typeChange) {
        await assertPlateMayBeShared(
          tx,
          normalizePlate(plateChange ? plateChange.to : before.currentPlate),
          typeChange ? typeChange.to : before.vehicleTypeId,
          id,
        );
      }
      for (const change of changes) await applyIdentityChange(tx, id, change.type, change.to);
      await this.audit.log(
        {
          userId: actorId,
          action: 'UPDATE_IDENTITY',
          entityType: 'Vehicle',
          entityId: id,
          oldValue: Object.fromEntries(changes.map((c) => [c.field, c.from])),
          newValue: Object.fromEntries(changes.map((c) => [c.field, c.to])),
        },
        tx,
      );
    });
    return this.findOne(id);
  }

  // Dedicated endpoint, not part of general update(): closes the current
  // VehiclePlateHistory row and opens a new one atomically with the
  // Vehicle.currentPlate write, so fill-up history never gets orphaned by a
  // plate change (docs/IMPLEMENTATION_PLAN.md §11, M2 "done means").
  async changePlate(id: string, dto: PlateChangeDto, actorId: string) {
    const vehicle = await this.findOne(id);

    if (dto.newPlate === vehicle.currentPlate) {
      throw new ConflictException('newPlate is the same as the current plate.');
    }

    const newNormalized = normalizePlate(dto.newPlate);
    if (!newNormalized) {
      throw new BadRequestException('PLATE_INVALID');
    }
    // After review (19 Oct 2026): another vehicle may have this plate number too.

    return this.prisma.$transaction(async (tx) => {
      await assertPlateMayBeShared(tx, newNormalized, vehicle.vehicleTypeId, id);
      const currentHistoryRow = await tx.vehiclePlateHistory.findFirst({
        where: { vehicleId: id, validTo: null },
        orderBy: { validFrom: 'desc' },
      });
      if (currentHistoryRow) {
        await tx.vehiclePlateHistory.update({
          where: { id: currentHistoryRow.id },
          data: { validTo: new Date() },
        });
      }

      await tx.vehiclePlateHistory.create({
        data: { vehicleId: id, plate: dto.newPlate },
      });

      const updated = await tx.vehicle.update({
        where: { id },
        data: { currentPlate: dto.newPlate, normalizedPlate: newNormalized },
      });

      await this.audit.log(
        {
          userId: actorId,
          action: 'PLATE_CHANGE',
          entityType: 'Vehicle',
          entityId: id,
          oldValue: { currentPlate: vehicle.currentPlate },
          newValue: { currentPlate: updated.currentPlate },
        },
        tx,
      );

      return updated;
    });
  }

  // Round 6: driver-vehicle association endpoints removed — fill-ups no
  // longer need driver identity, and the Driver management UI is gone
  // (see docs/DESIGN_owner_based_fillups.md). DriverVehicle rows already
  // in the database are left alone (historical), just no longer written
  // to from here.

  // ── Chassis/registration-booklet change requests (anti-fraud) ────────
  //
  // Displacing an ALREADY-SET chassisNumber/registrationBooklet is gated
  // behind supervisor/admin approval (VehicleChangeRequest) — the
  // requested value never takes effect until approved. A first-time
  // null -> value set is NOT gated: there's no established identity to
  // displace yet, so approval would add friction without closing any
  // actual hole (the @unique constraint already blocks the abuse case of
  // reusing someone else's value). This branch is generic on "was there
  // already a non-null value" — not hardcoded to chassisNumber or
  // registrationBooklet specifically.

  async setOrRequestChange(vehicleId: string, dto: CreateVehicleChangeRequestDto, actorId: string) {
    const result = await this.setOrRequestChangeCore(vehicleId, dto, actorId);
    if (result.requiresApproval) {
      await this.notifications.notifyOfficesOf(actorId, ['notifications:office_events'], {
        kind: 'CORRECTION_REQUESTED',
        title: 'طلب تصحيح بيانات مركبة بانتظار الموافقة',
        body: 'قدّم موظف تسجيل طلب تصحيح لرقم الهيكل أو الدفتر أو المالك أو اللوحة.',
        link: '/vehicles/change-requests',
        entityType: 'Vehicle',
        entityId: vehicleId,
      });
    }
    return result;
  }

  private async setOrRequestChangeCore(vehicleId: string, dto: CreateVehicleChangeRequestDto, actorId: string) {
    const vehicle = await this.findOne(vehicleId);
    const field = CHANGE_TYPE_FIELD[dto.changeType];
    const currentValue = vehicle[field];

    if (currentValue === dto.requestedValue) {
      throw new ConflictException('requestedValue is the same as the current value.');
    }

    if (dto.changeType === VehicleChangeType.OWNER_CHANGE) {
      const owner = await this.prisma.vehicleOwner.findUnique({ where: { id: dto.requestedValue } });
      if (!owner) {
        throw new NotFoundException('Vehicle owner not found.');
      }
      await this.assertOwnerHasRoom(dto.requestedValue, vehicleId);
    }
    if (dto.changeType === VehicleChangeType.VEHICLE_TYPE_CHANGE) {
      const vehicleType = await this.prisma.vehicleType.findUnique({ where: { id: dto.requestedValue } });
      if (!vehicleType) {
        throw new NotFoundException('Vehicle type not found.');
      }
    }

    if (UNIQUE_CHANGE_TYPES.has(dto.changeType)) {
      const existing = await findVehicleByChangeValue(this.prisma, dto.changeType, dto.requestedValue);
      if (existing) {
        throw new ConflictException(`${field} is already in use by another vehicle.`);
      }
    }

    const FIRST_SET_ACTION: Record<VehicleChangeType, string> = {
      [VehicleChangeType.CHASSIS_CHANGE]: 'CHASSIS_SET',
      [VehicleChangeType.BOOKLET_CHANGE]: 'BOOKLET_SET',
      [VehicleChangeType.OWNER_CHANGE]: 'OWNER_SET',
      [VehicleChangeType.USAGE_TYPE_CHANGE]: 'USAGE_TYPE_SET',
      // currentPlate is never null (required at creation) — this branch is
      // unreachable for PLATE_CHANGE in practice, kept only so this map
      // stays exhaustive over every VehicleChangeType.
      [VehicleChangeType.PLATE_CHANGE]: 'PLATE_SET',
      [VehicleChangeType.VEHICLE_TYPE_CHANGE]: 'VEHICLE_TYPE_SET',
    };

    if (currentValue === null) {
      const updated = await this.prisma.$transaction(async (tx) => {
        if (dto.changeType === VehicleChangeType.VEHICLE_TYPE_CHANGE) {
          await assertPlateMayBeShared(tx, vehicle.normalizedPlate, dto.requestedValue, vehicleId);
        }
        const result = await tx.vehicle.update({
          where: { id: vehicleId },
          data: buildChangeUpdateData(dto.changeType, dto.requestedValue),
        });

        await this.audit.log(
          {
            userId: actorId,
            action: FIRST_SET_ACTION[dto.changeType],
            entityType: 'Vehicle',
            entityId: vehicleId,
            newValue: { [field]: dto.requestedValue },
          },
          tx,
        );

        return result;
      });

      return { requiresApproval: false as const, vehicle: updated };
    }

    const pending = await this.prisma.vehicleChangeRequest.findFirst({
      where: { vehicleId, changeType: dto.changeType, status: 'PENDING' },
    });
    if (pending) {
      throw new ConflictException(
        'A pending change request already exists for this vehicle and change type.',
      );
    }

    const request = await this.prisma.$transaction(async (tx) => {
      const created = await tx.vehicleChangeRequest.create({
        data: {
          vehicleId,
          changeType: dto.changeType,
          currentValue,
          requestedValue: dto.requestedValue,
          reason: dto.reason,
          requestedById: actorId,
        },
      });

      await this.audit.log(
        {
          userId: actorId,
          action: 'VEHICLE_CHANGE_REQUESTED',
          entityType: 'VehicleChangeRequest',
          entityId: created.id,
          newValue: { vehicleId, changeType: dto.changeType, requestedValue: dto.requestedValue },
        },
        tx,
      );

      return created;
    });

    return { requiresApproval: true as const, changeRequest: request };
  }

  listChangeRequests(query: FindChangeRequestsQueryDto) {
    return this.prisma.vehicleChangeRequest.findMany({
      where: query.status ? { status: query.status } : undefined,
      include: { vehicle: { select: { id: true, internalCode: true, currentPlate: true } } },
      skip: query.skip,
      take: query.take,
      orderBy: { createdAt: 'desc' },
    });
  }

  private async findChangeRequestOrThrow(id: string) {
    const request = await this.prisma.vehicleChangeRequest.findUnique({ where: { id } });
    if (!request) {
      throw new NotFoundException('Vehicle change request not found.');
    }
    return request;
  }

  async approveChangeRequest(id: string, actorId: string) {
    const decided = await this.approveChangeRequestCore(id, actorId);
    await this.notifications.notifyUsers([decided.requestedById], {
      kind: 'CORRECTION_APPROVED',
      title: 'تمت الموافقة على طلب التصحيح',
      body: 'طُبّق التصحيح الذي طلبته على بيانات المركبة.',
      link: `/vehicles/${decided.vehicleId}`,
      entityType: 'Vehicle',
      entityId: decided.vehicleId,
    });
    return decided;
  }

  private async approveChangeRequestCore(id: string, actorId: string) {
    const request = await this.findChangeRequestOrThrow(id);
    if (request.status !== 'PENDING') {
      throw new ConflictException(`This change request has already been ${request.status.toLowerCase()}.`);
    }

    const field = CHANGE_TYPE_FIELD[request.changeType];

    // Re-check at approval time, not just at request time — the target
    // value's availability can change in between (same reasoning as
    // changePlate's own re-check). Only meaningful for the two @unique
    // fields — OWNER_CHANGE/USAGE_TYPE_CHANGE have nothing to conflict with.
    if (UNIQUE_CHANGE_TYPES.has(request.changeType)) {
      const existing = await findVehicleByChangeValue(this.prisma, request.changeType, request.requestedValue);
      if (existing && existing.id !== request.vehicleId) {
        throw new ConflictException(`${field} is already in use by another vehicle.`);
      }
    }
    if (request.changeType === VehicleChangeType.OWNER_CHANGE) {
      const owner = await this.prisma.vehicleOwner.findUnique({ where: { id: request.requestedValue } });
      if (!owner) {
        throw new NotFoundException('Vehicle owner not found.');
      }
      await this.assertOwnerHasRoom(request.requestedValue, request.vehicleId);
    }
    if (request.changeType === VehicleChangeType.VEHICLE_TYPE_CHANGE) {
      const vehicleType = await this.prisma.vehicleType.findUnique({ where: { id: request.requestedValue } });
      if (!vehicleType) {
        throw new NotFoundException('Vehicle type not found.');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      if (request.changeType === VehicleChangeType.PLATE_CHANGE || request.changeType === VehicleChangeType.VEHICLE_TYPE_CHANGE) {
        const current = await tx.vehicle.findUniqueOrThrow({
          where: { id: request.vehicleId },
          select: { normalizedPlate: true, vehicleTypeId: true },
        });
        const plateRequest = request.changeType === VehicleChangeType.PLATE_CHANGE;
        await assertPlateMayBeShared(
          tx,
          plateRequest ? normalizePlate(request.requestedValue) : current.normalizedPlate,
          plateRequest ? current.vehicleTypeId : request.requestedValue,
          request.vehicleId,
        );
      }
      await applyIdentityChange(tx, request.vehicleId, request.changeType, request.requestedValue);

      const updatedRequest = await tx.vehicleChangeRequest.update({
        where: { id },
        data: { status: 'APPROVED', decidedById: actorId, decidedAt: new Date() },
      });

      await this.audit.log(
        {
          userId: actorId,
          action: 'VEHICLE_CHANGE_APPROVED',
          entityType: 'VehicleChangeRequest',
          entityId: id,
          oldValue: { [field]: request.currentValue },
          newValue: { [field]: request.requestedValue },
        },
        tx,
      );

      return updatedRequest;
    });
  }

  async rejectChangeRequest(id: string, dto: RejectVehicleChangeRequestDto, actorId: string) {
    const decided = await this.rejectChangeRequestCore(id, dto, actorId);
    await this.notifications.notifyUsers([decided.requestedById], {
      kind: 'CORRECTION_REJECTED',
      title: 'رُفض طلب التصحيح',
      body: decided.rejectionReason ? `السبب: ${decided.rejectionReason}` : 'رفضه مدير المكتب.',
      link: `/vehicles/${decided.vehicleId}`,
      entityType: 'Vehicle',
      entityId: decided.vehicleId,
    });
    return decided;
  }

  private async rejectChangeRequestCore(id: string, dto: RejectVehicleChangeRequestDto, actorId: string) {
    const request = await this.findChangeRequestOrThrow(id);
    if (request.status !== 'PENDING') {
      throw new ConflictException(`This change request has already been ${request.status.toLowerCase()}.`);
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedRequest = await tx.vehicleChangeRequest.update({
        where: { id },
        data: {
          status: 'REJECTED',
          decidedById: actorId,
          decidedAt: new Date(),
          rejectionReason: dto.reason,
        },
      });

      await this.audit.log(
        {
          userId: actorId,
          action: 'VEHICLE_CHANGE_REJECTED',
          entityType: 'VehicleChangeRequest',
          entityId: id,
          newValue: { rejectionReason: dto.reason },
        },
        tx,
      );

      return updatedRequest;
    });
  }
}
