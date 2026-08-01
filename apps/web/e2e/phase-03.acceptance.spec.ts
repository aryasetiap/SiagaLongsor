import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

test.use({ screenshot: 'off', trace: 'off', video: 'off' });

test('Phase 03 risk, alert, profile, dan late-data flow terintegrasi', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(180_000);
  page.setDefaultNavigationTimeout(30_000);
  const pageErrors: Error[] = [];
  const missingOrganizationHeaders: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  page.on('request', (webRequest) => {
    const url = new URL(webRequest.url());
    if (
      url.origin === apiOrigin() &&
      /^\/api\/v1\/(?:sites|monitoring-overview|monitoring-points|devices|alerts)(?:\/|$)/.test(
        url.pathname,
      ) &&
      webRequest.headers()['x-organization-id'] === undefined
    ) {
      missingOrganizationHeaders.push(`${webRequest.method()} ${url.pathname}`);
    }
  });

  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 9).toUpperCase()}`;
  const pointName = `Phase 03 Point ${unique}`;
  const hardwareId = `P3-${unique}`;
  const displayName = `Phase 03 Device ${unique}`;
  let deviceSecret: string | null = null;

  await login(
    page,
    requiredCredential('E2E_PROJECT_OWNER_EMAIL', 'SEED_PROJECT_OWNER_EMAIL'),
    requiredCredential('E2E_PROJECT_OWNER_PASSWORD', 'SEED_PROJECT_OWNER_PASSWORD'),
  );
  await createMonitoringPoint(page, pointName);
  deviceSecret = await registerDevice(page, { hardwareId, displayName, pointName });
  await expectSensitiveValueAbsent(page, deviceSecret);

  const profile = await readActiveProfile(page);
  expect(profile.calibrationStatus).toBe('PROVISIONAL');
  const watchTilt =
    (profile.thresholds.safe.tiltMagnitudeDegLt + profile.thresholds.danger.tiltMagnitudeDegGt) / 2;
  const dangerTilt = profile.thresholds.danger.tiltMagnitudeDegGt + 0.5;
  expect(dangerTilt).toBeLessThanOrEqual(profile.technicalRanges.tiltMagnitudeDeg.maximum ?? 180);

  const bootId = `p3_boot_${unique}`;
  let sequence = 0;
  const firstWatch = telemetryPayload({
    unique,
    bootId,
    sequence: ++sequence,
    tilt: watchTilt,
    firmwareRisk: 'WATCH',
  });
  const secondWatch = telemetryPayload({
    unique,
    bootId,
    sequence: ++sequence,
    tilt: watchTilt,
    firmwareRisk: 'WATCH',
  });
  await expectAccepted(await sendTelemetry(request, hardwareId, deviceSecret, firstWatch));
  await expectAccepted(await sendTelemetry(request, hardwareId, deviceSecret, secondWatch));

  await page.goto('/overview');
  const pointRow = await findDashboardPoint(page, pointName);
  await expect(pointRow).toContainText('Waspada', { timeout: 30_000 });
  await page.goto('/alerts');
  const watchRow = page
    .getByRole('row')
    .filter({ hasText: pointName })
    .filter({ hasText: 'Risiko Waspada' });
  await expect(watchRow).toContainText('Aktif — belum ditangani', { timeout: 20_000 });

  const dangerPayload = telemetryPayload({
    unique,
    bootId,
    sequence: ++sequence,
    tilt: dangerTilt,
    firmwareRisk: 'DANGER',
  });
  await expectAccepted(await sendTelemetry(request, hardwareId, deviceSecret, dangerPayload));
  await page.goto('/overview');
  await expect(await findDashboardPoint(page, pointName)).toContainText('Bahaya', {
    timeout: 30_000,
  });
  await page.goto('/alerts');
  await expect(
    page.getByRole('row').filter({ hasText: pointName }).filter({ hasText: 'Risiko Bahaya' }),
  ).toBeVisible();
  await expect(
    page.getByRole('row').filter({ hasText: pointName }).filter({ hasText: 'Risiko Waspada' }),
  ).toBeVisible();

  const dangerRow = page
    .getByRole('row')
    .filter({ hasText: pointName })
    .filter({ hasText: 'Risiko Bahaya' });
  const beforeDuplicate = await dangerRow.textContent();
  const duplicateResponse = await sendTelemetry(request, hardwareId, deviceSecret, dangerPayload);
  expect(duplicateResponse.status()).toBe(200);
  expect(((await duplicateResponse.json()) as { duplicate: boolean }).duplicate).toBe(true);
  await page.reload();
  expect(
    await page
      .getByRole('row')
      .filter({ hasText: pointName })
      .filter({ hasText: 'Risiko Bahaya' })
      .textContent(),
  ).toBe(beforeDuplicate);

  const latePayload = telemetryPayload({
    unique,
    bootId,
    sequence: ++sequence,
    tilt: profile.thresholds.safe.tiltMagnitudeDegLt / 2,
    firmwareRisk: 'SAFE',
    timestamp: new Date(Date.now() - 24 * 60 * 60_000).toISOString(),
  });
  await expectAccepted(await sendTelemetry(request, hardwareId, deviceSecret, latePayload));
  await page.goto('/overview');
  const currentRow = await findDashboardPoint(page, pointName);
  await expect(currentRow).toContainText('Bahaya', { timeout: 30_000 });
  await currentRow.getByRole('button', { name: 'Lihat riwayat penilaian' }).click();
  await expect(page.getByText('Data historis terlambat')).toBeVisible();
  await expectSensitiveValueAbsent(page, deviceSecret);
  await page.getByRole('button', { name: 'Tutup', exact: true }).click();

  await page.goto('/alerts');
  await page
    .getByRole('row')
    .filter({ hasText: pointName })
    .filter({ hasText: 'Risiko Bahaya' })
    .getByRole('button', { name: 'Lihat detail' })
    .click();
  const detail = page.getByRole('dialog', { name: 'Detail peringatan' });
  await expect(detail).toBeVisible();
  await expect(detail).not.toContainText(/credential|authorization|rawpayload|hash/i);
  await detail.getByRole('button', { name: 'Tutup' }).click();

  await page.goto('/settings/risk-profile');
  await page.getByLabel('Pilih Site untuk profil risiko').selectOption(profile.siteId);
  await expect(page.getByText(`Profil risiko versi ${profile.version}`)).toBeVisible();
  await expect(page.getByText('Kalibrasi: PROVISIONAL')).toBeVisible();
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Simpan sebagai versi baru' }).click();
  await expect(
    page.getByText('Tidak ada perubahan konfigurasi. Versi aktif tetap sama.'),
  ).toBeVisible();
  const notes = page.getByLabel('Catatan');
  await notes.fill(`Acceptance ${unique}`);
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Simpan sebagai versi baru' }).click();
  await expect(
    page.getByText(`Versi ${profile.version + 1} berhasil dibuat dan diaktifkan.`),
  ).toBeVisible();
  await expect(page.getByText('Kalibrasi: PROVISIONAL')).toBeVisible();

  await expectNoSensitiveStorage(page);
  expect(missingOrganizationHeaders).toEqual([]);
  expect(pageErrors).toEqual([]);
  await logout(page);
  deviceSecret = null;
  expect(testInfo.attachments).toEqual([]);
});

test('SCHOOL_ADMIN dapat membaca risk dan alert tanpa kontrol mutation', async ({ page }) => {
  test.setTimeout(120_000);
  page.setDefaultNavigationTimeout(30_000);
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));

  await login(
    page,
    requiredCredential('E2E_SCHOOL_ADMIN_EMAIL', 'SEED_SCHOOL_ADMIN_EMAIL'),
    requiredCredential('E2E_SCHOOL_ADMIN_PASSWORD', 'SEED_SCHOOL_ADMIN_PASSWORD'),
  );
  await expect(page.getByRole('link', { name: /Peringatan/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Profil Risiko/ })).toBeVisible();

  await page.goto('/alerts');
  await expect(page.getByRole('heading', { name: 'Peringatan', level: 1 })).toBeVisible();

  await page.goto('/settings/risk-profile');
  const siteSelector = page.getByLabel('Pilih Site untuk profil risiko');
  await expect(siteSelector).toBeVisible();
  await siteSelector.selectOption({ index: 1 });
  await expect(page.getByText('Admin Sekolah memiliki akses baca saja.')).toBeVisible();
  await expect(page.getByLabel('Catatan')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Simpan sebagai versi baru' })).toHaveCount(0);

  await expectNoSensitiveStorage(page);
  expect(pageErrors).toEqual([]);
  await logout(page);
});

interface ActiveProfile {
  readonly siteId: string;
  readonly version: number;
  readonly calibrationStatus: string;
  readonly thresholds: {
    readonly safe: { readonly tiltMagnitudeDegLt: number };
    readonly danger: { readonly tiltMagnitudeDegGt: number };
  };
  readonly technicalRanges: {
    readonly tiltMagnitudeDeg: { readonly maximum: number | null };
  };
}

async function findDashboardPoint(page: Page, pointName: string) {
  await page.getByLabel('Cari titik monitoring').fill(pointName);
  await page.getByRole('button', { name: 'Terapkan filter' }).click();
  const row = page.getByRole('row').filter({ hasText: pointName });
  await expect(row).toBeVisible({ timeout: 20_000 });
  return row;
}

async function readActiveProfile(page: Page): Promise<ActiveProfile> {
  await page.goto('/settings/risk-profile');
  const selector = page.getByLabel('Pilih Site untuk profil risiko');
  const responsePromise = page.waitForResponse(
    (response) =>
      /\/api\/v1\/sites\/[^/]+\/risk-profile$/.test(new URL(response.url()).pathname) &&
      response.request().method() === 'GET',
  );
  await selector.selectOption({ index: 1 });
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { readonly data: ActiveProfile };
  return body.data;
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Alamat email').fill(email);
  await page.getByRole('textbox', { name: 'Kata sandi', exact: true }).fill(password);
  const submit = page.getByRole('button', { name: 'Masuk ke SiagaLongsor' });
  let responsePromise = waitForLoginResponse(page);
  await submit.click();
  let response = await responsePromise;

  // The full serial browser suite intentionally exercises the production login limiter.
  // Wait for the server-provided window and retry through the UI instead of weakening it.
  if (response.status() === 429) {
    const retryAfterSeconds = Number(response.headers()['retry-after'] ?? '60');
    await page.waitForTimeout(
      (Number.isFinite(retryAfterSeconds) ? retryAfterSeconds + 1 : 61) * 1000,
    );
    responsePromise = waitForLoginResponse(page);
    await submit.click();
    response = await responsePromise;
  }

  expect(response.status()).toBe(200);
  await expect(page).toHaveURL(/\/overview$/);
}

function waitForLoginResponse(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/v1/auth/login',
  );
}

async function createMonitoringPoint(page: Page, pointName: string) {
  await page.goto('/monitoring-points');
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
  await page.goto('/devices');
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
  expect(secret.length).toBeGreaterThanOrEqual(32);
  await credentialDialog
    .getByLabel('Saya telah menyimpan secret melalui mekanisme yang aman.')
    .check();
  await credentialDialog.getByRole('button', { name: 'Tutup dan hapus dari layar' }).click();
  return secret;
}

function telemetryPayload(input: {
  readonly unique: string;
  readonly bootId: string;
  readonly sequence: number;
  readonly tilt: number;
  readonly firmwareRisk: 'SAFE' | 'WATCH' | 'DANGER';
  readonly timestamp?: string;
}) {
  return {
    messageId: `p3_${input.unique}_${input.sequence}`,
    bootId: input.bootId,
    sequence: input.sequence,
    timestamp: input.timestamp ?? new Date(Date.now() - 100).toISOString(),
    firmwareVersion: 'phase-03-acceptance',
    network: { type: 'WIFI', signalRssi: -60 },
    readings: {
      tiltXDeg: 0,
      tiltYDeg: 0,
      tiltMagnitudeDeg: input.tilt,
      soilMoisturePct: 40,
      rainfallMmHour: 5,
      batteryVoltage: 12,
    },
    deviceAssessment: { riskLevel: input.firmwareRisk, sirenActive: false },
  };
}

function sendTelemetry(
  request: APIRequestContext,
  hardwareId: string,
  secret: string,
  payload: ReturnType<typeof telemetryPayload>,
) {
  return request.post(`${apiBaseUrl()}/iot/telemetry`, {
    headers: {
      authorization: `Device ${hardwareId}.${secret}`,
      'content-type': 'application/json',
      'idempotency-key': payload.messageId,
    },
    data: payload,
  });
}

async function expectAccepted(response: Awaited<ReturnType<typeof sendTelemetry>>) {
  expect(response.status()).toBe(201);
  expect(((await response.json()) as { accepted: boolean }).accepted).toBe(true);
}

async function expectSensitiveValueAbsent(page: Page, value: string) {
  expect((await page.locator('body').textContent())?.includes(value)).toBe(false);
  expect(page.url()).not.toContain(value);
  await expectNoSensitiveStorage(page);
}

async function expectNoSensitiveStorage(page: Page) {
  const storage = await page.evaluate(() => ({
    local: Object.entries(localStorage),
    session: Object.entries(sessionStorage),
    cookies: document.cookie,
  }));
  expect(storage.local.some(([key]) => /token|secret|credential/i.test(key))).toBe(false);
  expect(storage.session.some(([key]) => /token|secret|credential/i.test(key))).toBe(false);
  expect(storage.cookies).not.toMatch(/refresh|access.?token|secret|credential/i);
}

async function logout(page: Page) {
  await page.locator('header summary').click();
  await page.getByRole('button', { name: 'Keluar' }).click();
  await expect(page).toHaveURL(/\/login$/);
}

function apiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api/v1';
}

function apiOrigin() {
  return new URL(apiBaseUrl()).origin;
}

function requiredCredential(
  name:
    | 'E2E_PROJECT_OWNER_EMAIL'
    | 'E2E_PROJECT_OWNER_PASSWORD'
    | 'E2E_SCHOOL_ADMIN_EMAIL'
    | 'E2E_SCHOOL_ADMIN_PASSWORD',
  fallback:
    | 'SEED_PROJECT_OWNER_EMAIL'
    | 'SEED_PROJECT_OWNER_PASSWORD'
    | 'SEED_SCHOOL_ADMIN_EMAIL'
    | 'SEED_SCHOOL_ADMIN_PASSWORD',
) {
  const value = process.env[name]?.trim() || process.env[fallback]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} atau fallback seed wajib tersedia untuk acceptance Phase 03.`);
  }
  return value;
}
