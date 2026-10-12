import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { StockQueryDto } from './stock-query.dto';

export class StockExportQueryDto extends StockQueryDto {
  @ApiProperty({ enum: ['pdf'] })
  @IsIn(['pdf'])
  format!: 'pdf';
}
