import {
  Body,
  Controller,
  Headers,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import { Public } from '../authorization/public.decorator.js';
import { DeviceAuthGuard } from './device-auth.guard.js';
import { TelemetryDto } from './dto/telemetry.dto.js';
import { JsonContentTypeGuard } from './json-content-type.guard.js';
import { TelemetryService } from './telemetry.service.js';
import type { DeviceAuthenticatedRequest, TelemetryAcceptedResponse } from './telemetry.types.js';

@Controller('iot')
export class TelemetryController {
  constructor(private readonly telemetry: TelemetryService) {}

  @Public()
  @UseGuards(DeviceAuthGuard, JsonContentTypeGuard)
  @Post('telemetry')
  async ingest(
    @Req() request: DeviceAuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: TelemetryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TelemetryAcceptedResponse> {
    if (request.authenticatedDevice === undefined) {
      throw new UnauthorizedException({
        code: 'DEVICE_CREDENTIAL_INVALID',
        message: 'Credential device tidak valid.',
      });
    }
    const result = await this.telemetry.ingest(request.authenticatedDevice, idempotencyKey, input);
    response.status(result.duplicate ? 200 : 201);
    return result;
  }
}
