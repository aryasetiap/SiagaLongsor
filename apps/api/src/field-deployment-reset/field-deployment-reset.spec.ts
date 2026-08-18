import { describe, expect, it } from 'vitest';

import type { AppConfig } from '../config/app-config.js';
import { SingleDeviceService } from '../single-device/single-device.service.js';
import {
  PRODUCTION_FIELD_RESET_CONFIRMATION,
  assertFieldResetExecutionAllowed,
  createFieldResetPlan,
  executeFieldReset,
  type FieldResetDatabase,
} from './field-deployment-reset.js';

describe('field deployment reset', () => {
  it('keeps dry-run read-only', async () => {
    const database = createDatabase();

    const plan = await createFieldResetPlan(database);

    expect(plan.operationalCounts).toMatchObject({ telemetry: 3, notificationOutbox: 2 });
    expect(database.snapshot()).toMatchObject({ telemetry: 3, currentStates: 1, notifications: 2 });
  });

  it('requires the exact production confirmation before execution', () => {
    expect(() =>
      assertFieldResetExecutionAllowed({
        execute: true,
        nodeEnv: 'production',
        confirmation: 'reset',
        backupDirectory: 'C:\\field-backups',
        isAbsolutePath: () => true,
      }),
    ).toThrow(PRODUCTION_FIELD_RESET_CONFIRMATION);

    expect(() =>
      assertFieldResetExecutionAllowed({
        execute: true,
        nodeEnv: 'production',
        confirmation: PRODUCTION_FIELD_RESET_CONFIRMATION,
        backupDirectory: 'C:\\field-backups',
        isAbsolutePath: () => true,
      }),
    ).not.toThrow();
  });

  it('removes operational state while preserving foundation and device credentials', async () => {
    const database = createDatabase();
    const deviceBefore = database.deviceRecord();

    const result = await executeFieldReset(database);

    expect(result.before).toMatchObject({
      telemetry: 3,
      riskAssessments: 3,
      currentMonitoringPointStates: 1,
      notificationOutbox: 2,
      riskTransitionAuditLogs: 2,
      devicesWithRuntimeState: 1,
    });
    expect(result.after).toEqual({
      telemetry: 0,
      riskAssessments: 0,
      currentMonitoringPointStates: 0,
      notificationOutbox: 0,
      riskTransitionAuditLogs: 0,
      devicesWithRuntimeState: 0,
    });
    expect(database.foundationSnapshot()).toEqual({
      organizations: 1,
      sites: 1,
      monitoringPoints: 1,
      users: 1,
      memberships: 1,
      activeRiskProfiles: 1,
      securityAuditLogs: 1,
    });
    expect(database.deviceRecord()).toEqual({
      ...deviceBefore,
      firmwareVersion: null,
      lastSeenAt: null,
      lastTelemetryAt: null,
      lastNetworkType: null,
      lastSignalRssi: null,
    });
    expect(database.snapshot()).toMatchObject({ telemetry: 0, currentStates: 0, notifications: 0 });
  });

  it('leaves the public projection UNKNOWN and unavailable until fresh telemetry arrives', async () => {
    const decimal = (value: number) => ({ toNumber: () => value });
    const profile = {
      version: 1,
      calibrationStatus: 'CALIBRATED',
      activatedAt: new Date('2026-08-18T00:00:00.000Z'),
      notes: null,
      safeTiltMagnitudeDegLt: decimal(5),
      dangerTiltMagnitudeDegGt: decimal(15),
      safeSoilMoisturePctLt: decimal(40),
      dangerSoilMoisturePctGt: decimal(80),
      safeRainfallMmHourLt: decimal(2),
      dangerRainfallMmHourGt: decimal(10),
      moderateRainfallDailyMinMm: decimal(30),
      moderateRainfallDailyMaxMm: decimal(50),
      moderateRainfallConsecutiveDays: 3,
      rainfallContinuationMmHourGt: decimal(0),
    };
    const service = new SingleDeviceService(
      {
        device: {
          findMany: async () => [
            {
              id: 'device-1',
              hardwareId: 'SIAGALONGSOR-001',
              monitoringPointId: 'monitoring-point-1',
              site: { riskProfiles: [profile] },
            },
          ],
        },
        currentMonitoringPointState: { findUnique: async () => null },
        telemetry: { findMany: async () => [] },
      } as never,
      {} as never,
      { publicDashboard: { hardwareId: 'SIAGALONGSOR-001' } } as AppConfig,
    );

    const response = await service.overview({});

    expect(response.data.risk).toMatchObject({
      status: 'UNKNOWN',
      freshness: 'UNKNOWN',
      reasons: ['TELEMETRY_UNAVAILABLE'],
    });
  });
});

function createDatabase(): FieldResetDatabase & {
  snapshot(): Record<string, number>;
  foundationSnapshot(): Record<string, number>;
  deviceRecord(): Record<string, string | null>;
} {
  const rows = {
    telemetry: 3,
    riskAssessments: 3,
    currentStates: 1,
    notifications: 2,
    riskTransitionAudits: 2,
    securityAudits: 1,
    organizations: 1,
    sites: 1,
    monitoringPoints: 1,
    users: 1,
    memberships: 1,
    activeRiskProfiles: 1,
  };
  const device: Record<string, string | null> = {
    hardwareId: 'SIAGALONGSOR-001',
    credentialHash: 'preserved-credential-hash',
    firmwareVersion: 'bench-1.0.0',
    lastSeenAt: '2026-08-01T00:00:00.000Z',
    lastTelemetryAt: '2026-08-01T00:00:00.000Z',
    lastNetworkType: 'WIFI',
    lastSignalRssi: '-60',
  };
  const database = {
    organization: { count: async () => rows.organizations },
    site: { count: async () => rows.sites },
    monitoringPoint: { count: async () => rows.monitoringPoints },
    user: { count: async () => rows.users },
    membership: { count: async () => rows.memberships },
    riskProfile: { count: async () => rows.activeRiskProfiles },
    telemetry: delegate('telemetry'),
    riskAssessment: delegate('riskAssessments'),
    currentMonitoringPointState: delegate('currentStates'),
    notificationOutbox: delegate('notifications'),
    auditLog: {
      count: async (args?: unknown) =>
        isRiskTransitionQuery(args) ? rows.riskTransitionAudits : rows.securityAudits,
      deleteMany: async (args?: unknown) => {
        if (isRiskTransitionQuery(args)) {
          const count = rows.riskTransitionAudits;
          rows.riskTransitionAudits = 0;
          return { count };
        }
        return { count: 0 };
      },
    },
    device: {
      count: async (args?: unknown) => (args === undefined ? 1 : runtimeDeviceCount(device)),
      updateMany: async () => {
        device.firmwareVersion = null;
        device.lastSeenAt = null;
        device.lastTelemetryAt = null;
        device.lastNetworkType = null;
        device.lastSignalRssi = null;
        return { count: 1 };
      },
    },
    async $transaction<T>(callback: (transaction: FieldResetDatabase) => Promise<T>): Promise<T> {
      return callback(this);
    },
    snapshot: () => ({
      telemetry: rows.telemetry,
      currentStates: rows.currentStates,
      notifications: rows.notifications,
    }),
    foundationSnapshot: () => ({
      organizations: rows.organizations,
      sites: rows.sites,
      monitoringPoints: rows.monitoringPoints,
      users: rows.users,
      memberships: rows.memberships,
      activeRiskProfiles: rows.activeRiskProfiles,
      securityAuditLogs: rows.securityAudits,
    }),
    deviceRecord: () => ({ ...device }),
  };

  function delegate(field: 'telemetry' | 'riskAssessments' | 'currentStates' | 'notifications') {
    return {
      count: async () => rows[field],
      deleteMany: async () => {
        const count = rows[field];
        rows[field] = 0;
        return { count };
      },
    };
  }

  return database as unknown as FieldResetDatabase & {
    snapshot(): Record<string, number>;
    foundationSnapshot(): Record<string, number>;
    deviceRecord(): Record<string, string | null>;
  };
}

function isRiskTransitionQuery(args: unknown): boolean {
  return (
    typeof args === 'object' &&
    args !== null &&
    'where' in args &&
    typeof args.where === 'object' &&
    args.where !== null &&
    'eventType' in args.where &&
    args.where.eventType === 'RISK_STATUS_CHANGED'
  );
}

function runtimeDeviceCount(device: Record<string, string | null>): number {
  return Object.values(device).some(
    (value) =>
      value !== null && value !== 'SIAGALONGSOR-001' && value !== 'preserved-credential-hash',
  )
    ? 1
    : 0;
}
