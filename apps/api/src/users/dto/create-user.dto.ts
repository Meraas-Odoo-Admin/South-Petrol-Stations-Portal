import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateUserDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(60)
  username!: string;

  // Optional since phase 4b: when left out the system generates a strong
  // temporary password and returns it once. Always created must-change.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(120)
  fullName!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  // Phase 4b: the one job (a role) and the places it applies to, set in the
  // same step as the account. Optional so the older create-then-assign
  // callers keep working.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  roleId?: string;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(300)
  @IsString({ each: true })
  placeIds?: string[];
}
