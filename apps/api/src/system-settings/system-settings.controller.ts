import { Body, Controller, Get, NotFoundException, Param, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UpdateSettingDto } from './dto/update-setting.dto';
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
  ) {}

  @RequirePermission('settings:manage')
  @Get()
  findAll() {
    return this.prisma.systemSetting.findMany({ orderBy: { key: 'asc' } });
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
