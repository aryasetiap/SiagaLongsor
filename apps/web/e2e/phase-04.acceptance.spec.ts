import { expect, test, type APIRequestContext, type Page, type Response } from '@playwright/test';

test.describe.configure({ mode: 'serial' });
test.use({ screenshot: 'off', trace: 'off', video: 'off' });

let acceptedPointName: string | null = null;

test('PROJECT_OWNER menjalankan Dashboard Phase 04 dengan data aktual', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(240_000);
  page.setDefaultNavigationTimeout(30_000);
  const pageErrors: Error[] = [];
  const missingOrganizationHeaders: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  page.on('request', (webRequest) => {
    const url = new URL(webRequest.url());
    if (
      url.origin === apiOrigin() &&
      /^\/api\/v1\/(?:dashboard|monitoring-overview|monitoring-points|alerts|sites|devices)(?:\/|$)/.test(
        url.pathname,
      ) &&
      webRequest.headers()['x-organization-id'] === undefined
    ) {
      missingOrganizationHeaders.push(`${webRequest.method()} ${url.pathname}`);
    }
  });

  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 9).toUpperCase()}`;
  const pointName = `AAA Phase 04 Point ${unique}`;
  const hardwareId = `P4-${unique}`;
  const displayName = `Phase 04 Device ${unique}`;
  acceptedPointName = pointName;
  let deviceSecret: string | null = null;

  await login(
    page,
    requiredCredential('E2E_PROJECT_OWNER_EMAIL', 'SEED_PROJECT_OWNER_EMAIL'),
    requiredCredential('E2E_PROJECT_OWNER_PASSWORD', 'SEED_PROJECT_OWNER_PASSWORD'),
  );
  const baselineBody = await refreshSummary(page);

  const siteId = await createMonitoringPoint(page, pointName);
  deviceSecret = await registerDevice(page, { hardwareId, displayName, pointName, siteId });
  await expectSensitiveValueAbsent(page, deviceSecret);

  const profile = await readActiveProfile(page, siteId);
  const watchTilt =
    (profile.thresholds.safe.tiltMagnitudeDegLt + profile.thresholds.danger.tiltMagnitudeDegGt) / 2;
  const dangerTilt = profile.thresholds.danger.tiltMagnitudeDegGt + 0.5;
  const bootId = `p4_boot_${unique}`;
  const now = Date.now();
  const payloads = [
    telemetryPayload(unique, bootId, 1, watchTilt, 'WATCH', new Date(now - 55 * 60_000)),
    telemetryPayload(unique, bootId, 2, watchTilt + 0.25, 'WATCH', new Date(now - 45 * 60_000)),
    telemetryPayload(unique, bootId, 3, dangerTilt, 'DANGER', new Date(now - 5 * 60_000)),
  ] as const;
  for (const payload of payloads) {
    await expectAccepted(await sendTelemetry(request, hardwareId, deviceSecret, payload));
  }
  const latePayload = telemetryPayload(
    unique,
    bootId,
    4,
    profile.thresholds.safe.tiltMagnitudeDegLt / 2,
    'SAFE',
    new Date(now - 50 * 60_000),
  );
  await expectAccepted(await sendTelemetry(request, hardwareId, deviceSecret, latePayload));

  await page.goto('/overview');
  const summaryResponse = waitForDashboardSummary(page, 24);
  const recentAlertsResponse = waitForRecentAlerts(page);
  await page.getByRole('button', { name: 'Segarkan seluruh dashboard' }).click();
  const [currentBody, recentAlertsBody] = await Promise.all([
    dashboardBody(await summaryResponse),
    alertsBody(await recentAlertsResponse),
  ]);
  expect(currentBody.monitoringPoints.total).toBeGreaterThanOrEqual(
    baselineBody.monitoringPoints.total + 1,
  );
  expect(currentBody.monitoringPoints.active).toBeGreaterThanOrEqual(
    baselineBody.monitoringPoints.active + 1,
  );
  expect(currentBody.riskDistribution.danger).toBeGreaterThanOrEqual(1);
  expect(currentBody.alerts.activeCritical).toBeGreaterThanOrEqual(1);
  expect(
    recentAlertsBody.some(
      (alert) =>
        alert.monitoringPoint.name === pointName &&
        alert.type === 'RISK_DANGER' &&
        alert.severity === 'CRITICAL',
    ),
  ).toBe(true);

  await expect(
    page.getByRole('article', {
      name: `Titik Monitoring Aktif: ${currentBody.monitoringPoints.active}`,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('article', {
      name: `Peringatan Kritis Aktif: ${currentBody.alerts.activeCritical}`,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('article', {
      name: `Perangkat Tidak Terhubung: ${currentBody.connectivityDistribution.offline}`,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('article', { name: `Peringatan Baru: ${currentBody.alerts.newInWindow}` }),
  ).toBeVisible();
  await expect(page.getByRole('img', { name: /Distribusi risiko dari/ })).toBeVisible();
  await expect(page.getByLabel('Legenda distribusi risiko')).toContainText('Bahaya');
  await expect(page.getByText('Konektivitas perangkat aktif')).toBeVisible();

  await page.getByLabel('Cari titik monitoring').fill(pointName);
  const filteredOverview = waitForApiResponse(page, '/api/v1/monitoring-overview', 'GET');
  await page.getByRole('button', { name: 'Terapkan filter' }).click();
  const overviewBody = (await (await filteredOverview).json()) as unknown;
  expect(JSON.stringify(overviewBody)).not.toContain('totalCount');
  const pointRow = page.getByRole('row').filter({ hasText: pointName });
  await expect(pointRow).toContainText('Bahaya');

  const initialSeries = waitForSensorSeries(page, false);
  await pointRow.getByRole('button', { name: 'Pilih untuk grafik' }).click();
  const initialSeriesBody = await sensorBody(await initialSeries);
  expect(initialSeriesBody.items.every((item) => !item.isLate)).toBe(true);
  expect(isOldestFirst(initialSeriesBody.items)).toBe(true);
  await expect(page.getByRole('img', { name: /Grafik Kemiringan/ })).toBeVisible();
  await expect(page.getByText(/Kemiringan: 3 titik/)).toContainText('°');
  await expect(page.getByText(/gap terlihat/)).toContainText('1 gap');

  const lateSeries = waitForSensorSeries(page, true);
  await page.getByLabel('Sertakan data terlambat').check();
  const lateSeriesBody = await sensorBody(await lateSeries);
  expect(lateSeriesBody.items.some((item) => item.isLate)).toBe(true);
  expect(isOldestFirst(lateSeriesBody.items)).toBe(true);
  await expect(page.getByText(/Kemiringan: 4 titik/)).toContainText('1 data terlambat');
  await expect(page.getByText(/Data terlambat ditandai bentuk wajik/)).toBeVisible();

  const dangerAlert = page
    .locator('article')
    .filter({ hasText: pointName })
    .filter({ hasText: 'Kritis' });
  await expect(dangerAlert).toContainText('Risiko Bahaya');
  await dangerAlert.getByRole('button', { name: 'Lihat detail' }).click();
  await expect(page.getByRole('dialog', { name: 'Detail peringatan' })).toBeVisible();
  await page
    .getByRole('dialog', { name: 'Detail peringatan' })
    .getByRole('button', { name: 'Tutup' })
    .click();

  for (const hours of [72, 168, 24] as const) {
    const response = waitForDashboardSummary(page, hours);
    await page.getByLabel('Rentang dashboard').selectOption(String(hours));
    expect((await dashboardBody(await response)).window.hours).toBe(hours);
  }

  const siteRequests = [
    waitForDashboardSummary(page, 24, siteId),
    waitForApiResponse(page, '/api/v1/monitoring-overview', 'GET', `siteId=${siteId}`),
    waitForApiResponse(page, '/api/v1/alerts', 'GET', `siteId=${siteId}`),
  ] as const;
  await page.getByLabel('Filter Site dashboard').selectOption(siteId);
  await Promise.all(siteRequests);

  const refreshResponse = waitForDashboardSummary(page, 24, siteId);
  await page.getByRole('button', { name: 'Segarkan seluruh dashboard' }).click();
  await refreshResponse;

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 900, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole('heading', { name: 'Monitoring Overview' })).toBeVisible();
    await expect(pointRow).toContainText('Bahaya');
  }

  expect(await page.locator('body').textContent()).not.toMatch(
    /totalCount|rawPayload|credentialHash|Authorization|dibanding periode/i,
  );
  await expectSensitiveValueAbsent(page, deviceSecret);
  expect(missingOrganizationHeaders).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(testInfo.attachments).toEqual([]);
  await logout(page);
  deviceSecret = null;
});

test('SCHOOL_ADMIN membaca dashboard tanpa mutation', async ({ page }) => {
  test.setTimeout(120_000);
  page.setDefaultNavigationTimeout(30_000);
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  await login(
    page,
    requiredCredential('E2E_SCHOOL_ADMIN_EMAIL', 'SEED_SCHOOL_ADMIN_EMAIL'),
    requiredCredential('E2E_SCHOOL_ADMIN_PASSWORD', 'SEED_SCHOOL_ADMIN_PASSWORD'),
  );
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
  await expect(page.getByRole('article', { name: /Titik Monitoring Aktif:/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Monitoring Overview' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Peringatan Terbaru' })).toBeVisible();
  if (acceptedPointName !== null) {
    await page.getByLabel('Cari titik monitoring').fill(acceptedPointName);
    await page.getByRole('button', { name: 'Terapkan filter' }).click();
    const row = page.getByRole('row').filter({ hasText: acceptedPointName });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Pilih untuk grafik' }).click();
    await expect(page.getByRole('img', { name: /Grafik Kemiringan/ })).toBeVisible();
  }
  await expect(page.getByRole('button', { name: /akui|selesaikan|alarm palsu/i })).toHaveCount(0);
  await expectNoSensitiveStorage(page);
  expect(pageErrors).toEqual([]);
  await logout(page);
});

interface DashboardResponseBody {
  readonly monitoringPoints: { readonly total: number; readonly active: number };
  readonly riskDistribution: { readonly danger: number };
  readonly connectivityDistribution: { readonly offline: number };
  readonly alerts: { readonly activeCritical: number; readonly newInWindow: number };
  readonly window: { readonly hours: number };
}

interface SensorItem {
  readonly recordedAt: string;
  readonly isLate: boolean;
}

interface RecentAlertItem {
  readonly type: string;
  readonly severity: string;
  readonly monitoringPoint: { readonly name: string };
}

interface Profile {
  readonly thresholds: {
    readonly safe: { readonly tiltMagnitudeDegLt: number };
    readonly danger: { readonly tiltMagnitudeDegGt: number };
  };
}

async function dashboardBody(response: Response): Promise<DashboardResponseBody> {
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { readonly data: DashboardResponseBody };
  expect(JSON.stringify(body)).not.toContain('totalCount');
  return body.data;
}

async function sensorBody(response: Response): Promise<{ readonly items: readonly SensorItem[] }> {
  expect(response.status()).toBe(200);
  const body = (await response.json()) as {
    readonly data: { readonly items: readonly SensorItem[] };
  };
  expect(JSON.stringify(body)).not.toContain('totalCount');
  return body.data;
}

async function alertsBody(response: Response): Promise<readonly RecentAlertItem[]> {
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { readonly data: readonly RecentAlertItem[] };
  expect(JSON.stringify(body)).not.toContain('totalCount');
  return body.data;
}

function isOldestFirst(items: readonly SensorItem[]) {
  return items.every(
    (item, index) => index === 0 || item.recordedAt >= (items[index - 1]?.recordedAt ?? ''),
  );
}

async function refreshSummary(page: Page) {
  const response = waitForDashboardSummary(page, 24);
  await page.getByRole('button', { name: 'Segarkan seluruh dashboard' }).click();
  return dashboardBody(await response);
}

function waitForDashboardSummary(page: Page, hours: number, siteId?: string) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === 'GET' &&
      url.pathname === '/api/v1/dashboard/summary' &&
      url.searchParams.get('windowHours') === String(hours) &&
      (siteId === undefined
        ? !url.searchParams.has('siteId')
        : url.searchParams.get('siteId') === siteId)
    );
  });
}

function waitForRecentAlerts(page: Page) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === 'GET' &&
      url.pathname === '/api/v1/alerts' &&
      url.searchParams.get('sort') === 'lastObservedAt:desc' &&
      url.searchParams.get('limit') === '5' &&
      !url.searchParams.has('siteId')
    );
  });
}

function waitForSensorSeries(page: Page, includeLate: boolean) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === 'GET' &&
      /\/api\/v1\/monitoring-points\/[^/]+\/sensor-series$/.test(url.pathname) &&
      url.searchParams.get('includeLate') === String(includeLate)
    );
  });
}

function waitForApiResponse(page: Page, path: string, method: string, queryFragment?: string) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === method &&
      url.pathname === path &&
      (queryFragment === undefined || url.search.includes(queryFragment))
    );
  });
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Alamat email').fill(email);
  await page.getByRole('textbox', { name: 'Kata sandi', exact: true }).fill(password);
  const submit = page.getByRole('button', { name: 'Masuk ke SiagaLongsor' });
  let responsePromise = waitForApiResponse(page, '/api/v1/auth/login', 'POST');
  await submit.click();
  let response = await responsePromise;
  if (response.status() === 429) {
    const retryAfterSeconds = Number(response.headers()['retry-after'] ?? '60');
    await page.waitForTimeout(
      (Number.isFinite(retryAfterSeconds) ? retryAfterSeconds + 1 : 61) * 1000,
    );
    responsePromise = waitForApiResponse(page, '/api/v1/auth/login', 'POST');
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
  const response = page.waitForResponse((candidate) =>
    new URL(candidate.url()).pathname.endsWith(`/api/v1/sites/${siteId}/risk-profile`),
  );
  await page.getByLabel('Pilih Site untuk profil risiko').selectOption(siteId);
  const body = (await (await response).json()) as { readonly data: Profile };
  return body.data;
}

function telemetryPayload(
  unique: string,
  bootId: string,
  sequence: number,
  tilt: number,
  firmwareRisk: 'SAFE' | 'WATCH' | 'DANGER',
  timestamp: Date,
) {
  return {
    messageId: `p4_${unique}_${sequence}`,
    bootId,
    sequence,
    timestamp: timestamp.toISOString(),
    firmwareVersion: 'phase-04-acceptance',
    network: { type: 'WIFI', signalRssi: -58 },
    readings: {
      tiltXDeg: 0,
      tiltYDeg: 0,
      tiltMagnitudeDeg: tilt,
      soilMoisturePct: 40 + sequence,
      rainfallMmHour: 5 + sequence,
      batteryVoltage: 12 - sequence / 10,
    },
    deviceAssessment: { riskLevel: firmwareRisk, sirenActive: false },
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
  expect(
    storage.local.some(([key, value]) => /token|secret|credential/i.test(`${key}${value}`)),
  ).toBe(false);
  expect(
    storage.session.some(([key, value]) => /token|secret|credential/i.test(`${key}${value}`)),
  ).toBe(false);
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
    throw new Error(`${name} atau fallback seed wajib tersedia untuk acceptance Phase 04.`);
  }
  return value;
}
