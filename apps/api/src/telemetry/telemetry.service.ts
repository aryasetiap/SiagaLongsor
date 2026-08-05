import { createHash } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma, type Device } from '../generated/prisma/client.js';
import { DeviceLifecycleStatus, FirmwareRiskLevel } from '../generated/prisma/enums.js';
import { RiskEvaluationService } from '../risk/risk-evaluation.service.js';
import { RealtimePostCommitService } from '../realtime/realtime-post-commit.service.js';
import type { TelemetryDto } from './dto/telemetry.dto.js';
import type { AuthenticatedDevice, TelemetryAcceptedResponse } from './telemetry.types.js';

@Injectable()
export class TelemetryService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly riskEvaluation: RiskEvaluationService,
    private readonly realtime: RealtimePostCommitService,
  ) {}

  async ingest(
    devicePrincipal: AuthenticatedDevice,
    idempotencyKey: string | undefined,
    input: TelemetryDto,
  ): Promise<TelemetryAcceptedResponse> {
    if (idempotencyKey === undefined || idempotencyKey !== input.messageId) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_MISMATCH',
        message: 'Idempotency-Key harus sama dengan messageId.',
      });
    }

    const deviceTimestamp = new Date(input.timestamp);
    const maximumTimestamp = Date.now() + this.config.telemetry.maxFutureSkewSeconds * 1_000;
    if (deviceTimestamp.getTime() > maximumTimestamp) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Payload tidak valid.',
        details: [
          {
            field: 'timestamp',
            messages: ['Timestamp perangkat terlalu jauh di masa depan.'],
          },
        ],
      });
    }

    const rawPayload = toRawPayload(input);
    const canonicalPayloadHash = createHash('sha256')
      .update(canonicalize(rawPayload))
      .digest('hex');
    const serverReceivedAt = new Date();

    const result = await this.prisma.$transaction(async (transaction) => {
      const device = await lockDevice(transaction, devicePrincipal.id);
      validateCurrentDevice(device, devicePrincipal);

      const existing = await transaction.telemetry.findUnique({
        where: {
          deviceId_messageId: {
            deviceId: devicePrincipal.id,
            messageId: input.messageId,
          },
        },
      });
      if (existing !== null) {
        if (existing.canonicalPayloadHash !== canonicalPayloadHash) {
          throw new ConflictException({
            code: 'IDEMPOTENCY_CONFLICT',
            message: 'messageId telah digunakan untuk payload berbeda.',
          });
        }
        return { telemetry: existing, duplicate: true, realtime: [] };
      }

      const sequenceConflict = await transaction.telemetry.findUnique({
        where: {
          deviceId_bootId_sequence: {
            deviceId: devicePrincipal.id,
            bootId: input.bootId,
            sequence: BigInt(input.sequence),
          },
        },
      });
      if (sequenceConflict !== null) {
        throw new ConflictException({
          code: 'SEQUENCE_CONFLICT',
          message: 'Sequence telah digunakan pada boot session ini.',
        });
      }

      const telemetry = await transaction.telemetry.create({
        data: {
          deviceId: devicePrincipal.id,
          monitoringPointId: device.monitoringPointId,
          messageId: input.messageId,
          bootId: input.bootId,
          sequence: BigInt(input.sequence),
          deviceTimestamp,
          serverReceivedAt,
          firmwareVersion: input.firmwareVersion,
          ...(input.network?.type === undefined ? {} : { networkType: input.network.type }),
          ...(input.network?.signalRssi === undefined
            ? {}
            : { signalRssi: input.network.signalRssi }),
          ...(input.readings.tiltXDeg === undefined ? {} : { tiltXDeg: input.readings.tiltXDeg }),
          ...(input.readings.tiltYDeg === undefined ? {} : { tiltYDeg: input.readings.tiltYDeg }),
          tiltMagnitudeDeg: input.readings.tiltMagnitudeDeg,
          soilMoisturePct: input.readings.soilMoisturePct,
          rainfallMmHour: input.readings.rainfallMmHour,
          batteryVoltage: input.readings.batteryVoltage,
          firmwareRiskLevel: input.deviceAssessment?.riskLevel ?? FirmwareRiskLevel.UNKNOWN,
          firmwareSirenActive: input.deviceAssessment?.sirenActive ?? false,
          canonicalPayloadHash,
          rawPayload,
        },
      });

      const isLatest = device.lastTelemetryAt === null || deviceTimestamp >= device.lastTelemetryAt;
      const lastSeenAt =
        device.lastSeenAt === null || serverReceivedAt > device.lastSeenAt
          ? serverReceivedAt
          : device.lastSeenAt;
      await transaction.device.update({
        where: { id: device.id },
        data: {
          lastSeenAt,
          ...(isLatest
            ? {
                lastTelemetryAt: deviceTimestamp,
                firmwareVersion: input.firmwareVersion,
                lastNetworkType: input.network?.type ?? null,
                lastSignalRssi: input.network?.signalRssi ?? null,
              }
            : {}),
        },
      });
      const realtime = await this.riskEvaluation.evaluateAcceptedTelemetry(transaction, {
        device,
        telemetry,
        affectsCurrentState: isLatest,
        evaluatedAt: serverReceivedAt,
      });

      return { telemetry, duplicate: false, realtime };
    });

    await this.realtime.dispatch(result.realtime);

    return {
      accepted: true,
      duplicate: result.duplicate,
      telemetryId: result.telemetry.id,
      receivedAt: result.telemetry.serverReceivedAt.toISOString(),
    };
  }
}

function toRawPayload(input: TelemetryDto): Prisma.InputJsonObject {
  return {
    messageId: input.messageId,
    bootId: input.bootId,
    sequence: input.sequence,
    timestamp: input.timestamp,
    firmwareVersion: input.firmwareVersion,
    ...(input.network === undefined
      ? {}
      : {
          network: {
            type: input.network.type,
            ...(input.network.signalRssi === undefined
              ? {}
              : { signalRssi: input.network.signalRssi }),
          },
        }),
    readings: {
      ...(input.readings.tiltXDeg === undefined ? {} : { tiltXDeg: input.readings.tiltXDeg }),
      ...(input.readings.tiltYDeg === undefined ? {} : { tiltYDeg: input.readings.tiltYDeg }),
      tiltMagnitudeDeg: input.readings.tiltMagnitudeDeg,
      soilMoisturePct: input.readings.soilMoisturePct,
      rainfallMmHour: input.readings.rainfallMmHour,
      batteryVoltage: input.readings.batteryVoltage,
    },
    ...(input.deviceAssessment === undefined
      ? {}
      : {
          deviceAssessment: {
            riskLevel: input.deviceAssessment.riskLevel,
            sirenActive: input.deviceAssessment.sirenActive,
          },
        }),
  };
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'number') {
    return JSON.stringify(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  if (typeof value !== 'object') throw new Error('Unsupported canonical JSON value');

  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(object[key])}`)
    .join(',')}}`;
}

async function lockDevice(
  transaction: Prisma.TransactionClient,
  deviceId: string,
): Promise<Device | null> {
  const rows = await transaction.$queryRaw<Array<Device>>(Prisma.sql`
    SELECT *
    FROM "Device"
    WHERE "id" = ${deviceId}
    FOR UPDATE
  `);
  return rows[0] ?? null;
}

function validateCurrentDevice(
  device: Device | null,
  principal: AuthenticatedDevice,
): asserts device is Device {
  if (device === null || device.credentialHash !== principal.authenticatedCredentialHash) {
    throw new UnauthorizedException({
      code: 'DEVICE_CREDENTIAL_INVALID',
      message: 'Credential device tidak valid.',
    });
  }
  if (device.lifecycleStatus === DeviceLifecycleStatus.DISABLED) {
    throw new ForbiddenException({
      code: 'DEVICE_DISABLED',
      message: 'Device dinonaktifkan.',
    });
  }
}
