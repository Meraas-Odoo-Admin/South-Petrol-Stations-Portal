import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

// After review (18 Oct 2026): the plate, chassis, booklet, owner and vehicle
// type changed directly from «تعديل» by whoever may approve such changes
// (vehicles:approve_change), instead of a change request. Only the fields
// sent are changed; the values are checked with the registration's own rules.
export class UpdateVehicleIdentityDto {
  @ApiProperty({ required: false, example: '8-1234567' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  currentPlate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  chassisNumber?: string;

  // A chassis number that is not the standard 17 characters (6-20).
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  chassisNonStandard?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  registrationBooklet?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  ownerId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  vehicleTypeId?: string;
}
