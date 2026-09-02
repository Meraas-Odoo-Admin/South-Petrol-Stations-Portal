import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SystemSettingsService } from './system-settings.service';
import { UpdateSettingDto } from './dto/update-setting.dto';
import { CreateSettingDto } from './dto/create-setting.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.interface';

// Admin panel, item 7. CLAUDE.md rule 4: tunable business numbers come from
// SystemSetting, read at request time — this is the screen that actually
// lets an admin change one. SystemSettingsService.getNumber/getString read
// straight from Prisma on every call (confirmed: no cache layer anywhere
// in that service), so a value changed here takes effect on the very next
// fill-up evaluated — no invalidation step needed because there's nothing
// cached to invalidate.
@ApiTags('system-settings')
@Controller('system-settings')
export class SystemSettingsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settingsService: SystemSettingsService,
  ) {}

  @RequirePermission('settings:manage')
  @Get()
  findAll() {
    return this.prisma.systemSetting.findMany({ orderBy: { key: 'asc' } });
  }

  // Round 4 feedback item 1: real before/after impact for the two
  // weekly-cap settings, computed from actual Exception rows — see
  // SystemSettingsService.computeWeeklyCapImpact for what this can and
  // can't compute and why. Registered before the dynamic :key routes
  // would collide with it, though NestJS's segment-count matching means
  // this only matters if another :key/... route is ever added.
  @RequirePermission('settings:manage')
  @Get(':key/impact')
  async getImpact(@Param('key') key: string, @Query('value') value: string) {
    const numericValue = Number(value);
    if (!value || Number.isNaN(numericValue)) {
      throw new BadRequestException('A numeric "value" query parameter is required.');
    }
    return this.settingsService.computeWeeklyCapImpact(key, numericValue);
  }

  // Round 4 feedback item 1: "add a new numeric rule without a deploy" —
  // SystemSetting is already a table, not an enum, so creating a new row
  // is legitimate per CLAUDE.md rule 4. IMPORTANT caveat surfaced to the
  // admin in the frontend, not silently glossed over here: adding a row
  // does NOT wire it into FillUpRuleEngine — a new setting only affects
  // behavior once code is written to read it, same as every existing
  // setting was. This just removes "there's no way to even create the
  // row" as a blocker.
  @RequirePermission('settings:manage')
  @Post()
  async create(@Body() dto: CreateSettingDto, @CurrentUser() actor: AuthenticatedUser) {
    const existing = await this.prisma.systemSetting.findUnique({ where: { key: dto.key } });
    if (existing) {
      throw new ConflictException(`SystemSetting "${dto.key}" already exists.`);
    }

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.systemSetting.create({
        data: { key: dto.key, value: dto.value, description: dto.description },
      });

      await this.audit.log(
        {
          userId: actor.id,
          action: 'CREATE',
          entityType: 'SystemSetting',
          entityId: dto.key,
          newValue: { value: created.value, description: created.description },
        },
        tx,
      );

      return created;
    });
  }

  @RequirePermission('settings:manage')
  @Patch(':key')
  async update(
    @Param('key') key: string,
    @Body() dto: UpdateSettingDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const before = await this.prisma.systemSetting.findUnique({ where: { key } });
    if (!before) {
      throw new NotFoundException(`SystemSetting "${key}" does not exist — settings are not created here.`);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.systemSetting.update({ where: { key }, data: { value: dto.value } });

      await this.audit.log(
        {
          userId: actor.id,
          action: 'UPDATE',
          entityType: 'SystemSetting',
          entityId: key,
          oldValue: { value: before.value },
          newValue: { value: updated.value },
        },
        tx,
      );

      return updated;
    });
  }
}
