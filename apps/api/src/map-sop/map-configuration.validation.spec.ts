import { describe, expect, it } from 'vitest';

import type { UpdateMapConfigurationDto } from './dto/map-sop.dto.js';
import { canonicalMapHash, normalizeMapConfiguration } from './map-configuration.validation.js';

describe('map configuration validation', () => {
  it('accepts longitude/latitude boundaries and normalizes negative zero', () => {
    const normalized = normalizeMapConfiguration(
      input({ center: { position: [-0, 90], zoom: 22 } }),
    );
    expect(normalized.center).toEqual({ position: [0, 90], zoom: 22 });
  });

  it.each([
    [[181, 0]],
    [[0, 91]],
    [[Number.NaN, 0]],
    [[Number.POSITIVE_INFINITY, 0]],
    [[105, -5, 10]],
  ])('rejects invalid or altitude position %j', (position) => {
    expect(() => normalizeMapConfiguration(input({ center: { position, zoom: 10 } }))).toThrow();
  });

  it('accepts a closed Polygon ring', () => {
    const normalized = normalizeMapConfiguration(
      input({
        riskZones: [
          {
            featureId: '11111111-1111-4111-8111-111111111111',
            name: 'Zona',
            description: null,
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [105, -5],
                  [106, -5],
                  [106, -6],
                  [105, -5],
                ],
              ],
            },
          },
        ],
      }),
    );
    expect(normalized.riskZones[0]?.geometry.type).toBe('Polygon');
  });

  it('rejects an open or short Polygon ring', () => {
    expect(() =>
      normalizeMapConfiguration(
        input({
          riskZones: [
            {
              featureId: '11111111-1111-4111-8111-111111111111',
              name: 'Zona',
              description: null,
              geometry: {
                type: 'Polygon',
                coordinates: [
                  [
                    [105, -5],
                    [106, -5],
                    [106, -6],
                  ],
                ],
              },
            },
          ],
        }),
      ),
    ).toThrow();
  });

  it('requires LineString with at least two positions and rejects Polygon route', () => {
    expect(() =>
      normalizeMapConfiguration(
        input({
          evacuationRoutes: [
            {
              featureId: '22222222-2222-4222-8222-222222222222',
              name: 'Rute',
              description: null,
              destinationLabel: null,
              geometry: { type: 'Polygon', coordinates: [] },
            },
          ],
        }),
      ),
    ).toThrow();
  });

  it('produces the same hash for property-order and negative-zero equivalents', () => {
    const first = normalizeMapConfiguration(input({ center: { position: [0, -5], zoom: 16 } }));
    const second = normalizeMapConfiguration(input({ center: { zoom: 16, position: [-0, -5] } }));
    expect(canonicalMapHash(first)).toBe(canonicalMapHash(second));
  });

  it('preserves feature array ordering because it is presentation-significant', () => {
    const first = normalizeMapConfiguration(input());
    const second = {
      ...first,
      monitoringPointLocations: [...first.monitoringPointLocations].reverse(),
    };
    expect(canonicalMapHash(first)).not.toBe(canonicalMapHash(second));
  });
});

function input(overrides: Record<string, unknown> = {}): UpdateMapConfigurationDto {
  return {
    expectedVersion: null,
    center: null,
    monitoringPointLocations: [
      { monitoringPointId: 'point-a', position: [105, -5] },
      { monitoringPointId: 'point-b', position: [106, -6] },
    ],
    riskZones: [],
    evacuationRoutes: [],
    notes: null,
    ...overrides,
  } as UpdateMapConfigurationDto;
}
