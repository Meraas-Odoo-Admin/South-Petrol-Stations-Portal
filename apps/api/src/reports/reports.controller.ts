import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { ReportsExportService, EXPORT_ROW_LIMIT } from './reports-export.service';
import { DailyReportQueryDto } from './dto/daily-report-query.dto';
import { DailyReportExportQueryDto } from './dto/daily-report-export-query.dto';
import { ViolationsQueryDto } from './dto/violations-query.dto';
import { ViolationsExportQueryDto } from './dto/violations-export-query.dto';
import { HistoryQueryDto } from './dto/history-query.dto';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.interface';

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly exportService: ReportsExportService,
  ) {}

  @RequirePermission('reports:view')
  @Get('daily')
  getDailyReport(@Query() query: DailyReportQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.reports.getDailyReport(query, actor.id);
  }

  @RequirePermission('reports:view')
  @Get('daily/export')
  async exportDailyReport(
    @Query() query: DailyReportExportQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const report = await this.reports.getDailyReport(query, actor.id);
    const filename = `daily-report-${report.date}${report.stationId ? `-${report.stationId}` : ''}`;

    if (query.format === 'xlsx') {
      const buffer = await this.exportService.dailyReportToXlsx(report);
      res
        .status(200)
        .set({
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}.xlsx"`,
        })
        .send(buffer);
      return;
    }

    const buffer = await this.exportService.dailyReportToPdf(report);
    res
      .status(200)
      .set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}.pdf"`,
      })
      .send(buffer);
  }

  @RequirePermission('reports:view')
  @Get('violations')
  getViolations(@Query() query: ViolationsQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.reports.getViolations(query, actor.id);
  }

  // Declared before the export route; a fixed path, so it is never read as an id.
  @RequirePermission('reports:view')
  @Get('violations/pending-count')
  countPendingViolations(@CurrentUser() actor: AuthenticatedUser) {
    return this.reports.countPendingViolations(actor.id);
  }

  @RequirePermission('reports:view')
  @Get('violations/export')
  async exportViolations(
    @Query() query: ViolationsExportQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const rows = await this.reports.getViolationsForExport(query, actor.id, EXPORT_ROW_LIMIT);
    const filename = `violations-${new Date().toISOString().slice(0, 10)}`;

    if (query.format === 'xlsx') {
      const buffer = await this.exportService.violationsToXlsx(rows);
      res
        .status(200)
        .set({
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}.xlsx"`,
        })
        .send(buffer);
      return;
    }

    const buffer = await this.exportService.violationsToPdf(rows);
    res
      .status(200)
      .set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}.pdf"`,
      })
      .send(buffer);
  }

  // vehicles:read — "this vehicle's history" shown inline on the vehicle
  // detail page (gated on vehicles:read to reach the page at all), not a
  // directorate-level report. Round 6: the equivalent driver-history
  // endpoint was removed along with the rest of the Driver management
  // surface (see docs/DESIGN_owner_based_fillups.md) — history is
  // vehicle/owner-scoped now, not driver-scoped.
  @RequirePermission('vehicles:read')
  @Get('vehicles/:vehicleId/history')
  getVehicleHistory(
    @Param('vehicleId') vehicleId: string,
    @Query() query: HistoryQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.reports.getVehicleHistory(vehicleId, query, actor.id);
  }

  // reports:view_all_stations specifically — not reports:view. The
  // dashboard is inherently directorate-wide (per-station breakdown across
  // every station), so scope-filtering it down to "your stations" the way
  // the other endpoints do wouldn't produce a meaningful dashboard; the M4
  // instructions call for a route-level guard here instead.
  @RequirePermission('reports:view_all_stations')
  @Get('dashboard')
  getDashboard(@Query() query: DashboardQueryDto) {
    return this.reports.getDashboard(query);
  }
}
