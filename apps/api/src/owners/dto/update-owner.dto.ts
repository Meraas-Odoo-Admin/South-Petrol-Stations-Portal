import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

// identityType/identityNumber are deliberately absent — immutable after
// creation, same as Driver.identityType/identityNumber and User.username.
// Recording a fill-up under the wrong owner identity is a data-integrity
// issue, not something a PATCH should paper over.
export class UpdateOwnerDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  fullName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  address?: string;
}
