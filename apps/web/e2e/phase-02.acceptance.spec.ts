import { expect, test, type Page } from '@playwright/test';

test.use({ screenshot: 'off', trace: 'off', video: 'off' });

test('retained Phase 02 MonitoringPoint route works directly while R3 Perangkat remains diagnostics-only', async ({
  page,
}) => {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const pointName = `Acceptance Point ${unique}`;
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));

  await loginAsProjectOwner(page);
  await page.goto('/monitoring-points');
  await expect(page.getByRole('heading', { name: 'Titik monitoring', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Tambah titik monitoring' }).click();
  const createDialog = page.getByRole('dialog', { name: 'Tambah titik monitoring' });
  await createDialog.getByLabel('Pilih Site').selectOption({ index: 1 });
  await createDialog.getByLabel('Nama titik monitoring').fill(pointName);
  await createDialog.getByRole('button', { name: 'Simpan titik monitoring' }).click();
  await expect(page.getByRole('row').filter({ hasText: pointName })).toBeVisible();

  const row = page.getByRole('row').filter({ hasText: pointName });
  await row.getByRole('button', { name: `Lihat detail ${pointName}` }).click();
  const detail = page.getByRole('dialog', { name: pointName });
  await detail.getByRole('button', { name: 'Nonaktifkan' }).click();
  await page
    .getByRole('alertdialog', { name: 'Nonaktifkan titik monitoring?' })
    .getByRole('button', { name: 'Ya, nonaktifkan' })
    .click();
  await expect(page.getByRole('row').filter({ hasText: pointName })).toContainText('Nonaktif');

  await page.goto('/devices');
  await expect(page.getByRole('heading', { name: 'Perangkat', exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Daftarkan perangkat|Rotasi credential|Nonaktifkan/i }),
  ).toHaveCount(0);
  await expectNoSensitiveBrowserStorage(page);
  expect(pageErrors).toEqual([]);
  await logout(page);
});

async function loginAsProjectOwner(page: Page): Promise<void> {
  await page.goto('/login');
  await page
    .getByLabel('Alamat email')
    .fill(requiredCredential('E2E_PROJECT_OWNER_EMAIL', 'SEED_PROJECT_OWNER_EMAIL'));
  await page
    .getByRole('textbox', { name: 'Kata sandi', exact: true })
    .fill(requiredCredential('E2E_PROJECT_OWNER_PASSWORD', 'SEED_PROJECT_OWNER_PASSWORD'));
  await page.getByRole('button', { name: 'Masuk ke SiagaLongsor' }).click();
  await expect(page).toHaveURL(/\/overview$/);
}
function requiredCredential(
  name: 'E2E_PROJECT_OWNER_EMAIL' | 'E2E_PROJECT_OWNER_PASSWORD',
  fallback: 'SEED_PROJECT_OWNER_EMAIL' | 'SEED_PROJECT_OWNER_PASSWORD',
): string {
  const value = process.env[name]?.trim() || process.env[fallback]?.trim();
  if (!value) throw new Error(`${name} atau ${fallback} wajib tersedia.`);
  return value;
}
async function expectNoSensitiveBrowserStorage(page: Page): Promise<void> {
  const values = await page.evaluate(() => [
    ...Object.entries(localStorage),
    ...Object.entries(sessionStorage),
  ]);
  expect(
    values.some(
      ([key, value]) =>
        /(?:access|refresh)[_-]?token|credential|secret/i.test(`${key}${value}`) ||
        /^Bearer\s+/i.test(value),
    ),
  ).toBe(false);
}
async function logout(page: Page): Promise<void> {
  await page.locator('summary').click();
  await page.getByRole('button', { name: 'Keluar' }).click();
  await expect(page).toHaveURL(/\/login$/);
}
