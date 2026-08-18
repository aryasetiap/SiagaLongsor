import { execFile as execFileCallback } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);

export interface FieldResetBackup {
  readonly path: string;
  readonly manifestPath: string;
}

export interface CommandRunner {
  run(command: string, args: readonly string[]): Promise<void>;
}

const systemCommandRunner: CommandRunner = {
  async run(command, args) {
    try {
      await execFile(command, [...args], { windowsHide: true });
    } catch {
      throw new Error(`${command} failed; no field reset was performed.`);
    }
  },
};

export async function createVerifiedFieldResetBackup(input: {
  readonly backupDirectory: string;
  readonly databaseUrl: string;
  readonly releaseSha: string;
  readonly now: Date;
  readonly runner?: CommandRunner;
}): Promise<FieldResetBackup> {
  const runner = input.runner ?? systemCommandRunner;
  const backupName = `teknila-field-reset-${timestampForFile(input.now)}-${randomUUID()}.dump`;
  const path = join(input.backupDirectory, backupName);
  const manifestPath = `${path}.json`;

  await mkdir(dirname(path), { recursive: true });
  await runner.run('pg_dump', [
    '--format=custom',
    `--file=${path}`,
    `--dbname=${input.databaseUrl}`,
  ]);
  const backup = await stat(path);
  if (backup.size === 0)
    throw new Error('PostgreSQL backup is empty; no field reset was performed.');
  await runner.run('pg_restore', ['--list', path]);
  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        format: 'postgresql-custom',
        createdAt: input.now.toISOString(),
        releaseSha: input.releaseSha,
        backupFile: backupName,
      },
      null,
      2,
    )}\n`,
    { encoding: 'utf8', flag: 'wx' },
  );

  return { path, manifestPath };
}

function timestampForFile(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-');
}
