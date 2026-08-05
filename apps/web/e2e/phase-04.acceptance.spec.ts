import { expect, test, type Page } from '@playwright/test';

test.use({ screenshot: 'off', trace: 'off', video: 'off' });

test('R3 Overview menunjukkan status otoritatif dan kontrol histori tanpa selector Site', async ({
  page,
}) => {
  await loginProjectOwner(page);
  await page.goto('/overview');
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  await expect(
    page.getByText('Status risiko', { exact: true }).or(page.getByRole('alert')),
  ).toBeVisible();
  await expect(page.getByLabel('Rentang histori')).toHaveValue('24');
  await page.getByLabel('Rentang histori').selectOption('72');
  await expect(page.getByLabel('Rentang histori')).toHaveValue('72');
  await page.getByLabel('Rentang histori').selectOption('168');
  await expect(page.getByLabel('Rentang histori')).toHaveValue('168');
  await expect(page.getByRole('button', { name: 'Muat ulang' })).toBeVisible();
  await expect(
    page.getByText(/Pilih Site|Segarkan seluruh dashboard|Monitoring Overview/i),
  ).toHaveCount(0);
  await expect(page.getByTestId('realtime-indicator')).toHaveCount(0);
});

test('SCHOOL_ADMIN menerima pesan akses R3 yang jelas', async ({ page }) => {
  await login(page, 'E2E_SCHOOL_ADMIN_EMAIL', 'E2E_SCHOOL_ADMIN_PASSWORD');
  await expect(page.getByText('Halaman ini memerlukan akses Project Owner.')).toBeVisible();
});

async function loginProjectOwner(page: Page) {
  await login(page, 'E2E_PROJECT_OWNER_EMAIL', 'E2E_PROJECT_OWNER_PASSWORD');
}
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
