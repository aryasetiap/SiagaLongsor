import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export enum MonitoringPointSort {
  CREATED_AT_DESC = 'createdAt:desc',
  CREATED_AT_ASC = 'createdAt:asc',
  UPDATED_AT_DESC = 'updatedAt:desc',
  NAME_ASC = 'name:asc',
  NAME_DESC = 'name:desc',
}

function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function parseBoolean({ value }: { value: unknown }): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

function parseInteger({ value }: { value: unknown }): unknown {
  return typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
}

export class ListMonitoringPointsQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  siteId?: string;

  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  cursor?: string;

  @IsOptional()
  @Transform(parseInteger)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;

  @IsOptional()
  @IsEnum(MonitoringPointSort)
  sort: MonitoringPointSort = MonitoringPointSort.CREATED_AT_DESC;
}

export class CreateMonitoringPointDto {
  @IsString()
  @MinLength(1)
  siteId!: string;

  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  locationDescription?: string | null;
}

export class UpdateMonitoringPointDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  locationDescription?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}

export class MonitoringPointIdDto {
  @IsString()
  @MinLength(1)
  monitoringPointId!: string;
}
