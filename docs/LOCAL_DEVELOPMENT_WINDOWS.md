# Menjalankan SiagaLongsor di Windows (Docker Desktop)

Panduan ini menjalankan aplikasi untuk pengembangan lokal. Proyek ini adalah monorepo TypeScript:

- `apps/api`: API NestJS di `http://localhost:3001/api/v1`.
- `apps/web`: dashboard Next.js di `http://localhost:3000`.
- Docker Desktop: hanya menjalankan PostgreSQL untuk development.

Jadi Docker saja belum cukup: Node.js 24 dan pnpm (melalui Corepack) juga diperlukan untuk API dan dashboard.

## 1. Prasyarat

1. Instal dan buka **Docker Desktop**. Pada Windows, pilih backend WSL 2 saat proses instalasi bila diminta. Tunggu sampai status Docker Desktop menunjukkan *Engine running*.
2. Instal **Node.js 24.x** (bukan Node 20 atau versi lain). Proyek menetapkan rentang yang valid: `>=24.0.0 <25`.
3. Buka PowerShell baru, lalu masuk ke folder proyek:

   ```powershell
   cd D:\pakrismi\SiagaLongsor
   ```

4. Pastikan alatnya terbaca:

   ```powershell
   docker --version
   docker compose version
   node --version
   corepack --version
   ```

   `node --version` harus diawali `v24`. Jika `docker` tidak dikenali, Docker Desktop belum selesai dipasang, belum dibuka, atau terminal perlu ditutup lalu dibuka kembali agar PATH diperbarui.

## 2. Menyiapkan konfigurasi lokal

Salin template konfigurasi. File hasil salinan bersifat lokal dan tidak akan masuk Git.

```powershell
Copy-Item .env.example .env
Copy-Item apps\web\.env.example apps\web\.env.local
```

Buka `.env` dengan editor, lalu ganti semua nilai placeholder berikut dengan nilai Anda sendiri:

- `POSTGRES_PASSWORD`
- bagian password pada `DATABASE_URL` — harus **sama persis** dengan `POSTGRES_PASSWORD`
- `AUTH_ACCESS_TOKEN_SECRET` — minimal 32 karakter acak
- `SEED_PROJECT_OWNER_PASSWORD` — minimal 12 karakter
- `SEED_SCHOOL_ADMIN_PASSWORD` — minimal 12 karakter dan berbeda dari password owner

Untuk membuat satu nilai acak di PowerShell, jalankan perintah berikut lalu salin hasilnya ke field yang diperlukan:

```powershell
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$bytes = New-Object byte[] 48
$rng.GetBytes($bytes)
[Convert]::ToBase64String($bytes)
```

Gunakan alamat email pada `SEED_PROJECT_OWNER_EMAIL` dan password owner yang Anda buat sebagai akun login awal. `SEED_SCHOOL_ADMIN_EMAIL` dan password-nya menyediakan akun kedua.

Konfigurasi frontend sudah benar untuk development dan tidak perlu diubah:

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/api/v1
```

> Jangan masukkan `DATABASE_URL`, secret JWT, atau password ke `apps/web/.env.local`; file frontend hanya boleh berisi variabel `NEXT_PUBLIC_*` yang aman dilihat browser.

## 3. Instal dependency JavaScript

Di folder root proyek, aktifkan Corepack dan instal dependency sesuai lockfile:

```powershell
corepack enable
corepack pnpm install
```

Jika `corepack enable` ditolak karena hak akses, lanjutkan dengan bentuk perintah berikut; tidak perlu menginstal pnpm secara global:

```powershell
corepack pnpm install
```

## 4. Menjalankan database dengan Docker

Jalankan container yang didefinisikan oleh `compose.yaml`:

```powershell
docker compose up -d postgres
docker compose ps
```

Tunggu sampai status PostgreSQL menunjukkan `healthy`. Untuk melihat proses boot atau pesan kegagalan:

```powershell
docker compose logs --follow postgres
```

Gunakan `Ctrl+C` untuk berhenti mengikuti log; container tetap berjalan.

Port default yang dipakai:

| Komponen | Port di komputer | Catatan |
| --- | ---: | --- |
| PostgreSQL | `55432` | Port internal container tetap `5432`. |
| API | `3001` | Dijalankan oleh Node, bukan Docker. |
| Web | `3000` | Dijalankan oleh Node, bukan Docker. |

## 5. Membuat struktur database dan data akun awal

Setelah PostgreSQL sehat, jalankan tiga perintah ini dari root proyek:

```powershell
corepack pnpm prisma:generate
corepack pnpm prisma:migrate:deploy
corepack pnpm prisma:seed
```

`prisma:migrate:deploy` membuat tabel berdasarkan migration yang tersimpan di repository. `prisma:seed` membuat organisasi, lokasi development, profil risiko awal, serta dua akun dari nilai `SEED_*` di `.env`. Seed aman dijalankan kembali; data yang sesuai akan diperbarui, bukan diduplikasi.

## 6. Menjalankan API dan dashboard

Gunakan **dua terminal PowerShell** dan pastikan keduanya berada di `D:\pakrismi\SiagaLongsor`.

Terminal 1 — API:

```powershell
corepack pnpm --filter @siagalongsor/api dev
```

Terminal 2 — web:

```powershell
corepack pnpm --filter @siagalongsor/web dev
```

Setelah keduanya siap, verifikasi API:

```powershell
Invoke-RestMethod http://localhost:3001/api/v1/health
```

Hasil yang diharapkan berisi `status: ok` dan `database: up`. Kemudian buka:

<http://localhost:3000/login>

Masuk menggunakan `SEED_PROJECT_OWNER_EMAIL` dan `SEED_PROJECT_OWNER_PASSWORD` dari `.env`.

## 7. Perintah berhenti dan menjalankan kembali

Hentikan server API dan web dengan `Ctrl+C` pada masing-masing terminal. Untuk menghentikan container sambil mempertahankan data database:

```powershell
docker compose down
```

Untuk menjalankannya lagi di lain waktu, cukup jalankan kembali langkah 4, lalu langkah 6. Migration dan seed hanya perlu diulang bila ada migration baru atau Anda ingin menerapkan perubahan pada data seed.

## Troubleshooting

### `docker` tidak dikenali atau Docker tidak bisa terhubung

- Pastikan Docker Desktop benar-benar sudah terinstal dan sedang terbuka hingga engine berjalan.
- Tutup seluruh PowerShell, buka lagi, lalu ulangi `docker --version`.
- Bila Docker Desktop meminta WSL 2 update, selesaikan proses itu lalu restart Docker Desktop.
- Bila Docker Desktop dipasang khusus untuk user Windows, CLI dapat berada di `C:\Users\<nama-user>\AppData\Local\Programs\DockerDesktop\resources\bin`, bukan di `C:\Program Files`. Tambahkan folder tersebut ke PATH sesi PowerShell saat ini bila `docker.exe` ada di sana:

  ```powershell
  $env:Path += ';C:\Users\<nama-user>\AppData\Local\Programs\DockerDesktop\resources\bin'
  docker version
  ```

### Node masih v20 / perintah Node tidak sesuai

Proyek ini tidak mendukung Node 20. Instal Node 24.x, tutup-buka PowerShell, lalu pastikan `node --version` menampilkan `v24...` sebelum menjalankan `pnpm install`. Setelah mengganti versi Node, hapus dependency lokal hanya bila instalasi sebelumnya rusak, lalu instal ulang.

Jika instalasi Node dari `winget` berakhir dengan kode `1603`, buka log yang dicantumkan Winget dan cari `OutOfDiskSpace`. Node biasanya dipasang ke `C:\Program Files\nodejs`, sehingga ruang pada drive sistem `C:` harus tersedia meskipun source code berada di `D:`. Kosongkan sedikitnya 5 GB pada `C:` sebelum mengulang instalasi. Untuk Node, dependency proyek, image Docker, dan volume database, siapkan pula ruang kosong yang memadai (disarankan total minimal 10 GB pada drive yang dipakai Docker), lalu jalankan lagi:

```powershell
winget install --id OpenJS.NodeJS.LTS --exact
```

Setelah instalasi berhasil, tutup-buka PowerShell sebelum memeriksa `node --version`.

### PostgreSQL gagal start atau API tidak dapat menyambung database

- Periksa `POSTGRES_PASSWORD` dan password dalam `DATABASE_URL`; keduanya harus sama.
- Pastikan `POSTGRES_PORT=55432` dan URL database memakai `localhost:55432`.
- Lihat error container dengan `docker compose logs postgres`.
- Jika password di `.env` diubah **setelah** PostgreSQL pertama kali dibuat, volume Docker masih menyimpan password lama. Bila data development boleh dihapus, reset dengan perintah berikut:

  ```powershell
  docker compose down -v
  docker compose up -d postgres
  ```

  Perintah `down -v` menghapus seluruh data PostgreSQL lokal proyek ini. Setelah itu ulangi langkah 5.

### Port sudah dipakai

Periksa proses yang menggunakan port:

```powershell
Get-NetTCPConnection -LocalPort 3000,3001,55432 -ErrorAction SilentlyContinue
```

Hentikan proses yang bentrok, atau ubah port terkait secara konsisten. Jika mengubah `POSTGRES_PORT`, ubah juga port pada `DATABASE_URL`. Jika mengubah `API_PORT` atau port web, sesuaikan `WEB_URL` dan `NEXT_PUBLIC_API_BASE_URL` agar CORS dan browser tetap menuju alamat yang benar.

### Upload SOP/laporan gagal

Penyimpanan objek (S3/MinIO) bukan kebutuhan untuk membuka dashboard inti. `compose.yaml` saat ini tidak menyalakan MinIO. Fitur SOP/laporan lama yang membutuhkan object storage tidak akan berfungsi sampai layanan S3-compatible dan bucket dikonfigurasi. Jangan menganggap placeholder `OBJECT_STORAGE_*` pada `.env` sebagai layanan yang sudah aktif.

## Pemeriksaan kualitas (opsional)

Setelah aplikasi berjalan, Anda dapat mengecek kode dengan:

```powershell
corepack pnpm lint
corepack pnpm format:check
corepack pnpm typecheck
corepack pnpm test
```

Tes integrasi dan browser/E2E membutuhkan persiapan tambahan; panduan ini berfokus pada menjalankan aplikasi development lokal terlebih dahulu.
