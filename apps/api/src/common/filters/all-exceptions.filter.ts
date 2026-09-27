import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorResponseBody {
  statusCode: number;
  error: string;
  message: string | string[];
  // Optional structured data a thrown HttpException chose to expose, e.g.
  // the registration screen's duplicate-vehicle conflicts. Only ever what
  // the throw site put under `details` — never the exception's internals.
  // Not written to the log line below (which logs `message` only).
  details?: unknown;
  correlationId: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);
  private readonly isProduction = process.env.NODE_ENV === 'production';

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const correlationId = request.correlationId ?? 'unknown';

    const { statusCode, error, message, details } = this.resolve(exception);

    const body: ErrorResponseBody = {
      statusCode,
      error,
      message,
      ...(details !== undefined ? { details } : {}),
      correlationId,
    };

    this.logger.error(
      `[${correlationId}] ${request.method} ${request.url} -> ${statusCode}: ${JSON.stringify(message)}`,
      this.isProduction ? undefined : (exception as Error)?.stack,
    );

    response.status(statusCode).json(body);
  }

  private resolve(exception: unknown): {
    statusCode: number;
    error: string;
    message: string | string[];
    details?: unknown;
  } {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const payload = exception.getResponse();
      if (typeof payload === 'string') {
        return { statusCode, error: exception.name, message: payload };
      }
      const payloadObj = payload as Record<string, unknown>;
      return {
        statusCode,
        error: (payloadObj.error as string) ?? exception.name,
        message: (payloadObj.message as string | string[]) ?? exception.message,
        details: payloadObj.details,
      };
    }

    // Never leak internals (stack traces, driver errors, etc.) in production.
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'InternalServerError',
      message: this.isProduction ? 'An unexpected error occurred.' : String((exception as Error)?.message ?? exception),
    };
  }
}
