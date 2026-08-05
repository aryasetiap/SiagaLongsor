import { expect, test, type Page } from '@playwright/test';

test.use({ screenshot: 'off', trace: 'off', video: 'off' });

test('retained Alert route has no R3 realtime shell requirement', async ({ page }) => {
  await login(page);
  await expect(page.getByTestId('realtime-indicator')).toHaveCount(0);
  await page.goto('/alerts');
  await expect(page.getByRole('heading', { name: 'Peringatan', level: 1 })).toBeVisible();
  await expect(page.getByTestId('realtime-indicator')).toHaveCount(0);
});

test('R3 Audit Log presents transition history or its empty state', async ({ page }) => {
  await login(page);
  await page.goto('/settings/audit-log');
  await expect(page.getByRole('heading', { name: 'Audit Log', exact: true })).toBeVisible();
  await expect(
    page
      .getByText('Belum ada perubahan status risiko.')
      .or(page.locator('article'))
      .or(page.getByRole('alert')),
  ).toBeVisible();
  await expect(page.getByLabel('Jenis entitas')).toHaveCount(0);
});

async function login(page: Page) {
  const email = requiredCredential('E2E_PROJECT_OWNER_EMAIL');
  const password = requiredCredential('E2E_PROJECT_OWNER_PASSWORD');
  await page.goto('/login');
  await page.getByLabel('Alamat email').fill(email);
  await page.getByRole('textbox', { name: 'Kata sandi', exact: true }).fill(password);
  await page.getByRole('button', { name: 'Masuk ke SiagaLongsor' }).click();
  await expect(page).toHaveURL(/\/overview$/);
}
function requiredCredential(name: 'E2E_PROJECT_OWNER_EMAIL' | 'E2E_PROJECT_OWNER_PASSWORD') {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} wajib tersedia.`);
  return value;
}
