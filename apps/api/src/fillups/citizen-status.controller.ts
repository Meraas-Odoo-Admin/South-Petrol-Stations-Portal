import { Controller, Get, HttpException, HttpStatus, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { normalizeScannedCardNumber } from '../cards/card-number';
import { FillUpsService } from './fillups.service';

// The citizen's own check (after review, 19 Oct 2026): scan the QR on your
// card, see whether the vehicle may fill up now. No sign-in. It answers only
// what the printed card already shows plus the verdict — never the owner's
// name or identity number.
//
// The pumps come first (the client: "make the system efficient; the citizen's
// limit can be strict"):
//  - 10 checks an hour from one address (the throttler);
//  - at most CITIZEN_CHECKS_PER_SECOND checks a second from everyone
//    together, beyond which the answer is 503 «busy» without touching the
//    database — a rush of citizens never slows a fill-up being recorded;
//  - a card's answer is kept for a minute: asking again reads memory.
const CITIZEN_CHECKS_PER_SECOND = 10;
const RESULT_CACHE_MS = 60_000;
const RESULT_CACHE_MAX = 5_000;

type CitizenStatus = Awaited<ReturnType<FillUpsService['citizenCardStatus']>>;

@ApiTags('public')
@Controller('public')
export class CitizenStatusController {
  private readonly results = new Map<string, { at: number; value: CitizenStatus }>();
  private second = 0;
  private inThisSecond = 0;

  constructor(private readonly fillups: FillUpsService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @Get('card-status/:cardNumber')
  async cardStatus(@Param('cardNumber') rawCardNumber: string) {
    const key = normalizeScannedCardNumber(rawCardNumber) ?? rawCardNumber;
    const cached = this.results.get(key);
    if (cached && Date.now() - cached.at < RESULT_CACHE_MS) return cached.value;

    const now = Math.floor(Date.now() / 1000);
    if (now !== this.second) {
      this.second = now;
      this.inThisSecond = 0;
    }
    if (++this.inThisSecond > CITIZEN_CHECKS_PER_SECOND) {
      throw new HttpException('CITIZEN_CHECK_BUSY', HttpStatus.SERVICE_UNAVAILABLE);
    }

    const value = await this.fillups.citizenCardStatus(rawCardNumber);
    if (this.results.size >= RESULT_CACHE_MAX) {
      // Oldest first: a Map keeps insertion order.
      const oldest = this.results.keys().next().value;
      if (oldest !== undefined) this.results.delete(oldest);
    }
    this.results.set(key, { at: Date.now(), value });
    return value;
  }
}
