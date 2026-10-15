import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { FillUpIdentification, Prisma } from '@prisma/client';
import { fuelTypeMismatch } from '@fuel-tracking/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RbacService } from '../rbac/rbac.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { FuelStockService } from '../fuel-stock/fuel-stock.service';
import { NotificationsService } from '../notifications/notifications.service';
import { normalizeScannedCardNumber } from '../cards/card-number';
import { FillUpsRepository } from './fillups.repository';
import { FillUpRuleEngine } from './rule-engine/fill-up-rule-engine';
import type { RuleFailureReason, RuleSubject, RuleTrigger } from './rule-engine/types';
import { CreateFillUpDto } from './dto/create-fillup.dto';
import { CreateExceptionTypeDto } from './dto/create-exception-type.dto';
import { UpdateExceptionTypeDto } from './dto/update-exception-type.dto';
import { ExceptionsService } from './exceptions.service';

const FILL_UP_WITH_EXCEPTION_INCLUDE = { exception: true } as const;

type ExistingFillUp = Prisma.FillUpTransactionGetPayload<{
  include: typeof FILL_UP_WITH_EXCEPTION_INCLUDE;
}>;

type VehicleWithOwner = Prisma.VehicleGetPayload<{ include: { owner: true } }>;

// A reused Idempotency-Key is only a valid retry if it describes the SAME
// fill-up. A different vehicleId/etc under the same key is a client bug
// (key collision or a copy-paste mistake), not a retry — it must never
// silently resolve to the wrong transaction.
function payloadMatchesExisting(dto: CreateFillUpDto, existing: ExistingFillUp, cardVehicleId: string | null): boolean {
  if (dto.vehicleId !== undefined && dto.vehicleId !== existing.vehicleId) return false;
  // A card names its vehicle: the same key with another vehicle's card is a
  // different fill-up. (A card that is unknown names no vehicle here; the
  // normal path reports it.)
  if (cardVehicleId !== null && cardVehicleId !== existing.vehicleId) return false;
  if (dto.stationId !== existing.stationId) return false;
  if (dto.fuelType !== existing.fuelType) return false;
  if (!existing.quantityLiters.equals(dto.quantityLiters)) return false;
  if (dto.occurredAt !== undefined) {
    if (new Date(dto.occurredAt).getTime() !== existing.occurredAt.getTime()) return false;
  }
  return true;
}

// Who a fill-up is for and how it was identified, decided on the server from
// whatever the client sent - the client never gets to claim "card scan". Since
// Phase 6 a fill-up is recorded from a CARD SCAN; the only other way in is a
// REGISTERED vehicle found by search, with the reason its card could not be
// used (recorded as NO_CARD, «بدون بطاقة»).
type ResolvedSubject = {
  vehicle: VehicleWithOwner;
  identifiedBy: 'CARD_SCAN' | 'NO_CARD';
  noCardReason: string | null;
};

interface RecordingContext {
  municipalityId: string;
  municipalityName: string;
}

@Injectable()
export class FillUpsService {
  private readonly ruleEngine: FillUpRuleEngine;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rbac: RbacService,
    private readonly settings: SystemSettingsService,
    private readonly repo: FillUpsRepository,
    private readonly fuelStock: FuelStockService,
    private readonly notifications: NotificationsService,
    private readonly exceptions: ExceptionsService,
  ) {
    // Constructed directly rather than DI-injected: FillUpRuleEngine takes
    // plain SettingsReader/FillUpHistoryReader interfaces (see
    // rule-engine/types.ts) so it stays independently unit-testable without
    // Nest's TestingModule. Phase 6: no standing exceptions are wired in.
    this.ruleEngine = new FillUpRuleEngine(this.settings, this.repo);
  }

  private async assertStationInScope(stationId: string, actorId: string) {
    const scope = await this.rbac.getStationScope(actorId);
    if (scope !== null && !scope.includes(stationId)) {
      throw new ForbiddenException('You do not have access to this station.');
    }
  }

  // The pre-submit rule-review breakdown: every applicable rule's real
  // actual/limit numbers, computed by the SAME rule engine a real submission
  // uses, never a separate client-side estimate. It identifies the vehicle
  // through the same step create() uses (resolveSubject), so the preview of a
  // card scan or a no-card search can't disagree with the real submit.
  async previewRules(
    input: {
      vehicleId?: string;
      cardNumber?: string;
      noCardReason?: string;
      fuelType?: 'PETROL_95' | 'DIESEL' | 'KEROSENE';
    },
    stationId: string,
    actorId: string,
  ) {
    await this.assertStationInScope(stationId, actorId);
    const context = await this.resolveRecordingContext(stationId);
    const subject = await this.resolveSubject(input);
    const { checks, skipped, skippedBecause, disabled } = await this.ruleEngine.evaluateSubjectWithChecks(
      this.toRuleSubject(subject),
      context.municipalityId,
      new Date(),
    );
    const vehicleFuelType = subject.vehicle.fuelType;
    return {
      checks,
      skippedRules: skipped,
      skippedReason: skippedBecause,
      // Rules the super admin has switched off - not applied at all.
      disabledRules: disabled,
      // The vehicle's own fuel type, and (when the screen says which fuel is
      // chosen) whether it matches - a warning, never a block.
      vehicleFuelType,
      fuelMismatch: input.fuelType ? fuelTypeMismatch(vehicleFuelType, input.fuelType) : false,
      identifiedBy: subject.identifiedBy,
      registered: true,
      vehicleId: subject.vehicle.id,
      plate: null as string | null,
    };
  }

  // The municipality a fill-up at this station is recorded in — stamped
  // onto the FillUpTransaction and used to scope every rule-engine count.
  // Refuses (machine-checkable markers, mapped to Arabic by the fill-up
  // screen) rather than ever stamping null: STATION_ARCHIVED,
  // MUNICIPALITY_ARCHIVED, STATION_HAS_NO_MUNICIPALITY.
  private async resolveRecordingContext(stationId: string): Promise<RecordingContext> {
    const station = await this.prisma.station.findUnique({
      where: { id: stationId },
      select: { municipality: true, archivedAt: true },
    });
    if (!station) {
      throw new NotFoundException('Station not found.');
    }
    // An archived station (or a station of an archived municipality) takes no
    // new fill-ups - its history stays.
    if (station.archivedAt) {
      throw new ConflictException('STATION_ARCHIVED');
    }
    if (station.municipality?.archivedAt) {
      throw new ConflictException('MUNICIPALITY_ARCHIVED');
    }
    if (!station.municipality) {
      throw new ConflictException('STATION_HAS_NO_MUNICIPALITY');
    }
    // The municipality's activation switch gates nothing (Phase 6): a
    // fill-up is recorded whether it is on or off.
    return {
      municipalityId: station.municipality.id,
      municipalityName: station.municipality.name,
    };
  }

  // Phase 5B: the station's supervisor chooses which fuel types it sells now.
  // A station with none chosen yet is unrestricted (nothing has been set up);
  // once any is set, a fuel type not offered is refused here, not just hidden.
  private async assertFuelTypeSold(stationId: string, fuelType: string) {
    const rows = await this.prisma.stationFuelAvailability.findMany({
      where: { stationId },
      select: { fuelType: true, isAvailable: true },
    });
    if (rows.length === 0) return;
    const offered = rows.some((r) => r.fuelType === fuelType && r.isAvailable);
    if (!offered) {
      throw new ConflictException('FUEL_TYPE_NOT_SOLD_HERE');
    }
  }

  // What a recorded fill-up sets in motion. Best effort - none of it may fail
  // a fill-up that is already recorded.
  private async afterRecorded(input: {
    stationId: string;
    fuelType: 'PETROL_95' | 'DIESEL' | 'KEROSENE';
    fuelMismatch: boolean;
    actorId: string;
  }) {
    try {
      await this.fuelStock.afterChange(input.stationId, input.fuelType);
      const station = await this.prisma.station.findUnique({
        where: { id: input.stationId },
        select: { name: true },
      });
      const where = station?.name ?? '';
      if (input.fuelMismatch) {
        await this.notifications.notifyScope(
          { stationId: input.stationId },
          ['notifications:station_events'],
          {
            kind: 'FUEL_MISMATCH',
            title: `نوع وقود لا يطابق المركبة في ${where}`,
            body: 'سُجّلت تعبئة بنوع وقود مختلف عن نوع وقود المركبة المسجّل.',
            link: '/reports',
            entityType: 'Station',
            entityId: input.stationId,
          },
          { exceptUserId: input.actorId },
        );
      }
    } catch {
      // never fails the fill-up
    }
  }

  // Decides who the fill-up is for, from what the client sent:
  //  1. a cardNumber must be an ACTIVE card - its vehicle is the vehicle;
  //  2. without a card, a REGISTERED vehicle named by id with the reason its
  //     card could not be used (recorded as NO_CARD). It never works for a
  //     vehicle that is not registered;
  //  3. anything else is CARD_REQUIRED - the pump never accepts a plate on its
  //     own.
  private async resolveSubject(input: {
    vehicleId?: string;
    cardNumber?: string;
    noCardReason?: string;
  }): Promise<ResolvedSubject> {
    if (input.cardNumber !== undefined) {
      const cardNumber = normalizeScannedCardNumber(input.cardNumber);
      const card = cardNumber
        ? await this.prisma.vehicleCard.findUnique({
            where: { cardNumber },
            include: { vehicle: { include: { owner: true } } },
          })
        : null;
      if (!card) {
        throw new NotFoundException('CARD_NOT_FOUND');
      }
      if (card.status !== 'ACTIVE') {
        throw new ConflictException({ message: 'CARD_REVOKED', details: { status: card.status } });
      }
      if (input.vehicleId !== undefined && input.vehicleId !== card.vehicleId) {
        throw new BadRequestException('CARD_VEHICLE_MISMATCH');
      }
      if (input.noCardReason !== undefined) {
        // Nothing to excuse: don't let "no card" be recorded on a fill-up that
        // had a card (it would fake a missing card in the reports).
        throw new ConflictException('NO_CARD_NOT_NEEDED');
      }
      return { vehicle: card.vehicle, identifiedBy: 'CARD_SCAN', noCardReason: null };
    }

    if (input.vehicleId === undefined || input.noCardReason === undefined) {
      throw new ConflictException('CARD_REQUIRED');
    }
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: input.vehicleId }, include: { owner: true } });
    if (!vehicle) {
      throw new NotFoundException('VEHICLE_NOT_REGISTERED');
    }
    return { vehicle, identifiedBy: 'NO_CARD', noCardReason: input.noCardReason };
  }

  private toRuleSubject(subject: ResolvedSubject): RuleSubject {
    return {
      kind: 'vehicle',
      vehicleId: subject.vehicle.id,
      ownerId: subject.vehicle.ownerId,
    };
  }

  // Human-readable snapshot of the specific prior fill-up that triggered a
  // rule — used both for the Exception.triggerDetail persisted at
  // submission time and for the inline 422 rejection response.
  private async describeTrigger(trigger: RuleTrigger | undefined) {
    if (!trigger) {
      return null;
    }
    const vehicle = trigger.vehicleId
      ? await this.prisma.vehicle.findUnique({
          where: { id: trigger.vehicleId },
          select: { internalCode: true, currentPlate: true },
        })
      : null;
    return {
      vehicleId: trigger.vehicleId,
      vehicleInternalCode: vehicle?.internalCode ?? null,
      vehicleCurrentPlate: vehicle?.currentPlate ?? null,
      // ISO string, not a raw Date — this is stored as JSON (Exception.
      // triggerDetail) and returned as JSON over the API either way.
      occurredAt: trigger.occurredAt.toISOString(),
    };
  }

  async create(dto: CreateFillUpDto, idempotencyKey: string, actorId: string) {
    // CLAUDE.md rule 3 (non-negotiable): station-scoped access is enforced
    // server-side for every station-data endpoint, not just reads. This
    // MUST run before the idempotency-key lookup below, checked against
    // dto.stationId (client-declared) rather than anything read off an
    // existing row — otherwise an out-of-scope actor who has (or guesses)
    // someone else's Idempotency-Key could retrieve that fill-up's full
    // data via the 200-replay path without ever hitting this check.
    await this.assertStationInScope(dto.stationId, actorId);

    // Idempotency: a retried POST with the same key resolves to the SAME
    // row, never a new one — "a flaky station connection retrying a POST
    // should never double-record a fill-up".
    const existing = await this.prisma.fillUpTransaction.findUnique({
      where: { idempotencyKey },
      include: FILL_UP_WITH_EXCEPTION_INCLUDE,
    });
    if (existing) {
      const cardNumber = dto.cardNumber !== undefined ? normalizeScannedCardNumber(dto.cardNumber) : null;
      const cardVehicleId = cardNumber
        ? ((await this.prisma.vehicleCard.findUnique({ where: { cardNumber }, select: { vehicleId: true } }))?.vehicleId ?? null)
        : null;
      if (!payloadMatchesExisting(dto, existing, cardVehicleId)) {
        throw new ConflictException(
          'This Idempotency-Key was already used for a different fill-up (mismatched vehicle, station, fuel type, quantity, or occurredAt). Use a new key for a new submission.',
        );
      }
      return { status: 'existing' as const, transaction: existing };
    }

    // Resolved once here and stamped onto the row below — never looked up
    // again through the station afterward.
    const context = await this.resolveRecordingContext(dto.stationId);
    const municipalityId = context.municipalityId;
    await this.assertFuelTypeSold(dto.stationId, dto.fuelType);
    const subject = await this.resolveSubject(dto);
    const ruleSubject = this.toRuleSubject(subject);
    const vehicle = subject.vehicle;
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
    const exceptionModeFieldsPresent = Boolean(dto.exceptionTypeId ?? dto.reason);

    const baseData = {
      vehicleId: vehicle.id,
      stationId: dto.stationId,
      municipalityId,
      fuelType: dto.fuelType,
      quantityLiters: dto.quantityLiters,
      occurredAt,
      recordedById: actorId,
      idempotencyKey,
      identifiedBy: subject.identifiedBy as FillUpIdentification,
      noCardReason: subject.noCardReason,
      // Phase 5A: the fuel poured is not the vehicle's own fuel type - a
      // warning at the pump, recorded here so reports can list mismatches.
      fuelMismatch: fuelTypeMismatch(vehicle.fuelType, dto.fuelType),
    };
    const auditBase = {
      vehicleId: baseData.vehicleId,
      stationId: baseData.stationId,
      municipalityId,
      identifiedBy: subject.identifiedBy,
      noCardReason: subject.noCardReason ?? undefined,
      fuelMismatch: baseData.fuelMismatch || undefined,
    };
    const auditAction = subject.identifiedBy === 'NO_CARD' ? 'FILLUP_NO_CARD' : 'CREATE';

    // The rule engine's verdict. Run once for both branches: a plain fill-up is
    // refused with it, an exception records which rule was overridden.
    const verdict = await this.ruleEngine.evaluateSubject(ruleSubject, municipalityId, occurredAt);

    if (!exceptionModeFieldsPresent) {
      if (!verdict.allowed) {
        return {
          status: 'rejected' as const,
          reason: verdict.reason,
          trigger: await this.describeTrigger(verdict.trigger),
        };
      }
      const created = await this.prisma.$transaction(async (tx) => {
        const row = await tx.fillUpTransaction.create({ data: { ...baseData, isException: false } });
        await this.audit.log(
          {
            userId: actorId,
            action: auditAction,
            entityType: 'FillUpTransaction',
            entityId: row.id,
            newValue: { ...auditBase, isException: false },
          },
          tx,
        );
        return row;
      });
      const transaction = await this.prisma.fillUpTransaction.findUniqueOrThrow({
        where: { id: created.id },
        include: FILL_UP_WITH_EXCEPTION_INCLUDE,
      });
      await this.afterRecorded({ stationId: dto.stationId, fuelType: dto.fuelType, fuelMismatch: baseData.fuelMismatch, actorId });
      return { status: 'created' as const, transaction };
    }

    // ── Exception mode (Phase 6) ────────────────────────────────────────
    // A rule blocked the fill-up and the employee picked an active exception
    // type with a short reason. No approval step: it is recorded at once,
    // counted against the type's daily limit at this station, flagged when
    // over it (refused when the strict switch is on), and logged with who,
    // station, vehicle, type, the rule overridden, the reason and the time.
    const permissions = await this.rbac.getPermissionsForUser(actorId);
    if (!permissions.has('fillups:record_exception')) {
      throw new ForbiddenException('You are not authorized to record fill-ups as exceptions.');
    }
    if (!dto.reason?.trim()) {
      throw new BadRequestException('reason is required when submitting a fill-up with an exception.');
    }
    if (!dto.exceptionTypeId) {
      throw new BadRequestException('exceptionTypeId is required when submitting a fill-up with an exception.');
    }
    const exceptionType = await this.prisma.exceptionType.findUnique({ where: { id: dto.exceptionTypeId } });
    if (!exceptionType || !exceptionType.isActive) {
      throw new NotFoundException('Exception type not found or inactive.');
    }
    const triggerReason: RuleFailureReason | null = verdict.allowed ? null : verdict.reason;
    const triggerDetail = verdict.allowed ? null : await this.describeTrigger(verdict.trigger);
    const use = await this.exceptions.assessUse({
      type: exceptionType,
      stationId: dto.stationId,
      municipalityId,
      triggerReason,
      at: occurredAt,
    });

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.fillUpTransaction.create({ data: { ...baseData, isException: true } });
      await tx.exception.create({
        data: {
          fillUpTransactionId: row.id,
          exceptionTypeId: exceptionType.id,
          reason: dto.reason!.trim(),
          // No approval step: the person who used it is recorded as approver
          // so every exception row reads as settled.
          approvedById: actorId,
          triggerReason,
          triggerDetail: triggerDetail ?? undefined,
          overLimit: use.over,
        },
      });
      await this.audit.log(
        {
          userId: actorId,
          action: auditAction,
          entityType: 'FillUpTransaction',
          entityId: row.id,
          newValue: {
            ...auditBase,
            isException: true,
            exceptionTypeId: exceptionType.id,
            ruleOverridden: triggerReason ?? undefined,
            overLimit: use.over || undefined,
          },
        },
        tx,
      );
      return row;
    });

    const transaction = await this.prisma.fillUpTransaction.findUniqueOrThrow({
      where: { id: created.id },
      include: FILL_UP_WITH_EXCEPTION_INCLUDE,
    });
    await this.afterRecorded({ stationId: dto.stationId, fuelType: dto.fuelType, fuelMismatch: baseData.fuelMismatch, actorId });
    await this.exceptions.afterUse({
      stationId: dto.stationId,
      municipalityId,
      typeId: exceptionType.id,
      typeName: exceptionType.name,
      use,
      at: occurredAt,
      actorId,
    });
    return { status: 'created' as const, transaction };
  }

  // The fuel price per liter (SystemSetting, CLAUDE.md rule 4), gated on
  // fillups:create since any station employee who can record a fill-up needs
  // to see it.
  async getFuelPrices(): Promise<Record<'PETROL_95' | 'DIESEL' | 'KEROSENE', number>> {
    const [petrol95, diesel, kerosene] = await Promise.all([
      this.settings.getNumber('fillup.price_per_liter.PETROL_95'),
      this.settings.getNumber('fillup.price_per_liter.DIESEL'),
      this.settings.getNumber('fillup.price_per_liter.KEROSENE'),
    ]);
    return { PETROL_95: petrol95, DIESEL: diesel, KEROSENE: kerosene };
  }

  // The active exception types a fill-up at this station can use, with today's
  // uses and the strict switch (Phase 6). Without a station, every active type.
  listActiveExceptionTypes(stationId: string | undefined, actorId: string) {
    if (stationId) return this.exceptions.typesForStation(stationId, actorId);
    return this.prisma.exceptionType.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  }

  // The management view: every type, including inactive. A municipality
  // manager sees the global types (read only) and their own municipality's.
  async listAllExceptionTypes(actorId: string) {
    const scope = await this.rbac.getMunicipalityScope(actorId);
    return this.prisma.exceptionType.findMany({
      where: scope === null ? {} : { OR: [{ municipalityId: null }, { municipalityId: { in: scope } }] },
      orderBy: { name: 'asc' },
    });
  }

  // The super admin manages global types (and any municipality's); a
  // municipality manager only their own municipality's (CLAUDE.md rule 3).
  private async resolveTypeMunicipality(requested: string | undefined, actorId: string): Promise<string | null> {
    const scope = await this.rbac.getMunicipalityScope(actorId);
    if (scope === null) {
      return requested ?? null;
    }
    const municipalityId = requested ?? (scope.length === 1 ? scope[0]! : undefined);
    if (!municipalityId || !scope.includes(municipalityId)) {
      throw new ForbiddenException('You can manage exception types of your own municipality only.');
    }
    return municipalityId;
  }

  async createExceptionType(dto: CreateExceptionTypeDto, actorId: string) {
    const existing = await this.prisma.exceptionType.findUnique({ where: { key: dto.key } });
    if (existing) {
      throw new ConflictException('key is already in use.');
    }
    const municipalityId = await this.resolveTypeMunicipality(dto.municipalityId, actorId);

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.exceptionType.create({
        data: {
          key: dto.key,
          name: dto.name,
          overridableRules: dto.overridableRules ?? [],
          dailyLimitPerStation: dto.dailyLimitPerStation ?? null,
          municipalityId,
        },
      });
      await this.audit.log(
        {
          userId: actorId,
          action: 'CREATE',
          entityType: 'ExceptionType',
          entityId: created.id,
          newValue: {
            key: created.key,
            name: created.name,
            overridableRules: created.overridableRules,
            dailyLimitPerStation: created.dailyLimitPerStation,
            municipalityId: created.municipalityId,
          },
        },
        tx,
      );
      return created;
    });
  }

  async updateExceptionType(id: string, dto: UpdateExceptionTypeDto, actorId: string) {
    const before = await this.prisma.exceptionType.findUnique({ where: { id } });
    if (!before) {
      throw new NotFoundException('Exception type not found.');
    }
    const scope = await this.rbac.getMunicipalityScope(actorId);
    if (scope !== null && (before.municipalityId === null || !scope.includes(before.municipalityId))) {
      throw new ForbiddenException('You can manage exception types of your own municipality only.');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.exceptionType.update({ where: { id }, data: dto });
      await this.audit.log(
        {
          userId: actorId,
          action: 'UPDATE',
          entityType: 'ExceptionType',
          entityId: id,
          oldValue: {
            name: before.name,
            isActive: before.isActive,
            overridableRules: before.overridableRules,
            dailyLimitPerStation: before.dailyLimitPerStation,
          },
          newValue: {
            name: updated.name,
            isActive: updated.isActive,
            overridableRules: updated.overridableRules,
            dailyLimitPerStation: updated.dailyLimitPerStation,
          },
        },
        tx,
      );
      return updated;
    });
  }
}
