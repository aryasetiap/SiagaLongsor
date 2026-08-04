import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });
test.use({ screenshot: 'off', trace: 'off', video: 'off' });

let activePointName: string | null = null;

test('PROJECT_OWNER mengelola lifecycle Alert, realtime, dan Audit Log', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(300_000);
  page.setDefaultNavigationTimeout(30_000);
  const pageErrors: Error[] = [];
  const missingOrganizationHeaders: string[] = [];
  const sensitiveRealtimeUrls: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  page.on('request', (webRequest) => {
    const url = new URL(webRequest.url());
    if (url.pathname === '/api/v1/realtime/stream' && url.search !== '') {
      sensitiveRealtimeUrls.push(url.href);
    }
    if (
      url.origin === apiOrigin() &&
      /^\/api\/v1\/(?:realtime|dashboard|monitoring-overview|monitoring-points|alerts|audit-logs|sites|devices)(?:\/|$)/.test(
        url.pathname,
      ) &&
      webRequest.headers()['x-organization-id'] === undefined
    ) {
      missingOrganizationHeaders.push(`${webRequest.method()} ${url.pathname}`);
    }
  });

  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 9).toUpperCase()}`;
  const pointName = `Phase 05 Point ${unique}`;
  const hardwareId = `P5-${unique}`;
  const displayName = `Phase 05 Device ${unique}`;
  activePointName = pointName;
  let deviceSecret: string | null = null;

  await login(
    page,
    requiredCredential('E2E_PROJECT_OWNER_EMAIL', 'SEED_PROJECT_OWNER_EMAIL'),
    requiredCredential('E2E_PROJECT_OWNER_PASSWORD', 'SEED_PROJECT_OWNER_PASSWORD'),
  );
  await expect(page.getByTestId('realtime-indicator').first()).toContainText('Realtime aktif', {
    timeout: 30_000,
  });
  const siteId = await createMonitoringPoint(page, pointName);
  deviceSecret = await registerDevice(page, { hardwareId, displayName, pointName, siteId });
  await expectSensitiveValueAbsent(page, deviceSecret);

  const profile = await readActiveProfile(page, siteId);
  const dangerTilt = profile.thresholds.danger.tiltMagnitudeDegGt + 0.5;
  const bootId = `p5_boot_${unique}`;
  let sequence = 0;
  const first = telemetryPayload(unique, bootId, ++sequence, dangerTilt);
  await expectAccepted(await sendTelemetry(request, hardwareId, deviceSecret, first));

  await page.goto('/alerts');
  await expect(page.getByTestId('realtime-indicator').first()).toContainText('Realtime aktif', {
    timeout: 30_000,
  });
  let dangerRow = findDangerAlert(page, pointName);
  await expect(dangerRow).toContainText('Aktif', { timeout: 30_000 });

  const repeated = telemetryPayload(unique, bootId, ++sequence, dangerTilt + 0.1);
  await expectAccepted(await sendTelemetry(request, hardwareId, deviceSecret, repeated));
  await expect(dangerRow).toContainText('2 kali', { timeout: 30_000 });

  await dangerRow.getByRole('button', { name: 'Lihat detail' }).click();
  let detail = page.getByRole('dialog', { name: 'Detail peringatan' });
  await expect(detail).toBeVisible();
  await detail.getByRole('button', { name: 'Buka SOP' }).first().click();
  await expect(detail.getByText('SOP resmi belum tersedia pada sistem')).toBeVisible();
  expect(await detail.textContent()).not.toMatch(/evakuasi|hubungi petugas|berlindung/i);
  await detail.getByRole('button', { name: 'Konfirmasi peringatan' }).click();
  const acknowledge = page.getByRole('dialog', { name: 'Konfirmasi peringatan' });
  await acknowledge.getByLabel('Catatan operator').fill(`Diperiksa ${unique}`);
  await acknowledge.getByLabel('Kondisi lapangan').fill('Kondisi lapangan telah diverifikasi');
  await acknowledge.getByRole('radio', { name: 'Ya' }).check();
  const acknowledgeResponse = waitForApiResponse(
    page,
    new RegExp('/api/v1/alerts/[^/]+/acknowledge$'),
    'POST',
  );
  await acknowledge.getByRole('button', { name: 'Konfirmasi' }).click();
  expect((await acknowledgeResponse).status()).toBe(200);
  detail = page.getByRole('dialog', { name: 'Detail peringatan' });
  await expect(detail).toContainText('Diketahui', { timeout: 20_000 });
  await expect(detail.getByText(`Diperiksa ${unique}`)).toBeVisible();
  await expect(detail).toContainText(/Project Owner|Operator/);

  const observedAfterAcknowledge = telemetryPayload(unique, bootId, ++sequence, dangerTilt + 0.2);
  await expectAccepted(
    await sendTelemetry(request, hardwareId, deviceSecret, observedAfterAcknowledge),
  );
  await expect(detail).toContainText(/Jumlah observasi3/, { timeout: 30_000 });
  await expect(detail).toContainText('Diketahui');

  await detail.getByRole('button', { name: 'Selesaikan' }).click();
  const resolve = page.getByRole('dialog', { name: 'Selesaikan peringatan' });
  await resolve.getByLabel('Catatan penyelesaian').fill(`Selesai ${unique}`);
  const resolveResponse = waitForApiResponse(
    page,
    new RegExp('/api/v1/alerts/[^/]+/resolve$'),
    'POST',
  );
  await resolve.getByRole('button', { name: 'Konfirmasi' }).click();
  expect((await resolveResponse).status()).toBe(200);
  await expect(detail).toContainText('Selesai', { timeout: 20_000 });
  await expect(detail.getByText(`Selesai ${unique}`)).toBeVisible();
  await expect(
    detail.getByRole('button', { name: /Konfirmasi peringatan|Selesaikan|alarm palsu/ }),
  ).toHaveCount(0);
  await detail.getByRole('button', { name: 'Tutup', exact: true }).click();

  const newOccurrence = telemetryPayload(unique, bootId, ++sequence, dangerTilt + 0.3);
  await expectAccepted(await sendTelemetry(request, hardwareId, deviceSecret, newOccurrence));
  dangerRow = findDangerAlert(page, pointName, 'Aktif');
  await expect(dangerRow).toBeVisible({ timeout: 30_000 });
  await dangerRow.getByRole('button', { name: 'Lihat detail' }).click();
  detail = page.getByRole('dialog', { name: 'Detail peringatan' });
  await detail.getByRole('button', { name: 'Tandai alarm palsu' }).click();
  const falseAlarm = page.getByRole('dialog', { name: 'Tandai sebagai alarm palsu' });
  await falseAlarm.getByLabel('Alasan alarm palsu').fill(`Gangguan sensor ${unique}`);
  const falseAlarmResponse = waitForApiResponse(
    page,
    new RegExp('/api/v1/alerts/[^/]+/false-alarm$'),
    'POST',
  );
  await falseAlarm.getByRole('button', { name: 'Konfirmasi' }).click();
  expect((await falseAlarmResponse).status()).toBe(200);
  await expect(detail).toContainText('Alarm palsu', { timeout: 20_000 });
  await expect(detail.getByText(`Gangguan sensor ${unique}`)).toBeVisible();
  await detail.getByRole('button', { name: 'Tutup', exact: true }).click();

  const adminOccurrence = telemetryPayload(unique, bootId, ++sequence, dangerTilt + 0.4);
  await expectAccepted(await sendTelemetry(request, hardwareId, deviceSecret, adminOccurrence));

  await page.goto('/settings/audit-log');
  await expect(page.getByRole('heading', { name: 'Audit Log' })).toBeVisible();
  await page.getByLabel('Jenis entitas').fill('Alert');
  await page.getByRole('button', { name: 'Terapkan' }).click();
  await expect(page.getByText(/Alert acknowledged/i).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Alert resolved/i).first()).toBeVisible();
  await expect(page.getByText(/Alert false alarm/i).first()).toBeVisible();
  expect(await page.locator('main').textContent()).not.toMatch(
    /ip address|user agent|authorization|raw telemetry|credentialHash/i,
  );

  await page.goto('/alerts');
  await expect(page.getByTestId('realtime-indicator').first()).toContainText('Realtime aktif', {
    timeout: 30_000,
  });
  await page.evaluate(() => window.stop());
  await expect(page.getByTestId('realtime-indicator').first()).toContainText('Realtime terputus', {
    timeout: 20_000,
  });
  await expect(page.getByRole('row').filter({ hasText: pointName }).first()).toBeVisible();
  await expect(page.getByTestId('realtime-indicator').first()).toContainText('Realtime aktif', {
    timeout: 45_000,
  });

  await expectNoSensitiveStorage(page);
  await expectSensitiveValueAbsent(page, deviceSecret);
  expect(missingOrganizationHeaders).toEqual([]);
  expect(sensitiveRealtimeUrls).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(testInfo.attachments).toEqual([]);
  await logout(page);
  deviceSecret = null;
});

test('SCHOOL_ADMIN hanya dapat acknowledge dan tidak dapat membaca Audit Log', async ({ page }) => {
  test.setTimeout(180_000);
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  await login(
    page,
    requiredCredential('E2E_SCHOOL_ADMIN_EMAIL', 'SEED_SCHOOL_ADMIN_EMAIL'),
    requiredCredential('E2E_SCHOOL_ADMIN_PASSWORD', 'SEED_SCHOOL_ADMIN_PASSWORD'),
  );
  await expect(page.getByRole('link', { name: /Audit Log/ })).toHaveCount(0);
  await expect(page.getByTestId('realtime-indicator').first()).toContainText('Realtime aktif', {
    timeout: 30_000,
  });
  await page.goto('/settings/audit-log');
  await expect(page.getByText('Halaman ini hanya tersedia untuk Project Owner.')).toBeVisible();
  expect(await page.locator('main').textContent()).not.toContain('Operator Utama');

  if (activePointName !== null) {
    await page.goto('/alerts');
    const activeRow = findDangerAlert(page, activePointName, 'Aktif');
    await expect(activeRow).toBeVisible({ timeout: 30_000 });
    await activeRow.getByRole('button', { name: 'Lihat detail' }).click();
    let detail = page.getByRole('dialog', { name: 'Detail peringatan' });
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 900, height: 1_000 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await expect(detail.getByRole('button', { name: 'Konfirmasi peringatan' })).toBeVisible();
    }
    await expect(detail.getByRole('button', { name: 'Selesaikan' })).toHaveCount(0);
    await expect(detail.getByRole('button', { name: 'Tandai alarm palsu' })).toHaveCount(0);
    await detail.getByRole('button', { name: 'Konfirmasi peringatan' }).click();
    const acknowledge = page.getByRole('dialog', { name: 'Konfirmasi peringatan' });
    await acknowledge.getByLabel('Catatan operator').fill('Diperiksa oleh Admin Sekolah');
    await acknowledge.getByLabel('Kondisi lapangan').fill('Kondisi telah diverifikasi');
    await acknowledge.getByRole('radio', { name: 'Belum' }).check();
    const response = waitForApiResponse(
      page,
      new RegExp('/api/v1/alerts/[^/]+/acknowledge$'),
      'POST',
    );
    await acknowledge.getByRole('button', { name: 'Konfirmasi' }).click();
    expect((await response).status()).toBe(200);
    detail = page.getByRole('dialog', { name: 'Detail peringatan' });
    await expect(detail).toContainText('Diketahui', { timeout: 20_000 });
    await expect(detail.getByRole('button', { name: 'Selesaikan' })).toHaveCount(0);
    await expect(detail.getByRole('button', { name: 'Tandai alarm palsu' })).toHaveCount(0);
    await detail.getByRole('button', { name: 'Tutup', exact: true }).click();
  }
  await expectNoSensitiveStorage(page);
  expect(pageErrors).toEqual([]);
  await logout(page);
});

interface Profile {
  readonly thresholds: { readonly danger: { readonly tiltMagnitudeDegGt: number } };
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Alamat email').fill(email);
  await page.getByRole('textbox', { name: 'Kata sandi', exact: true }).fill(password);
  const submit = page.getByRole('button', { name: 'Masuk ke SiagaLongsor' });
  let responsePromise = waitForApiResponse(page, /\/api\/v1\/auth\/login$/, 'POST');
  await submit.click();
  let response = await responsePromise;
  if (response.status() === 429) {
    const retryAfter = Number(response.headers()['retry-after'] ?? '60');
    await page.waitForTimeout((Number.isFinite(retryAfter) ? retryAfter + 1 : 61) * 1_000);
    responsePromise = waitForApiResponse(page, /\/api\/v1\/auth\/login$/, 'POST');
    await submit.click();
    response = await responsePromise;
  }
  expect(response.status()).toBe(200);
  await expect(page).toHaveURL(/\/overview$/);
}

async function createMonitoringPoint(page: Page, pointName: string): Promise<string> {
  await page.goto('/monitoring-points');
  await page.getByRole('button', { name: 'Tambah titik monitoring' }).click();
  const dialog = page.getByRole('dialog', { name: 'Tambah titik monitoring' });
  await dialog.getByLabel('Pilih Site').selectOption({ index: 1 });
  const siteId = await dialog.getByLabel('Pilih Site').inputValue();
  await dialog.getByLabel('Nama titik monitoring').fill(pointName);
  await dialog.getByRole('button', { name: 'Simpan titik monitoring' }).click();
  await expect(page.getByText('Titik monitoring berhasil ditambahkan.')).toBeVisible();
  return siteId;
}

async function registerDevice(
  page: Page,
  input: {
    readonly hardwareId: string;
    readonly displayName: string;
    readonly pointName: string;
    readonly siteId: string;
  },
): Promise<string> {
  await page.goto('/devices');
  await page.getByRole('button', { name: 'Daftarkan perangkat' }).click();
  const dialog = page.getByRole('dialog', { name: 'Daftarkan perangkat' });
  await dialog.getByLabel('Hardware ID').fill(input.hardwareId);
  await dialog.getByLabel('Nama perangkat').fill(input.displayName);
  await dialog.getByLabel('Pilih Site').selectOption(input.siteId);
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

async function readActiveProfile(page: Page, siteId: string): Promise<Profile> {
  await page.goto('/settings/risk-profile');
  const response = waitForApiResponse(
    page,
    new RegExp(`/api/v1/sites/${siteId}/risk-profile$`),
    'GET',
  );
  await page.getByLabel('Pilih Site untuk profil risiko').selectOption(siteId);
  const body = (await (await response).json()) as { readonly data: Profile };
  return body.data;
}

function telemetryPayload(
  unique: string,
  bootId: string,
  sequence: number,
  tiltMagnitudeDeg: number,
) {
  return {
    messageId: `p5_${unique}_${sequence}`,
    bootId,
    sequence,
    timestamp: new Date(Date.now() - 100).toISOString(),
    firmwareVersion: 'phase-05-acceptance',
    network: { type: 'WIFI', signalRssi: -58 },
    readings: {
      tiltXDeg: 0,
      tiltYDeg: 0,
      tiltMagnitudeDeg,
      soilMoisturePct: 40,
      rainfallMmHour: 5,
      batteryVoltage: 12,
    },
    deviceAssessment: { riskLevel: 'DANGER', sirenActive: false },
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
  expect(((await response.json()) as { readonly accepted: boolean }).accepted).toBe(true);
}

function findDangerAlert(page: Page, pointName: string, status?: string) {
  let row = page
    .getByRole('row')
    .filter({ hasText: pointName })
    .filter({ hasText: 'Risiko Bahaya' });
  if (status !== undefined) row = row.filter({ hasText: status });
  return row.first();
}

function waitForApiResponse(page: Page, path: RegExp, method: string) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === method && path.test(new URL(response.url()).pathname),
  );
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
    throw new Error(`${name} atau fallback seed wajib tersedia untuk acceptance Phase 05.`);
  }
  return value;
}
