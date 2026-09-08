import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class AssignPermissionDto {
  @ApiProperty()
  @IsString()
  permissionId!: string;
}
