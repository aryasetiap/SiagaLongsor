import { describe, expect, it } from 'vitest';

import { parseReportRange } from './report-range.js';
import {
  csvField,
  csvHeader,
  serializeTelemetryCsvRow,
  telemetryCsvFilename,
} from './telemetry-csv.js';

describe('telemetry CSV contract', () => {
  it('emits the exact header with RFC 4180 CRLF', () => {
    expect(csvHeader()).toBe(
      'recordedAt,serverReceivedAt,monitoringPointName,hardwareId,tiltMagnitudeDeg,soilMoisturePct,rainfallMmHour,batteryVoltage,firmwareVersion,serverRisk,riskProfileVersion,affectsCurrentState\r\n',
    );
  });

  it('doubles quotes and quotes comma/newline text', () => {
    expect(csvField('A,"B"\nC', true)).toBe('"A,""B""\nC"');
  });

  it.each(['=SUM(A1)', '+cmd', '-danger', '@formula'])('neutralizes formula text %s', (value) => {
    expect(csvField(value, true)).toBe(`'${value}`);
  });

  it('does not neutralize a negative numeric field', () => {
    expect(csvField('-12.5', false)).toBe('-12.5');
  });

  it('preserves null as an empty field and UNKNOWN as UNKNOWN', () => {
    const row = serializeTelemetryCsvRow({
      recordedAt: '2026-08-01T00:00:00.000Z',
      serverReceivedAt: '2026-08-01T00:00:01.000Z',
      monitoringPointName: 'Point',
      hardwareId: 'DEVICE',
      tiltMagnitudeDeg: '1',
      soilMoisturePct: '2',
      rainfallMmHour: '3',
      batteryVoltage: '4',
      firmwareVersion: 'v1',
      serverRisk: 'UNKNOWN',
      riskProfileVersion: null,
      affectsCurrentState: null,
    });
    expect(row).toContain(',UNKNOWN,,\r\n');
  });

  it('creates a safe filename without trusting Site text', () => {
    const fileName = telemetryCsvFilename(
      '../site\r\nunsafe',
      new Date('2026-07-01T00:00:00.000Z'),
      new Date('2026-08-01T00:00:00.000Z'),
    );
    expect(fileName).toBe('telemetry-___site__unsafe-2026-07-01-2026-08-01.csv');
    expect(fileName).not.toMatch(/[\r\n/\\]/);
  });

  it('accepts the exact 31-day boundary', () => {
    expect(parseReportRange('2026-07-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z')).toMatchObject({
      from: new Date('2026-07-01T00:00:00.000Z'),
      to: new Date('2026-08-01T00:00:00.000Z'),
    });
  });

  it.each([
    ['2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z'],
    ['2026-08-02T00:00:00.000Z', '2026-08-01T00:00:00.000Z'],
    ['2026-07-01T00:00:00.000Z', '2026-08-01T00:00:00.001Z'],
  ])('rejects invalid or overlong range %s to %s', (from, to) => {
    expect(() => parseReportRange(from, to)).toThrow('Rentang waktu');
  });
});
