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
import { FillUpsRepository } from './fillups.repository';
import { FillUpRuleEngine } from './rule-engine/fill-up-rule-engine';
import { CreateFillUpDto } from './dto/create-fillup.dto';

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
  ) {
    // Constructed directly rather than DI-injected: FillUpRuleEngine takes
    // plain SettingsReader/FillUpHistoryReader interfaces (see rule-engine/
    // types.ts) so it stays independently unit-testable without Nest's
    // TestingModule. SystemSettingsService/FillUpsRepository are the real
    // Prisma-backed implementations of those interfaces.
    this.ruleEngine = new FillUpRuleEngine(this.settings, this.repo);
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
        return { status: 'rejected' as const, reason: ruleResult.reason };
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
          },
        });

        await this.audit.log(
          {
            userId: actorId,
            action: 'CREATE',
            entityType: 'FillUpTransaction',
            entityId: created.id,
            newValue: { vehicleId: created.vehicleId, stationId: created.stationId, isException: false },
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
    // (docs/OPEN_ITEMS.md, resolved). The rule engine is bypassed entirely
    // — this is the request that already knows it's over-cap.
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
}
