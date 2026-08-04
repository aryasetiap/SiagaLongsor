import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });
test.use({
  screenshot: 'off',
  trace: 'off',
  video: 'off',
  timezoneId: 'Asia/Jakarta',
});

test('PROJECT_OWNER Reports memvalidasi range dan mengunduh CSV secara authenticated', async ({
  page,
}) => {
  test.setTimeout(90_000);

  const errors: Error[] = [];
  const directStorageRequests: string[] = [];
  let csvRequestCount = 0;

  page.on('pageerror', (error) => errors.push(error));
  page.on('request', (browserRequest) => {
    const url = new URL(browserRequest.url());

    if (url.port === '59000') directStorageRequests.push(url.href);

    if (
      url.origin === apiOrigin() &&
      url.pathname === '/api/v1/reports/telemetry.csv' &&
      browserRequest.method() === 'GET'
    ) {
      csvRequestCount += 1;
    }
  });

  await login(
    page,
    requiredCredential('E2E_PROJECT_OWNER_EMAIL', 'SEED_PROJECT_OWNER_EMAIL'),
    requiredCredential('E2E_PROJECT_OWNER_PASSWORD', 'SEED_PROJECT_OWNER_PASSWORD'),
  );

  await page.goto('/reports');

  await expect(page.getByLabel('Site')).toBeVisible();
  await expect(page.getByText('Status saat laporan dibuat', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ekspor telemetry CSV' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Buat laporan PDF' })).toBeVisible();
  await expect(page.getByLabel('Site')).not.toHaveValue('');

  const siteId = await page.getByLabel('Site').inputValue();
  expect(siteId).not.toBe('');

  // Missing range: client-side rejection, no CSV network request.
  await page.getByRole('button', { name: 'Ekspor telemetry CSV' }).click();
  await expect(page.getByRole('alert').filter({ hasText: /wajib/i })).toHaveText(/wajib/i);
  expect(csvRequestCount).toBe(0);

  // Inverted range: client-side rejection, no CSV network request.
  await fillRange(page, '2026-02-01T00:00', '2026-01-01T00:00');
  await page.getByRole('button', { name: 'Ekspor telemetry CSV' }).click();
  await expect(page.getByRole('alert').filter({ hasText: /harus sebelum/i })).toHaveText(
    /harus sebelum/i,
  );
  expect(csvRequestCount).toBe(0);

  // More than 31 days: client-side rejection, no CSV network request.
  await fillRange(page, '2026-01-01T00:00', '2026-02-02T00:00');
  await page.getByRole('button', { name: 'Ekspor telemetry CSV' }).click();
  await expect(page.getByRole('alert').filter({ hasText: /31 hari/i })).toHaveText(/31 hari/i);
  expect(csvRequestCount).toBe(0);

  // Valid [from,to): one authenticated CSV request and one browser download.
  const fromInput = '2026-01-01T00:00';
  const toInput = '2026-01-02T00:00';
  await fillRange(page, fromInput, toInput);

  const csvRequestPromise = page.waitForRequest((browserRequest) => {
    const url = new URL(browserRequest.url());
    return (
      url.origin === apiOrigin() &&
      url.pathname === '/api/v1/reports/telemetry.csv' &&
      browserRequest.method() === 'GET'
    );
  });
  const csvResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.origin === apiOrigin() &&
      url.pathname === '/api/v1/reports/telemetry.csv' &&
      response.request().method() === 'GET'
    );
  });
  const downloadPromise = page.waitForEvent('download');

  await page.getByRole('button', { name: 'Ekspor telemetry CSV' }).click();

  const csvRequest = await csvRequestPromise;
  const csvUrl = new URL(csvRequest.url());

  expect(csvRequest.headers().authorization).toBeTruthy();
  expect(csvRequest.headers()['x-organization-id']).toBeTruthy();
  expect(csvUrl.searchParams.get('siteId')).toBe(siteId);
  expect(csvUrl.searchParams.get('from')).toBe(new Date(fromInput).toISOString());
  expect(csvUrl.searchParams.get('to')).toBe(new Date(toInput).toISOString());
  expect(csvUrl.searchParams.has('token')).toBe(false);
  expect(csvUrl.searchParams.has('access_token')).toBe(false);

  const csvResponse = await csvResponsePromise;
  expect(csvResponse.status()).toBe(200);
  expect(csvResponse.headers()['content-type']).toContain('text/csv');

  const download = await downloadPromise;
  expect(download.suggestedFilename().length).toBeGreaterThan(0);

  expect(csvRequestCount).toBe(1);
  await expect(page).not.toHaveURL(/[?&](?:token|access_token)=/i);
  expect(await storageContainsToken(page)).toBe(false);
  expect(directStorageRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test('PROJECT_OWNER membuat PDF hingga SUCCEEDED dan mengunduh artifact secara authenticated', async ({
  page,
}) => {
  test.setTimeout(90_000);

  const errors: Error[] = [];
  const directStorageRequests: string[] = [];
  const observedDetailStatuses: string[] = [];

  page.on('pageerror', (error) => errors.push(error));
  page.on('request', (browserRequest) => {
    const url = new URL(browserRequest.url());
    if (url.port === '59000') directStorageRequests.push(url.href);
  });
  page.on('response', async (response) => {
    const url = new URL(response.url());
    if (
      url.origin === apiOrigin() &&
      /^\/api\/v1\/report-jobs\/[^/]+$/.test(url.pathname) &&
      response.request().method() === 'GET' &&
      response.ok()
    ) {
      try {
        const body = (await response.json()) as { data?: { status?: string } };
        if (body.data?.status) observedDetailStatuses.push(body.data.status);
      } catch {
        // A malformed detail response will be caught by the UI/status assertions below.
      }
    }
  });

  await login(
    page,
    requiredCredential('E2E_PROJECT_OWNER_EMAIL', 'SEED_PROJECT_OWNER_EMAIL'),
    requiredCredential('E2E_PROJECT_OWNER_PASSWORD', 'SEED_PROJECT_OWNER_PASSWORD'),
  );

  await page.goto('/reports');
  await expect(page.getByLabel('Site')).not.toHaveValue('');

  const siteId = await page.getByLabel('Site').inputValue();
  const fromInput = '2026-01-01T00:00';
  const toInput = '2026-01-02T00:00';

  await fillRange(page, fromInput, toInput);

  const createRequestPromise = page.waitForRequest(
    (browserRequest) =>
      new URL(browserRequest.url()).pathname === '/api/v1/report-jobs' &&
      browserRequest.method() === 'POST',
  );
  const createResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/v1/report-jobs' &&
      response.request().method() === 'POST',
  );

  await page.getByRole('button', { name: 'Buat laporan PDF' }).click();

  const createRequest = await createRequestPromise;
  expect(createRequest.headers().authorization).toBeTruthy();
  expect(createRequest.headers()['x-organization-id']).toBeTruthy();

  const createBody = createRequest.postDataJSON() as {
    reportType: string;
    siteId: string;
    from: string;
    to: string;
  };

  expect(createBody).toEqual({
    reportType: 'SITE_PERIOD_SUMMARY_PDF',
    siteId,
    from: new Date(fromInput).toISOString(),
    to: new Date(toInput).toISOString(),
  });

  const createResponse = await createResponsePromise;
  expect(createResponse.status()).toBe(202);

  const created = (await createResponse.json()) as {
    data: {
      id: string;
      status: string;
    };
  };

  expect(created.data.id).toBeTruthy();
  expect(created.data.status).toBe('QUEUED');

  const reportSection = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Laporan PDF' }) });
  const newestJob = reportSection.locator('li').first();
  await expect(newestJob).toBeVisible();

  const terminalStatus = await expect
    .poll(async () => (await newestJob.locator('strong').textContent())?.trim() ?? '', {
      timeout: 60_000,
      intervals: [500, 1000, 2000, 3000],
    })
    .toMatch(/^(SUCCEEDED|FAILED|EXPIRED)$/);

  void terminalStatus;
  await expect(newestJob.locator('strong')).toHaveText('SUCCEEDED');
  await expect(newestJob.getByRole('button', { name: 'Unduh PDF' })).toBeVisible();

  // The UI must have polled authoritative job detail; PROCESSING may be too fast to observe.
  expect(observedDetailStatuses.length).toBeGreaterThan(0);
  expect(observedDetailStatuses.at(-1)).toBe('SUCCEEDED');

  const contentRequestPromise = page.waitForRequest((browserRequest) => {
    const url = new URL(browserRequest.url());
    return (
      url.origin === apiOrigin() &&
      url.pathname === `/api/v1/report-jobs/${created.data.id}/content` &&
      browserRequest.method() === 'GET'
    );
  });
  const contentResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.origin === apiOrigin() &&
      url.pathname === `/api/v1/report-jobs/${created.data.id}/content` &&
      response.request().method() === 'GET'
    );
  });
  const downloadPromise = page.waitForEvent('download');

  await newestJob.getByRole('button', { name: 'Unduh PDF' }).click();

  const contentRequest = await contentRequestPromise;
  expect(contentRequest.headers().authorization).toBeTruthy();
  expect(contentRequest.headers()['x-organization-id']).toBeTruthy();

  const contentResponse = await contentResponsePromise;
  expect(contentResponse.status()).toBe(200);
  expect(contentResponse.headers()['content-type']).toContain('application/pdf');
  expect(contentResponse.headers()['x-content-type-options']).toBe('nosniff');

  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/[.]pdf$/i);

  await expect(page).not.toHaveURL(/[?&](?:token|access_token)=/i);
  expect(await storageContainsToken(page)).toBe(false);
  expect(directStorageRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test('SCHOOL_ADMIN memiliki akses Reports yang sama untuk CSV dan PDF', async ({ page }) => {
  test.setTimeout(90_000);

  const errors: Error[] = [];
  const directStorageRequests: string[] = [];

  page.on('pageerror', (error) => errors.push(error));
  page.on('request', (browserRequest) => {
    const url = new URL(browserRequest.url());
    if (url.port === '59000') directStorageRequests.push(url.href);
  });

  await login(
    page,
    requiredCredential('E2E_SCHOOL_ADMIN_EMAIL', 'SEED_SCHOOL_ADMIN_EMAIL'),
    requiredCredential('E2E_SCHOOL_ADMIN_PASSWORD', 'SEED_SCHOOL_ADMIN_PASSWORD'),
  );

  await page.goto('/reports');

  await expect(page.getByLabel('Site')).toBeVisible();
  await expect(page.getByLabel('Site')).not.toHaveValue('');
  await expect(page.getByText('Status saat laporan dibuat', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ekspor telemetry CSV' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Buat laporan PDF' })).toBeVisible();

  const siteId = await page.getByLabel('Site').inputValue();
  const fromInput = '2026-01-01T00:00';
  const toInput = '2026-01-02T00:00';

  await fillRange(page, fromInput, toInput);

  const csvRequestPromise = page.waitForRequest((browserRequest) => {
    const url = new URL(browserRequest.url());
    return (
      url.origin === apiOrigin() &&
      url.pathname === '/api/v1/reports/telemetry.csv' &&
      browserRequest.method() === 'GET'
    );
  });
  const csvResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.origin === apiOrigin() &&
      url.pathname === '/api/v1/reports/telemetry.csv' &&
      response.request().method() === 'GET'
    );
  });
  const csvDownloadPromise = page.waitForEvent('download');

  await page.getByRole('button', { name: 'Ekspor telemetry CSV' }).click();

  const csvRequest = await csvRequestPromise;
  expect(csvRequest.headers().authorization).toBeTruthy();
  expect(csvRequest.headers()['x-organization-id']).toBeTruthy();

  const csvUrl = new URL(csvRequest.url());
  expect(csvUrl.searchParams.get('siteId')).toBe(siteId);
  expect(csvUrl.searchParams.get('from')).toBe(new Date(fromInput).toISOString());
  expect(csvUrl.searchParams.get('to')).toBe(new Date(toInput).toISOString());

  const csvResponse = await csvResponsePromise;
  expect(csvResponse.status()).toBe(200);
  expect(csvResponse.headers()['content-type']).toContain('text/csv');

  const csvDownload = await csvDownloadPromise;
  expect(csvDownload.suggestedFilename().length).toBeGreaterThan(0);

  const createRequestPromise = page.waitForRequest(
    (browserRequest) =>
      new URL(browserRequest.url()).pathname === '/api/v1/report-jobs' &&
      browserRequest.method() === 'POST',
  );
  const createResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/v1/report-jobs' &&
      response.request().method() === 'POST',
  );

  await page.getByRole('button', { name: 'Buat laporan PDF' }).click();

  const createRequest = await createRequestPromise;
  expect(createRequest.headers().authorization).toBeTruthy();
  expect(createRequest.headers()['x-organization-id']).toBeTruthy();

  const createResponse = await createResponsePromise;
  expect(createResponse.status()).toBe(202);

  const created = (await createResponse.json()) as {
    data: {
      id: string;
      status: string;
    };
  };

  expect(created.data.id).toBeTruthy();
  expect(created.data.status).toBe('QUEUED');

  const reportSection = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Laporan PDF' }) });
  const newestJob = reportSection.locator('li').first();

  await expect(newestJob).toBeVisible();
  await expect
    .poll(async () => (await newestJob.locator('strong').textContent())?.trim() ?? '', {
      timeout: 60_000,
      intervals: [500, 1000, 2000, 3000],
    })
    .toBe('SUCCEEDED');

  const contentRequestPromise = page.waitForRequest((browserRequest) => {
    const url = new URL(browserRequest.url());
    return (
      url.origin === apiOrigin() &&
      url.pathname === `/api/v1/report-jobs/${created.data.id}/content` &&
      browserRequest.method() === 'GET'
    );
  });
  const contentResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.origin === apiOrigin() &&
      url.pathname === `/api/v1/report-jobs/${created.data.id}/content` &&
      response.request().method() === 'GET'
    );
  });
  const pdfDownloadPromise = page.waitForEvent('download');

  await newestJob.getByRole('button', { name: 'Unduh PDF' }).click();

  const contentRequest = await contentRequestPromise;
  expect(contentRequest.headers().authorization).toBeTruthy();
  expect(contentRequest.headers()['x-organization-id']).toBeTruthy();

  const contentResponse = await contentResponsePromise;
  expect(contentResponse.status()).toBe(200);
  expect(contentResponse.headers()['content-type']).toContain('application/pdf');

  const pdfDownload = await pdfDownloadPromise;
  expect(pdfDownload.suggestedFilename()).toMatch(/[.]pdf$/i);

  await expect(page).not.toHaveURL(/[?&](?:token|access_token)=/i);
  expect(await storageContainsToken(page)).toBe(false);
  expect(directStorageRequests).toEqual([]);
  expect(errors).toEqual([]);
});

async function fillRange(page: Page, from: string, to: string): Promise<void> {
  await page.getByLabel('Dari').fill(from);
  await page.getByLabel('Sampai').fill(to);
}

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('textbox', { name: 'Kata sandi' }).fill(password);
  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect(page).toHaveURL(/\/overview$/);
}

function apiOrigin(): string {
  return new URL(process.env.E2E_API_BASE_URL ?? 'http://localhost:3001/api/v1').origin;
}

function requiredCredential(name: string, fallback: string): string {
  const value = process.env[name]?.trim() || process.env[fallback]?.trim();

  if (value === undefined || value.length === 0) {
    throw new Error(`${name} atau ${fallback} wajib tersedia untuk acceptance Phase 06.`);
  }

  return value;
}

async function storageContainsToken(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const pattern = /token|secret|credential|^eyJ[A-Za-z0-9_-]+\./i;

    return [localStorage, sessionStorage].some((storage) =>
      Object.entries(storage).some(([key, value]) => pattern.test(`${key}${value}`)),
    );
  });
}
