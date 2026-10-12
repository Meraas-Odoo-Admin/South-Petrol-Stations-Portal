import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { VehicleChangeType } from '@prisma/client';
import { IsValidVehicleChangeValue } from '../../common/validators/vehicle-change-value.validator';

export class CreateVehicleChangeRequestDto {
  @ApiProperty({ enum: VehicleChangeType })
  @IsEnum(VehicleChangeType)
  changeType!: VehicleChangeType;

  // Chassis numbers are case-insensitive on input but stored/compared
  // uppercase — only applies to CHASSIS_CHANGE; a BOOKLET_CHANGE value is
  // left as typed.
  @ApiProperty({
    description:
      'New chassis number (17 chars, CHASSIS_CHANGE) or new registration booklet number (6-12 alphanumeric, BOOKLET_CHANGE).',
  })
  @Transform(({ value, obj }) =>
    obj.changeType === VehicleChangeType.CHASSIS_CHANGE && typeof value === 'string'
      ? value.toUpperCase()
      : value,
  )
  @IsString()
  @IsValidVehicleChangeValue()
  requestedValue!: string;

  // Ticked when the new chassis number is not the usual 17 characters (6-20
  // allowed) - the same tick as at registration. Only read for CHASSIS_CHANGE.
  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  chassisNonStandard?: boolean;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  reason!: string;

  @ApiProperty({ description: 'Mandatory for both change types — not optional per category like fill-up exceptions.' })
  @IsString()
  @MinLength(1)
  proofReference!: string;
}
