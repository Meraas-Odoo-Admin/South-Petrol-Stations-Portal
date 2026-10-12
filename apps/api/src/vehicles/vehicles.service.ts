import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, VehicleChangeType, VehicleUsageType } from '@prisma/client';
import { normalizePlate, plateSearchTerm } from '@fuel-tracking/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { FindVehiclesQueryDto, OwnerIdentityStatusFilter, VehicleSortField } from './dto/find-vehicles-query.dto';
import { PlateChangeDto } from './dto/plate-change.dto';
import { CreateVehicleChangeRequestDto } from './dto/create-change-request.dto';
import { RejectVehicleChangeRequestDto } from './dto/reject-change-request.dto';
import { FindChangeRequestsQueryDto } from './dto/find-change-requests-query.dto';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { resolveWeekWindowStrategy } from '../fillups/rule-engine/week-window.strategy';
import { RegistrationStationsService } from '../registration-stations/registration-stations.service';
import { DuplicateCheckQueryDto } from './dto/duplicate-check-query.dto';

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

const UNIQUE_CHANGE_TYPES: Set<VehicleChangeType> = new Set([
  VehicleChangeType.CHASSIS_CHANGE,
  VehicleChangeType.BOOKLET_CHANGE,
  VehicleChangeType.PLATE_CHANGE,
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
      return prisma.vehicle.findUnique({ where: { registrationBooklet: value } });
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

@Injectable()
export class VehiclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SystemSettingsService,
    private readonly registrationStations: RegistrationStationsService,
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

  async findDuplicates(values: DuplicateCheckQueryDto): Promise<{ conflicts: VehicleDuplicate[] }> {
    const select = { id: true, internalCode: true, currentPlate: true } as const;
    const checks: Array<[VehicleDuplicate['field'], Promise<VehicleDuplicate['vehicle'] | null>]> = [];
    if (values.currentPlate) {
      // By the normalized plate (and the stored text, for rows that predate
      // the column): `8-1234567`, `8 1234567` and `٨-١٢٣٤٥٦٧` are one plate.
      checks.push([
        'currentPlate',
        this.prisma.vehicle.findFirst({
          where: { OR: plateMatchClauses(values.currentPlate) },
          select,
        }),
      ]);
    }
    if (values.chassisNumber) {
      checks.push(['chassisNumber', this.prisma.vehicle.findUnique({ where: { chassisNumber: values.chassisNumber }, select })]);
    }
    if (values.registrationBooklet) {
      checks.push([
        'registrationBooklet',
        this.prisma.vehicle.findUnique({ where: { registrationBooklet: values.registrationBooklet }, select }),
      ]);
    }
    const conflicts: VehicleDuplicate[] = [];
    for (const [field, lookup] of checks) {
      const vehicle = await lookup;
      if (vehicle) {
        conflicts.push({ field, vehicle });
      }
    }
    return { conflicts };
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
      const clash = await tx.vehicle.findFirst({
        where: { normalizedPlate },
        select: { id: true, internalCode: true, currentPlate: true },
      });
      if (clash) {
        // On its own connection, so the record survives this transaction's rollback.
        await this.recordDuplicateCatch(registrationStationId, actorId, ['currentPlate']);
        throw new ConflictException({
          message: 'VEHICLE_DUPLICATE',
          details: { conflicts: [{ field: 'currentPlate', vehicle: clash }] },
        });
      }

      const vehicle = await tx.vehicle.create({
        data: {
          ...vehicleFields,
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
      const linked = await tx.fillUpTransaction.updateMany({
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
  findAll(query: FindVehiclesQueryDto) {
    const ownerIdentityFilter: Record<OwnerIdentityStatusFilter, object> = {
      [OwnerIdentityStatusFilter.VERIFIED]: {
        owner: { identityType: { in: ['NATIONAL_ID', 'ADMINISTRATIVE_ID'] } },
      },
      [OwnerIdentityStatusFilter.PROVISIONAL]: { owner: { identityType: 'DRIVERS_LICENSE' } },
      [OwnerIdentityStatusFilter.MISSING]: { ownerId: null },
    };

    const sortOrderBy: Record<VehicleSortField, object> = {
      [VehicleSortField.CREATED_AT]: { createdAt: 'desc' },
      [VehicleSortField.INTERNAL_CODE]: { internalCode: 'asc' },
      [VehicleSortField.CURRENT_PLATE]: { currentPlate: 'asc' },
    };

    return this.prisma.vehicle.findMany({
      where: {
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
        model: query.brand ? { equals: query.brand } : undefined,
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
              { owner: { fullName: { contains: query.search, mode: 'insensitive' } } },
              { owner: { identityNumber: { contains: query.search } } },
            ]
          : undefined,
      },
      include: {
        owner: { select: { id: true, fullName: true, identityType: true, identityNumber: true, phone: true } },
        vehicleType: { select: { id: true, name: true } },
      },
      skip: query.skip,
      take: query.take,
      orderBy: sortOrderBy[query.sort ?? VehicleSortField.CREATED_AT],
    });
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
        owner: { select: { id: true, fullName: true, identityType: true, identityNumber: true, phone: true } },
        vehicleType: { select: { id: true, name: true } },
        plateHistory: { orderBy: { validFrom: 'asc' } },
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
          oldValue: { model: before.model, color: before.color, manufactureYear: before.manufactureYear },
          newValue: { model: vehicle.model, color: vehicle.color, manufactureYear: vehicle.manufactureYear },
        },
        tx,
      );

      return vehicle;
    });
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
    const existingByPlate = await this.prisma.vehicle.findFirst({
      where: { id: { not: id }, OR: plateMatchClauses(dto.newPlate) },
    });
    if (existingByPlate) {
      throw new ConflictException('currentPlate is already in use by another vehicle.');
    }

    return this.prisma.$transaction(async (tx) => {
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
          proofReference: dto.proofReference,
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
    }
    if (request.changeType === VehicleChangeType.VEHICLE_TYPE_CHANGE) {
      const vehicleType = await this.prisma.vehicleType.findUnique({ where: { id: request.requestedValue } });
      if (!vehicleType) {
        throw new NotFoundException('Vehicle type not found.');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      if (request.changeType === VehicleChangeType.CHASSIS_CHANGE) {
        const currentHistoryRow = await tx.vehicleChassisHistory.findFirst({
          where: { vehicleId: request.vehicleId, validTo: null },
          orderBy: { validFrom: 'desc' },
        });
        if (currentHistoryRow) {
          await tx.vehicleChassisHistory.update({
            where: { id: currentHistoryRow.id },
            data: { validTo: new Date() },
          });
        }
        await tx.vehicleChassisHistory.create({
          data: { vehicleId: request.vehicleId, chassisNumber: request.requestedValue },
        });
      } else if (request.changeType === VehicleChangeType.BOOKLET_CHANGE) {
        const currentHistoryRow = await tx.vehicleBookletHistory.findFirst({
          where: { vehicleId: request.vehicleId, validTo: null },
          orderBy: { validFrom: 'desc' },
        });
        if (currentHistoryRow) {
          await tx.vehicleBookletHistory.update({
            where: { id: currentHistoryRow.id },
            data: { validTo: new Date() },
          });
        }
        await tx.vehicleBookletHistory.create({
          data: { vehicleId: request.vehicleId, registrationBooklet: request.requestedValue },
        });
      } else if (request.changeType === VehicleChangeType.PLATE_CHANGE) {
        // Same close-old/open-new pattern as changePlate() below — a
        // change-request-approved plate change must leave the same
        // unbroken VehiclePlateHistory trail a direct change would.
        const currentHistoryRow = await tx.vehiclePlateHistory.findFirst({
          where: { vehicleId: request.vehicleId, validTo: null },
          orderBy: { validFrom: 'desc' },
        });
        if (currentHistoryRow) {
          await tx.vehiclePlateHistory.update({
            where: { id: currentHistoryRow.id },
            data: { validTo: new Date() },
          });
        }
        await tx.vehiclePlateHistory.create({
          data: { vehicleId: request.vehicleId, plate: request.requestedValue },
        });
      }
      // OWNER_CHANGE/USAGE_TYPE_CHANGE/VEHICLE_TYPE_CHANGE: no dedicated
      // history table (see CHANGE_TYPE_FIELD's own comment) — the field
      // update below plus this request row's own audit trail is the
      // complete record.

      await tx.vehicle.update({
        where: { id: request.vehicleId },
        data: buildChangeUpdateData(request.changeType, request.requestedValue),
      });

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
