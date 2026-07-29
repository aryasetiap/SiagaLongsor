# SiagaLongsor — Codex Reference Pack

Paket ini adalah **acuan utama pengembangan** website dan backend Sistem Deteksi Dini Tanah Longsor untuk implementasi awal di **SMAN 17 Bandar Lampung**.

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

- `backend/prisma/schema.prisma` — rancangan awal skema Prisma.
- `backend/.env.example` — contoh environment variable.
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
4. Mulai hanya dari `prompts/phase-01-foundation.md`.
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
