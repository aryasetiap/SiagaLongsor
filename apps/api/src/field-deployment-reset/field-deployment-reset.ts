export const PRODUCTION_FIELD_RESET_CONFIRMATION = 'RESET_FIELD_DEPLOYMENT';

export interface OperationalRowCounts {
  readonly telemetry: number;
  readonly riskAssessments: number;
  readonly currentMonitoringPointStates: number;
  readonly notificationOutbox: number;
  readonly riskTransitionAuditLogs: number;
  readonly devicesWithRuntimeState: number;
}

export interface FieldResetPlan {
  readonly foundationCounts: {
    readonly organizations: number;
    readonly sites: number;
    readonly monitoringPoints: number;
    readonly devices: number;
    readonly users: number;
    readonly memberships: number;
    readonly activeRiskProfiles: number;
  };
  readonly operationalCounts: OperationalRowCounts;
}

interface CountDelegate {
  count(args?: unknown): Promise<number>;
}

interface DeleteDelegate extends CountDelegate {
  deleteMany(args?: unknown): Promise<{ count: number }>;
}

interface DeviceDelegate extends CountDelegate {
  updateMany(args: unknown): Promise<{ count: number }>;
}

export interface FieldResetTransaction {
  readonly telemetry: DeleteDelegate;
  readonly riskAssessment: DeleteDelegate;
  readonly currentMonitoringPointState: DeleteDelegate;
  readonly notificationOutbox: DeleteDelegate;
  readonly auditLog: DeleteDelegate;
  readonly device: DeviceDelegate;
}

export interface FieldResetDatabase extends FieldResetTransaction {
  $transaction<T>(callback: (transaction: FieldResetTransaction) => Promise<T>): Promise<T>;
  readonly organization: CountDelegate;
  readonly site: CountDelegate;
  readonly monitoringPoint: CountDelegate;
  readonly user: CountDelegate;
  readonly membership: CountDelegate;
  readonly riskProfile: CountDelegate;
}

const deviceRuntimeStateFilter = {
  OR: [
    { lastSeenAt: { not: null } },
    { lastTelemetryAt: { not: null } },
    { lastNetworkType: { not: null } },
    { lastSignalRssi: { not: null } },
    { firmwareVersion: { not: null } },
  ],
};

export function parseFieldResetArguments(args: readonly string[]): {
  readonly execute: boolean;
  readonly confirmation: string | null;
  readonly backupDirectory: string | null;
} {
  let execute = false;
  let confirmation: string | null = null;
  let backupDirectory: string | null = null;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--execute') {
      execute = true;
      continue;
    }
    if (argument === '--confirm' || argument === '--backup-dir') {
      const value = args[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`${argument} requires a value.`);
      }
      if (argument === '--confirm') confirmation = value;
      else backupDirectory = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  return { execute, confirmation, backupDirectory };
}

export function assertFieldResetExecutionAllowed(input: {
  readonly execute: boolean;
  readonly nodeEnv: string | undefined;
  readonly confirmation: string | null;
  readonly backupDirectory: string | null;
  readonly isAbsolutePath: (value: string) => boolean;
}): void {
  if (!input.execute) return;
  if (input.backupDirectory === null || !input.isAbsolutePath(input.backupDirectory)) {
    throw new Error('--execute requires an absolute --backup-dir path.');
  }
  if (
    input.nodeEnv === 'production' &&
    input.confirmation !== PRODUCTION_FIELD_RESET_CONFIRMATION
  ) {
    throw new Error(
      `NODE_ENV=production requires --confirm ${PRODUCTION_FIELD_RESET_CONFIRMATION} before destructive execution.`,
    );
  }
}

export async function createFieldResetPlan(database: FieldResetDatabase): Promise<FieldResetPlan> {
  const [
    organizations,
    sites,
    monitoringPoints,
    devices,
    users,
    memberships,
    activeRiskProfiles,
    operationalCounts,
  ] = await Promise.all([
    database.organization.count(),
    database.site.count(),
    database.monitoringPoint.count(),
    database.device.count(),
    database.user.count(),
    database.membership.count(),
    database.riskProfile.count({ where: { isActive: true } }),
    countOperationalRows(database),
  ]);

  const foundationCounts = {
    organizations,
    sites,
    monitoringPoints,
    devices,
    users,
    memberships,
    activeRiskProfiles,
  };
  const missing = Object.entries(foundationCounts)
    .filter(([, count]) => count === 0)
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(
      `Field reset aborted: required foundation data is missing (${missing.join(', ')}).`,
    );
  }

  return { foundationCounts, operationalCounts };
}

export async function executeFieldReset(database: FieldResetDatabase): Promise<{
  readonly before: OperationalRowCounts;
  readonly after: OperationalRowCounts;
}> {
  const before = await countOperationalRows(database);

  await database.$transaction(async (transaction) => {
    await transaction.currentMonitoringPointState.deleteMany();
    await transaction.riskAssessment.deleteMany();
    await transaction.telemetry.deleteMany();
    await transaction.notificationOutbox.deleteMany();
    await transaction.auditLog.deleteMany({ where: { eventType: 'RISK_STATUS_CHANGED' } });
    await transaction.device.updateMany({
      data: {
        firmwareVersion: null,
        lastSeenAt: null,
        lastTelemetryAt: null,
        lastNetworkType: null,
        lastSignalRssi: null,
      },
    });
  });

  return { before, after: await countOperationalRows(database) };
}

async function countOperationalRows(
  database: FieldResetTransaction,
): Promise<OperationalRowCounts> {
  const [
    telemetry,
    riskAssessments,
    currentMonitoringPointStates,
    notificationOutbox,
    riskTransitionAuditLogs,
    devicesWithRuntimeState,
  ] = await Promise.all([
    database.telemetry.count(),
    database.riskAssessment.count(),
    database.currentMonitoringPointState.count(),
    database.notificationOutbox.count(),
    database.auditLog.count({ where: { eventType: 'RISK_STATUS_CHANGED' } }),
    database.device.count({ where: deviceRuntimeStateFilter }),
  ]);

  return {
    telemetry,
    riskAssessments,
    currentMonitoringPointStates,
    notificationOutbox,
    riskTransitionAuditLogs,
    devicesWithRuntimeState,
  };
}
