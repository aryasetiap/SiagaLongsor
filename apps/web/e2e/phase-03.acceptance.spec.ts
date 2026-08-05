import { expect, test, type Page } from '@playwright/test';

test.use({ screenshot: 'off', trace: 'off', video: 'off' });

test('retained Alerts route is reachable directly and is not primary navigation', async ({
  page,
}) => {
  await login(page, 'E2E_PROJECT_OWNER_EMAIL', 'E2E_PROJECT_OWNER_PASSWORD');
  await expect(page.getByRole('link', { name: /Peringatan/ })).toHaveCount(0);
  await page.goto('/alerts');
  await expect(page.getByRole('heading', { name: 'Peringatan', level: 1 })).toBeVisible();
});

test('SCHOOL_ADMIN retains legacy Alerts access but is denied R3 profile access', async ({
  page,
}) => {
  await login(page, 'E2E_SCHOOL_ADMIN_EMAIL', 'E2E_SCHOOL_ADMIN_PASSWORD');
  await page.goto('/alerts');
  await expect(page.getByRole('heading', { name: 'Peringatan', level: 1 })).toBeVisible();
  await page.goto('/settings/risk-profile');
  await expect(page.getByText('Halaman ini memerlukan akses Project Owner.')).toBeVisible();
});

async function login(
  page: Page,
  emailName: 'E2E_PROJECT_OWNER_EMAIL' | 'E2E_SCHOOL_ADMIN_EMAIL',
  passwordName: 'E2E_PROJECT_OWNER_PASSWORD' | 'E2E_SCHOOL_ADMIN_PASSWORD',
) {
  await page.goto('/login');
  await page.getByLabel('Alamat email').fill(requiredCredential(emailName));
  await page
    .getByRole('textbox', { name: 'Kata sandi', exact: true })
    .fill(requiredCredential(passwordName));
  await page.getByRole('button', { name: 'Masuk ke SiagaLongsor' }).click();
  await expect(page).toHaveURL(/\/overview$/);
}
function requiredCredential(
  name:
    | 'E2E_PROJECT_OWNER_EMAIL'
    | 'E2E_PROJECT_OWNER_PASSWORD'
    | 'E2E_SCHOOL_ADMIN_EMAIL'
    | 'E2E_SCHOOL_ADMIN_PASSWORD',
) {
  const fallback = name.replace(/^E2E_/, 'SEED_') as
    | 'SEED_PROJECT_OWNER_EMAIL'
    | 'SEED_PROJECT_OWNER_PASSWORD'
    | 'SEED_SCHOOL_ADMIN_EMAIL'
    | 'SEED_SCHOOL_ADMIN_PASSWORD';
  const value = process.env[name]?.trim() || process.env[fallback]?.trim();
  if (!value) throw new Error(`${name} atau ${fallback} wajib tersedia.`);
  return value;
}
