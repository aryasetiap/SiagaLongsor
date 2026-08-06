import { expect, test } from '@playwright/test';

test.use({ screenshot: 'off', trace: 'off' });

test('PROJECT_OWNER dapat membuka empat halaman produk single-device', async ({ page }) => {
  await loginAsProjectOwner(page);

  const navigation = page.getByRole('navigation', { name: 'Navigasi utama' });
  await expect(navigation.getByRole('link', { name: /Overview/ })).toBeVisible();
  await expect(navigation.getByRole('link', { name: /Perangkat/ })).toBeVisible();
  await expect(navigation.getByRole('link', { name: /Profil Risiko/ })).toBeVisible();
  await expect(navigation.getByRole('link', { name: /Audit Log/ })).toBeVisible();
  await expect(
    navigation.getByRole('link', { name: /Monitoring|Peringatan|Peta|SOP|Laporan/ }),
  ).toHaveCount(0);

  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  await expect(page.locator('#overview-range')).toHaveValue('1440');
  const range = page.locator('#overview-range');
  await expect(range.locator('option[value="5"]')).toHaveText('5 menit');
  await expect(range.locator('option[value="15"]')).toHaveText('15 menit');
  await expect(range.locator('option[value="60"]')).toHaveText('1 jam');
  await expect(range.locator('option[value="360"]')).toHaveText('6 jam');
  await expect(range.locator('option[value="4320"]')).toHaveText('72 jam');
  await expect(range.locator('option[value="10080"]')).toHaveText('7 hari');

  await page.goto('/devices');
  await expect(page.getByRole('heading', { name: 'Perangkat', exact: true })).toBeVisible();
  await expect(page.getByText('Konektivitas', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Daftarkan perangkat|Rotasi credential|Nonaktifkan/i }),
  ).toHaveCount(0);

  await page.goto('/settings/risk-profile');

  await expect(page.getByRole('heading', { name: 'Profil Risiko', exact: true })).toBeVisible();

  await expect(
    page.getByRole('alert').filter({
      hasText: 'Device deployment belum dikonfigurasi.',
    }),
  ).toBeVisible();

  await page.goto('/settings/audit-log');

  await expect(page.getByRole('heading', { name: 'Audit Log', exact: true })).toBeVisible();

  await expect(
    page.getByRole('alert').filter({
      hasText: 'Device deployment belum dikonfigurasi.',
    }),
  ).toBeVisible();
});

async function loginAsProjectOwner(page: import('@playwright/test').Page): Promise<void> {
  const email = requiredCredential('E2E_PROJECT_OWNER_EMAIL', 'SEED_PROJECT_OWNER_EMAIL');
  const password = requiredCredential('E2E_PROJECT_OWNER_PASSWORD', 'SEED_PROJECT_OWNER_PASSWORD');
  await page.goto('/login');
  await page.getByLabel('Alamat email').fill(email);
  await page.getByRole('textbox', { name: 'Kata sandi', exact: true }).fill(password);
  await page.getByRole('button', { name: 'Masuk ke SiagaLongsor' }).click();
  await expect(page).toHaveURL(/\/overview$/);
}

function requiredCredential(primary: string, fallback: string): string {
  const value = process.env[primary]?.trim() || process.env[fallback]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${primary} atau ${fallback} wajib tersedia.`);
  }
  return value;
}
