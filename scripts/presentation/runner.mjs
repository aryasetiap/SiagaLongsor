import { execFile, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { mkdir, readFile, rm, stat, writeFile, open } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const runtimeDir = join(root, 'tmp', 'presentation');
const configPath = join(root, '.env.presentation.local');
const processStatePath = join(runtimeDir, 'processes.json');
const secretStatePath = join(runtimeDir, 'device-credential.json');
const buildStatePath = join(runtimeDir, 'builds.json');
const composeProject = 'siagalongsor-presentation';
const apiUrl = 'http://localhost:3002/api/v1';
const webUrl = 'http://localhost:3003';
const requiredConfig = [
  'PRESENTATION_POSTGRES_PASSWORD',
  'PRESENTATION_OWNER_PASSWORD',
  'PRESENTATION_ADMIN_PASSWORD',
  'PRESENTATION_AUTH_SECRET',
];

const command = process.argv[2];
try {
  if (!['setup', 'start', 'stop', 'status', 'reset', 'open'].includes(command))
    throw new Error('Gunakan presentation:setup, start, stop, status, reset, atau open.');
  await { setup, start, stop, status, reset, open: openBrowser }[command]();
} catch (error) {
  console.error(
    `Presentation runner gagal: ${error instanceof Error ? error.message : 'kesalahan tidak dikenal.'}`,
  );
  process.exitCode = 1;
}

async function setup() {
  try {
    await stat(configPath);
    console.log('.env.presentation.local sudah ada; tidak diubah.');
    return;
  } catch {
    // The local configuration is created below when it does not exist.
  }
  const values = Object.fromEntries(
    requiredConfig.map((key) => [key, randomBytes(32).toString('base64url')]),
  );
  values.PRESENTATION_OWNER_PASSWORD = randomBytes(24).toString('base64url');
  values.PRESENTATION_ADMIN_PASSWORD = randomBytes(24).toString('base64url');
  await writeFile(
    configPath,
    `${Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n')}\n`,
    { encoding: 'utf8', mode: 0o600 },
  );
  console.log(
    'Konfigurasi lokal presentation dibuat di .env.presentation.local. Nilainya tidak ditampilkan dan file diabaikan Git.',
  );
}

async function start() {
  const config = await presentationConfig();
  await ensurePrerequisites();
  await ensurePortsAvailable();
  await compose(['up', '-d', 'postgres', 'redis'], composeEnvironment(config));
  await waitForComposeHealth();
  const environment = presentationEnvironment(config);
  await buildIfNeeded('api', environment);
  await runCorepack(
    ['pnpm', '--filter', '@siagalongsor/api', 'prisma:migrate:deploy'],
    environment,
  );
  await runCorepack(['pnpm', '--filter', '@siagalongsor/api', 'prisma:seed'], environment);
  await startComponent('api', environment);
  await waitForApi();
  const provisioned = await provisionDeviceAndProfile(config);
  await buildIfNeeded('web', {
    ...environment,
    NEXT_PUBLIC_API_BASE_URL: apiUrl,
    NEXT_PUBLIC_PRESENTATION_MODE: 'true',
  });
  await startComponent('web', {
    ...environment,
    NEXT_PUBLIC_API_BASE_URL: apiUrl,
    NEXT_PUBLIC_PRESENTATION_MODE: 'true',
  });
  await waitForUrl(webUrl);
  await startComponent('simulator', { ...environment, ...provisioned.simulatorEnvironment });
  console.log(
    '\nSiagaLongsor Presentation READY\n\nWeb:\nhttp://localhost:3003\n\nOverview:\nhttp://localhost:3003/overview\n\nAPI health:\nhttp://localhost:3002/api/v1/health\n\nSimulator:\nRUNNING',
  );
}

async function stop() {
  const state = await readJson(processStatePath, {});
  for (const component of ['simulator', 'web', 'api'])
    await stopComponent(component, state[component]);
  await compose(['down'], {}, false);
  await rm(processStatePath, { force: true });
  console.log(
    'Presentation processes and isolated Docker services stopped. Presentation data was retained.',
  );
}

async function status() {
  const state = await readJson(processStatePath, {});
  const [postgres, redis, api, web, simulator] = await Promise.all([
    composeServiceRunning('postgres'),
    composeServiceRunning('redis'),
    health(),
    reachable(webUrl),
    processRunning(state.simulator, 'simulator'),
  ]);
  console.log('component                      | state   | address');
  console.log(
    `PostgreSQL                     | ${postgres ? 'RUNNING' : 'STOPPED'} | localhost:55433`,
  );
  console.log(`Redis                          | ${redis ? 'RUNNING' : 'STOPPED'} | localhost:6380`);
  console.log(`API :3002                      | ${api ? 'HEALTHY' : 'STOPPED'} | ${apiUrl}`);
  console.log(`Web :3003                      | ${web ? 'HEALTHY' : 'STOPPED'} | ${webUrl}`);
  console.log(
    `Presentation Simulator         | ${simulator ? 'RUNNING' : 'STOPPED'} | telemetry pipeline`,
  );
}

async function reset() {
  console.log(
    'Presentation data only will be removed. Development and physical-device data are never targeted.',
  );
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`Ketik ${composeProject} untuk melanjutkan: `);
  rl.close();
  if (answer !== composeProject)
    throw new Error('Reset dibatalkan: safeguard project name tidak cocok.');
  await stop();
  await compose(['down', '-v'], {}, true);
  await rm(runtimeDir, { recursive: true, force: true });
  console.log('Presentation environment reset completed.');
}

async function openBrowser() {
  const target = `${webUrl}/overview`;
  try {
    if (process.platform === 'win32') await run('cmd.exe', ['/c', 'start', '', target]);
    else if (process.platform === 'darwin') await run('open', [target]);
    else await run('xdg-open', [target]);
  } catch {
    console.log(`Open this address in a browser: ${target}`);
  }
}

async function presentationConfig() {
  let raw;
  try {
    raw = await readFile(configPath, 'utf8');
  } catch {
    throw new Error('Buat konfigurasi sekali dengan: corepack pnpm presentation:setup');
  }
  const values = {};
  for (const line of raw.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)=(.*)\s*$/.exec(line);
    if (match) values[match[1]] = match[2];
  }
  for (const key of requiredConfig)
    if (!values[key] || values[key].includes('replace-with-'))
      throw new Error(`Konfigurasi ${key} belum valid.`);
  if (
    values.PRESENTATION_OWNER_PASSWORD.length < 12 ||
    values.PRESENTATION_ADMIN_PASSWORD.length < 12 ||
    values.PRESENTATION_AUTH_SECRET.length < 32
  )
    throw new Error(
      'Password presentation minimal 12 karakter dan auth secret minimal 32 karakter.',
    );
  return values;
}

function presentationEnvironment(config) {
  return {
    ...process.env,
    NODE_ENV: 'production',
    API_PORT: '3002',
    WEB_URL: webUrl,
    DATABASE_URL: `postgresql://siagalongsor:${encodeURIComponent(config.PRESENTATION_POSTGRES_PASSWORD)}@localhost:55433/siagalongsor_presentation`,
    REDIS_URL: 'redis://localhost:6380',
    AUTH_ACCESS_TOKEN_SECRET: config.PRESENTATION_AUTH_SECRET,
    SEED_ORGANIZATION_NAME: 'SiagaLongsor Presentation',
    SEED_ORGANIZATION_SLUG: 'siagalongsor-presentation',
    SEED_SITE_NAME: 'Demo Terisolasi',
    SEED_SITE_SLUG: 'demo-terisolasi',
    SEED_PROJECT_OWNER_NAME: 'Demo Owner',
    SEED_PROJECT_OWNER_EMAIL: 'demo.owner@example.invalid',
    SEED_PROJECT_OWNER_PASSWORD: config.PRESENTATION_OWNER_PASSWORD,
    SEED_SCHOOL_ADMIN_NAME: 'Demo Admin',
    SEED_SCHOOL_ADMIN_EMAIL: 'demo.admin@example.invalid',
    SEED_SCHOOL_ADMIN_PASSWORD: config.PRESENTATION_ADMIN_PASSWORD,
  };
}

function composeEnvironment(config) {
  return {
    ...process.env,
    POSTGRES_USER: 'siagalongsor',
    POSTGRES_PASSWORD: config.PRESENTATION_POSTGRES_PASSWORD,
    POSTGRES_DB: 'siagalongsor_presentation',
    POSTGRES_PORT: '55433',
    REDIS_PORT: '6380',
  };
}

async function ensurePrerequisites() {
  await run('docker', ['--version']);
  await runCorepack(['pnpm', '--version']);
  try {
    await stat(join(root, 'node_modules'));
  } catch {
    throw new Error('Dependencies tidak tersedia; jalankan corepack pnpm install terlebih dahulu.');
  }
}
async function ensurePortsAvailable() {
  const state = await readJson(processStatePath, {});
  for (const [port, component] of [
    [3002, 'api'],
    [3003, 'web'],
  ]) {
    if (!(await portAvailable(port)) && !(await processRunning(state[component], component))) {
      throw new Error(`Port ${port} sedang dipakai oleh proses non-presentation.`);
    }
  }
  for (const [port, service] of [
    [55433, 'postgres'],
    [6380, 'redis'],
  ]) {
    if (!(await portAvailable(port)) && !(await composeServiceRunning(service))) {
      throw new Error(`Port ${port} sedang dipakai oleh layanan non-presentation.`);
    }
  }
}
async function portAvailable(port) {
  return await new Promise((resolvePort) => {
    const server = createServer();
    server.once('error', () => resolvePort(false));
    server.listen(port, '127.0.0.1', () => server.close(() => resolvePort(true)));
  });
}
async function waitForComposeHealth() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if ((await composeServiceRunning('postgres')) && (await composeServiceRunning('redis'))) return;
    await delay(1000);
  }
  throw new Error('PostgreSQL atau Redis presentation tidak sehat.');
}
async function buildIfNeeded(component, environment) {
  const directory =
    component === 'api' ? join(root, 'apps', 'api', 'dist') : join(root, 'apps', 'web', '.next');
  const builds = await readJson(buildStatePath, {});
  const expectedWebBuild = `${apiUrl}|presentation`;
  try {
    await stat(directory);
    if (component !== 'web' || builds.web === expectedWebBuild) return;
  } catch {
    // Missing build output is handled by the build below.
  }
  await runCorepack(['pnpm', '--filter', `@siagalongsor/${component}`, 'build'], environment);
  if (component === 'web') {
    await mkdir(runtimeDir, { recursive: true });
    await writeJson(buildStatePath, { ...builds, web: expectedWebBuild });
  }
}
async function startComponent(component, environment) {
  const state = await readJson(processStatePath, {});
  if (await processRunning(state[component], component)) return;
  await mkdir(runtimeDir, { recursive: true });
  const log = await open(join(runtimeDir, `${component}.log`), 'a');
  const child = spawn(
    process.execPath,
    [join(root, 'scripts', 'presentation', 'service.mjs'), component],
    { cwd: root, env: environment, detached: true, stdio: ['ignore', log.fd, log.fd] },
  );
  child.unref();
  await log.close();
  state[component] = { pid: child.pid };
  await writeJson(processStatePath, state);
}
async function stopComponent(component, record) {
  if (!(await processRunning(record, component))) return;
  if (process.platform === 'win32') await run('taskkill', ['/pid', String(record.pid), '/t', '/f']);
  else process.kill(record.pid, 'SIGTERM');
}
async function processRunning(record, component) {
  if (!record?.pid) return false;
  try {
    if (process.platform === 'win32') {
      const result = await run(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          `(Get-CimInstance Win32_Process -Filter "ProcessId=${record.pid}").CommandLine`,
        ],
        false,
      );
      return (
        result.stdout.includes('scripts\\presentation\\service.mjs') &&
        result.stdout.includes(component)
      );
    }
    process.kill(record.pid, 0);
    return true;
  } catch {
    return false;
  }
}
async function provisionDeviceAndProfile(config) {
  const login = await request('/auth/login', {
    method: 'POST',
    body: { email: 'demo.owner@example.invalid', password: config.PRESENTATION_OWNER_PASSWORD },
  });
  const token = login.accessToken;
  const membership = login.user?.memberships?.find((item) => item.role === 'PROJECT_OWNER');
  if (!token || !membership?.organizationId)
    throw new Error('Demo Owner tidak memiliki organisasi PROJECT_OWNER.');
  const headers = {
    Authorization: `Bearer ${token}`,
    'X-Organization-Id': membership.organizationId,
  };
  const devices = await request('/devices?limit=100', { headers });
  const matches = (devices.data ?? []).filter(
    (device) => device.hardwareId === 'PRESENTATION-DEMO-001',
  );
  if (matches.length > 1)
    throw new Error(
      'Lebih dari satu device presentation ditemukan; jalankan reset untuk database presentation bersih.',
    );
  let secret = (await readJson(secretStatePath, {})).secret;
  if (matches.length === 0) {
    const created = await request('/devices', {
      method: 'POST',
      headers,
      body: {
        hardwareId: 'PRESENTATION-DEMO-001',
        displayName: 'Presentation Simulator',
        monitoringPointId: 'seed_sman17_primary_monitoring_point',
      },
    });
    secret = created.data?.credential?.secret;
  } else if (!secret) {
    const rotated = await request(
      `/devices/${encodeURIComponent(matches[0].id)}/rotate-credential`,
      { method: 'POST', headers },
    );
    secret = rotated.data?.credential?.secret;
  }
  if (typeof secret !== 'string' || secret.length === 0)
    throw new Error('Credential device presentation tidak tersedia.');
  await mkdir(runtimeDir, { recursive: true });
  await writeJson(secretStatePath, { secret });
  const profile = await request('/risk-profile', { headers: { Authorization: `Bearer ${token}` } });
  const data = profile.data;
  const sensors = ['tiltMagnitudeDeg', 'soilMoisturePct', 'rainfallMmHour'];
  const simulatorEnvironment = {
    SIMULATOR_API_BASE_URL: apiUrl,
    SIMULATOR_HARDWARE_ID: 'PRESENTATION-DEMO-001',
    SIMULATOR_DEVICE_SECRET: secret,
  };
  for (const sensor of sensors) {
    if (typeof data?.[sensor]?.watch !== 'number' || typeof data?.[sensor]?.danger !== 'number')
      throw new Error('Profil risiko aktif tidak menyediakan enam threshold presentation.');
    const prefix = `SIMULATOR_PRESENTATION_${sensor.replace(/([A-Z])/g, '_$1').toUpperCase()}`;
    simulatorEnvironment[`${prefix}_WATCH`] = String(data[sensor].watch);
    simulatorEnvironment[`${prefix}_DANGER`] = String(data[sensor].danger);
  }
  return { simulatorEnvironment };
}
async function request(path, options = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`API request ${path} gagal (HTTP ${response.status}).`);
  return body;
}
async function waitForApi() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await health()) return;
    await delay(1000);
  }
  throw new Error('API presentation tidak sehat; periksa tmp/presentation/api.log.');
}
async function waitForUrl(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await reachable(url)) return;
    await delay(1000);
  }
  throw new Error(`Web presentation tidak tersedia; periksa tmp/presentation/web.log.`);
}
async function health() {
  try {
    const response = await fetch(`${apiUrl}/health`);
    const body = await response.json();
    return (
      response.status === 200 &&
      body.status === 'ok' &&
      body.database === 'up' &&
      body.redis === 'up'
    );
  } catch {
    return false;
  }
}
async function reachable(url) {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}
async function compose(args, environment = {}, required = true) {
  return run(
    'docker',
    ['compose', '-p', composeProject, '-f', join(root, 'compose.yaml'), ...args],
    required,
    { ...process.env, POSTGRES_PASSWORD: 'presentation-command-placeholder', ...environment },
  );
}
async function composeServiceRunning(service) {
  try {
    const result = await compose(['ps', '-q', service], {}, false);
    return result.stdout.trim().length > 0;
  } catch {
    return false;
  }
}
function runCorepack(args, environment) {
  return process.platform === 'win32'
    ? run('cmd.exe', ['/d', '/s', '/c', 'corepack', ...args], true, environment)
    : run('corepack', args, true, environment);
}
function run(executable, args, required = true, environment = process.env) {
  return new Promise((resolveRun, rejectRun) => {
    execFile(
      executable,
      args,
      {
        cwd: root,
        env: environment,
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error && required) rejectRun(new Error(stderr.trim() || error.message));
        else resolveRun({ stdout, stderr });
      },
    );
  });
}
async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}
async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value)}\n`, { encoding: 'utf8', mode: 0o600 });
}
function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
