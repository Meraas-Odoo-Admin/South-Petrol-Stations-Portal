import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RbacService } from '../rbac/rbac.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { FillUpsRepository, StandingExceptionsRepository } from './fillups.repository';
import { FillUpRuleEngine } from './rule-engine/fill-up-rule-engine';
import type { RuleTrigger } from './rule-engine/types';
import { CreateFillUpDto } from './dto/create-fillup.dto';
import { CreateExceptionTypeDto } from './dto/create-exception-type.dto';
import { UpdateExceptionTypeDto } from './dto/update-exception-type.dto';

const FILL_UP_WITH_EXCEPTION_INCLUDE = { exception: true } as const;

type ExistingFillUp = Prisma.FillUpTransactionGetPayload<{
  include: typeof FILL_UP_WITH_EXCEPTION_INCLUDE;
}>;

// A reused Idempotency-Key is only a valid retry if it describes the SAME
// fill-up. A different vehicleId/etc under the same key is a client bug
// (key collision or a copy-paste mistake), not a retry — it must never
// silently resolve to the wrong transaction.
function payloadMatchesExisting(dto: CreateFillUpDto, existing: ExistingFillUp): boolean {
  if (dto.vehicleId !== existing.vehicleId) return false;
  if (dto.stationId !== existing.stationId) return false;
  if (dto.fuelType !== existing.fuelType) return false;
  if (!existing.quantityLiters.equals(dto.quantityLiters)) return false;
  if (dto.occurredAt !== undefined) {
    if (new Date(dto.occurredAt).getTime() !== existing.occurredAt.getTime()) return false;
  }
  return true;
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
  ) {
    // Constructed directly rather than DI-injected: FillUpRuleEngine takes
    // plain SettingsReader/FillUpHistoryReader/StandingExceptionReader
    // interfaces (see rule-engine/types.ts) so it stays independently
    // unit-testable without Nest's TestingModule.
    // SystemSettingsService/FillUpsRepository/StandingExceptionsRepository
    // are the real Prisma-backed implementations of those interfaces.
    this.ruleEngine = new FillUpRuleEngine(this.settings, this.repo, this.standingExceptionsRepo);
  }

  // Round 7 item 1: the fill-up form's pre-submit rule-review screen —
  // returns every applicable rule's real actual/limit numbers, computed by
  // the SAME rule engine a real submission uses (FillUpRuleEngine.
  // evaluateWithChecks), never a separate client-side estimate. Gated on
  // fillups:create (not vehicles:read) since it's part of the fill-up
  // recording flow specifically, same reasoning as getFuelPrices/
  // listExceptionTypes below.
  async previewRules(vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found.');
    }
    const { checks } = await this.ruleEngine.evaluateWithChecks(vehicleId, vehicle.ownerId, new Date());
    return { checks };
  }

  // Human-readable snapshot of the specific prior fill-up that triggered a
  // rule — used both for the Exception.triggerDetail persisted at
  // submission time (item 8) and for the inline 422 rejection response, so
  // the same shape backs both surfaces.
  private async describeTrigger(trigger: RuleTrigger | undefined) {
    if (!trigger) {
      return null;
    }
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: trigger.vehicleId },
      select: { internalCode: true, currentPlate: true },
    });
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
    // data via the 200-replay path without ever hitting this check. A
    // scoped actor gets 403 on ANY stationId they're not scoped to,
    // whether or not the key already resolves to a real transaction.
    const scope = await this.rbac.getStationScope(actorId);
    if (scope !== null && !scope.includes(dto.stationId)) {
      throw new ForbiddenException('You do not have access to this station.');
    }

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
      return { status: 'existing' as const, transaction: existing };
    }

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: dto.vehicleId },
      include: { owner: true },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found.');
    }
    const station = await this.prisma.station.findUnique({ where: { id: dto.stationId } });
    if (!station) {
      throw new NotFoundException('Station not found.');
    }

    // Round 11 item 1: a DRIVERS_LICENSE-identified owner is a one-time,
    // provisional stand-in — the client's own framing was "only the first
    // fill is available," a hard block, not a flaggable/exception-
    // routable rule like the checks FillUpRuleEngine evaluates. Deliberately
    // structured as a separate check here (not folded into the rule
    // engine's RuleFailureReason set) since it must ALSO block exception
    // mode below — every other rule is bypassable by recording an
    // exception, this one specifically must not be. "First fill-up" means
    // this vehicle has zero PERSISTED FillUpTransaction rows so far — a
    // prior rejected attempt never created one, so it doesn't count.
    if (vehicle.owner?.identityType === 'DRIVERS_LICENSE') {
      const priorFillUpCount = await this.prisma.fillUpTransaction.count({
        where: { vehicleId: dto.vehicleId },
      });
      if (priorFillUpCount > 0) {
        // Machine-checkable marker, not prose — the frontend maps this to
        // a specific Arabic message (never shows raw English text per the
        // code-leak audit) rather than the generic fallback every other
        // non-422 error gets.
        throw new ForbiddenException('OWNER_IDENTITY_PROVISIONAL');
      }
    }

    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
    const exceptionModeFieldsPresent = Boolean(
      dto.exceptionTypeId ?? dto.reason ?? dto.proofReference,
    );

    if (!exceptionModeFieldsPresent) {
      const ruleResult = await this.ruleEngine.evaluate(dto.vehicleId, vehicle.ownerId, occurredAt);
      if (!ruleResult.allowed) {
        return {
          status: 'rejected' as const,
          reason: ruleResult.reason,
          trigger: await this.describeTrigger(ruleResult.trigger),
        };
      }

      const transaction = await this.prisma.$transaction(async (tx) => {
        const created = await tx.fillUpTransaction.create({
          data: {
            vehicleId: dto.vehicleId,
            stationId: dto.stationId,
            fuelType: dto.fuelType,
            quantityLiters: dto.quantityLiters,
            occurredAt,
            recordedById: actorId,
            isException: false,
            idempotencyKey,
            // Set only when a rule that would have blocked this fill-up
            // was instead auto-allowed by an active StandingException —
            // "auto-allowed with no trace" is exactly what the standing-
            // exception design explicitly must NOT do.
            standingExceptionId: ruleResult.coveredBy?.standingExceptionId,
            coveredRule: ruleResult.coveredBy?.rule,
          },
        });

        await this.audit.log(
          {
            userId: actorId,
            action: 'CREATE',
            entityType: 'FillUpTransaction',
            entityId: created.id,
            newValue: {
              vehicleId: created.vehicleId,
              stationId: created.stationId,
              isException: false,
              standingExceptionId: ruleResult.coveredBy?.standingExceptionId ?? undefined,
              coveredRule: ruleResult.coveredBy?.rule ?? undefined,
            },
          },
          tx,
        );

        return tx.fillUpTransaction.findUniqueOrThrow({
          where: { id: created.id },
          include: FILL_UP_WITH_EXCEPTION_INCLUDE,
        });
      });

      return { status: 'created' as const, transaction };
    }

    // Exception mode: "no hard block, exception with a mandatory reason"
    // (docs/OPEN_ITEMS.md, resolved). The rule engine's verdict is never
    // used to BLOCK this request — but it IS run once, diagnostic-only, to
    // capture which rule actually would have fired and which specific
    // prior fill-up triggered it (item 8). Never trust a client-supplied
    // diagnostic for this — always re-derive it server-side, same as any
    // other authoritative check.
    const diagnostic = await this.ruleEngine.evaluate(dto.vehicleId, vehicle.ownerId, occurredAt);
    const triggerReason = diagnostic.allowed ? null : diagnostic.reason;
    const triggerDetail = diagnostic.allowed ? null : await this.describeTrigger(diagnostic.trigger);

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

    const transaction = await this.prisma.$transaction(async (tx) => {
      const created = await tx.fillUpTransaction.create({
        data: {
          vehicleId: dto.vehicleId,
          stationId: dto.stationId,
          fuelType: dto.fuelType,
          quantityLiters: dto.quantityLiters,
          occurredAt,
          recordedById: actorId,
          isException: true,
          idempotencyKey,
        },
      });

      await tx.exception.create({
        data: {
          fillUpTransactionId: created.id,
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
          action: 'CREATE',
          entityType: 'FillUpTransaction',
          entityId: created.id,
          newValue: {
            vehicleId: created.vehicleId,
            stationId: created.stationId,
            isException: true,
            exceptionTypeId: dto.exceptionTypeId,
          },
        },
        tx,
      );

      return tx.fillUpTransaction.findUniqueOrThrow({
        where: { id: created.id },
        include: FILL_UP_WITH_EXCEPTION_INCLUDE,
      });
    });

    return { status: 'created' as const, transaction };
  }

  // Ordinary station scoping (CLAUDE.md rule 3, non-negotiable) IS enforced
  // below. What's still provisional is narrower than that: any holder of
  // fillups:approve_exception may approve any exception at any station
  // within their scope — §13 item 4 (security-authority scope for a
  // station) is still pending from the client, and once answered, approval
  // may additionally need to be restricted to the station's specific
  // SecurityAuthority rather than "the caller's scope includes this
  // station" being sufficient. That further restriction is NOT implemented
  // now; flagged so it isn't mistaken for a finished design.
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
