import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDefined,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const trimmed = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
const nullableTrimmed = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() || null : value;

export class SiteIdDto {
  @IsString()
  @MinLength(1)
  siteId!: string;
}

export class SopDocumentIdDto {
  @IsString()
  @MinLength(1)
  documentId!: string;
}

class MapCenterDto {
  @IsArray()
  position!: unknown[];

  @IsInt()
  @Min(0)
  @Max(22)
  zoom!: number;
}

class MonitoringPointLocationDto {
  @IsString()
  @MinLength(1)
  monitoringPointId!: string;

  @IsArray()
  position!: unknown[];
}

class RiskZoneDto {
  @IsUUID('4')
  featureId!: string;

  @Transform(trimmed)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @Transform(nullableTrimmed)
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @IsObject()
  geometry!: Record<string, unknown>;
}

class EvacuationRouteDto extends RiskZoneDto {
  @IsOptional()
  @Transform(nullableTrimmed)
  @IsString()
  @MaxLength(200)
  destinationLabel?: string | null;
}

export class UpdateMapConfigurationDto {
  @IsDefined()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsInt()
  @Min(1)
  expectedVersion!: number | null;

  @IsDefined()
  @ValidateIf((_, value: unknown) => value !== null)
  @ValidateNested()
  @Type(() => MapCenterDto)
  center!: MapCenterDto | null;

  @IsArray()
  @ArrayMaxSize(1000)
  @ArrayUnique((entry: MonitoringPointLocationDto) => entry.monitoringPointId)
  @ValidateNested({ each: true })
  @Type(() => MonitoringPointLocationDto)
  monitoringPointLocations!: MonitoringPointLocationDto[];

  @IsArray()
  @ArrayMaxSize(250)
  @ArrayUnique((entry: RiskZoneDto) => entry.featureId)
  @ValidateNested({ each: true })
  @Type(() => RiskZoneDto)
  riskZones!: RiskZoneDto[];

  @IsArray()
  @ArrayMaxSize(250)
  @ArrayUnique((entry: EvacuationRouteDto) => entry.featureId)
  @ValidateNested({ each: true })
  @Type(() => EvacuationRouteDto)
  evacuationRoutes!: EvacuationRouteDto[];

  @IsDefined()
  @ValidateIf((_, value: unknown) => value !== null)
  @Transform(nullableTrimmed)
  @IsString()
  @MaxLength(2000)
  notes!: string | null;
}

export class MapOverviewQueryDto {
  @IsString()
  @MinLength(1)
  siteId!: string;
}

export class UploadSopDto {
  @Transform(trimmed)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @Transform(nullableTrimmed)
  @IsString()
  @MaxLength(2000)
  description?: string | null;
}

export class ListSopVersionsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;

  @IsOptional()
  @IsString()
  @MinLength(1)
  cursor?: string;
}

export interface UploadedPdfFile {
  readonly originalname: string;
  readonly mimetype: string;
  readonly size: number;
  readonly buffer: Buffer;
}
