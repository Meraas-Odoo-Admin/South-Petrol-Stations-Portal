import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { FillUpIdentification, Prisma } from '@prisma/client';
import { fuelTypeMismatch, normalizePlate } from '@fuel-tracking/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RbacService } from '../rbac/rbac.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { RegistrationStationsService } from '../registration-stations/registration-stations.service';
import { calendarDayString, computeStage, type MunicipalityStage } from '../common/utils/grace-stage';
import { normalizeScannedCardNumber } from '../cards/card-number';
import { FillUpsRepository, StandingExceptionsRepository } from './fillups.repository';
import { FillUpRuleEngine } from './rule-engine/fill-up-rule-engine';
import type { RuleSubject, RuleTrigger } from './rule-engine/types';
import { CreateFillUpDto } from './dto/create-fillup.dto';
import { CreateExceptionTypeDto } from './dto/create-exception-type.dto';
import { UpdateExceptionTypeDto } from './dto/update-exception-type.dto';

const FILL_UP_WITH_EXCEPTION_INCLUDE = { exception: true } as const;

type ExistingFillUp = Prisma.FillUpTransactionGetPayload<{
  include: typeof FILL_UP_WITH_EXCEPTION_INCLUDE;
}>;

type VehicleWithOwner = Prisma.VehicleGetPayload<{ include: { owner: true } }>;

// The key the exceptions flow records an override under (ExceptionType is a
// lookup table — CLAUDE.md rule 5 — so the row is created on first use if an
// admin hasn't already added it).
const EMERGENCY_EXCEPTION_TYPE = { key: 'emergency', name: 'طوارئ — تجاوز شرط البطاقة', requiresProof: false } as const;

// A reused Idempotency-Key is only a valid retry if it describes the SAME
// fill-up. A different vehicleId/etc under the same key is a client bug
// (key collision or a copy-paste mistake), not a retry — it must never
// silently resolve to the wrong transaction.
function payloadMatchesExisting(dto: CreateFillUpDto, existing: ExistingFillUp): boolean {
  if (dto.vehicleId !== undefined && dto.vehicleId !== existing.vehicleId) return false;
  // A typed plate that named no vehicle must still be the same plate. (A
  // plate typed for a registered vehicle resolves to it, so only an
  // unregistered row is compared here.)
  if (dto.vehicleId === undefined && dto.plate !== undefined && existing.vehicleId === null) {
    if (normalizePlate(dto.plate) !== existing.normalizedPlate) return false;
  }
  if (dto.stationId !== existing.stationId) return false;
  if (dto.fuelType !== existing.fuelType) return false;
  if (!existing.quantityLiters.equals(dto.quantityLiters)) return false;
  if (dto.occurredAt !== undefined) {
    if (new Date(dto.occurredAt).getTime() !== existing.occurredAt.getTime()) return false;
  }
  return true;
}

// Who a fill-up is for and how it was identified, decided on the server from
// whatever the client sent — the client never gets to claim "card scan".
type ResolvedSubject =
  | {
      kind: 'vehicle';
      vehicle: VehicleWithOwner;
      identifiedBy: 'CARD_SCAN' | 'TYPED_REGISTERED';
      typedPlate: string | null;
      normalizedPlate: string | null;
    }
  | { kind: 'plate'; identifiedBy: 'TYPED_UNREGISTERED'; typedPlate: string; normalizedPlate: string };

interface RecordingContext {
  municipalityId: string;
  municipalityName: string;
  stage: MunicipalityStage;
  cardRequiredFromDate: string | null;
}

interface Awareness {
  cardRequiredFromDate: string;
  registrationStations: { id: string; name: string; address: string; workingHours: string | null }[];
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
    private readonly standingExceptionsRepo: StandingExceptionsRepository,
    private readonly registrationStations: RegistrationStationsService,
  ) {
    // Constructed directly rather than DI-injected: FillUpRuleEngine takes
    // plain SettingsReader/FillUpHistoryReader/StandingExceptionReader
    // interfaces (see rule-engine/types.ts) so it stays independently
    // unit-testable without Nest's TestingModule.
    // SystemSettingsService/FillUpsRepository/StandingExceptionsRepository
    // are the real Prisma-backed implementations of those interfaces.
    this.ruleEngine = new FillUpRuleEngine(this.settings, this.repo, this.standingExceptionsRepo);
  }

  private async assertStationInScope(stationId: string, actorId: string) {
    const scope = await this.rbac.getStationScope(actorId);
    if (scope !== null && !scope.includes(stationId)) {
      throw new ForbiddenException('You do not have access to this station.');
    }
  }

  // Round 7 item 1: the fill-up form's pre-submit rule-review screen —
  // returns every applicable rule's real actual/limit numbers, computed by
  // the SAME rule engine a real submission uses (FillUpRuleEngine.
  // evaluateWithChecks), never a separate client-side estimate. Gated on
  // fillups:create (not vehicles:read) since it's part of the fill-up
  // recording flow specifically, same reasoning as getFuelPrices/
  // listExceptionTypes below.
  //
  // Registration pivot, phase 1: allowances are per municipality, so the
  // preview needs the station too — it resolves the municipality exactly
  // the way create() does (same scope check, same refusal for a station
  // with no municipality or one that isn't live), so the numbers shown are
  // the ones a real submit at that station will be judged by.
  //
  // Phase 4a: it identifies the vehicle and enforces the card requirement
  // through the very same two steps create() uses (resolveSubject,
  // enforceCardRequirement), so the preview for a typed or unregistered
  // plate — including the refusal after the deadline — can't disagree with
  // the real submit.
  async previewRules(
    input: {
      vehicleId?: string;
      cardNumber?: string;
      plate?: string;
      emergencyOverride?: boolean;
      fuelType?: 'PETROL_95' | 'DIESEL' | 'KEROSENE';
    },
    stationId: string,
    actorId: string,
  ) {
    await this.assertStationInScope(stationId, actorId);
    const context = await this.resolveRecordingContext(stationId);
    const subject = await this.resolveSubject(input, context);
    const identifiedBy = await this.enforceCardRequirement(subject, context, {
      emergencyOverride: input.emergencyOverride,
      overrideReason: 'preview',
      actorId,
    });
    const ruleSubject = this.toRuleSubject(subject);
    const { checks, skipped, skippedBecause, disabled } = await this.ruleEngine.evaluateSubjectWithChecks(
      ruleSubject,
      context.municipalityId,
      new Date(),
    );
    const vehicleFuelType = subject.kind === 'vehicle' ? subject.vehicle.fuelType : null;
    return {
      checks,
      // Rules that can't be evaluated for this subject (the three owner-level
      // rules for an unregistered plate or an institution's vehicle) — the
      // screen says so, and why.
      skippedRules: skipped,
      skippedReason: skippedBecause,
      // Rules the super admin has switched off - not applied at all.
      disabledRules: disabled,
      // The vehicle's own fuel type, and (when the screen says which fuel is
      // chosen) whether it matches - a warning, never a block.
      vehicleFuelType,
      fuelMismatch: input.fuelType ? fuelTypeMismatch(vehicleFuelType, input.fuelType) : false,
      identifiedBy,
      registered: subject.kind === 'vehicle',
      stage: context.stage,
      cardRequiredFromDate: context.cardRequiredFromDate,
      vehicleId: subject.kind === 'vehicle' ? subject.vehicle.id : null,
      plate: subject.kind === 'plate' ? subject.typedPlate : null,
    };
  }

  // The municipality a fill-up at this station is recorded in — stamped
  // onto the FillUpTransaction and used to scope every rule-engine count.
  // Refuses (machine-checkable markers, mapped to Arabic by the fill-up
  // screen — same convention as OWNER_IDENTITY_PROVISIONAL) rather than
  // ever stamping null:
  //  - STATION_HAS_NO_MUNICIPALITY: Station.municipalityId is still null.
  //  - MUNICIPALITY_NOT_LIVE: the municipality is still PREPARING — no
  //    fill-up can be recorded there until an admin switches it to LIVE.
  // Phase 4a: also returns the municipality's stage right now, computed
  // here on the server.
  private async resolveRecordingContext(stationId: string): Promise<RecordingContext> {
    const station = await this.prisma.station.findUnique({
      where: { id: stationId },
      select: { municipality: true, archivedAt: true },
    });
    if (!station) {
      throw new NotFoundException('Station not found.');
    }
    // Phase 5A: an archived station (or a station of an archived
    // municipality) takes no new fill-ups - its history stays.
    if (station.archivedAt) {
      throw new ConflictException('STATION_ARCHIVED');
    }
    if (station.municipality?.archivedAt) {
      throw new ConflictException('MUNICIPALITY_ARCHIVED');
    }
    if (!station.municipality) {
      throw new ConflictException('STATION_HAS_NO_MUNICIPALITY');
    }
    if (station.municipality.status !== 'LIVE') {
      throw new ConflictException('MUNICIPALITY_NOT_LIVE');
    }
    return {
      municipalityId: station.municipality.id,
      municipalityName: station.municipality.name,
      stage: computeStage(new Date(), station.municipality),
      cardRequiredFromDate: calendarDayString(station.municipality.cardRequiredFromDate),
    };
  }

  // Decides who the fill-up is for, from what the client sent:
  //  1. a cardNumber must be an ACTIVE card — its vehicle is the vehicle;
  //  2. else a vehicleId names a registered vehicle (picked from the typed-
  //     plate search);
  //  3. else a typed plate: a registered vehicle with that NORMALIZED plate
  //     is that vehicle (so retyping a registered plate differently can't
  //     dodge its limits); only a plate matching none is unregistered.
  private async resolveSubject(
    input: { vehicleId?: string; cardNumber?: string; plate?: string },
    _context: RecordingContext,
  ): Promise<ResolvedSubject> {
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
      return { kind: 'vehicle', vehicle: card.vehicle, identifiedBy: 'CARD_SCAN', typedPlate: null, normalizedPlate: null };
    }

    const typed = input.plate?.trim() || null;
    // A typed plate that can't be split into a city code and a serial number
    // is refused outright, whatever else identifies the vehicle — the same
    // rule everywhere a plate is matched (see shared plate.ts).
    if (typed !== null && !normalizePlate(typed)) {
      throw new BadRequestException('PLATE_INVALID');
    }

    if (input.vehicleId !== undefined) {
      const vehicle = await this.prisma.vehicle.findUnique({ where: { id: input.vehicleId }, include: { owner: true } });
      if (!vehicle) {
        throw new NotFoundException('Vehicle not found.');
      }
      const typedPlate = typed ?? vehicle.currentPlate;
      return {
        kind: 'vehicle',
        vehicle,
        identifiedBy: 'TYPED_REGISTERED',
        typedPlate,
        normalizedPlate: normalizePlate(typedPlate),
      };
    }

    if (!typed) {
      throw new BadRequestException('VEHICLE_NOT_IDENTIFIED');
    }
    const normalizedPlate = normalizePlate(typed);
    if (!normalizedPlate) {
      throw new BadRequestException('PLATE_INVALID');
    }
    const matches = await this.prisma.vehicle.findMany({
      where: { normalizedPlate },
      include: { owner: true },
      take: 5,
    });
    if (matches.length === 1) {
      return { kind: 'vehicle', vehicle: matches[0]!, identifiedBy: 'TYPED_REGISTERED', typedPlate: typed, normalizedPlate };
    }
    if (matches.length > 1) {
      // Pre-existing data can hold two vehicles that normalize to the same
      // plate (reported by `plates:report`, never merged automatically). The
      // exact stored plate settles it; otherwise a person has to look.
      const exact = matches.filter((v) => v.currentPlate === typed);
      if (exact.length === 1) {
        return { kind: 'vehicle', vehicle: exact[0]!, identifiedBy: 'TYPED_REGISTERED', typedPlate: typed, normalizedPlate };
      }
      throw new ConflictException('PLATE_AMBIGUOUS');
    }
    return { kind: 'plate', identifiedBy: 'TYPED_UNREGISTERED', typedPlate: typed, normalizedPlate };
  }

  private toRuleSubject(subject: ResolvedSubject): RuleSubject {
    return subject.kind === 'vehicle'
      ? {
          kind: 'vehicle',
          vehicleId: subject.vehicle.id,
          ownerId: subject.vehicle.ownerId,
          ownerKind: subject.vehicle.owner?.ownerKind,
        }
      : { kind: 'plate', normalizedPlate: subject.normalizedPlate };
  }

  // From the card deadline on, a vehicle needs an ACTIVE card: a scan proves
  // one, a typed plate of a registered vehicle is accepted only if that
  // vehicle has an active card (the damaged-QR case — the plate is printed
  // on the card), and an unregistered plate never has one. Anything else is
  // refused (409 CARD_REQUIRED, with the registration stations to go to)
  // unless a supervisor authorizes an emergency override: that needs the
  // fillups:emergency_override permission (checked HERE, server-side,
  // whatever the UI shows) and a written reason, and waives ONLY the card
  // requirement — the gap and weekly limits are still evaluated.
  // Returns how the fill-up is identified in the end.
  private async enforceCardRequirement(
    subject: ResolvedSubject,
    context: RecordingContext,
    options: { emergencyOverride?: boolean; overrideReason?: string; actorId: string },
  ): Promise<FillUpIdentification> {
    if (options.emergencyOverride) {
      const permissions = await this.rbac.getPermissionsForUser(options.actorId);
      if (!permissions.has('fillups:emergency_override')) {
        throw new ForbiddenException('You are not authorized to record an emergency override.');
      }
      if (!options.overrideReason?.trim()) {
        throw new BadRequestException('OVERRIDE_REASON_REQUIRED');
      }
    }

    let needsCard = false;
    if (context.stage === 'CARD_REQUIRED' && subject.identifiedBy !== 'CARD_SCAN') {
      needsCard =
        subject.kind === 'plate' ||
        !(await this.prisma.vehicleCard.findUnique({
          where: { activeForVehicleId: subject.vehicle.id },
          select: { id: true },
        }));
    }

    if (!needsCard) {
      if (options.emergencyOverride) {
        // Nothing to waive: don't let "override" be recorded on a fill-up
        // that didn't need one (it would fake an emergency in the reports).
        throw new ConflictException('OVERRIDE_NOT_NEEDED');
      }
      return subject.identifiedBy;
    }
    if (!options.emergencyOverride) {
      throw new ConflictException({
        message: 'CARD_REQUIRED',
        details: {
          stage: context.stage,
          cardRequiredFromDate: context.cardRequiredFromDate,
          registrationStations: await this.registrationStationsFor(context.municipalityId),
        },
      });
    }
    return 'EMERGENCY_OVERRIDE';
  }

  // Name, address and working hours of the active registration stations in a
  // municipality, live — phone numbers stay on the printed sheet only.
  private async registrationStationsFor(municipalityId: string) {
    const stations = await this.registrationStations.listActiveForMunicipality(municipalityId);
    return stations.map(({ id, name, address, workingHours }) => ({ id, name, address, workingHours }));
  }

  // During the awareness stage, every fill-up recorded WITHOUT a card scan
  // shows the driver the deadline and where to register. Built from live
  // data on every call.
  private async awarenessFor(
    municipalityId: string,
    identifiedBy: FillUpIdentification,
  ): Promise<Awareness | null> {
    if (identifiedBy === 'CARD_SCAN' || identifiedBy === 'EMERGENCY_OVERRIDE') return null;
    const municipality = await this.prisma.municipality.findUnique({ where: { id: municipalityId } });
    if (!municipality || computeStage(new Date(), municipality) !== 'AWARENESS') return null;
    const deadline = calendarDayString(municipality.cardRequiredFromDate);
    if (!deadline) return null;
    return { cardRequiredFromDate: deadline, registrationStations: await this.registrationStationsFor(municipalityId) };
  }

  // Human-readable snapshot of the specific prior fill-up that triggered a
  // rule — used both for the Exception.triggerDetail persisted at
  // submission time (item 8) and for the inline 422 rejection response, so
  // the same shape backs both surfaces. A prior fill-up for an unregistered
  // plate has no vehicle: it's described by the plate being evaluated.
  private async describeTrigger(trigger: RuleTrigger | undefined, fallbackPlate: string | null = null) {
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
      vehicleCurrentPlate: vehicle?.currentPlate ?? fallbackPlate,
      // ISO string, not a raw Date — this is stored as JSON (Exception.
      // triggerDetail) and returned as JSON over the API either way.
      occurredAt: trigger.occurredAt.toISOString(),
    };
  }

  private async ensureEmergencyExceptionType(tx: Prisma.TransactionClient) {
    return tx.exceptionType.upsert({
      where: { key: EMERGENCY_EXCEPTION_TYPE.key },
      create: { ...EMERGENCY_EXCEPTION_TYPE },
      update: {},
    });
  }

  async create(dto: CreateFillUpDto, idempotencyKey: string, actorId: string) {
    // CLAUDE.md rule 3 (non-negotiable): station-scoped access is enforced
    // server-side for every station-data endpoint, not just reads. This
    // MUST run before the idempotency-key lookup below, checked against
    // dto.stationId (client-declared) rather than anything read off an
    // existing row — otherwise an out-of-scope actor who has (or guesses)
    // someone else's Idempotency-Key could retrieve that fill-up's full
    // data via the 200-replay path without ever hitting this check. A
    // scoped actor gets 403 on ANY stationId they're not scoped to,
    // whether or not the key already resolves to a real transaction.
    await this.assertStationInScope(dto.stationId, actorId);

    // Idempotency: a retried POST with the same key resolves to the SAME
    // row, never a new one — "a flaky station connection retrying a POST
    // should never double-record a fill-up" (docs/IMPLEMENTATION_PLAN.md §7).
    const existing = await this.prisma.fillUpTransaction.findUnique({
      where: { idempotencyKey },
      include: FILL_UP_WITH_EXCEPTION_INCLUDE,
    });
    if (existing) {
      if (!payloadMatchesExisting(dto, existing)) {
        throw new ConflictException(
          'This Idempotency-Key was already used for a different fill-up (mismatched vehicle, station, fuel type, quantity, or occurredAt). Use a new key for a new submission.',
        );
      }
      return {
        status: 'existing' as const,
        transaction: existing,
        awareness: existing.municipalityId
          ? await this.awarenessFor(existing.municipalityId, existing.identifiedBy)
          : null,
      };
    }

    // Resolved once here and stamped onto the row below — never looked up
    // again through the station afterward (see the schema comment on
    // FillUpTransaction.municipalityId). Runs before either branch, so an
    // exception-mode submission can't bypass it either.
    const context = await this.resolveRecordingContext(dto.stationId);
    const municipalityId = context.municipalityId;
    const subject = await this.resolveSubject(dto, context);
    const identifiedBy = await this.enforceCardRequirement(subject, context, {
      emergencyOverride: dto.emergencyOverride,
      overrideReason: dto.overrideReason,
      actorId,
    });
    const overrideReason = identifiedBy === 'EMERGENCY_OVERRIDE' ? dto.overrideReason!.trim() : null;
    const ruleSubject = this.toRuleSubject(subject);
    const vehicle = subject.kind === 'vehicle' ? subject.vehicle : null;
    const fallbackPlate = subject.kind === 'plate' ? subject.typedPlate : null;

    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
    const exceptionModeFieldsPresent = Boolean(
      dto.exceptionTypeId ?? dto.reason ?? dto.proofReference,
    );

    // Columns every recorded fill-up carries. typedPlate/normalizedPlate are
    // kept for every typed identification (and an override) so the plate as
    // entered is never lost; a card scan has neither.
    const baseData = {
      vehicleId: vehicle?.id ?? null,
      stationId: dto.stationId,
      municipalityId,
      fuelType: dto.fuelType,
      quantityLiters: dto.quantityLiters,
      occurredAt,
      recordedById: actorId,
      idempotencyKey,
      identifiedBy,
      typedPlate: subject.typedPlate,
      normalizedPlate: subject.normalizedPlate,
      overrideReason,
      // Phase 5A: the fuel poured is not the vehicle's own fuel type - a
      // warning at the pump, recorded here so reports can list mismatches.
      fuelMismatch: vehicle ? fuelTypeMismatch(vehicle.fuelType, dto.fuelType) : false,
    };
    const auditBase = {
      vehicleId: baseData.vehicleId,
      stationId: baseData.stationId,
      municipalityId,
      identifiedBy,
      fuelMismatch: baseData.fuelMismatch || undefined,
      // A plate is not personal data under CLAUDE.md rule 10 (national/
      // administrative IDs and phone numbers are); it's what the unregistered
      // fill-up is recorded against.
      normalizedPlate: baseData.normalizedPlate,
      overrideReason: overrideReason ?? undefined,
    };

    // A plate with no registered vehicle is counted by its own history, so
    // two simultaneous submissions (or one racing the vehicle's registration)
    // must be serialized: both take the same per-plate advisory lock — the
    // registration transaction takes it too — and the allowance is
    // evaluated inside it.
    const lockPlate = async (tx: Prisma.TransactionClient) => {
      if (subject.kind !== 'plate') return;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'plate:' + subject.normalizedPlate}))`;
      const nowRegistered = await tx.vehicle.count({ where: { normalizedPlate: subject.normalizedPlate } });
      if (nowRegistered > 0) {
        throw new ConflictException('PLATE_NOW_REGISTERED');
      }
    };

    if (!exceptionModeFieldsPresent) {
      type Outcome =
        | { status: 'rejected'; reason: import('./rule-engine/types').RuleFailureReason; trigger: RuleTrigger | undefined }
        | { status: 'created'; id: string };
      const outcome = await this.prisma.$transaction(async (tx): Promise<Outcome> => {
        await lockPlate(tx);
        const ruleResult = await this.ruleEngine.evaluateSubject(ruleSubject, municipalityId, occurredAt);
        if (!ruleResult.allowed) {
          return { status: 'rejected', reason: ruleResult.reason, trigger: ruleResult.trigger };
        }

        const created = await tx.fillUpTransaction.create({
          data: {
            ...baseData,
            isException: identifiedBy === 'EMERGENCY_OVERRIDE',
            // Set only when a rule that would have blocked this fill-up
            // was instead auto-allowed by an active StandingException —
            // "auto-allowed with no trace" is exactly what the standing-
            // exception design explicitly must NOT do.
            standingExceptionId: ruleResult.coveredBy?.standingExceptionId,
            coveredRule: ruleResult.coveredBy?.rule,
          },
        });

        if (identifiedBy === 'EMERGENCY_OVERRIDE') {
          // An override is flagged as an exception in the reports: it gets
          // the same Exception row a one-time exception does (type
          // "emergency", approved by the supervisor who authorized it).
          const type = await this.ensureEmergencyExceptionType(tx);
          await tx.exception.create({
            data: {
              fillUpTransactionId: created.id,
              exceptionTypeId: type.id,
              reason: overrideReason!,
              approvedById: actorId,
            },
          });
        }

        await this.audit.log(
          {
            userId: actorId,
            action: identifiedBy === 'EMERGENCY_OVERRIDE' ? 'EMERGENCY_OVERRIDE_FILLUP' : 'CREATE',
            entityType: 'FillUpTransaction',
            entityId: created.id,
            newValue: {
              ...auditBase,
              isException: identifiedBy === 'EMERGENCY_OVERRIDE',
              standingExceptionId: ruleResult.coveredBy?.standingExceptionId ?? undefined,
              coveredRule: ruleResult.coveredBy?.rule ?? undefined,
            },
          },
          tx,
        );
        return { status: 'created', id: created.id };
      });

      if (outcome.status === 'rejected') {
        return {
          status: 'rejected' as const,
          reason: outcome.reason,
          trigger: await this.describeTrigger(outcome.trigger, fallbackPlate),
        };
      }
      const transaction = await this.prisma.fillUpTransaction.findUniqueOrThrow({
        where: { id: outcome.id },
        include: FILL_UP_WITH_EXCEPTION_INCLUDE,
      });
      return { status: 'created' as const, transaction, awareness: await this.awarenessFor(municipalityId, identifiedBy) };
    }

    // Exception mode: "no hard block, exception with a mandatory reason"
    // (docs/OPEN_ITEMS.md, resolved). The rule engine's verdict is never
    // used to BLOCK this request — but it IS run once, diagnostic-only, to
    // capture which rule actually would have fired and which specific
    // prior fill-up triggered it (item 8). Never trust a client-supplied
    // diagnostic for this — always re-derive it server-side, same as any
    // other authoritative check.
    //
    // Phase 4a: the existing exception flow works the same for an
    // unregistered plate (it waives the gap/weekly limits that DO apply to
    // it); standing exceptions are the part that can't apply — they're
    // granted to a vehicle/owner. When an emergency override is combined
    // with it, the exception row carries the exception the supervisor chose,
    // and the override reason is kept on the fill-up itself.
    const diagnostic = await this.ruleEngine.evaluateSubject(ruleSubject, municipalityId, occurredAt);
    const triggerReason = diagnostic.allowed ? null : diagnostic.reason;
    const triggerDetail = diagnostic.allowed ? null : await this.describeTrigger(diagnostic.trigger, fallbackPlate);

    // Round 12: recording an exception is now gated by its own permission,
    // separate from fillups:create — the client wants this to be "a tick
    // box in the settings given to certain users they pick," per-user, not
    // a blanket ability everyone who can record a normal fill-up also gets.
    // See UserPermission for the per-user grant mechanism.
    const permissions = await this.rbac.getPermissionsForUser(actorId);
    if (!permissions.has('fillups:record_exception')) {
      throw new ForbiddenException('You are not authorized to record fill-ups as exceptions.');
    }

    if (!dto.reason) {
      throw new BadRequestException(
        'reason is required when submitting a fill-up with an exception.',
      );
    }
    if (!dto.exceptionTypeId) {
      throw new BadRequestException(
        'exceptionTypeId is required when submitting a fill-up with an exception.',
      );
    }
    const exceptionType = await this.prisma.exceptionType.findUnique({
      where: { id: dto.exceptionTypeId },
    });
    if (!exceptionType || !exceptionType.isActive) {
      throw new NotFoundException('Exception type not found or inactive.');
    }
    if (exceptionType.requiresProof && !dto.proofReference?.trim()) {
      throw new BadRequestException(
        `proofReference is required for exception type "${exceptionType.key}".`,
      );
    }

    const created = await this.prisma.$transaction(async (tx) => {
      await lockPlate(tx);
      const row = await tx.fillUpTransaction.create({
        data: { ...baseData, isException: true },
      });

      await tx.exception.create({
        data: {
          fillUpTransactionId: row.id,
          exceptionTypeId: dto.exceptionTypeId!,
          reason: dto.reason!,
          proofReference: dto.proofReference,
          // Round 12: anyone who holds fillups:record_exception (checked
          // above) no longer needs a separate supervisor/admin approval —
          // "I don't want them to be approved by the supervisor or admin, I
          // just want them go as exception." Auto-approved by the same
          // actor who recorded it, immediately, at creation. The
          // fillups:approve_exception queue (approveException below) is
          // left in place unchanged for any legacy pending rows — this
          // permission check just means no NEW row is ever created pending.
          approvedById: actorId,
          triggerReason,
          triggerDetail: triggerDetail ?? undefined,
        },
      });

      await this.audit.log(
        {
          userId: actorId,
          action: identifiedBy === 'EMERGENCY_OVERRIDE' ? 'EMERGENCY_OVERRIDE_FILLUP' : 'CREATE',
          entityType: 'FillUpTransaction',
          entityId: row.id,
          newValue: { ...auditBase, isException: true, exceptionTypeId: dto.exceptionTypeId },
        },
        tx,
      );

      return row;
    });

    const transaction = await this.prisma.fillUpTransaction.findUniqueOrThrow({
      where: { id: created.id },
      include: FILL_UP_WITH_EXCEPTION_INCLUDE,
    });
    return { status: 'created' as const, transaction, awareness: await this.awarenessFor(municipalityId, identifiedBy) };
  }

  // Ordinary station scoping (CLAUDE.md rule 3, non-negotiable) IS enforced
  // below. What's still provisional is narrower than that: any holder of
  // fillups:approve_exception may approve any exception at any station
  // within their scope. §13 item 4 is now answered (one SecurityAuthority
  // per municipality, OPEN_ITEMS.md #4), but whether approval should
  // additionally be restricted to that authority's people is part of the
  // later supervisor-roles phase, not implemented here; flagged so it
  // isn't mistaken for a finished design.
  async approveException(fillUpId: string, actorId: string) {
    const transaction = await this.prisma.fillUpTransaction.findUnique({
      where: { id: fillUpId },
      include: FILL_UP_WITH_EXCEPTION_INCLUDE,
    });
    if (!transaction) {
      throw new NotFoundException('Fill-up transaction not found.');
    }
    if (!transaction.exception) {
      throw new NotFoundException('This fill-up has no exception to approve.');
    }
    if (transaction.exception.approvedById) {
      throw new ConflictException('This exception has already been approved.');
    }

    const scope = await this.rbac.getStationScope(actorId);
    if (scope !== null && !scope.includes(transaction.stationId)) {
      throw new ForbiddenException('You do not have access to this station.');
    }

    return this.prisma.$transaction(async (tx) => {
      const exception = await tx.exception.update({
        where: { id: transaction.exception!.id },
        data: { approvedById: actorId },
      });

      await this.audit.log(
        {
          userId: actorId,
          action: 'APPROVE_EXCEPTION',
          entityType: 'Exception',
          entityId: exception.id,
          oldValue: { approvedById: null },
          newValue: { approvedById: actorId },
        },
        tx,
      );

      return tx.fillUpTransaction.findUniqueOrThrow({
        where: { id: fillUpId },
        include: FILL_UP_WITH_EXCEPTION_INCLUDE,
      });
    });
  }

  // Round 4 feedback, item 3: an auto-calculated read-only cost field
  // (quantity × price-per-liter) on the fill-up form. Per CLAUDE.md rule 4,
  // the price itself is a SystemSetting, not a hardcoded constant — gated
  // on fillups:create (same reasoning as exception-types above) rather
  // than settings:manage, since any station employee who can record a
  // fill-up needs to see the price, not just admins.
  async getFuelPrices(): Promise<Record<'PETROL_95' | 'DIESEL' | 'KEROSENE', number>> {
    const [petrol95, diesel, kerosene] = await Promise.all([
      this.settings.getNumber('fillup.price_per_liter.PETROL_95'),
      this.settings.getNumber('fillup.price_per_liter.DIESEL'),
      this.settings.getNumber('fillup.price_per_liter.KEROSENE'),
    ]);
    return { PETROL_95: petrol95, DIESEL: diesel, KEROSENE: kerosene };
  }

  // The frontend's "submit as exception" flow needs to know which
  // categories exist and which require proof BEFORE submitting — there was
  // no read endpoint for ExceptionType at all until now (CLAUDE.md rule 5:
  // exception categories are a lookup table, so this is just exposing rows
  // that already exist, not adding new data).
  listActiveExceptionTypes() {
    return this.prisma.exceptionType.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  // Admin panel, item 7's "exception types itself should be DB-driven, not
  // hardcoded" — the table already was (CLAUDE.md rule 5), what was
  // missing was a way to manage it without a raw DB write. Includes
  // inactive types too — an admin editing the catalog needs to see
  // everything, not just what's currently offered to a submitter.
  listAllExceptionTypes() {
    return this.prisma.exceptionType.findMany({ orderBy: { name: 'asc' } });
  }

  async createExceptionType(dto: CreateExceptionTypeDto, actorId: string) {
    const existing = await this.prisma.exceptionType.findUnique({ where: { key: dto.key } });
    if (existing) {
      throw new ConflictException('key is already in use.');
    }

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.exceptionType.create({
        data: { key: dto.key, name: dto.name, requiresProof: dto.requiresProof ?? true },
      });
      await this.audit.log(
        {
          userId: actorId,
          action: 'CREATE',
          entityType: 'ExceptionType',
          entityId: created.id,
          newValue: { key: created.key, name: created.name, requiresProof: created.requiresProof },
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

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.exceptionType.update({ where: { id }, data: dto });
      await this.audit.log(
        {
          userId: actorId,
          action: 'UPDATE',
          entityType: 'ExceptionType',
          entityId: id,
          oldValue: { name: before.name, requiresProof: before.requiresProof, isActive: before.isActive },
          newValue: { name: updated.name, requiresProof: updated.requiresProof, isActive: updated.isActive },
        },
        tx,
      );
      return updated;
    });
  }
}
