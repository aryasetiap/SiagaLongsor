import { expect, test } from '@playwright/test';

test.describe('smoke autentikasi Teknila Siaga Longsor', () => {
  test('root membuka overview publik untuk pengguna tanpa sesi', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveURL(/\/overview$/);
    await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Navigasi publik' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Masuk administrator' })).toBeVisible();
  });

  test('form login tampil dan dapat digunakan dengan keyboard', async ({ page }) => {
    await page.goto('/login');
    const visibleBrandLockup = page.locator('.login-brand-lockup:visible');
    await expect(visibleBrandLockup.getByLabel('Teknila Siaga Longsor')).toBeVisible();
    await expect(
      visibleBrandLockup.getByText('Universitas Lampung', { exact: true }),
    ).toBeVisible();
    await expect(visibleBrandLockup.getByText('Fakultas Teknik', { exact: true })).toBeVisible();
    await expect(
      page.getByText(
        'Masuk menggunakan akun terdaftar untuk mengakses dashboard Teknila Siaga Longsor.',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByText('Masuk untuk mengakses dashboard Teknila Siaga Longsor.', { exact: true }),
    ).toBeHidden();
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

  test('overview publik dan login tidak overflow pada viewport mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/overview');

    await expect(page.getByRole('navigation', { name: 'Navigasi publik' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Masuk administrator' })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);

    await page.goto('/login');
    const loginButton = page.getByRole('button', { name: 'Masuk ke Dashboard' });
    await expect(loginButton).toBeVisible();
    const loginButtonBox = await loginButton.boundingBox();
    expect(loginButtonBox).not.toBeNull();
    expect((loginButtonBox?.y ?? Infinity) + (loginButtonBox?.height ?? 0)).toBeLessThanOrEqual(
      844,
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });

  test('co-brand login mobile satu baris dan terpusat', async ({ page }) => {
    for (const viewport of [
      { width: 360, height: 800 },
      { width: 375, height: 812 },
      { width: 390, height: 844 },
      { width: 430, height: 932 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/login');

      await expect(
        page.getByText('Masuk untuk mengakses dashboard Teknila Siaga Longsor.', { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText('Akses hanya untuk pengguna terdaftar.', { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText(
          'Sistem ini mendukung pemantauan dan tidak menggantikan verifikasi lapangan.',
          { exact: true },
        ),
      ).toBeVisible();

      const row = page.locator('.login-brand-lockup');
      const teknila = row.locator('.brand-mark');
      const divider = row.locator('.login-brand-divider');
      const affiliation = row.locator('.institutional-affiliation');
      const hero = page.locator('.login-brand-panel');
      const main = page.locator('.login-form-panel');
      const card = page.locator('.login-card-surface');
      const emailInput = page.getByLabel('Alamat email');
      const loginButton = page.getByRole('button', { name: 'Masuk ke Dashboard' });
      const [
        rowBox,
        teknilaBox,
        dividerBox,
        affiliationBox,
        heroBox,
        mainBox,
        cardBox,
        emailBox,
        buttonBox,
      ] = await Promise.all([
        row.boundingBox(),
        teknila.boundingBox(),
        divider.boundingBox(),
        affiliation.boundingBox(),
        hero.boundingBox(),
        main.boundingBox(),
        card.boundingBox(),
        emailInput.boundingBox(),
        loginButton.boundingBox(),
      ]);

      expect(rowBox).not.toBeNull();
      expect(teknilaBox).not.toBeNull();
      expect(dividerBox).not.toBeNull();
      expect(affiliationBox).not.toBeNull();
      expect(heroBox).not.toBeNull();
      await expect(hero).toHaveCSS('border-bottom-left-radius', '32px');
      expect(await hero.evaluate((element) => getComputedStyle(element, '::after').content)).toBe(
        'none',
      );
      expect(mainBox).not.toBeNull();
      expect(cardBox).not.toBeNull();
      expect(emailBox).not.toBeNull();
      expect(buttonBox).not.toBeNull();
      expect(heroBox?.height ?? 0).toBeGreaterThanOrEqual(120);
      expect(heroBox?.height ?? Infinity).toBeLessThanOrEqual(150);
      expect(
        Math.abs((rowBox?.x ?? 0) + (rowBox?.width ?? 0) / 2 - viewport.width / 2),
      ).toBeLessThanOrEqual(1);
      expect((teknilaBox?.x ?? 0) + (teknilaBox?.width ?? 0)).toBeLessThan(dividerBox?.x ?? 0);
      expect((dividerBox?.x ?? 0) + (dividerBox?.width ?? 0)).toBeLessThan(affiliationBox?.x ?? 0);
      expect(
        Math.abs(
          (teknilaBox?.y ?? 0) +
            (teknilaBox?.height ?? 0) / 2 -
            ((affiliationBox?.y ?? 0) + (affiliationBox?.height ?? 0) / 2),
        ),
      ).toBeLessThanOrEqual(1);
      expect((rowBox?.x ?? 0) + (rowBox?.width ?? Infinity)).toBeLessThanOrEqual(
        viewport.width - 16,
      );
      expect((rowBox?.y ?? Infinity) + (rowBox?.height ?? 0)).toBeLessThanOrEqual(mainBox?.y ?? 0);
      expect(cardBox?.y ?? 0).toBeGreaterThanOrEqual((heroBox?.y ?? 0) + (heroBox?.height ?? 0));
      expect(
        Math.abs(
          (cardBox?.y ?? 0) -
            (mainBox?.y ?? 0) -
            ((mainBox?.y ?? 0) +
              (mainBox?.height ?? 0) -
              (cardBox?.y ?? 0) -
              (cardBox?.height ?? 0)),
        ),
      ).toBeLessThanOrEqual(1);
      expect(cardBox?.height ?? 0).toBeGreaterThan(heroBox?.height ?? Infinity);
      expect(cardBox?.width ?? Infinity).toBeLessThanOrEqual(370);
      expect(cardBox?.x ?? 0).toBeGreaterThanOrEqual(16);
      expect(
        Math.abs((cardBox?.x ?? 0) + (cardBox?.width ?? 0) / 2 - viewport.width / 2),
      ).toBeLessThanOrEqual(1);
      expect(emailBox?.height ?? 0).toBeGreaterThanOrEqual(48);
      expect(emailBox?.height ?? Infinity).toBeLessThanOrEqual(50);
      expect(buttonBox?.height ?? 0).toBeGreaterThanOrEqual(50);
      expect(buttonBox?.height ?? Infinity).toBeLessThanOrEqual(51);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    }
  });

  test('halaman administrator mengarahkan pengguna tanpa sesi ke login', async ({ page }) => {
    await page.goto('/devices');

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('button', { name: 'Masuk ke Dashboard' })).toBeEnabled();
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
    await page.getByRole('button', { name: 'Masuk ke Dashboard' }).click();

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
    await page.getByRole('button', { name: 'Masuk ke Dashboard' }).click();

    await expect(page).toHaveURL(/\/overview$/);
    await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Navigasi utama' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Overview/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Perangkat/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Profil Risiko/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Riwayat Status Risiko/ })).toBeVisible();
    await expect(
      page.getByRole('link', { name: /Monitoring|Peringatan|Peta|Laporan/ }),
    ).toHaveCount(0);
    await expectNoTokensInBrowserStorage(page);

    await page.reload();
    await expect(page).toHaveURL(/\/overview$/);
    await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
    await expectNoTokensInBrowserStorage(page);

    await page.getByRole('button', { name: /Menu akun/ }).click();
    const accountMenu = page.getByRole('menu', { name: /Menu akun/ });
    await expect(accountMenu.getByText('Sesi aktif dan terverifikasi')).toBeVisible();
    await accountMenu.getByRole('menuitem', { name: 'Keluar' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('button', { name: 'Masuk ke Dashboard' })).toBeEnabled();
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
