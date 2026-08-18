import { execFile as execFileCallback } from 'node:child_process';
import { isAbsolute } from 'node:path';
import { promisify } from 'node:util';

import { PrismaPg } from '@prisma/adapter-pg';

import { createVerifiedFieldResetBackup } from '../src/field-deployment-reset/field-deployment-backup.js';
import {
  assertFieldResetExecutionAllowed,
  createFieldResetPlan,
  executeFieldReset,
  parseFieldResetArguments,
  type FieldResetDatabase,
  type FieldResetPlan,
  type OperationalRowCounts,
} from '../src/field-deployment-reset/field-deployment-reset.js';
import { loadEnvironment } from '../src/config/load-environment.js';
import { PrismaClient } from '../src/generated/prisma/client.js';

const execFile = promisify(execFileCallback);

async function main(): Promise<void> {
  loadEnvironment();
  const options = parseFieldResetArguments(process.argv.slice(2));
  assertFieldResetExecutionAllowed({
    ...options,
    nodeEnv: process.env.NODE_ENV,
    isAbsolutePath: isAbsolute,
  });

  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.trim() === '') {
    throw new Error('DATABASE_URL is required for field reset.');
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  try {
    await prisma.$connect();
    const database = prisma as unknown as FieldResetDatabase;
    const plan = await createFieldResetPlan(database);
    printPlan(plan, options.execute);
    if (!options.execute) {
      console.log(
        'Dry-run complete. No database rows were changed. Re-run with --execute to perform the reset.',
      );
      return;
    }

    const releaseSha = await currentReleaseSha();
    const backup = await createVerifiedFieldResetBackup({
      backupDirectory: options.backupDirectory as string,
      databaseUrl,
      releaseSha,
      now: new Date(),
    });
    console.log(`Verified PostgreSQL custom backup: ${backup.path}`);
    console.log(`Backup manifest: ${backup.manifestPath}`);

    const result = await executeFieldReset(database);
    console.log('Field reset completed. Affected operational row counts:');
    printCounts('before', result.before);
    printCounts('after', result.after);
    console.log(
      'Device credential was preserved. Rotate it separately immediately before final field installation.',
    );
    console.log(
      'Fresh telemetry is now required; missing operational data resolves to UNKNOWN/unavailable, never SAFE.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

function printPlan(plan: FieldResetPlan, execute: boolean): void {
  console.log(`Field deployment reset plan (${execute ? 'EXECUTE' : 'DRY-RUN'}):`);
  console.log('Foundation records preserved:', plan.foundationCounts);
  console.log('Operational rows affected:');
  printCounts('before', plan.operationalCounts);
  console.log(
    'Risk-transition audit records are removed; security and configuration audit records are retained.',
  );
}

function printCounts(label: string, counts: OperationalRowCounts): void {
  console.log(`${label}:`, counts);
}

async function currentReleaseSha(): Promise<string> {
  try {
    const { stdout } = await execFile('git', ['rev-parse', 'HEAD'], { windowsHide: true });
    const sha = stdout.trim();
    if (!/^[0-9a-f]{40}$/i.test(sha)) throw new Error('invalid SHA');
    return sha;
  } catch {
    throw new Error('Git release SHA could not be determined; no field reset was performed.');
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Field reset failed safely.';
  console.error(`Field reset aborted: ${message}`);
  process.exitCode = 1;
});
