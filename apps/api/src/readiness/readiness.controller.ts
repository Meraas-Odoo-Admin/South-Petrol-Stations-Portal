import { Controller, Get, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { ReadinessService } from './readiness.service';
import { ReadinessQueryDto } from './dto/readiness-query.dto';
import { ReadinessExportQueryDto } from './dto/readiness-export-query.dto';
import { readinessPdf } from './readiness-pdf';
import { ReportPdfService } from '../report-pdf/report-pdf.service';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.interface';

// Phase 4c: deadline readiness. What each caller sees is narrowed in the
// service by their station and registration-station scope.
@ApiTags('reports')
@Controller('reports/readiness')
export class ReadinessController {
  constructor(
    private readonly readiness: ReadinessService,
    private readonly pdf: ReportPdfService,
  ) {}

  @RequirePermission('readiness:view')
  @Get('export')
  async export(
    @Query() query: ReadinessExportQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const pdf = await this.pdf.render(readinessPdf(await this.readiness.report(query, actor.id)));
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="deadline-readiness.pdf"' });
    return new StreamableFile(pdf);
  }

  @RequirePermission('readiness:view')
  @Get()
  report(@Query() query: ReadinessQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.readiness.report(query, actor.id);
  }
}
