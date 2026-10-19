import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

export class AuditQueryDto extends PaginationQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  entityType?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  userId?: string;

  // Everything that happened to one record (a vehicle, an account, a station…),
  // with entityType (after review, 19 Oct 2026).
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  entityId?: string;

  // One action, or several separated by commas (a group on the screen, such
  // as every sign-in event).
  @ApiProperty({ required: false, example: 'LOGIN_FAILED,ACCOUNT_LOCKED' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  action?: string;

  // An inclusive range of Africa/Tripoli calendar days.
  @ApiProperty({ required: false, example: '2026-10-01' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from must be a calendar day, YYYY-MM-DD.' })
  from?: string;

  @ApiProperty({ required: false, example: '2026-10-31' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to must be a calendar day, YYYY-MM-DD.' })
  to?: string;

  // Who did it (name or username), the name typed at a failed sign-in, an
  // address, or the exact id of the record.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}
