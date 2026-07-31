import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { CalibrationStatus } from '../../generated/prisma/enums.js';

export class TechnicalRangeDto {
  @IsNumber()
  minimum!: number;

  @IsOptional()
  @IsNumber()
  maximum!: number | null;
}

export class SafeThresholdsDto {
  @IsNumber()
  tiltMagnitudeDegLt!: number;

  @IsNumber()
  soilMoisturePctLt!: number;

  @IsNumber()
  rainfallMmHourLt!: number;
}

export class DangerThresholdsDto {
  @IsNumber()
  tiltMagnitudeDegGt!: number;

  @IsNumber()
  rainfallMmHourGt!: number;

  @IsNumber()
  soilMoisturePctGt!: number;
}

export class RiskThresholdsDto {
  @ValidateNested()
  @Type(() => SafeThresholdsDto)
  safe!: SafeThresholdsDto;

  @ValidateNested()
  @Type(() => DangerThresholdsDto)
  danger!: DangerThresholdsDto;
}

export class TechnicalRangesDto {
  @ValidateNested()
  @Type(() => TechnicalRangeDto)
  tiltXDeg!: TechnicalRangeDto;

  @ValidateNested()
  @Type(() => TechnicalRangeDto)
  tiltYDeg!: TechnicalRangeDto;

  @ValidateNested()
  @Type(() => TechnicalRangeDto)
  tiltMagnitudeDeg!: TechnicalRangeDto;

  @ValidateNested()
  @Type(() => TechnicalRangeDto)
  soilMoisturePct!: TechnicalRangeDto;

  @ValidateNested()
  @Type(() => TechnicalRangeDto)
  rainfallMmHour!: TechnicalRangeDto;

  @ValidateNested()
  @Type(() => TechnicalRangeDto)
  batteryVoltage!: TechnicalRangeDto;

  @ValidateNested()
  @Type(() => TechnicalRangeDto)
  signalRssi!: TechnicalRangeDto;
}

export class RiskFreshnessDto {
  @IsInt()
  @Min(1)
  onlineWithinMinutes!: number;

  @IsInt()
  @Min(2)
  offlineAfterMinutes!: number;
}

export class RiskHysteresisDto {
  @IsInt()
  @Min(1)
  watchConsecutiveSamples!: number;

  @IsInt()
  @Min(1)
  dangerConsecutiveSamples!: number;

  @IsInt()
  @Min(0)
  downgradeStableMinutes!: number;

  @IsInt()
  @Min(1)
  mismatchConsecutiveSamples!: number;
}

export class UpdateRiskProfileDto {
  @IsEnum(CalibrationStatus)
  calibrationStatus!: CalibrationStatus;

  @ValidateNested()
  @Type(() => RiskThresholdsDto)
  thresholds!: RiskThresholdsDto;

  @ValidateNested()
  @Type(() => TechnicalRangesDto)
  technicalRanges!: TechnicalRangesDto;

  @ValidateNested()
  @Type(() => RiskFreshnessDto)
  freshness!: RiskFreshnessDto;

  @ValidateNested()
  @Type(() => RiskHysteresisDto)
  hysteresis!: RiskHysteresisDto;

  @ValidateIf((_object, value: unknown) => value !== null)
  @IsString()
  @MaxLength(2000)
  notes!: string | null;
}

export class RiskProfileSiteIdDto {
  @IsString()
  siteId!: string;
}
