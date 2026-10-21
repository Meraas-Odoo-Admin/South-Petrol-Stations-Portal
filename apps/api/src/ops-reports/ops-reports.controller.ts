import { Controller, Get, NotFoundException, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { OpsReportsService } from './ops-reports.service';
import { OpsReportExportQueryDto, OpsReportQueryDto } from './dto/ops-report-query.dto';
import { pageReport, tableToCsv, type OpsReport } from './ops-report-types';
import { AuditedExport } from '../audit/audited-export';

// The role reports of phase 5B. One endpoint per report, each behind its own
// permission, plus a CSV export of any one table of it (the same rows, the
// same sort the screen shows).
@ApiTags('ops-reports')
@Controller('ops-reports')
export class OpsReportsController {
  constructor(private readonly reports: OpsReportsService) {}

  private paged(report: OpsReport, query: OpsReportQueryDto): OpsReport {
    return pageReport(report, query);
  }

  private csv(report: OpsReport, query: OpsReportExportQueryDto, res: Response): StreamableFile {
    const table = report.tables.find((t) => t.id === query.table);
    if (!table) throw new NotFoundException('TABLE_NOT_FOUND');
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${report.report}-${table.id}-${report.range.from}_${report.range.to}.csv"`,
    });
    return new StreamableFile(Buffer.from(tableToCsv(table, query.sort, query.dir), 'utf-8'));
  }

  @RequirePermission('registration_reports:own_day')
  @Get('my-day')
  myDay(@Query() query: OpsReportQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.reports.myDay(query, actor.id).then((r) => this.paged(r, query));
  }

  @RequirePermission('registration_reports:own_day')
  @AuditedExport('my-day')
  @Get('my-day/export')
  async myDayExport(
    @Query() query: OpsReportExportQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.csv(await this.reports.myDay(query, actor.id), query, res);
  }

  @RequirePermission('reports:own_shift')
  @Get('my-shift')
  myShift(@CurrentUser() actor: AuthenticatedUser) {
    return this.reports.myShift(actor.id);
  }

  @RequirePermission('reports:own_shift')
  @AuditedExport('my-shift')
  @Get('my-shift/export')
  async myShiftExport(
    @Query() query: OpsReportExportQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.csv(await this.reports.myShift(actor.id), query, res);
  }

  @RequirePermission('registration_reports:view')
  @Get('office')
  office(@Query() query: OpsReportQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.reports.office(query, actor.id).then((r) => this.paged(r, query));
  }

  @RequirePermission('registration_reports:view')
  @AuditedExport('office')
  @Get('office/export')
  async officeExport(
    @Query() query: OpsReportExportQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.csv(await this.reports.office(query, actor.id), query, res);
  }

  @RequirePermission('reports:view')
  @Get('station')
  station(@Query() query: OpsReportQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.reports.station(query, actor.id).then((r) => this.paged(r, query));
  }

  @RequirePermission('reports:view')
  @AuditedExport('station')
  @Get('station/export')
  async stationExport(
    @Query() query: OpsReportExportQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.csv(await this.reports.station(query, actor.id), query, res);
  }

  // «التوريد والتعبئة» in «مراقبة المحطات» (after review, 21 Oct 2026).
  @RequirePermission('fuel_stock:read')
  @Get('supply')
  supply(@Query() query: OpsReportQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.reports.supply(query, actor.id).then((r) => this.paged(r, query));
  }

  @RequirePermission('fuel_stock:read')
  @AuditedExport('supply')
  @Get('supply/export')
  async supplyExport(
    @Query() query: OpsReportExportQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.csv(await this.reports.supply(query, actor.id), query, res);
  }

  @RequirePermission('reports:municipality')
  @Get('municipality')
  municipality(@Query() query: OpsReportQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.reports.municipality(query, actor.id).then((r) => this.paged(r, query));
  }

  @RequirePermission('reports:municipality')
  @AuditedExport('municipality')
  @Get('municipality/export')
  async municipalityExport(
    @Query() query: OpsReportExportQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.csv(await this.reports.municipality(query, actor.id), query, res);
  }

  @RequirePermission('reports:municipality')
  @Get('municipality-summary')
  municipalitySummary(@Query() query: OpsReportQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.reports.municipalitySummary(query, actor.id);
  }

  @RequirePermission('reports:cross_municipality')
  @Get('summary')
  summary(@Query() query: OpsReportQueryDto) {
    return this.reports.summary(query).then((r) => this.paged(r, query));
  }

  @RequirePermission('reports:cross_municipality')
  @AuditedExport('summary')
  @Get('summary/export')
  async summaryExport(@Query() query: OpsReportExportQueryDto, @Res({ passthrough: true }) res: Response) {
    return this.csv(await this.reports.summary(query), query, res);
  }
}
