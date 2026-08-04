import { Buffer } from 'node:buffer';

import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });
test.use({ screenshot: 'off', trace: 'off', video: 'off' });

test('PROJECT_OWNER membuat Map, menangani conflict stale tanpa replay, dan no-op secara authoritative', async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const errors: Error[] = [];
  const externalMapRequests: string[] = [];
  page.on('pageerror', (error) => errors.push(error));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (
      url.origin !== page.url().split('/').slice(0, 3).join('/') &&
      /tile|mapbox|googleapis|leaflet/i.test(url.href)
    )
      externalMapRequests.push(url.href);
  });
  await login(
    page,
    requiredCredential('E2E_PROJECT_OWNER_EMAIL', 'SEED_PROJECT_OWNER_EMAIL'),
    requiredCredential('E2E_PROJECT_OWNER_PASSWORD', 'SEED_PROJECT_OWNER_PASSWORD'),
  );
  const outOfBand = await authenticate(request);
  const mapResponses: {
    readonly method: string;
    readonly status: number;
    readonly path: string;
  }[] = [];
  let browserMapPutCount = 0;
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.origin === apiOrigin() && url.pathname.includes('/map-config')) {
      mapResponses.push({
        method: response.request().method(),
        status: response.status(),
        path: url.pathname,
      });
    }
  });
  page.on('request', (browserRequest) => {
    const url = new URL(browserRequest.url());
    if (url.origin === apiOrigin() && /\/sites\/[^/]+\/map-config$/.test(url.pathname)) {
      expect(browserRequest.headers()['x-organization-id']).toBeTruthy();
      if (browserRequest.method() === 'PUT') browserMapPutCount += 1;
    }
  });
  const sitesPromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/v1/sites' &&
      response.request().method() === 'GET' &&
      response.status() === 200,
  );
  const initialOverviewPromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/v1/map/overview' &&
      response.request().method() === 'GET' &&
      response.status() === 200,
  );
  await page.goto('/map');
  await expect(page.getByRole('heading', { name: 'Map & Evacuation' })).toBeVisible();
  await expect(page.getByLabel('Site')).toBeVisible();
  const sites = (await (await sitesPromise).json()) as { data: readonly { id: string }[] };
  const initialOverview = (await (await initialOverviewPromise).json()) as {
    data: { site: { id: string }; markers: readonly { monitoringPoint: { id: string } }[] };
  };
  const siteId = initialOverview.data.site.id;
  await page.getByLabel('Site').focus();
  expect(await page.getByLabel('Site').inputValue()).toBe(siteId);
  await expect(page.getByText('Site ini belum memiliki konfigurasi peta.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Daftar titik monitoring' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Buka editor' })).toBeVisible();
  expect(sites.data.some((site) => site.id === siteId)).toBe(true);
  const pointsResponse = await request.get(
    `${apiOrigin()}/api/v1/monitoring-points?siteId=${encodeURIComponent(siteId)}&limit=1`,
    {
      headers: {
        authorization: `Bearer ${outOfBand.token}`,
        'x-organization-id': outOfBand.organizationId,
      },
    },
  );
  expect(pointsResponse.status()).toBe(200);
  const points = (await pointsResponse.json()) as { data: readonly { id: string }[] };
  const pointId = points.data[0]!.id;
  const initialConfigPromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/v1/sites/${siteId}/map-config` &&
      response.request().method() === 'GET' &&
      [200, 404].includes(response.status()),
  );
  await page.getByRole('button', { name: 'Buka editor' }).press('Enter');
  await initialConfigPromise;
  await page.getByRole('textbox', { name: 'Longitude', exact: true }).fill('105.20');
  await page.getByRole('textbox', { name: 'Latitude', exact: true }).fill('-5.40');
  await page.getByLabel('Zoom').fill('15');
  await page
    .getByLabel(/Lokasi MonitoringPoint/)
    .fill(JSON.stringify([{ monitoringPointId: pointId, position: [105.2, -5.4] }]));
  await page.getByLabel(/Risk-zone Polygon/).fill(
    JSON.stringify([
      {
        featureId: '11111111-1111-4111-8111-111111111111',
        name: 'Zona E2E',
        description: null,
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [105.2, -5.4],
              [105.21, -5.4],
              [105.21, -5.41],
              [105.2, -5.41],
              [105.2, -5.4],
            ],
          ],
        },
      },
    ]),
  );
  await page.getByLabel(/Evacuation-route LineString/).fill(
    JSON.stringify([
      {
        featureId: '22222222-2222-4222-8222-222222222222',
        name: 'Jalur E2E',
        description: null,
        destinationLabel: 'Titik aman',
        geometry: {
          type: 'LineString',
          coordinates: [
            [105.205, -5.405],
            [105.215, -5.415],
          ],
        },
      },
    ]),
  );
  const createResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/v1/sites/${siteId}/map-config` &&
      response.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'Simpan konfigurasi' }).press('Enter');
  const created = await createResponse;
  expect(created.status()).toBe(200);
  const createdBody = (await created.json()) as { data: Record<string, unknown>; changed: boolean };
  expect(createdBody.changed).toBe(true);
  expect(createdBody.data.version).toBe(1);
  await expect(page.getByText(`Konfigurasi versi ${createdBody.data.version}`)).toBeVisible();
  await expect(page.getByText('Zona referensi statis', { exact: true })).toBeVisible();
  await expect(page.getByText('Jalur evakuasi manual', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Daftar titik monitoring authoritative')).toBeVisible();

  const staleEditorConfig = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/v1/sites/${siteId}/map-config` &&
      response.request().method() === 'GET' &&
      response.status() === 200,
  );
  await page.getByRole('button', { name: 'Buka editor' }).click();
  await staleEditorConfig;
  const outOfBandInput: Record<string, unknown> = {
    ...createdBody.data,
    expectedVersion: 1,
    notes: 'out-of-band update',
  };
  delete outOfBandInput.id;
  delete outOfBandInput.siteId;
  delete outOfBandInput.version;
  delete outOfBandInput.createdAt;
  delete outOfBandInput.activatedAt;
  delete outOfBandInput.createdBy;
  const external = await request.put(`${apiOrigin()}/api/v1/sites/${siteId}/map-config`, {
    data: outOfBandInput,
    headers: {
      authorization: `Bearer ${outOfBand.token}`,
      'x-organization-id': outOfBand.organizationId,
    },
  });
  expect(external.status()).toBe(200);
  const externalBody = (await external.json()) as {
    data: Record<string, unknown>;
    changed: boolean;
  };
  expect(externalBody.changed).toBe(true);
  expect(externalBody.data.version).toBe(2);

  await page.getByLabel('Catatan').fill('stale browser edit');

  const staleResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/v1/sites/${siteId}/map-config` &&
      response.request().method() === 'PUT' &&
      response.status() === 409,
  );
  const refetchResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/v1/sites/${siteId}/map-config` &&
      response.request().method() === 'GET' &&
      response.status() === 200,
  );

  const beforeStale = browserMapPutCount;
  await page.getByRole('button', { name: 'Simpan konfigurasi' }).click();

  const staleResponse = await staleResponsePromise;
  expect(staleResponse.status()).toBe(409);
  const staleBody = (await staleResponse.json()) as { error: { code: string } };
  expect(staleBody.error.code).toBe('MAP_CONFIG_VERSION_CONFLICT');

  const refetchResponse = await refetchResponsePromise;
  expect(refetchResponse.status()).toBe(200);
  const refetchBody = (await refetchResponse.json()) as { data: Record<string, unknown> };
  expect(refetchBody.data.version).toBe(externalBody.data.version);

  // Refetch authoritative adalah barrier stabil. Jangan bergantung pada toast conflict transient.
  expect(browserMapPutCount).toBe(beforeStale + 1);

  const noOpResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/v1/sites/${siteId}/map-config` &&
      response.request().method() === 'PUT' &&
      response.status() === 200,
  );
  await page.getByRole('button', { name: 'Simpan konfigurasi' }).click();

  const noOpResponse = await noOpResponsePromise;
  expect(noOpResponse.status()).toBe(200);
  const noOpBody = (await noOpResponse.json()) as {
    data: Record<string, unknown>;
    changed: boolean;
  };
  expect(noOpBody.changed).toBe(false);
  expect(noOpBody.data.version).toBe(externalBody.data.version);

  // Satu stale PUT + satu explicit no-op PUT; tidak ada automatic replay.
  expect(browserMapPutCount).toBe(beforeStale + 2);
  await expect(
    page.getByText(`Konfigurasi versi ${String(noOpBody.data.version)}`, { exact: true }),
  ).toBeVisible();
  await expect(page).not.toHaveURL(/[?&](?:token|access_token)=/i);
  expect(await storageContainsToken(page)).toBe(false);
  expect(externalMapRequests).toEqual([]);
  expect(errors).toEqual([]);
});

const SOP_BROWSER_FILE_NAME = 'sop-browser-e2e.pdf';

test('PROJECT_OWNER mengunggah SOP PDF, melihat versi aktif/riwayat, dan mengunduh secara authenticated', async ({
  page,
}) => {
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
    requiredCredential('E2E_PROJECT_OWNER_EMAIL', 'SEED_PROJECT_OWNER_EMAIL'),
    requiredCredential('E2E_PROJECT_OWNER_PASSWORD', 'SEED_PROJECT_OWNER_PASSWORD'),
  );

  const overviewPromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/v1/map/overview' &&
      response.request().method() === 'GET' &&
      response.status() === 200,
  );
  await page.goto('/map');
  const overview = (await (await overviewPromise).json()) as { data: { site: { id: string } } };
  const siteId = overview.data.site.id;

  await expect(page.getByRole('heading', { name: 'SOP resmi' })).toBeVisible();
  await expect(page.getByText('SOP resmi belum tersedia', { exact: true })).toBeVisible();
  const fileInput = page.getByLabel('Unggah SOP PDF (maks. 10 MiB)');
  await expect(fileInput).toBeVisible();

  await fileInput.setInputFiles({
    name: SOP_BROWSER_FILE_NAME,
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n'),
  });

  const uploadRequestPromise = page.waitForRequest(
    (browserRequest) =>
      new URL(browserRequest.url()).pathname === `/api/v1/sites/${siteId}/sop` &&
      browserRequest.method() === 'POST',
  );
  const uploadResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/v1/sites/${siteId}/sop` &&
      response.request().method() === 'POST',
  );
  const activeRefetchPromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/v1/sites/${siteId}/sop` &&
      response.request().method() === 'GET' &&
      response.status() === 200,
  );
  const historyRefetchPromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/v1/sites/${siteId}/sop/versions` &&
      response.request().method() === 'GET' &&
      response.status() === 200,
  );

  await page.getByRole('button', { name: 'Konfirmasi unggah versi aktif' }).click();

  const uploadRequest = await uploadRequestPromise;
  expect(uploadRequest.headers()['x-organization-id']).toBeTruthy();
  expect(uploadRequest.headers().authorization).toBeTruthy();

  const uploadResponse = await uploadResponsePromise;
  expect([200, 201]).toContain(uploadResponse.status());
  const uploadedBody = (await uploadResponse.json()) as {
    data: {
      id: string;
      version: number;
      originalFileName: string;
      mediaType: string;
      isActive: boolean;
    };
  };
  expect(uploadedBody.data.originalFileName).toBe(SOP_BROWSER_FILE_NAME);
  expect(uploadedBody.data.version).toBe(1);
  expect(uploadedBody.data.mediaType).toBe('application/pdf');
  expect(uploadedBody.data.isActive).toBe(true);

  const activeRefetch = await activeRefetchPromise;
  const activeBody = (await activeRefetch.json()) as {
    data: { id: string; version: number; originalFileName: string; isActive: boolean };
  };
  expect(activeBody.data.id).toBe(uploadedBody.data.id);
  expect(activeBody.data.version).toBe(uploadedBody.data.version);
  expect(activeBody.data.originalFileName).toBe(SOP_BROWSER_FILE_NAME);
  expect(activeBody.data.isActive).toBe(true);

  const historyRefetch = await historyRefetchPromise;
  const historyBody = (await historyRefetch.json()) as {
    data: readonly { id: string; version: number; originalFileName: string }[];
  };
  expect(
    historyBody.data.some(
      (document) =>
        document.id === uploadedBody.data.id &&
        document.version === uploadedBody.data.version &&
        document.originalFileName === SOP_BROWSER_FILE_NAME,
    ),
  ).toBe(true);

  await expect(page.getByText(`${SOP_BROWSER_FILE_NAME} (aktif)`, { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Riwayat versi' })).toBeVisible();
  await expect
    .poll(async () => page.getByText(SOP_BROWSER_FILE_NAME, { exact: false }).count())
    .toBeGreaterThanOrEqual(2);

  const contentRequestPromise = page.waitForRequest(
    (browserRequest) =>
      new URL(browserRequest.url()).pathname ===
        `/api/v1/sop-documents/${uploadedBody.data.id}/content` &&
      browserRequest.method() === 'GET',
  );
  const contentResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname ===
        `/api/v1/sop-documents/${uploadedBody.data.id}/content` &&
      response.request().method() === 'GET',
  );
  await page.getByRole('button', { name: 'Unduh SOP' }).first().click();

  const contentRequest = await contentRequestPromise;
  expect(contentRequest.headers()['x-organization-id']).toBeTruthy();
  expect(contentRequest.headers().authorization).toBeTruthy();
  const contentResponse = await contentResponsePromise;
  expect(contentResponse.status()).toBe(200);
  expect(contentResponse.headers()['content-type']).toContain('application/pdf');
  expect(contentResponse.headers()['content-disposition']).toContain('inline');
  expect(contentResponse.headers()['content-disposition']).toContain(SOP_BROWSER_FILE_NAME);

  await expect(page).not.toHaveURL(/[?&](?:token|access_token)=/i);
  expect(await storageContainsToken(page)).toBe(false);
  expect(directStorageRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test('SCHOOL_ADMIN mendapat Map/SOP read-only pada viewport mobile', async ({ page }) => {
  const errors: Error[] = [];
  const directStorageRequests: string[] = [];
  page.on('pageerror', (error) => errors.push(error));
  page.on('request', (browserRequest) => {
    const url = new URL(browserRequest.url());
    if (url.port === '59000') directStorageRequests.push(url.href);
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await login(
    page,
    requiredCredential('E2E_SCHOOL_ADMIN_EMAIL', 'SEED_SCHOOL_ADMIN_EMAIL'),
    requiredCredential('E2E_SCHOOL_ADMIN_PASSWORD', 'SEED_SCHOOL_ADMIN_PASSWORD'),
  );

  const activeSopPromise = page.waitForResponse(
    (response) =>
      /\/api\/v1\/sites\/[^/]+\/sop$/.test(new URL(response.url()).pathname) &&
      response.request().method() === 'GET' &&
      response.status() === 200,
  );
  await page.goto('/map');
  const activeSopResponse = await activeSopPromise;
  const activeSopBody = (await activeSopResponse.json()) as {
    data: { id: string; originalFileName: string; version: number; isActive: boolean };
  };

  await expect(page.getByRole('heading', { name: 'Map & Evacuation' })).toBeVisible();
  await expect(page.getByLabel('Site')).toBeVisible();
  await expect(
    page.getByText('Konfigurasi peta bersifat hanya-baca untuk School Admin.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Buka editor' })).toHaveCount(0);
  await expect(page.getByLabel('Daftar titik monitoring authoritative')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'SOP resmi' })).toBeVisible();
  expect(activeSopBody.data.originalFileName).toBe(SOP_BROWSER_FILE_NAME);
  expect(activeSopBody.data.version).toBe(1);
  expect(activeSopBody.data.isActive).toBe(true);
  await expect(page.getByText(`${SOP_BROWSER_FILE_NAME} (aktif)`, { exact: true })).toBeVisible();
  await expect(page.getByLabel('Unggah SOP PDF (maks. 10 MiB)')).toHaveCount(0);

  const contentRequestPromise = page.waitForRequest(
    (browserRequest) =>
      new URL(browserRequest.url()).pathname ===
        `/api/v1/sop-documents/${activeSopBody.data.id}/content` &&
      browserRequest.method() === 'GET',
  );
  const contentResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname ===
        `/api/v1/sop-documents/${activeSopBody.data.id}/content` &&
      response.request().method() === 'GET',
  );
  await page.getByRole('button', { name: 'Unduh SOP' }).first().click();

  const contentRequest = await contentRequestPromise;
  expect(contentRequest.headers()['x-organization-id']).toBeTruthy();
  expect(contentRequest.headers().authorization).toBeTruthy();
  const contentResponse = await contentResponsePromise;
  expect(contentResponse.status()).toBe(200);
  expect(contentResponse.headers()['content-type']).toContain('application/pdf');

  await expect(page).not.toHaveURL(/[?&](?:token|access_token)=/i);
  expect(await storageContainsToken(page)).toBe(false);
  expect(directStorageRequests).toEqual([]);
  expect(errors).toEqual([]);
});

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('textbox', { name: 'Kata sandi' }).fill(password);
  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect(page).toHaveURL(/\/overview$/);
}

async function authenticate(
  request: APIRequestContext,
): Promise<{ readonly token: string; readonly organizationId: string }> {
  const response = await request.post(`${apiOrigin()}/api/v1/auth/login`, {
    data: {
      email: requiredCredential('E2E_PROJECT_OWNER_EMAIL', 'SEED_PROJECT_OWNER_EMAIL'),
      password: requiredCredential('E2E_PROJECT_OWNER_PASSWORD', 'SEED_PROJECT_OWNER_PASSWORD'),
    },
  });
  expect(response.status()).toBe(200);
  const body = (await response.json()) as {
    accessToken: string;
    user: { memberships: readonly { organizationId: string }[] };
  };
  return { token: body.accessToken, organizationId: body.user.memberships[0]!.organizationId };
}

function apiOrigin(): string {
  return new URL(process.env.E2E_API_BASE_URL ?? 'http://localhost:3001/api/v1').origin;
}

function requiredCredential(name: string, fallback: string): string {
  const value = process.env[name]?.trim() || process.env[fallback]?.trim();
  if (value === undefined || value.length === 0)
    throw new Error(`${name} atau ${fallback} wajib tersedia untuk acceptance Phase 06.`);
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
