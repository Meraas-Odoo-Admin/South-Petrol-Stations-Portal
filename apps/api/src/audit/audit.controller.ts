import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuditQueryDto } from './audit-query.dto';
import { AuditReadService } from './audit-read.service';
import { RequirePermission } from '../common/decorators/require-permission.decorator';

// Read-only view onto the insert-only AuditLog table (CLAUDE.md rule 6 —
// the app's DB role has no UPDATE/DELETE on it, so this can never show
// anything but the true history). Admin-panel screen, item 7. After review
// (15 Oct 2026): filters by action, date and who/address, and each entry
// named (the person, station, vehicle… it is about).
@ApiTags('audit')
@Controller('audit-log')
export class AuditController {
  constructor(private readonly audit: AuditReadService) {}

  @RequirePermission('audit:view')
  @Get()
  findAll(@Query() query: AuditQueryDto) {
    return this.audit.list(query);
  }
}
