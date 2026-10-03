import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateRegistrationDeskDto } from './create-registration-desk.dto';

export class UpdateRegistrationDeskDto extends PartialType(CreateRegistrationDeskDto) {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
