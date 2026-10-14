import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsISO8601, IsOptional, IsString, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { ExceptionsService } from './exceptions.service';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.interface';

class GlobalExceptionSettingsDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  strictLimit?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  stationDailyThreshold?: number;
}

// null clears the municipality's own value, so the global one applies again.
class MunicipalityExceptionSettingsDto {
  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsBoolean()
  strictLimit?: boolean | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  stationDailyThreshold?: number | null;
}

class ExceptionsListQueryDto {
  @IsOptional() @IsString() stationId?: string;
  @IsOptional() @IsString() municipalityId?: string;
  @IsOptional() @IsISO8601({ strict: true }) from?: string;
  @IsOptional() @IsISO8601({ strict: true }) to?: string;
  @IsOptional() @IsString() typeId?: string;
  @IsOptional() @IsString() employeeId?: string;
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  flaggedOnly?: boolean;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(0) skip?: number;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1) @Max(100) take?: number;
}

class ByStationQueryDto {
  @IsOptional() @IsString() municipalityId?: string;
  @IsOptional() @IsISO8601({ strict: true }) from?: string;
  @IsOptional() @IsISO8601({ strict: true }) to?: string;
}

@ApiTags('exceptions')
@Controller('exceptions')
export class ExceptionsController {
  constructor(private readonly exceptions: ExceptionsService) {}

  // The station supervisor's list (their stations), the municipality manager's
  // (their municipality) and the super admin's - scoped server-side.
  @RequirePermission('reports:view')
  @Get()
  list(@Query() query: ExceptionsListQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.exceptions.list(query, actor.id);
  }

  @RequirePermission('reports:municipality')
  @Get('by-station')
  byStation(@Query() query: ByStationQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.exceptions.byStation(query, actor.id);
  }

  @RequirePermission('exception_settings:manage')
  @Get('settings')
  settings(@Query('municipalityId') municipalityId: string | undefined, @CurrentUser() actor: AuthenticatedUser) {
    return this.exceptions.getSettings(municipalityId || undefined, actor.id);
  }

  // The global switch and threshold: the super admin's (settings:manage).
  @RequirePermission('settings:manage')
  @Patch('settings')
  setGlobal(@Body() dto: GlobalExceptionSettingsDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.exceptions.setGlobalSettings(dto, actor.id);
  }

  @RequirePermission('exception_settings:manage')
  @Patch('settings/municipality/:municipalityId')
  setMunicipality(
    @Param('municipalityId') municipalityId: string,
    @Body() dto: MunicipalityExceptionSettingsDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.exceptions.setMunicipalitySettings(municipalityId, dto, actor.id);
  }
}
