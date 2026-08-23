import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

export class DailyReportQueryDto {
  // Required unless the caller holds reports:view_all_stations — enforced
  // in ReportsService, not here, since it depends on who's asking.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  stationId?: string;

  // Date-only (no time-of-day component) — a "daily" report is bounded by
  // calendar day, not a timestamp. Defaults to today (server's current UTC
  // date) when omitted. No station has timezone data in the schema, so day
  // boundaries are computed in UTC — worth revisiting once that's decided.
  @ApiProperty({ required: false, example: '2026-08-23' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be in YYYY-MM-DD format' })
  date?: string;
}
