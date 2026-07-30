import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';

import type { RequestWithContext } from './request-context.js';

interface StructuredHttpError {
  code?: string;
  message?: string | string[];
  details?: unknown;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestWithContext>();
    const response = http.getResponse<Response>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const structured = this.getStructuredError(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `Unhandled request failure requestId=${request.requestId}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json({
      error: {
        code: structured.code ?? this.defaultCode(status),
        message: this.safeMessage(status, structured.message),
        ...(structured.details === undefined ? {} : { details: structured.details }),
      },
      requestId: request.requestId,
      timestamp: new Date().toISOString(),
    });
  }

  private getStructuredError(exception: unknown): StructuredHttpError {
    if (!(exception instanceof HttpException)) {
      return {};
    }

    const response = exception.getResponse();
    return typeof response === 'object' && response !== null
      ? (response as StructuredHttpError)
      : {};
  }

  private safeMessage(status: number, message: StructuredHttpError['message']): string {
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      return 'Terjadi kesalahan internal.';
    }

    if (Array.isArray(message)) {
      return 'Payload tidak valid.';
    }

    return message ?? 'Permintaan tidak dapat diproses.';
  }

  private defaultCode(status: number): string {
    const codes: Partial<Record<number, string>> = {
      [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
      [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
      [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
      [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
      [HttpStatus.CONFLICT]: 'CONFLICT',
      [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
      [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
    };

    return codes[status] ?? 'INTERNAL_ERROR';
  }
}
