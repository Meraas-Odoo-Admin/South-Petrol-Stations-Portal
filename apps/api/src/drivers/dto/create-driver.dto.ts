import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { IdentityType } from '@prisma/client';

export class CreateDriverDto {
  @ApiProperty({ enum: IdentityType })
  @IsEnum(IdentityType)
  identityType!: IdentityType;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  identityNumber!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  fullName!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phone?: string;
}
