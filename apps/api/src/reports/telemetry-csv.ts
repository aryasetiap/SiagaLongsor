export const TELEMETRY_CSV_COLUMNS = [
  'recordedAt',
  'serverReceivedAt',
  'monitoringPointName',
  'hardwareId',
  'tiltMagnitudeDeg',
  'soilMoisturePct',
  'rainfallMmHour',
  'batteryVoltage',
  'firmwareVersion',
  'serverRisk',
  'riskProfileVersion',
  'affectsCurrentState',
] as const;

export interface TelemetryCsvRecord {
  readonly recordedAt: string;
  readonly serverReceivedAt: string;
  readonly monitoringPointName: string;
  readonly hardwareId: string;
  readonly tiltMagnitudeDeg: string;
  readonly soilMoisturePct: string;
  readonly rainfallMmHour: string;
  readonly batteryVoltage: string;
  readonly firmwareVersion: string;
  readonly serverRisk: string | null;
  readonly riskProfileVersion: number | null;
  readonly affectsCurrentState: boolean | null;
}

export function csvHeader(): string {
  return `${TELEMETRY_CSV_COLUMNS.join(',')}\r\n`;
}

export function serializeTelemetryCsvRow(record: TelemetryCsvRecord): string {
  const fields: readonly [unknown, boolean][] = [
    [record.recordedAt, false],
    [record.serverReceivedAt, false],
    [record.monitoringPointName, true],
    [record.hardwareId, true],
    [record.tiltMagnitudeDeg, false],
    [record.soilMoisturePct, false],
    [record.rainfallMmHour, false],
    [record.batteryVoltage, false],
    [record.firmwareVersion, true],
    [record.serverRisk, false],
    [record.riskProfileVersion, false],
    [record.affectsCurrentState, false],
  ];
  return `${fields.map(([value, text]) => csvField(value, text)).join(',')}\r\n`;
}

export function csvField(value: unknown, protectFormulaText: boolean): string {
  if (value === null || value === undefined) return '';
  let rendered = typeof value === 'boolean' ? String(value) : String(value);
  if (protectFormulaText && /^[=+\-@]/.test(rendered)) rendered = `'${rendered}`;
  if (/[",\r\n]/.test(rendered)) rendered = `"${rendered.replaceAll('"', '""')}"`;
  return rendered;
}

export function telemetryCsvFilename(siteId: string, from: Date, to: Date): string {
  const safeSite = siteId.replaceAll(/[^A-Za-z0-9_-]/g, '_').slice(0, 64) || 'site';
  const date = (value: Date) => value.toISOString().slice(0, 10);
  return `telemetry-${safeSite}-${date(from)}-${date(to)}.csv`;
}
