import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { DateRangeQueryDto } from '../../common/dto/date-range-query.dto';

// CSV is made in the browser from the table the person is looking at; the
// server makes the PDF (Arabic through the Chromium renderer).
export class OfficesExportQueryDto extends DateRangeQueryDto {
  @ApiProperty({ enum: ['pdf'] })
  @IsIn(['pdf'])
  format!: 'pdf';

  // Limits the document to one office; it must be inside the caller's scope.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  officeId?: string;
}
