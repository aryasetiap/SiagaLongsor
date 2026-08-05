import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsDefined,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { CalibrationStatus } from '../generated/prisma/enums.js';

export class OverviewQueryDto {
  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;
}

export class ThresholdDto {
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  watch!: number;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  danger!: number;
}

export class SingleRiskProfileDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => ThresholdDto)
  tiltMagnitudeDeg!: ThresholdDto;

  @IsDefined()
  @ValidateNested()
  @Type(() => ThresholdDto)
  soilMoisturePct!: ThresholdDto;

  @IsDefined()
  @ValidateNested()
  @Type(() => ThresholdDto)
  rainfallMmHour!: ThresholdDto;

  @IsOptional()
  @IsEnum(CalibrationStatus)
  calibrationStatus?: CalibrationStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class AuditQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;
}
