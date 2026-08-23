import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

// identityType/identityNumber are deliberately absent — immutable after
// creation, same as User.username. Recording a fill-up under the wrong
// identity is a data-integrity issue, not something a PATCH should paper over.
export class UpdateDriverDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  fullName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phone?: string;
}
