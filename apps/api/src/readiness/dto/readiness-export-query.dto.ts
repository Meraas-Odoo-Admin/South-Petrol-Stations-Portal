import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { ReadinessQueryDto } from './readiness-query.dto';

export class ReadinessExportQueryDto extends ReadinessQueryDto {
  @ApiProperty({ enum: ['pdf'] })
  @IsIn(['pdf'])
  format!: 'pdf';
}
