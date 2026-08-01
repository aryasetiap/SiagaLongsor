import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

function trim({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function integer({ value }: { value: unknown }): unknown {
  return typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
}

export class AcknowledgeAlertDto {
  @IsUUID('4')
  actionId!: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  note!: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  fieldCondition!: string;

  @IsBoolean()
  sopExecuted!: boolean;
}

export class ResolveAlertDto {
  @IsUUID('4')
  actionId!: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  resolutionNote!: string;
}

export class FalseAlarmAlertDto {
  @IsUUID('4')
  actionId!: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  reason!: string;
}

export class AlertEventListQueryDto {
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
