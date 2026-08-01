import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

function parseInteger({ value }: { value: unknown }): unknown {
  return typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
}

function parseBoolean({ value }: { value: unknown }): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

export class DashboardSummaryQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  siteId?: string;

  @IsOptional()
  @Transform(parseInteger)
  @IsInt()
  @Min(1)
  @Max(168)
  windowHours = 24;
}

export class SensorSeriesQueryDto {
  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;

  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  includeLate = false;

  @IsOptional()
  @IsString()
  @MinLength(1)
  cursor?: string;

  @IsOptional()
  @Transform(parseInteger)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit = 500;
}
