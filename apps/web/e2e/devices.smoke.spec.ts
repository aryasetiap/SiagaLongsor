import { expect, test } from '@playwright/test';

test.use({ screenshot: 'off', trace: 'off' });

test('PROJECT_OWNER melihat Perangkat sebagai diagnostik tanpa kontrol lifecycle', async ({
  page,
}) => {
  await loginAsProjectOwner(page);
  await page.goto('/devices');

  await expect(page.getByRole('heading', { name: 'Perangkat', exact: true })).toBeVisible();
  await expect(
    page.getByText('Konektivitas', { exact: true }).or(page.locator('.error-banner')),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Daftarkan perangkat|Rotasi credential|Nonaktifkan/i }),
  ).toHaveCount(0);
  await expect(page.getByText(/Pilih Site|Pilih titik monitoring/i)).toHaveCount(0);
});

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
  if (value === undefined || value.length === 0) throw new Error(`${name} wajib tersedia.`);
  return value;
}
