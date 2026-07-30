# SiagaLongsor

Monorepo website dan backend Sistem Deteksi Dini Tanah Longsor untuk implementasi awal di
**SMAN 17 Bandar Lampung**.

## Status implementasi

Checkpoint aktif: **Phase 01 Task 05**.

- Next.js menyediakan login, bootstrap session, dan protected application shell.
- NestJS API menyediakan health check, authentication, dan authorization guard.
- Schema Prisma aktif berada di `apps/api/prisma/schema.prisma`.
- PostgreSQL dan Redis development berada di `compose.yaml`.
- Authentication memakai access JWT singkat dan rotating refresh token dalam cookie `httpOnly`.
- RBAC backend mendukung `PROJECT_OWNER` dan `SCHOOL_ADMIN` dalam organization scope.
- Ingestion, risk engine, alert, SSE, dan dashboard operasional belum diimplementasikan.

## Menjalankan foundation

Prasyarat: Node.js 24, Corepack, dan Docker.

1. Buat environment backend dengan `cp .env.example .env`, kemudian ganti seluruh placeholder
   credential server lokal. NestJS, integration test, dan Prisma CLI memuat file root ini otomatis
   tanpa memerlukan `apps/api/.env`. Environment yang sudah diinjeksi shell/CI tetap memiliki
   prioritas.
2. Buat environment frontend dengan
   `cp apps/web/.env.example apps/web/.env.local`. File tersebut hanya boleh berisi konfigurasi
   publik yang aman tersedia dalam browser. Nilai development-nya adalah
   `NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/api/v1`.
3. Aktifkan package manager: `corepack enable`. Bila instalasi Node tidak mengizinkan pembuatan
   shim global, gunakan bentuk `corepack pnpm <command>`.
4. Install dependency: `corepack pnpm install`.
5. Jalankan dependensi: `docker compose up -d postgres redis`.
6. Generate Prisma Client: `corepack pnpm prisma:generate`.
7. Terapkan migration: `corepack pnpm prisma:migrate:deploy`.
8. Jalankan seed: `corepack pnpm prisma:seed`.
9. Jalankan API: `corepack pnpm --filter @siagalongsor/api dev`.
10. Jalankan web: `corepack pnpm --filter @siagalongsor/web dev`.
11. Verifikasi dengan `corepack pnpm lint`, `corepack pnpm format:check`,
    `corepack pnpm typecheck`, dan `corepack pnpm test`.

API tersedia pada `http://localhost:3001/api/v1`. Health check publik berada di
`GET /api/v1/health`. Endpoint authentication:

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`

Login dan refresh mengembalikan access token di response body. Refresh token hanya dikirim sebagai
cookie `httpOnly`, `SameSite=Lax`, dan menggunakan `Secure` ketika `NODE_ENV=production`.

Web membaca `NEXT_PUBLIC_API_BASE_URL` dari `apps/web/.env.local`. Next.js menyertakan variabel
`NEXT_PUBLIC_*` ke browser bundle pada saat development server atau production build dimulai;
restart Next.js setelah nilainya berubah. Jangan pernah menaruh database URL, JWT secret, seed
credential, token, atau credential lain dalam variabel frontend. Access token disimpan hanya dalam
memory aplikasi dan hilang saat halaman direload. Web kemudian mencoba memulihkan sesi melalui
refresh cookie `httpOnly`.

Seed membutuhkan email dan password dari environment. Tidak ada credential seed yang ditanam di
source code.

`AUTH_ACCESS_TOKEN_SECRET` wajib diisi nilai acak minimal 32 karakter. Credential seed hanya untuk
development/bootstrap dan tidak menjadi fallback authentication runtime.

PostgreSQL container tetap mendengarkan port `5432` di dalam jaringan Docker, tetapi dipublikasikan
ke host melalui port `55432` secara default. Pemisahan ini mencegah benturan dengan instalasi
PostgreSQL lokal yang umum memakai port host `5432`. Ubah `POSTGRES_PORT` dan `DATABASE_URL`
bersamaan bila port host perlu disesuaikan.

## Keputusan produk yang sudah dikunci

- Jumlah alat awal: **1 perangkat**, tetapi arsitektur wajib mendukung penambahan banyak perangkat dan banyak lokasi.
- Konektivitas lapangan: **Wi-Fi sebagai jalur utama dan modem seluler sebagai cadangan**.
- Operator aktif MVP:
  - **Project Owner**: tim pemilik/pengembang proyek.
  - **School Admin**: admin sekolah.
- Peringatan lokal pada perangkat harus tetap bekerja walaupun internet atau server bermasalah.
- Dashboard tidak boleh menampilkan perangkat offline atau data kedaluwarsa sebagai `SAFE`.
- Kendali sirene dari internet **tidak termasuk MVP**.

## Urutan membaca

1. `AGENTS.md` — aturan kerja utama untuk Codex.
2. `docs/01_PRD.md` — kebutuhan dan ruang lingkup produk.
3. `docs/02_SYSTEM_ARCHITECTURE.md` — arsitektur teknis.
4. `docs/03_DOMAIN_DATA_MODEL.md` — model domain dan database.
5. `docs/04_API_CONTRACT.md` — kontrak API.
6. `docs/05_RISK_ENGINE_SPEC.md` — aturan risiko dan alert.
7. `docs/06_UI_UX_SPEC.md` — spesifikasi dashboard berdasarkan gambar referensi.
8. `docs/07_SECURITY_OPERATIONS.md` — keamanan dan operasional.
9. `docs/08_IMPLEMENTATION_ROADMAP.md` — tahapan coding.
10. `docs/09_TEST_ACCEPTANCE_PLAN.md` — test plan dan acceptance criteria.
11. `docs/10_FIRMWARE_CONNECTIVITY.md` — integrasi perangkat dan dual connectivity.
12. `docs/11_DECISIONS_ASSUMPTIONS.md` — keputusan, asumsi, dan pertanyaan terbuka.

## Berkas teknis siap pakai

- `apps/api/prisma/schema.prisma` — schema Prisma aktif dan bertahap.
- `backend/prisma/schema.prisma` — referensi domain lama; deprecated dan bukan source of truth aktif.
- `.env.example` — environment server untuk development dan seed.
- `apps/web/.env.example` — template environment publik untuk Next.js.
- `backend/.env.example` — referensi konfigurasi lengkap fase mendatang.
- `specs/openapi.yaml` — spesifikasi awal OpenAPI.
- `specs/telemetry-payload.schema.json` — JSON Schema payload telemetri.
- `infra/docker-compose.reference.yml` — dependensi lokal PostgreSQL, Redis, Mailpit, dan MQTT opsional.
- `prompts/codex-master-prompt.md` — prompt induk untuk memulai sesi Codex.
- `prompts/phase-*.md` — prompt per fase agar Codex tidak mengerjakan terlalu banyak sekaligus.

## Aset dan referensi

- `assets/ui-reference-dashboard.png` — referensi visual dashboard.
- `references/Proposal_PKM_SMAN17.pdf` — dokumen proposal sumber kebutuhan.
- `references/Spesifikasi_Alat_Longsor.docx` — dokumen rancangan alat dan threshold awal.

## Cara menggunakan bersama Codex

1. Salin seluruh isi paket ke root repository baru.
2. Buka repository di Codex.
3. Berikan `prompts/codex-master-prompt.md` sebagai konteks awal.
4. Prompt pada `prompts/` bersifat operasional lokal dan sengaja tidak dilacak Git.
5. Setelah setiap fase selesai, jalankan test, periksa migration, dan commit.
6. Jangan meminta Codex membangun seluruh sistem dalam satu prompt.

## Stack yang direkomendasikan

- Monorepo: pnpm workspace + Turborepo opsional.
- Web: Next.js, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query.
- API: NestJS, Prisma, PostgreSQL, Redis, BullMQ.
- Realtime: Server-Sent Events untuk MVP; WebSocket dapat ditambahkan kemudian.
- Grafik: Apache ECharts atau Recharts.
- Peta: Leaflet atau MapLibre.
- Validasi: Zod di frontend dan class-validator/Zod di backend.
- Pengujian: Vitest/Jest, Supertest, Playwright, k6.

## Prinsip keselamatan paling penting

Website ini mendukung pengambilan keputusan, tetapi bukan pengganti penilaian ahli geologi/geoteknik atau prosedur tanggap darurat resmi. Threshold awal harus dapat dikonfigurasi, diberi versi, dan divalidasi melalui kalibrasi lapangan.
