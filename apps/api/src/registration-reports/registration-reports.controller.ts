import { Controller, Get, Param, Query, Res, StreamableFile } from '@nestjs/common';
import { EmployeesQueryDto } from './dto/employees-query.dto';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { RegistrationReportsService } from './registration-reports.service';
import { ActivityQueryDto } from './dto/activity-query.dto';
import { OfficesExportQueryDto } from './dto/offices-export-query.dto';
import { officesPdf } from './offices-pdf';
import { ReportPdfService } from '../report-pdf/report-pdf.service';
import { DateRangeQueryDto } from '../common/dto/date-range-query.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.interface';

// Phase 4c: registration-office monitoring. Registration employees hold no
// permission here; a registration supervisor sees only their own offices
// (enforced in the service by registration-station scope), the admins all.
@ApiTags('reports')
@Controller('reports/registration')
export class RegistrationReportsController {
  constructor(
    private readonly reports: RegistrationReportsService,
    private readonly pdf: ReportPdfService,
  ) {}

  @RequirePermission('registration_reports:view')
  @Get('offices')
  offices(@Query() query: DateRangeQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.reports.offices(query, actor.id);
  }

  // Declared before the ':officeId' routes.
  @RequirePermission('registration_reports:view')
  @Get('offices/export')
  async exportOffices(
    @Query() query: OfficesExportQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const pdf = await this.pdf.render(officesPdf(await this.reports.offices(query, actor.id)));
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="registration-offices.pdf"' });
    return new StreamableFile(pdf);
  }

  @RequirePermission('registration_reports:view')
  @Get('offices/:officeId/employees')
  employees(@Param('officeId') officeId: string, @Query() query: EmployeesQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.reports.employees(officeId, query, actor.id);
  }

  @RequirePermission('registration_reports:view')
  @Get('employees/:userId/activity')
  activity(@Param('userId') userId: string, @Query() query: ActivityQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.reports.activity(userId, query, actor.id);
  }
}
