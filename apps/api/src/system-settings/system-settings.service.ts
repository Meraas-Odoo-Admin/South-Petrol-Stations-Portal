import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { SettingsReader } from '../fillups/rule-engine/types';
import { resolveWeekWindowStrategy } from '../fillups/rule-engine/week-window.strategy';

const DAY_MS = 24 * 60 * 60 * 1000;
const LOOKBACK_DAYS = 14;

// Which trigger reason a given weekly-cap setting corresponds to, and
// whether the check counts by vehicle or by owner — the only two
// SystemSetting keys this can compute a real before/after impact for.
// Every other setting (gap-days, liters cap, prices) returns `null` from
// computeImpact rather than a fabricated number.
const WEEKLY_CAP_IMPACT_CONFIG: Partial<Record<string, { triggerReason: string; scope: 'vehicle' | 'owner' }>> = {
  'fillup.max_per_week': { triggerReason: 'VEHICLE_WEEKLY_CAP_REACHED', scope: 'vehicle' },
  'fillup.max_per_week_per_owner': { triggerReason: 'OWNER_WEEKLY_CAP_REACHED', scope: 'owner' },
};

// Prisma-backed implementation of SettingsReader — CLAUDE.md rule 4: tunable
// business numbers come from SystemSetting, read at request time, never a
// hardcoded constant. A missing key is a seed/config bug, not a recoverable
// runtime condition, so this throws loudly rather than silently defaulting.
@Injectable()
export class SystemSettingsService implements SettingsReader {
  constructor(private readonly prisma: PrismaService) {}

  // After review (19 Oct 2026): every fill-up and every citizen check reads
  // ~7 settings that change a few times a year. They are kept in memory for
  // 30 s, and dropped the moment a setting is changed through the API
  // (invalidate()). Off in tests, which change settings straight in the
  // database and expect it at once.
  private readonly cache = new Map<string, { value: string; at: number }>();
  private readonly cacheMs = process.env.NODE_ENV === 'test' ? 0 : 30_000;

  invalidate(): void {
    this.cache.clear();
  }

  async getNumber(key: string): Promise<number> {
    const raw = await this.getString(key);
    const value = Number(raw);
    if (Number.isNaN(value)) {
      throw new Error(`SystemSetting "${key}" is not a valid number: "${raw}"`);
    }
    return value;
  }

  async getString(key: string): Promise<string> {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < this.cacheMs) return cached.value;
    const setting = await this.prisma.systemSetting.findUnique({ where: { key } });
    if (!setting) {
      throw new Error(`SystemSetting "${key}" is not seeded.`);
    }
    if (this.cacheMs > 0) this.cache.set(key, { value: setting.value, at: Date.now() });
    return setting.value;
  }

  // Round 4 feedback item 1: the settings admin screen must state the real
  // before/after impact of a change ("raising this from 2 to 3 means 18
  // fill-ups that would have violated the weekly cap no longer will"), not
  // a generic warning. Only the two weekly-cap settings map to a stored,
  // countable signal (Exception.triggerReason on rows that WERE submitted
  // as an exception because they tripped that specific rule) — a plain
  // rejection is never persisted at all, so there is no historical record
  // to recompute a counterfactual against for any other setting. Returns
  // null for anything not in WEEKLY_CAP_IMPACT_CONFIG rather than fabricate
  // a number for it.
  async computeWeeklyCapImpact(key: string, hypotheticalValue: number): Promise<{ noLongerViolating: number | null }> {
    const config = WEEKLY_CAP_IMPACT_CONFIG[key];
    if (!config) {
      // Wrapped in an object rather than a bare `null` body — a JSON API
      // returning literally `null` is ambiguous over the wire (some HTTP
      // clients/serializers collapse it to an empty object), and this way
      // the shape is always `{ noLongerViolating: ... }` whether or not a
      // real number was computable.
      return { noLongerViolating: null };
    }

    const weekWindowMode = await this.getString('fillup.week_window_mode');
    const weekStartDay = await this.getNumber('fillup.week_start_day');
    const windowStrategy = resolveWeekWindowStrategy(weekWindowMode);

    const exceptions = await this.prisma.exception.findMany({
      where: { triggerReason: config.triggerReason },
      select: {
        fillUpTransaction: {
          select: {
            vehicleId: true,
            occurredAt: true,
            municipalityId: true,
            normalizedPlate: true,
            vehicle: { select: { ownerId: true } },
          },
        },
      },
    });

    let noLongerViolating = 0;
    for (const { fillUpTransaction } of exceptions) {
      if (!fillUpTransaction) continue;
      const { vehicleId, occurredAt, vehicle, municipalityId, normalizedPlate } = fillUpTransaction;
      // A fill-up for an unregistered plate (no vehicle, so no owner): the
      // owner-level caps can't apply to it, and its vehicle-level count is
      // that plate's own history in its municipality.
      if (!vehicle && config.scope === 'owner') continue;
      if (vehicle && config.scope === 'owner' && !vehicle.ownerId) continue; // nothing to aggregate against
      const windowStart = windowStrategy.windowStart(occurredAt, weekStartDay);
      const lookbackStart = new Date(occurredAt.getTime() - LOOKBACK_DAYS * DAY_MS);

      const countInWindow = await this.prisma.fillUpTransaction.count({
        where: {
          ...(config.scope === 'vehicle'
            ? vehicleId
              ? { vehicleId }
              : { vehicleId: null, normalizedPlate, municipalityId }
            : { vehicle: { ownerId: vehicle!.ownerId } }),
          occurredAt: { gte: lookbackStart < windowStart ? windowStart : lookbackStart, lt: occurredAt },
        },
      });

      // The historical exception fired because countInWindow (at the time)
      // was already >= the cap in effect then. We don't have that
      // historical cap value stored, only whether it tripped — so this
      // compares against the hypothetical value directly: if the count
      // that actually preceded it is now below the new cap, this specific
      // case would no longer need an exception.
      if (countInWindow < hypotheticalValue) {
        noLongerViolating++;
      }
    }

    return { noLongerViolating };
  }
}
