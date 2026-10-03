import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

// FAILED_PRINT is deliberately not offered here: it's only ever issued by
// POST /cards/:id/failed-print, which cancels the misprinted card first.
export const ISSUABLE_REASONS = ['FIRST_ISSUE', 'LOST', 'DAMAGED', 'DETAILS_CHANGED'] as const;
export type IssuableReason = (typeof ISSUABLE_REASONS)[number];

export class IssueCardDto {
  @ApiProperty({ description: 'The registration station the card is issued at.' })
  @IsString()
  @MinLength(1)
  registrationStationId!: string;

  @ApiProperty({ description: 'The desk (and printer) the card is printed at.' })
  @IsString()
  @MinLength(1)
  deskId!: string;

  @ApiProperty({ enum: ISSUABLE_REASONS })
  @IsIn(ISSUABLE_REASONS)
  reason!: IssuableReason;

  @ApiProperty({ required: false, description: 'Free-text detail, e.g. where the card was lost.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reasonNote?: string;
}
