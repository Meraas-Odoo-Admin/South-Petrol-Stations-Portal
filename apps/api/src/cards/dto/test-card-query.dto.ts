import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class TestCardQueryDto {
  // Whose office name goes on the header — the desk's own station's.
  @ApiProperty()
  @IsString()
  @MinLength(1)
  registrationStationId!: string;

  // The desk the test card is printed at: a test card uses up a blank, which
  // the stock reconciliation counts against that desk.
  @ApiProperty()
  @IsString()
  @MinLength(1)
  deskId!: string;
}
