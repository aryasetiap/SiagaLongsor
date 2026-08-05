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
  await expect(page.locator('#overview-range')).toHaveValue('24');
  await expect(page.getByRole('option', { name: '72 jam' })).toHaveCount(1);
  await expect(page.getByRole('option', { name: '7 hari' })).toHaveCount(1);

  await page.goto('/devices');
  await expect(page.getByRole('heading', { name: 'Perangkat', exact: true })).toBeVisible();
  await expect(page.getByText('Konektivitas', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Daftarkan perangkat|Rotasi credential|Nonaktifkan/i }),
  ).toHaveCount(0);

  await page.goto('/settings/risk-profile');
  await expect(page.getByRole('heading', { name: 'Profil Risiko', exact: true })).toBeVisible();
  await expect(
    page.getByText(/Profil risiko|Data tidak dapat dimuat|Profil risiko tidak dapat dimuat/),
  ).toBeVisible();

  await page.goto('/settings/audit-log');
  await expect(page.getByRole('heading', { name: 'Audit Log', exact: true })).toBeVisible();
  await expect(
    page.getByText(/Belum ada perubahan status risiko|Audit tidak dapat dimuat/),
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
