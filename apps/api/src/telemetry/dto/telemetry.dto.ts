import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { FirmwareRiskLevel, NetworkType } from '../../generated/prisma/enums.js';

export class TelemetryNetworkDto {
  @IsEnum(NetworkType)
  type!: NetworkType;

  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-150)
  @Max(0)
  signalRssi?: number;
}

export class TelemetryReadingsDto {
  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-180)
  @Max(180)
  tiltXDeg?: number;

  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-180)
  @Max(180)
  tiltYDeg?: number;

  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  @Max(180)
  tiltMagnitudeDeg!: number;

  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  @Max(100)
  soilMoisturePct!: number;

  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  rainfallMmHour!: number;

  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  @Max(30)
  batteryVoltage!: number;
}

export class DeviceAssessmentDto {
  @IsEnum(FirmwareRiskLevel)
  riskLevel!: FirmwareRiskLevel;

  @IsBoolean()
  sirenActive!: boolean;
}

export class TelemetryDto {
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  messageId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  bootId!: string;

  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  sequence!: number;

  @IsISO8601({ strict: true, strictSeparator: true })
  timestamp!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(32)
  firmwareVersion!: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => TelemetryNetworkDto)
  network?: TelemetryNetworkDto;

  @IsObject()
  @ValidateNested()
  @Type(() => TelemetryReadingsDto)
  readings!: TelemetryReadingsDto;

  @IsObject()
  @ValidateNested()
  @Type(() => DeviceAssessmentDto)
  deviceAssessment!: DeviceAssessmentDto;
}
