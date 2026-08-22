import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { HealthCheckResponse } from '@fuel-tracking/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness + database connectivity check' })
  async check(): Promise<HealthCheckResponse> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', database: 'connected', timestamp: new Date().toISOString() };
    } catch {
      throw new HttpException(
        {
          status: 'error',
          database: 'disconnected',
          timestamp: new Date().toISOString(),
        } satisfies HealthCheckResponse,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}
