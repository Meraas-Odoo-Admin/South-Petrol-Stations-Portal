import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { AuditQueryDto } from './audit-query.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';

// Read-only view onto the insert-only AuditLog table (CLAUDE.md rule 6 —
// the app's DB role has no UPDATE/DELETE on it, so this can never show
// anything but the true history). Admin-panel screen, item 7.
@ApiTags('audit')
@Controller('audit-log')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @RequirePermission('audit:view')
  @Get()
  async findAll(@Query() query: AuditQueryDto) {
    const where = {
      entityType: query.entityType || undefined,
      userId: query.userId || undefined,
    };
    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
        include: { user: { select: { id: true, username: true, fullName: true } } },
      }),
    ]);
    return { total, rows };
  }
}
