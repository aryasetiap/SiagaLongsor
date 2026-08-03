import { Type } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

import { ReportJobStatus, ReportType } from '../../generated/prisma/enums.js';

export class TelemetryCsvQueryDto {
  @IsString()
  @MinLength(1)
  siteId!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  monitoringPointId?: string;

  @IsISO8601({ strict: true })
  from!: string;

  @IsISO8601({ strict: true })
  to!: string;
}

export class CreateReportJobDto {
  @IsEnum(ReportType)
  reportType!: ReportType;

  @IsString()
  @MinLength(1)
  siteId!: string;

  @IsISO8601({ strict: true })
  from!: string;

  @IsISO8601({ strict: true })
  to!: string;
}

export class ReportJobListQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  siteId?: string;

  @IsOptional()
  @IsEnum(ReportJobStatus)
  status?: ReportJobStatus;

  @IsOptional()
  @IsEnum(ReportType)
  reportType?: ReportType;

  @IsOptional()
  @IsString()
  @MinLength(1)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;
}

export class ReportJobIdDto {
  @IsString()
  @MinLength(1)
  reportJobId!: string;
}
