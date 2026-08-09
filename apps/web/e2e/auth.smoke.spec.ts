import { expect, test } from '@playwright/test';

test.describe('smoke autentikasi SiagaLongsor', () => {
  test('root membuka overview publik untuk pengguna tanpa sesi', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveURL(/\/overview$/);
    await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Navigasi publik' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Masuk administrator' })).toBeVisible();
  });

  test('form login tampil dan dapat digunakan dengan keyboard', async ({ page }) => {
    await page.goto('/login');
    const emailInput = page.getByLabel('Alamat email');
    const passwordInput = page.getByRole('textbox', { name: 'Kata sandi', exact: true });

    await emailInput.focus();
    await page.keyboard.type('format-email-tidak-valid');
    await page.keyboard.press('Tab');
    await expect(passwordInput).toBeFocused();
    await page.keyboard.type('kata-sandi-uji');
    await page.keyboard.press('Enter');

    await expect(page.getByText('Masukkan format email yang valid.')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('halaman administrator mengarahkan pengguna tanpa sesi ke login', async ({ page }) => {
    await page.goto('/devices');

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('button', { name: 'Masuk ke SiagaLongsor' })).toBeEnabled();
  });

  test('invalid login menampilkan pesan aman', async ({ page }) => {
    const email = requiredCredential('E2E_PROJECT_OWNER_EMAIL');
    await page.goto('/login');
    await page.getByLabel('Alamat email').fill(email);
    await page
      .getByRole('textbox', { name: 'Kata sandi', exact: true })
      .fill('SENGAJA-SALAH-BUKAN-CREDENTIAL');

    const loginResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().endsWith('/api/v1/auth/login'),
    );
    await page.getByRole('button', { name: 'Masuk ke SiagaLongsor' }).click();

    const loginResponse = await loginResponsePromise;
    expect(loginResponse.status()).toBe(401);
    await expect(page.locator('form [role="alert"]')).toHaveText(
      'Email atau kata sandi tidak valid.',
    );
  });

  test('valid login, session reload, shell, storage, dan logout bekerja', async ({ page }) => {
    const email = requiredCredential('E2E_PROJECT_OWNER_EMAIL');
    const password = requiredCredential('E2E_PROJECT_OWNER_PASSWORD');
    const browserErrors: Error[] = [];
    page.on('pageerror', (error) => browserErrors.push(error));

    await page.goto('/login');
    await page.getByLabel('Alamat email').fill(email);
    await page.getByRole('textbox', { name: 'Kata sandi', exact: true }).fill(password);
    await page.getByRole('button', { name: 'Masuk ke SiagaLongsor' }).click();

    await expect(page).toHaveURL(/\/overview$/);
    await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Navigasi utama' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Overview/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Perangkat/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Profil Risiko/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Audit Log/ })).toBeVisible();
    await expect(
      page.getByRole('link', { name: /Monitoring|Peringatan|Peta|Laporan/ }),
    ).toHaveCount(0);
    await expect(page.getByText('Sesi aktif dan terverifikasi')).toBeAttached();
    await expectNoTokensInBrowserStorage(page);

    await page.reload();
    await expect(page).toHaveURL(/\/overview$/);
    await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
    await expectNoTokensInBrowserStorage(page);

    await page.locator('summary').click();
    await page.getByRole('button', { name: 'Keluar' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('button', { name: 'Masuk ke SiagaLongsor' })).toBeEnabled();
    expect(browserErrors).toEqual([]);
  });
});

function requiredCredential(
  name: 'E2E_PROJECT_OWNER_EMAIL' | 'E2E_PROJECT_OWNER_PASSWORD',
): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} wajib tersedia untuk smoke test autentikasi.`);
  }
  return value;
}

async function expectNoTokensInBrowserStorage(page: import('@playwright/test').Page) {
  const containsToken = await page.evaluate(() => {
    const entries = [
      ...Object.entries(window.localStorage),
      ...Object.entries(window.sessionStorage),
    ];
    const tokenName = /(?:access|refresh)[_-]?token/i;
    const bearerValue = /^Bearer\s+/i;
    const jwtValue = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

    return entries.some(
      ([key, value]) => tokenName.test(key) || bearerValue.test(value) || jwtValue.test(value),
    );
  });

  expect(containsToken).toBe(false);
}
