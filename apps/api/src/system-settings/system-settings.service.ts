import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { SettingsReader } from '../fillups/rule-engine/types';

// Prisma-backed implementation of SettingsReader — CLAUDE.md rule 4: tunable
// business numbers come from SystemSetting, read at request time, never a
// hardcoded constant. A missing key is a seed/config bug, not a recoverable
// runtime condition, so this throws loudly rather than silently defaulting.
@Injectable()
export class SystemSettingsService implements SettingsReader {
  constructor(private readonly prisma: PrismaService) {}

  async getNumber(key: string): Promise<number> {
    const raw = await this.getString(key);
    const value = Number(raw);
    if (Number.isNaN(value)) {
      throw new Error(`SystemSetting "${key}" is not a valid number: "${raw}"`);
    }
    return value;
  }

  async getString(key: string): Promise<string> {
    const setting = await this.prisma.systemSetting.findUnique({ where: { key } });
    if (!setting) {
      throw new Error(`SystemSetting "${key}" is not seeded.`);
    }
    return setting.value;
  }
}
