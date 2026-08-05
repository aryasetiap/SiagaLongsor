import { expect, test } from '@playwright/test';

test('PROJECT_OWNER dapat membuat, mengedit, dan menonaktifkan titik monitoring', async ({
  page,
}) => {
  const browserErrors: Error[] = [];
  page.on('pageerror', (error) => browserErrors.push(error));
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const name = `Smoke Monitoring ${unique}`;
  const updatedLocation = `Lokasi smoke diperbarui ${unique}`;

  await loginAsProjectOwner(page);
  await page.goto('/monitoring-points');
  await expect(page.getByRole('heading', { name: 'Titik monitoring', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Tambah titik monitoring' }).click();
  const createDialog = page.getByRole('dialog', { name: 'Tambah titik monitoring' });
  await expect(createDialog.getByLabel('Pilih Site')).toBeVisible();
  await createDialog.getByLabel('Pilih Site').selectOption({ index: 1 });
  await createDialog.getByLabel('Nama titik monitoring').fill(name);
  await createDialog.getByLabel('Deskripsi lokasi (opsional)').fill(`Lokasi smoke ${unique}`);
  await createDialog.getByRole('button', { name: 'Simpan titik monitoring' }).click();

  await expect(page.getByText('Titik monitoring berhasil ditambahkan.')).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: name });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: `Lihat detail ${name}` }).click();

  const detailDialog = page.getByRole('dialog', { name });
  await expect(detailDialog).toBeVisible();
  await detailDialog.getByRole('button', { name: 'Edit' }).click();
  await detailDialog.getByLabel('Deskripsi lokasi (opsional)').fill(updatedLocation);
  await detailDialog.getByRole('button', { name: 'Simpan perubahan' }).click();

  await expect(page.getByText('Data titik monitoring tersimpan.')).toBeVisible();
  const updatedRow = page.getByRole('row').filter({ hasText: name });
  await expect(updatedRow).toContainText(updatedLocation);
  await updatedRow.getByRole('button', { name: `Lihat detail ${name}` }).click();
  await page.getByRole('dialog', { name }).getByRole('button', { name: 'Nonaktifkan' }).click();

  const confirmation = page.getByRole('alertdialog', {
    name: 'Nonaktifkan titik monitoring?',
  });
  await confirmation.getByRole('button', { name: 'Ya, nonaktifkan' }).click();
  await expect(page.getByText('Data titik monitoring tersimpan.')).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: name })).toContainText('Nonaktif');
  expect(browserErrors).toEqual([]);
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
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} wajib tersedia untuk smoke test MonitoringPoint.`);
  }
  return value;
}
