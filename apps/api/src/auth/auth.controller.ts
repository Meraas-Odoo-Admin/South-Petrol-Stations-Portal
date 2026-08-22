import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { AuthService, TokenPair } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from '../common/decorators/public.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from './types/jwt-payload.interface';

export const REFRESH_COOKIE_NAME = 'refresh_token';

const REFRESH_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: '/api/v1/auth',
};

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = await this.auth.validateCredentials(dto.username, dto.password, req.ip);
    const pair = await this.auth.issueTokenPair(user.id, user.username);
    this.setRefreshCookie(res, pair);
    return { accessToken: pair.accessToken, mustChangePassword: user.mustChangePassword };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!raw) {
      throw new UnauthorizedException('Missing refresh token.');
    }
    const pair = await this.auth.rotateRefreshToken(raw);
    this.setRefreshCookie(res, pair);
    return { accessToken: pair.accessToken };
  }

  // Authenticated (not just @Public) so we know who's logging out for the
  // audit trail, but requires no specific permission beyond being logged in.
  @RequirePermission()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const raw = req.cookies?.[REFRESH_COOKIE_NAME];
    if (raw) {
      await this.auth.logout(raw, user.id);
    }
    res.clearCookie(REFRESH_COOKIE_NAME, REFRESH_COOKIE_OPTIONS);
  }

  private setRefreshCookie(res: Response, pair: TokenPair) {
    res.cookie(REFRESH_COOKIE_NAME, pair.refreshToken, {
      ...REFRESH_COOKIE_OPTIONS,
      expires: pair.refreshExpiresAt,
    });
  }
}
