import type {
  Alert,
  MonitoringOverviewItem,
  RiskAssessment,
  RiskProfile,
} from '../src/risk/risk-contracts';

export const overviewFixture: MonitoringOverviewItem = {
  monitoringPoint: {
    id: 'mp-phase-03',
    name: 'Lereng Utama',
    locationDescription: 'Belakang sekolah',
    isActive: true,
  },
  site: { id: 'site-phase-03', name: 'SMAN 17', timezone: 'Asia/Jakarta' },
  device: {
    id: 'device-phase-03',
    hardwareId: 'PHASE03-DEVICE',
    displayName: 'Sensor Utama',
    lifecycleStatus: 'ENABLED',
  },
  latestTelemetry: {
    telemetryId: 'telemetry-phase-03',
    deviceTimestamp: '2026-08-01T02:14:00.000Z',
    serverReceivedAt: '2026-08-01T02:14:02.000Z',
    tiltMagnitudeDeg: 4.2,
    soilMoisturePct: 72.1,
    rainfallMmHour: 24.5,
    batteryVoltage: 12.5,
  },
  currentState: {
    monitoringPointId: 'mp-phase-03',
    deviceId: 'device-phase-03',
    serverRisk: 'WATCH',
    connectivityStatus: 'ONLINE',
    reasons: ['WATCH_THRESHOLDS_MET'],
    latestTelemetryId: 'telemetry-phase-03',
    evaluatedAt: '2026-08-01T02:14:02.100Z',
    lastTelemetryAt: '2026-08-01T02:14:00.000Z',
    profileId: 'profile-phase-03',
    profileVersion: 1,
    activeAlertSummary: {
      count: 1,
      highestSeverity: 'WARNING',
      types: ['RISK_WATCH'],
    },
  },
};

export const assessmentFixture: RiskAssessment = {
  id: 'assessment-phase-03',
  telemetryId: 'telemetry-phase-03',
  monitoringPointId: 'mp-phase-03',
  deviceId: 'device-phase-03',
  serverRisk: 'WATCH',
  reasons: ['WATCH_THRESHOLDS_MET'],
  firmwareRisk: 'SAFE',
  firmwareSirenActive: false,
  affectsCurrentState: false,
  evaluatedAt: '2026-08-01T02:14:02.100Z',
  profileId: 'profile-phase-03',
  profileVersion: 1,
};

export const alertFixture: Alert = {
  id: 'alert-phase-03',
  organizationId: 'organization-phase-03',
  site: overviewFixture.site,
  monitoringPoint: overviewFixture.monitoringPoint,
  deviceId: 'device-phase-03',
  type: 'RISK_WATCH',
  severity: 'WARNING',
  status: 'ACTIVE',
  reasons: ['WATCH_THRESHOLDS_MET'],
  occurrenceCount: 2,
  firstObservedAt: '2026-08-01T02:14:02.100Z',
  lastObservedAt: '2026-08-01T02:20:02.100Z',
  createdAt: '2026-08-01T02:14:02.100Z',
  updatedAt: '2026-08-01T02:20:02.100Z',
};

export const profileFixture: RiskProfile = {
  id: 'profile-phase-03',
  siteId: 'site-phase-03',
  version: 1,
  calibrationStatus: 'PROVISIONAL',
  thresholds: {
    safe: { tiltMagnitudeDegLt: 3, soilMoisturePctLt: 65, rainfallMmHourLt: 20 },
    danger: { tiltMagnitudeDegGt: 8, rainfallMmHourGt: 50, soilMoisturePctGt: 85 },
  },
  technicalRanges: {
    tiltXDeg: { minimum: -180, maximum: 180 },
    tiltYDeg: { minimum: -180, maximum: 180 },
    tiltMagnitudeDeg: { minimum: 0, maximum: 180 },
    soilMoisturePct: { minimum: 0, maximum: 100 },
    rainfallMmHour: { minimum: 0, maximum: null },
    batteryVoltage: { minimum: 0, maximum: 30 },
    signalRssi: { minimum: -150, maximum: 0 },
  },
  freshness: { onlineWithinMinutes: 20, offlineAfterMinutes: 35 },
  hysteresis: {
    watchConsecutiveSamples: 2,
    dangerConsecutiveSamples: 1,
    downgradeStableMinutes: 10,
    mismatchConsecutiveSamples: 3,
  },
  notes: 'Profil provisional.',
  createdAt: '2026-08-01T02:00:00.000Z',
  activatedAt: '2026-08-01T02:00:00.000Z',
};
