import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createVerifiedFieldResetBackup, type CommandRunner } from './field-deployment-backup.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('createVerifiedFieldResetBackup', () => {
  it('creates a custom backup, verifies it, and records the release SHA without database credentials', async () => {
    const directory = await temporaryDirectory();
    const calls: Array<{ command: string; args: readonly string[] }> = [];
    const runner: CommandRunner = {
      async run(command, args) {
        calls.push({ command, args });
        if (command === 'pg_dump') {
          const output = args.find((argument) => argument.startsWith('--file='));
          await writeFile(output?.slice('--file='.length) ?? '', 'custom-backup');
        }
      },
    };

    const backup = await createVerifiedFieldResetBackup({
      backupDirectory: directory,
      databaseUrl: 'postgresql://user:secret@localhost:5432/siagalongsor',
      releaseSha: 'a'.repeat(40),
      now: new Date('2026-08-18T00:00:00.000Z'),
      runner,
    });

    expect(calls.map((call) => call.command)).toEqual(['pg_dump', 'pg_restore']);
    expect(calls[0]?.args).toContain('--format=custom');
    expect(calls[1]?.args[0]).toBe('--list');
    const manifest = await readFile(backup.manifestPath, 'utf8');
    expect(manifest).toContain('a'.repeat(40));
    expect(manifest).not.toContain('secret');
  });

  it('aborts before writing a manifest when backup verification fails', async () => {
    const directory = await temporaryDirectory();
    const runner: CommandRunner = {
      async run(command, args) {
        if (command === 'pg_dump') {
          const output = args.find((argument) => argument.startsWith('--file='));
          await writeFile(output?.slice('--file='.length) ?? '', 'custom-backup');
          return;
        }
        throw new Error('verification failed');
      },
    };

    await expect(
      createVerifiedFieldResetBackup({
        backupDirectory: directory,
        databaseUrl: 'postgresql://user:secret@localhost:5432/siagalongsor',
        releaseSha: 'a'.repeat(40),
        now: new Date('2026-08-18T00:00:00.000Z'),
        runner,
      }),
    ).rejects.toThrow('verification failed');
  });
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'siagalongsor-field-reset-'));
  directories.push(directory);
  return directory;
}
