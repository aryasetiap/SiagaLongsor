import { spawn } from 'node:child_process';

const component = process.argv[2];
const commands = {
  api: ['pnpm', '--filter', '@siagalongsor/api', 'start'],
  web: ['pnpm', '--filter', '@siagalongsor/web', 'exec', 'next', 'start', '--port', '3003'],
  simulator: [
    'pnpm',
    '--filter',
    '@siagalongsor/api',
    'simulator:device',
    '--',
    '--scenario',
    'presentation',
    '--interval',
    '5000',
    '--count',
    '0',
  ],
};

const command = commands[component];
if (command === undefined) process.exitCode = 1;
else {
  const isWindows = process.platform === 'win32';
  const child = spawn(
    isWindows ? 'cmd.exe' : 'corepack',
    isWindows ? ['/d', '/c', ['corepack', ...command].join(' ')] : command,
    {
      env: process.env,
      stdio: 'inherit',
    },
  );
  const stop = () => child.kill('SIGTERM');
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  child.once('exit', (code) => {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
    process.exitCode = code ?? 1;
  });
}
