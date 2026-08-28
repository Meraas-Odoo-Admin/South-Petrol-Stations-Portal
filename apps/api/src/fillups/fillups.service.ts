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
// fill-up. A different vehicleId/driverId/etc under the same key is a
// client bug (key collision or a copy-paste mistake), not a retry — it
// must never silently resolve to the wrong transaction.
function payloadMatchesExisting(dto: CreateFillUpDto, existing: ExistingFillUp): boolean {
  if (dto.vehicleId !== existing.vehicleId) return false;
  if (dto.driverId !== existing.driverId) return false;
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
          'This Idempotency-Key was already used for a different fill-up (mismatched vehicle, driver, station, fuel type, quantity, or occurredAt). Use a new key for a new submission.',
        );
      }
      return { status: 'existing' as const, transaction: existing };
    }

    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: dto.vehicleId } });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found.');
    }
    const driver = await this.prisma.driver.findUnique({ where: { id: dto.driverId } });
    if (!driver) {
      throw new NotFoundException('Driver not found.');
    }
    const station = await this.prisma.station.findUnique({ where: { id: dto.stationId } });
    if (!station) {
      throw new NotFoundException('Station not found.');
    }

    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
    const exceptionModeFieldsPresent = Boolean(
      dto.exceptionTypeId ?? dto.reason ?? dto.proofReference,
    );

    if (!exceptionModeFieldsPresent) {
      const ruleResult = await this.ruleEngine.evaluate(dto.vehicleId, dto.driverId, occurredAt);
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
            driverId: dto.driverId,
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
    const diagnostic = await this.ruleEngine.evaluate(dto.vehicleId, dto.driverId, occurredAt);
    const triggerReason = diagnostic.allowed ? null : diagnostic.reason;
    const triggerDetail = diagnostic.allowed ? null : await this.describeTrigger(diagnostic.trigger);

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
          driverId: dto.driverId,
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
          approvedById: null,
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
