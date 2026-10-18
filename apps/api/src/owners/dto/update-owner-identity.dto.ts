import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength } from 'class-validator';

// After review (18 Oct 2026): the owner's identity number corrected directly
// from the owner's «تعديل» by whoever may approve such corrections
// (owners:approve_change), instead of a correction request.
export class UpdateOwnerIdentityDto {
  @ApiProperty({ enum: ['NATIONAL_ID', 'ADMINISTRATIVE_ID'] })
  @IsIn(['NATIONAL_ID', 'ADMINISTRATIVE_ID'])
  identityType!: 'NATIONAL_ID' | 'ADMINISTRATIVE_ID';

  @ApiProperty({ example: '119851234567' })
  @IsString()
  @MaxLength(20)
  identityNumber!: string;
}
