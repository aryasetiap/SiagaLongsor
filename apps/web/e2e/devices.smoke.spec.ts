import { expect, test } from '@playwright/test';

test.use({ screenshot: 'off', trace: 'off' });

test('PROJECT_OWNER dapat mengelola lifecycle Device dan credential sekali tampil', async ({
  page,
}) => {
  const browserErrors: Error[] = [];
  page.on('pageerror', (error) => browserErrors.push(error));
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const pointName = `Device Smoke Point ${unique}`;
  const hardwareId = `E2E-DEVICE-${unique}`;
  const displayName = `Perangkat Smoke ${unique}`;
  const editedName = `Perangkat Diperbarui ${unique}`;

  await loginAsProjectOwner(page);
  await createMonitoringPoint(page, pointName);
  await Promise.all([
    page.waitForURL(/\/devices$/, { timeout: 30_000 }),
    page.getByRole('link', { name: /Perangkat/ }).click(),
  ]);
  await expect(page.getByRole('heading', { name: 'Perangkat', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Daftarkan perangkat' }).click();
  const register = page.getByRole('dialog', { name: 'Daftarkan perangkat' });
  await register.getByLabel('Hardware ID').fill(hardwareId);
  await register.getByLabel('Nama perangkat').fill(displayName);
  await register.getByLabel('Pilih Site').selectOption({ index: 1 });
  await register.getByLabel('Cari titik monitoring').fill(pointName);
  await register.getByLabel('Cari titik monitoring').press('Enter');
  await register.getByLabel('Pilih titik monitoring').selectOption({ label: pointName });
  await register.getByRole('button', { name: 'Daftarkan perangkat' }).click();

  const credentialDialog = page.getByRole('dialog', { name: /Simpan credential/ });
  const initialSecret = await credentialDialog.getByLabel('Secret perangkat').inputValue();
  expect(initialSecret.length >= 32).toBe(true);
  await acknowledgeAndCloseCredential(credentialDialog);
  expect(await bodyContains(page, initialSecret)).toBe(false);
  await page.reload();
  await expect(page).toHaveURL(/\/devices$/);
  expect(await bodyContains(page, initialSecret)).toBe(false);

  const row = page.getByRole('row').filter({ hasText: hardwareId });
  await expect(row).toContainText(displayName);
  await row.getByRole('button', { name: `Lihat detail ${displayName}` }).click();
  let detail = page.getByRole('dialog', { name: displayName });
  await detail.getByRole('button', { name: 'Edit' }).click();
  await detail.getByLabel('Nama perangkat').fill(editedName);
  await detail.getByRole('button', { name: 'Simpan perubahan' }).click();
  await expect(page.getByText('Data perangkat tersimpan.')).toBeVisible();

  const editedRow = page.getByRole('row').filter({ hasText: hardwareId });
  await expect(editedRow).toContainText(editedName);
  await editedRow.getByRole('button', { name: `Lihat detail ${editedName}` }).click();
  detail = page.getByRole('dialog', { name: editedName });
  await detail.getByRole('button', { name: 'Rotasi credential' }).click();
  await page.getByRole('button', { name: 'Ya, rotasi credential' }).click();

  const rotatedCredentialDialog = page.getByRole('dialog', { name: /Simpan credential/ });
  const rotatedSecret = await rotatedCredentialDialog.getByLabel('Secret perangkat').inputValue();
  expect(rotatedSecret.length >= 32 && rotatedSecret !== initialSecret).toBe(true);
  await acknowledgeAndCloseCredential(rotatedCredentialDialog);
  expect(await bodyContains(page, rotatedSecret)).toBe(false);

  await page
    .getByRole('row')
    .filter({ hasText: hardwareId })
    .getByRole('button', { name: `Lihat detail ${editedName}` })
    .click();
  detail = page.getByRole('dialog', { name: editedName });
  await detail.getByRole('button', { name: 'Nonaktifkan' }).click();
  await page.getByRole('button', { name: 'Ya, nonaktifkan' }).click();
  await expect(page.getByText(/berada dalam status dinonaktifkan/)).toBeVisible();

  const disabledRow = page.getByRole('row').filter({ hasText: hardwareId });
  await expect(disabledRow).toContainText('Dinonaktifkan');
  await disabledRow.getByRole('button', { name: `Lihat detail ${editedName}` }).click();
  detail = page.getByRole('dialog', { name: editedName });
  await expect(detail.getByRole('button', { name: 'Rotasi credential' })).toHaveCount(0);
  await expect(detail.getByRole('button', { name: 'Nonaktifkan' })).toHaveCount(0);
  await expectNoSensitiveBrowserStorage(page);
  expect(browserErrors).toEqual([]);
});

async function createMonitoringPoint(
  page: import('@playwright/test').Page,
  pointName: string,
): Promise<void> {
  await Promise.all([
    page.waitForURL(/\/monitoring-points$/, { timeout: 30_000 }),
    page.getByRole('link', { name: /Monitoring/ }).click(),
  ]);
  await page.getByRole('button', { name: 'Tambah titik monitoring' }).click();
  const dialog = page.getByRole('dialog', { name: 'Tambah titik monitoring' });
  await dialog.getByLabel('Pilih Site').selectOption({ index: 1 });
  await dialog.getByLabel('Nama titik monitoring').fill(pointName);
  await dialog.getByRole('button', { name: 'Simpan titik monitoring' }).click();
  await expect(page.getByText('Titik monitoring berhasil ditambahkan.')).toBeVisible();
}

async function acknowledgeAndCloseCredential(
  dialog: import('@playwright/test').Locator,
): Promise<void> {
  await dialog.getByLabel('Saya telah menyimpan secret melalui mekanisme yang aman.').check();
  await dialog.getByRole('button', { name: 'Tutup dan hapus dari layar' }).click();
  await expect(dialog).toHaveCount(0);
}

async function bodyContains(
  page: import('@playwright/test').Page,
  value: string,
): Promise<boolean> {
  return page.evaluate((sensitiveValue) => document.body.innerText.includes(sensitiveValue), value);
}

async function loginAsProjectOwner(page: import('@playwright/test').Page): Promise<void> {
  const email = requiredCredential('E2E_PROJECT_OWNER_EMAIL');
  const password = requiredCredential('E2E_PROJECT_OWNER_PASSWORD');
  await page.goto('/login');
  await page.getByLabel('Alamat email').fill(email);
  await page.getByRole('textbox', { name: 'Kata sandi', exact: true }).fill(password);
  await page.getByRole('button', { name: 'Masuk ke SiagaLongsor' }).click();
  await expect(page).toHaveURL(/\/overview$/);
}

function requiredCredential(
  name: 'E2E_PROJECT_OWNER_EMAIL' | 'E2E_PROJECT_OWNER_PASSWORD',
): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} wajib tersedia untuk smoke test Device.`);
  }
  return value;
}

async function expectNoSensitiveBrowserStorage(page: import('@playwright/test').Page) {
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
