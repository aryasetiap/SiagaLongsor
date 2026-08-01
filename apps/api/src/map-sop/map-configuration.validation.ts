import { createHash } from 'node:crypto';

import { BadRequestException } from '@nestjs/common';

import type { UpdateMapConfigurationDto } from './dto/map-sop.dto.js';
import type { GeoJsonPosition, MapConfigurationData } from './map-sop.types.js';

export function normalizeMapConfiguration(input: UpdateMapConfigurationDto): MapConfigurationData {
  return {
    center:
      input.center === null
        ? null
        : { position: position(input.center.position, 'center.position'), zoom: input.center.zoom },
    monitoringPointLocations: input.monitoringPointLocations.map((entry, index) => ({
      monitoringPointId: entry.monitoringPointId,
      position: position(entry.position, `monitoringPointLocations.${index}.position`),
    })),
    riskZones: input.riskZones.map((entry, index) => ({
      featureId: entry.featureId,
      name: entry.name,
      description: entry.description ?? null,
      geometry: polygon(entry.geometry, `riskZones.${index}.geometry`),
    })),
    evacuationRoutes: input.evacuationRoutes.map((entry, index) => ({
      featureId: entry.featureId,
      name: entry.name,
      description: entry.description ?? null,
      destinationLabel: entry.destinationLabel ?? null,
      geometry: lineString(entry.geometry, `evacuationRoutes.${index}.geometry`),
    })),
    notes: input.notes ?? null,
  };
}

export function canonicalMapHash(configuration: MapConfigurationData): string {
  // Array order is presentation-significant for map layers and routes, so normalization preserves it.
  return createHash('sha256').update(JSON.stringify(configuration)).digest('hex');
}

function polygon(
  value: Record<string, unknown>,
  field: string,
): MapConfigurationData['riskZones'][number]['geometry'] {
  if (
    value.type !== 'Polygon' ||
    !Array.isArray(value.coordinates) ||
    value.coordinates.length < 1
  ) {
    throw invalidGeometry(field, 'GeoJSON Polygon minimal memiliki satu linear ring.');
  }
  const coordinates = value.coordinates.map((candidate, ringIndex) => {
    if (!Array.isArray(candidate) || candidate.length < 4) {
      throw invalidGeometry(
        `${field}.coordinates.${ringIndex}`,
        'Linear ring minimal empat posisi.',
      );
    }
    const ring = candidate.map((item, index) =>
      position(item, `${field}.coordinates.${ringIndex}.${index}`),
    );
    if (ring[0]?.[0] !== ring.at(-1)?.[0] || ring[0]?.[1] !== ring.at(-1)?.[1]) {
      throw invalidGeometry(`${field}.coordinates.${ringIndex}`, 'Linear ring harus tertutup.');
    }
    return ring;
  });
  return { type: 'Polygon', coordinates };
}

function lineString(
  value: Record<string, unknown>,
  field: string,
): MapConfigurationData['evacuationRoutes'][number]['geometry'] {
  if (
    value.type !== 'LineString' ||
    !Array.isArray(value.coordinates) ||
    value.coordinates.length < 2
  ) {
    throw invalidGeometry(field, 'GeoJSON LineString minimal memiliki dua posisi.');
  }
  return {
    type: 'LineString',
    coordinates: value.coordinates.map((item, index) =>
      position(item, `${field}.coordinates.${index}`),
    ),
  };
}

function position(value: unknown, field: string): GeoJsonPosition {
  if (!Array.isArray(value) || value.length !== 2) {
    throw invalidGeometry(field, 'Posisi harus tepat [longitude, latitude] tanpa altitude.');
  }
  const [rawLongitude, rawLatitude] = value;
  if (
    typeof rawLongitude !== 'number' ||
    typeof rawLatitude !== 'number' ||
    !Number.isFinite(rawLongitude) ||
    !Number.isFinite(rawLatitude) ||
    rawLongitude < -180 ||
    rawLongitude > 180 ||
    rawLatitude < -90 ||
    rawLatitude > 90
  ) {
    throw invalidGeometry(field, 'Longitude atau latitude tidak valid.');
  }
  return [normalizeZero(rawLongitude), normalizeZero(rawLatitude)];
}

function normalizeZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function invalidGeometry(field: string, message: string): BadRequestException {
  return new BadRequestException({
    code: 'VALIDATION_ERROR',
    message: 'Payload tidak valid.',
    details: [{ field, messages: [message] }],
  });
}
