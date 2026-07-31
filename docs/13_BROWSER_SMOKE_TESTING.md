# Browser smoke testing

Smoke test frontend menggunakan Playwright dan Chromium untuk memverifikasi alur autentikasi
terhadap API, PostgreSQL, dan Redis yang nyata. Test tidak menyediakan mock mode atau credential
fallback.

## Persiapan lokal

1. Siapkan root `.env` dan `apps/web/.env.local` seperti petunjuk development repository.
2. Jalankan PostgreSQL dan Redis, lalu terapkan migration dan seed.
3. Pasang browser Chromium sekali:

   ```bash
   corepack pnpm --filter @siagalongsor/web exec playwright install chromium
   ```

4. Inject credential development seed melalui shell tanpa memasukkannya ke source:

   ```text
   E2E_PROJECT_OWNER_EMAIL
   E2E_PROJECT_OWNER_PASSWORD
   ```

5. Jalankan:

   ```bash
   corepack pnpm --filter @siagalongsor/web test:e2e
   ```

Playwright menjalankan API dan Next.js secara otomatis. Server yang sudah berjalan dapat digunakan
kembali pada development. URL dapat disesuaikan melalui `E2E_BASE_URL` dan `E2E_API_BASE_URL`.
Credential tidak boleh ditulis ke command history, committed environment file, test source, atau
laporan Playwright.

Di CI, credential E2E memakai password seed ephemeral per run. Trace dan screenshot hanya disimpan
ketika test gagal.
