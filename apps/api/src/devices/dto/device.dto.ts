import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { DeviceLifecycleStatus } from '../../generated/prisma/enums.js';

export enum DeviceSort {
  CREATED_AT_DESC = 'createdAt:desc',
  CREATED_AT_ASC = 'createdAt:asc',
  UPDATED_AT_DESC = 'updatedAt:desc',
  DISPLAY_NAME_ASC = 'displayName:asc',
  DISPLAY_NAME_DESC = 'displayName:desc',
  LAST_SEEN_AT_DESC = 'lastSeenAt:desc',
}

function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function parseInteger({ value }: { value: unknown }): unknown {
  return typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
}

export class ListDevicesQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  siteId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  monitoringPointId?: string;

  @IsOptional()
  @IsEnum(DeviceLifecycleStatus)
  lifecycleStatus?: DeviceLifecycleStatus;

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
  @IsEnum(DeviceSort)
  sort: DeviceSort = DeviceSort.CREATED_AT_DESC;
}

export class RegisterDeviceDto {
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9_-]{2,63}$/)
  hardwareId!: string;

  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  displayName!: string;

  @IsString()
  @MinLength(1)
  monitoringPointId!: string;
}

export class UpdateDeviceDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  displayName?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MinLength(1)
  monitoringPointId?: string;
}

export class DeviceIdDto {
  @IsString()
  @MinLength(1)
  deviceId!: string;
}
