import { spawn } from 'node:child_process';
import path from 'node:path';

import { expect, test, type Locator, type Page } from '@playwright/test';

test.use({ screenshot: 'off', trace: 'off', video: 'off' });

test('Phase 02 lifecycle terintegrasi dari MonitoringPoint sampai deactivation', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);

  const pageErrors: Error[] = [];
  const missingOrganizationHeaders: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (
      url.origin === apiOrigin() &&
      /^\/api\/v1\/(?:sites|monitoring-points|devices)(?:\/|$)/.test(url.pathname) &&
      request.headers()['x-organization-id'] === undefined
    ) {
      missingOrganizationHeaders.push(`${request.method()} ${url.pathname}`);
    }
  });

  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
  const pointName = `Acceptance Point ${unique}`;
  const hardwareId = `ACC-DEVICE-${unique}`;
  const displayName = `Acceptance Device ${unique}`;
  let initialSecret: string | null = null;
  let rotatedSecret: string | null = null;

  await loginAsProjectOwner(page);
  await createMonitoringPoint(page, pointName);
  await openDeviceManagement(page);
  initialSecret = await registerDevice(page, { hardwareId, displayName, pointName });
  await expectCredentialAbsent(page, initialSecret);
  await page.reload();
  await expect(page).toHaveURL(/\/devices$/);
  await expectCredentialAbsent(page, initialSecret);

  for (const scenario of [
    'normal',
    'duplicate',
    'late',
    'sequence-conflict',
    'idempotency-conflict',
  ] as const) {
    const result = await runSimulator(hardwareId, initialSecret, scenario);
    expect(result.exitCode).toBe(0);
    expect(result.output.includes(initialSecret)).toBe(false);
    expect(result.output).toContain(`"event":"simulator_completed","scenario":"${scenario}"`);
  }

  await openDeviceDetail(page, hardwareId, displayName);
  let detail = page.getByRole('dialog', { name: displayName });
  await expect(detail.getByText('simulator-1.0.0', { exact: true })).toBeVisible();
  await expect(detail.getByText(/Wi-Fi; RSSI -67/)).toBeVisible();
  await expect(detail.getByText('Belum tersedia', { exact: true })).toHaveCount(1);

  await detail.getByRole('button', { name: 'Rotasi credential' }).click();
  await page.getByRole('button', { name: 'Ya, rotasi credential' }).click();
  const rotationDialog = page.getByRole('dialog', { name: /Simpan credential/ });
  rotatedSecret = await rotationDialog.getByLabel('Secret perangkat').inputValue();
  expect(rotatedSecret.length >= 32 && rotatedSecret !== initialSecret).toBe(true);
  await acknowledgeAndCloseCredential(rotationDialog);
  await expectCredentialAbsent(page, rotatedSecret);

  const rejectedOldCredential = await runSimulator(hardwareId, initialSecret, 'normal');
  expect(rejectedOldCredential.exitCode).not.toBe(0);
  expect(rejectedOldCredential.output.includes(initialSecret)).toBe(false);
  expect(rejectedOldCredential.output).toContain('"httpStatus":401');
  expect(rejectedOldCredential.output).toContain('"errorCode":"DEVICE_CREDENTIAL_INVALID"');
  initialSecret = null;

  const acceptedRotatedCredential = await runSimulator(hardwareId, rotatedSecret, 'normal');
  expect(acceptedRotatedCredential.exitCode).toBe(0);
  expect(acceptedRotatedCredential.output.includes(rotatedSecret)).toBe(false);

  await openDeviceDetail(page, hardwareId, displayName);
  detail = page.getByRole('dialog', { name: displayName });
  await detail.getByRole('button', { name: 'Nonaktifkan' }).click();
  await page.getByRole('button', { name: 'Ya, nonaktifkan' }).click();
  await expect(page.getByText(/berada dalam status dinonaktifkan/)).toBeVisible();

  const rejectedDisabledDevice = await runSimulator(hardwareId, rotatedSecret, 'normal');
  expect(rejectedDisabledDevice.exitCode).not.toBe(0);
  expect(rejectedDisabledDevice.output.includes(rotatedSecret)).toBe(false);
  expect(rejectedDisabledDevice.output).toContain('"httpStatus":403');
  expect(rejectedDisabledDevice.output).toContain('"errorCode":"DEVICE_DISABLED"');
  await expectCredentialAbsent(page, rotatedSecret);
  rotatedSecret = null;

  const disabledRow = page.getByRole('row').filter({ hasText: hardwareId });
  await expect(disabledRow).toContainText('Dinonaktifkan');
  await disabledRow.getByRole('button', { name: `Lihat detail ${displayName}` }).click();
  detail = page.getByRole('dialog', { name: displayName });
  await expect(detail.getByRole('button', { name: 'Rotasi credential' })).toHaveCount(0);
  await expect(detail.getByRole('button', { name: 'Nonaktifkan' })).toHaveCount(0);
  await detail.getByRole('button', { name: 'Tutup', exact: true }).click();

  await openMonitoringPointManagement(page);
  const pointRow = page.getByRole('row').filter({ hasText: pointName });
  await pointRow.getByRole('button', { name: `Lihat detail ${pointName}` }).click();
  const pointDetail = page.getByRole('dialog', { name: pointName });
  await pointDetail.getByRole('button', { name: 'Nonaktifkan' }).click();
  const confirmation = page.getByRole('alertdialog', {
    name: 'Nonaktifkan titik monitoring?',
  });
  await confirmation.getByRole('button', { name: 'Ya, nonaktifkan' }).click();
  await expect(page.getByRole('row').filter({ hasText: pointName })).toContainText('Nonaktif');

  await expectNoSensitiveBrowserStorage(page);
  expect(missingOrganizationHeaders).toEqual([]);
  expect(pageErrors).toEqual([]);
  await logout(page);
  expect(testInfo.attachments).toEqual([]);
});

async function loginAsProjectOwner(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Alamat email').fill(requiredCredential('E2E_PROJECT_OWNER_EMAIL'));
  await page
    .getByRole('textbox', { name: 'Kata sandi', exact: true })
    .fill(requiredCredential('E2E_PROJECT_OWNER_PASSWORD'));
  await page.getByRole('button', { name: 'Masuk ke SiagaLongsor' }).click();
  await expect(page).toHaveURL(/\/overview$/);
}

async function createMonitoringPoint(page: Page, pointName: string): Promise<void> {
  await openMonitoringPointManagement(page);
  await page.getByRole('button', { name: 'Tambah titik monitoring' }).click();
  const dialog = page.getByRole('dialog', { name: 'Tambah titik monitoring' });
  await dialog.getByLabel('Pilih Site').selectOption({ index: 1 });
  await dialog.getByLabel('Nama titik monitoring').fill(pointName);
  await dialog.getByRole('button', { name: 'Simpan titik monitoring' }).click();
  await expect(page.getByText('Titik monitoring berhasil ditambahkan.')).toBeVisible();
}

async function registerDevice(
  page: Page,
  input: { readonly hardwareId: string; readonly displayName: string; readonly pointName: string },
): Promise<string> {
  await page.getByRole('button', { name: 'Daftarkan perangkat' }).click();
  const dialog = page.getByRole('dialog', { name: 'Daftarkan perangkat' });
  await dialog.getByLabel('Hardware ID').fill(input.hardwareId);
  await dialog.getByLabel('Nama perangkat').fill(input.displayName);
  await dialog.getByLabel('Pilih Site').selectOption({ index: 1 });
  await dialog.getByLabel('Cari titik monitoring').fill(input.pointName);
  await dialog.getByLabel('Cari titik monitoring').press('Enter');
  await dialog.getByLabel('Pilih titik monitoring').selectOption({ label: input.pointName });
  await dialog.getByRole('button', { name: 'Daftarkan perangkat' }).click();

  const credentialDialog = page.getByRole('dialog', { name: /Simpan credential/ });
  const secret = await credentialDialog.getByLabel('Secret perangkat').inputValue();
  expect(secret.length >= 32).toBe(true);
  await acknowledgeAndCloseCredential(credentialDialog);
  return secret;
}

async function openDeviceManagement(page: Page): Promise<void> {
  await Promise.all([
    page.waitForURL(/\/devices$/, { timeout: 30_000 }),
    page.getByRole('link', { name: /Perangkat/ }).click(),
  ]);
  await expect(page.getByRole('heading', { name: 'Perangkat', exact: true })).toBeVisible();
}

async function openMonitoringPointManagement(page: Page): Promise<void> {
  await Promise.all([
    page.waitForURL(/\/monitoring-points$/, { timeout: 30_000 }),
    page.getByRole('link', { name: /Monitoring/ }).click(),
  ]);
  await expect(page.getByRole('heading', { name: 'Titik monitoring', exact: true })).toBeVisible();
}

async function openDeviceDetail(
  page: Page,
  hardwareId: string,
  displayName: string,
): Promise<void> {
  const row = page.getByRole('row').filter({ hasText: hardwareId });
  await row.getByRole('button', { name: `Lihat detail ${displayName}` }).click();
  await expect(page.getByRole('dialog', { name: displayName })).toBeVisible();
}

async function acknowledgeAndCloseCredential(dialog: Locator): Promise<void> {
  await dialog.getByLabel('Saya telah menyimpan secret melalui mekanisme yang aman.').check();
  await dialog.getByRole('button', { name: 'Tutup dan hapus dari layar' }).click();
  await expect(dialog).toHaveCount(0);
}

async function expectCredentialAbsent(page: Page, secret: string): Promise<void> {
  const exposure = await page.evaluate((credential) => {
    const storage = [
      ...Object.entries(window.localStorage),
      ...Object.entries(window.sessionStorage),
    ];
    return {
      body: document.body.innerText.includes(credential),
      cookie: document.cookie.includes(credential),
      localOrSessionStorage: storage.some(
        ([key, value]) => key.includes(credential) || value.includes(credential),
      ),
      url: window.location.href.includes(credential),
    };
  }, secret);
  expect(exposure).toEqual({
    body: false,
    cookie: false,
    localOrSessionStorage: false,
    url: false,
  });
}

async function expectNoSensitiveBrowserStorage(page: Page): Promise<void> {
  const containsSensitiveValue = await page.evaluate(() => {
    const entries = [
      ...Object.entries(window.localStorage),
      ...Object.entries(window.sessionStorage),
    ];
    return entries.some(
      ([key, value]) =>
        /(?:access|refresh)[_-]?token|credential|secret/i.test(key) ||
        /^Bearer\s+/i.test(value) ||
        /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value),
    );
  });
  expect(containsSensitiveValue).toBe(false);
}

async function logout(page: Page): Promise<void> {
  await page.locator('summary').click();
  await page.getByRole('button', { name: 'Keluar' }).click();
  await expect(page).toHaveURL(/\/login$/);
}

type Scenario = 'normal' | 'duplicate' | 'late' | 'sequence-conflict' | 'idempotency-conflict';

async function runSimulator(
  hardwareId: string,
  secret: string,
  scenario: Scenario,
): Promise<{ readonly exitCode: number; readonly output: string }> {
  const repositoryRoot = path.resolve(__dirname, '../../..');
  const invocation =
    process.platform === 'win32'
      ? {
          command: process.env.ComSpec ?? 'cmd.exe',
          arguments: [
            '/d',
            '/s',
            '/c',
            `corepack pnpm --filter @siagalongsor/api simulator:device -- --scenario ${scenario} --count 1 --interval 0`,
          ],
        }
      : {
          command: 'corepack',
          arguments: [
            'pnpm',
            '--filter',
            '@siagalongsor/api',
            'simulator:device',
            '--',
            '--scenario',
            scenario,
            '--count',
            '1',
            '--interval',
            '0',
          ],
        };
  const simulatorEnvironment = { ...process.env };
  for (const name of [
    'DATABASE_URL',
    'POSTGRES_PASSWORD',
    'AUTH_ACCESS_TOKEN_SECRET',
    'SEED_PROJECT_OWNER_PASSWORD',
    'SEED_SCHOOL_ADMIN_PASSWORD',
    'E2E_PROJECT_OWNER_PASSWORD',
  ]) {
    delete simulatorEnvironment[name];
  }
  const child = spawn(invocation.command, invocation.arguments, {
    cwd: repositoryRoot,
    env: {
      ...simulatorEnvironment,
      SIMULATOR_API_BASE_URL: apiBaseUrl(),
      SIMULATOR_HARDWARE_ID: hardwareId,
      SIMULATOR_DEVICE_SECRET: secret,
    },
    shell: false,
    windowsHide: true,
  });

  let output = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    output += chunk;
  });
  child.stderr.on('data', (chunk: string) => {
    output += chunk;
  });

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => resolve(code ?? 1));
  });
  return { exitCode, output };
}

function apiBaseUrl(): string {
  return (process.env.E2E_API_BASE_URL?.trim() || 'http://localhost:3001/api/v1').replace(
    /\/$/,
    '',
  );
}

function apiOrigin(): string {
  return new URL(apiBaseUrl()).origin;
}

function requiredCredential(
  name: 'E2E_PROJECT_OWNER_EMAIL' | 'E2E_PROJECT_OWNER_PASSWORD',
): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} wajib tersedia untuk acceptance Phase 02.`);
  }
  return value;
}
