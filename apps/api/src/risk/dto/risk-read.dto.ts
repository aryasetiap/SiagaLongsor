import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import {
  AlertSeverity,
  AlertStatus,
  AlertType,
  ConnectivityStatus,
  RiskLevel,
} from '../../generated/prisma/enums.js';

function trim({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function integer({ value }: { value: unknown }): unknown {
  return typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
}

class PageQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  cursor?: string;

  @IsOptional()
  @Transform(integer)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;
}

export enum MonitoringOverviewSort {
  NAME_ASC = 'name:asc',
  NAME_DESC = 'name:desc',
  RISK_DESC = 'risk:desc',
  CONNECTIVITY_DESC = 'connectivity:desc',
  LAST_TELEMETRY_AT_DESC = 'lastTelemetryAt:desc',
}

export class MonitoringOverviewQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  siteId?: string;

  @IsOptional()
  @IsEnum(RiskLevel)
  riskLevel?: RiskLevel;

  @IsOptional()
  @IsEnum(ConnectivityStatus)
  connectivityStatus?: ConnectivityStatus;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsEnum(MonitoringOverviewSort)
  sort: MonitoringOverviewSort = MonitoringOverviewSort.NAME_ASC;
}

export class RiskAssessmentHistoryQueryDto extends PageQueryDto {}

export enum AlertSort {
  LAST_OBSERVED_AT_DESC = 'lastObservedAt:desc',
  CREATED_AT_DESC = 'createdAt:desc',
  SEVERITY_DESC = 'severity:desc',
}

export class AlertListQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  siteId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  monitoringPointId?: string;

  @IsOptional()
  @IsEnum(AlertType)
  type?: AlertType;

  @IsOptional()
  @IsEnum(AlertSeverity)
  severity?: AlertSeverity;

  @IsOptional()
  @IsEnum(AlertStatus)
  status?: AlertStatus;

  @IsOptional()
  @IsEnum(AlertSort)
  sort: AlertSort = AlertSort.LAST_OBSERVED_AT_DESC;
}

export class AlertIdDto {
  @IsString()
  @MinLength(1)
  alertId!: string;
}
