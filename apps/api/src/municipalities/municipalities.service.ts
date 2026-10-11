import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { Municipality } from '@prisma/client';
import {
  calendarDayString,
  calendarDayToDate,
  computeStage,
  isValidCalendarDay,
  tripoliDay,
} from '../common/utils/grace-stage';
import { CreateMunicipalityDto } from './dto/create-municipality.dto';
import { UpdateMunicipalityDto } from './dto/update-municipality.dto';

// Settings-managed lookup list — same shape as CompaniesService, see
// station-card-field-spec's "why status and ownership-type aren't
// Settings-managed" section for the distinction this pattern rests on.
//
// Registration pivot, phase 1: a municipality is also the rollout unit.
// It's created PREPARING (schema default) and switched to LIVE via
// update() — only once its security authority exists.
@Injectable()
export class MunicipalitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // The station form shows a station's security authority read-only from
  // its municipality (one per municipality, OPEN_ITEMS.md #4) — included
  // here so the form doesn't need a second lookup.
  private readonly include = { securityAuthority: { select: { id: true, name: true } } } as const;

  // What the API (and so the UI) sees: the two dates as plain YYYY-MM-DD
  // calendar days and the stage computed server-side for right now.
  private present<T extends Municipality>(municipality: T) {
    return {
      ...municipality,
      awarenessStartDate: calendarDayString(municipality.awarenessStartDate),
      cardRequiredFromDate: calendarDayString(municipality.cardRequiredFromDate),
      stage: computeStage(new Date(), municipality),
    };
  }

  async create(dto: CreateMunicipalityDto, actorId: string) {
    const existing = await this.prisma.municipality.findUnique({ where: { name: dto.name } });
    if (existing) {
      throw new ConflictException('MUNICIPALITY_NAME_TAKEN');
    }

    const municipality = await this.prisma.municipality.create({
      data: { name: dto.name },
      include: this.include,
    });

    await this.audit.log({
      userId: actorId,
      action: 'CREATE',
      entityType: 'Municipality',
      entityId: municipality.id,
      newValue: { name: municipality.name, status: municipality.status },
    });

    return this.present(municipality);
  }

  async findAll() {
    const rows = await this.prisma.municipality.findMany({ orderBy: { name: 'asc' }, include: this.include });
    return rows.map((m) => this.present(m));
  }

  async findOne(id: string) {
    return this.present(await this.findRaw(id));
  }

  private async findRaw(id: string) {
    const municipality = await this.prisma.municipality.findUnique({ where: { id }, include: this.include });
    if (!municipality) {
      throw new NotFoundException('Municipality not found.');
    }
    return municipality;
  }

  async update(
    id: string,
    dto: UpdateMunicipalityDto,
    actorId: string,
    options: { stageDatesOnly?: boolean } = {},
  ) {
    if (options.stageDatesOnly) {
      // confirmName only accompanies the deadline's typed-name check.
      const allowed = new Set(['awarenessStartDate', 'cardRequiredFromDate', 'confirmName']);
      const extra = Object.keys(dto).filter((key) => (dto as Record<string, unknown>)[key] !== undefined && !allowed.has(key));
      if (extra.length > 0) {
        throw new ForbiddenException('STAGE_DATES_ONLY');
      }
    }
    const before = await this.findRaw(id);
    const stageDates = this.resolveStageDates(before, dto);

    // A municipality can't go live without the one security authority
    // that oversees its stations (registration pivot plan §5/§11).
    if (dto.status === 'LIVE' && before.status !== 'LIVE' && !before.securityAuthority) {
      throw new ConflictException('MUNICIPALITY_NEEDS_AUTHORITY');
    }

    if (dto.status === 'PREPARING' && before.status === 'LIVE' && dto.confirmName?.trim() !== before.name) {
      throw new BadRequestException('CONFIRMATION_NAME_MISMATCH');
    }

    if (dto.name && dto.name !== before.name) {
      const existing = await this.prisma.municipality.findUnique({ where: { name: dto.name } });
      if (existing) {
        throw new ConflictException('MUNICIPALITY_NAME_TAKEN');
      }
    }

    if (dto.code && dto.code !== before.code) {
      const taken = await this.prisma.municipality.findUnique({ where: { code: dto.code } });
      if (taken) {
        throw new ConflictException('MUNICIPALITY_CODE_TAKEN');
      }
    }

    const {
      confirmName: _confirmName,
      awarenessStartDate: _awareness,
      cardRequiredFromDate: _deadline,
      ...data
    } = dto;
    const municipality = await this.prisma.municipality.update({
      where: { id },
      data: {
        ...data,
        ...(stageDates.changed.awarenessStartDate
          ? { awarenessStartDate: stageDates.next.awarenessStartDate ? calendarDayToDate(stageDates.next.awarenessStartDate) : null }
          : {}),
        ...(stageDates.changed.cardRequiredFromDate
          ? { cardRequiredFromDate: stageDates.next.cardRequiredFromDate ? calendarDayToDate(stageDates.next.cardRequiredFromDate) : null }
          : {}),
      },
      include: this.include,
    });

    // Moving a stage date changes what every pump does from that day on, so
    // it gets its own audit entry with the old and new values.
    if (stageDates.changed.awarenessStartDate || stageDates.changed.cardRequiredFromDate) {
      await this.audit.log({
        userId: actorId,
        action: 'UPDATE_STAGE_DATES',
        entityType: 'Municipality',
        entityId: municipality.id,
        oldValue: {
          awarenessStartDate: calendarDayString(before.awarenessStartDate),
          cardRequiredFromDate: calendarDayString(before.cardRequiredFromDate),
        },
        newValue: stageDates.next,
      });
    }

    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      entityType: 'Municipality',
      entityId: municipality.id,
      oldValue: { name: before.name, status: before.status, code: before.code },
      newValue: { name: municipality.name, status: municipality.status, code: municipality.code },
    });

    return this.present(municipality);
  }

  // Validates a change to the two stage dates and returns what changed.
  //  - each must be a real calendar day;
  //  - awareness must start before the deadline (checked on the resulting
  //    pair, so changing one against the stored other is covered);
  //  - a deadline moved to today (Tripoli) or earlier starts enforcement
  //    immediately, so — like LIVE → PREPARING — it needs the municipality's
  //    name typed as confirmation, on the API as well as in the UI.
  private resolveStageDates(
    before: Municipality,
    dto: UpdateMunicipalityDto,
  ): {
    next: { awarenessStartDate: string | null; cardRequiredFromDate: string | null };
    changed: { awarenessStartDate: boolean; cardRequiredFromDate: boolean };
  } {
    const current = {
      awarenessStartDate: calendarDayString(before.awarenessStartDate),
      cardRequiredFromDate: calendarDayString(before.cardRequiredFromDate),
    };
    const next = { ...current };
    for (const field of ['awarenessStartDate', 'cardRequiredFromDate'] as const) {
      if (dto[field] === undefined) continue;
      const value = dto[field];
      if (value !== null && !isValidCalendarDay(value)) {
        throw new BadRequestException('INVALID_DATE');
      }
      next[field] = value;
    }
    if (next.awarenessStartDate && next.cardRequiredFromDate && next.awarenessStartDate >= next.cardRequiredFromDate) {
      throw new BadRequestException('AWARENESS_NOT_BEFORE_DEADLINE');
    }
    const changed = {
      awarenessStartDate: next.awarenessStartDate !== current.awarenessStartDate,
      cardRequiredFromDate: next.cardRequiredFromDate !== current.cardRequiredFromDate,
    };
    if (
      changed.cardRequiredFromDate &&
      next.cardRequiredFromDate &&
      next.cardRequiredFromDate <= tripoliDay(new Date()) &&
      dto.confirmName?.trim() !== before.name
    ) {
      throw new BadRequestException('CONFIRMATION_NAME_MISMATCH');
    }
    return { next, changed };
  }
}
