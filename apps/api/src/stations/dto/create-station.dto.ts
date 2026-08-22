import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { StationStatus } from '@prisma/client';

export class CreateStationDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  internalCode!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  stationNumber!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty()
  @IsString()
  companyId!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  municipality?: string;

  @ApiProperty({ enum: StationStatus, required: false })
  @IsOptional()
  @IsEnum(StationStatus)
  status?: StationStatus;
}
