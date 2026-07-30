# AGENTS.md — Aturan Kerja Codex untuk SiagaLongsor

Dokumen ini adalah instruksi tertinggi di dalam repository. Semua perubahan kode harus mematuhinya.

## 1. Peran

Bertindak sebagai senior full-stack engineer yang membangun sistem monitoring IoT berorientasi keselamatan. Prioritaskan correctness, auditability, resilience, security, dan maintainability di atas kecepatan menambah fitur.

## 2. Konteks produk yang tidak boleh diubah diam-diam

- Implementasi awal memiliki 1 perangkat, tetapi seluruh model dan API harus mendukung banyak perangkat.
- Wi-Fi adalah koneksi utama; modem seluler adalah fallback.
- Role aktif MVP hanya `PROJECT_OWNER` dan `SCHOOL_ADMIN`.
- Sirene dan evaluasi risiko lokal pada perangkat harus dapat berjalan tanpa server.
- Remote control sirene tidak boleh dibuat pada MVP.
- Device offline, delayed, invalid, atau stale tidak boleh diberi status `SAFE`.
- Threshold harus configurable, versioned, auditable, dan tidak boleh hard-coded sebagai satu-satunya sumber kebenaran.
- Telemetry harus idempotent.
- Semua perubahan konfigurasi dan perubahan lifecycle alert harus masuk audit log.

## 3. Stack target

- TypeScript strict mode.
- Next.js untuk web.
- NestJS untuk API.
- PostgreSQL dan Prisma.
- Redis dan BullMQ.
- Tailwind CSS dan shadcn/ui.
- SSE untuk pembaruan dashboard real-time pada MVP.
- Docker Compose untuk local development.

Jangan mengganti stack utama tanpa menulis ADR dan mendapat persetujuan pengguna.

## 4. Aturan sebelum mengubah kode

Sebelum implementasi, tuliskan:

1. Tujuan perubahan.
2. File yang akan dibuat atau diubah.
3. Model database/API yang terdampak.
4. Risiko migrasi atau kompatibilitas.
5. Test yang akan ditambahkan.

Untuk perubahan besar, buat rencana bertahap dan tunggu persetujuan sebelum coding.

### 4.1 Koordinasi frontend dan backend

- Perubahan API wajib mengikuti contract-first workflow. Contract harus ditinjau frontend dan
  backend serta digabung sebelum implementation PR yang bergantung padanya.
- Frontend dan backend tidak boleh membuat request, response, error, atau tipe API sendiri-sendiri
  yang menyimpang dari OpenAPI.
- Perubahan shared files wajib dikoordinasikan dan secara normal memerlukan review silang.
  Documented Team Lead bypass mengikuti kebijakan pada `docs/12_TEAM_WORKFLOW.md` dan bukan
  self-approval.
- Prisma schema dan migration hanya dikelola Backend Engineer. Migration yang sudah masuk `main`
  tidak boleh diedit.
- Ikuti panduan operasional pada `CONTRIBUTING.md` dan rincian ownership serta checkpoint pada
  `docs/12_TEAM_WORKFLOW.md`.

## 5. Aturan implementasi

- Gunakan strict TypeScript; hindari `any` kecuali ada alasan tertulis.
- Gunakan DTO/schema validation pada semua input eksternal.
- Gunakan database constraint untuk invariant penting.
- Gunakan transaction untuk perubahan multi-tabel yang harus atomik.
- Gunakan UTC pada database dan ISO 8601 pada API; konversi ke WIB hanya pada UI.
- Gunakan integer/decimal yang tepat untuk nilai sensor; jangan mengandalkan float untuk data yang membutuhkan konsistensi.
- Gunakan pagination pada seluruh endpoint list.
- Jangan mengembalikan secret, credential hash, atau internal stack trace.
- Jangan menyimpan secret di repository.
- Jangan melakukan delete fisik telemetry atau audit log melalui UI normal.
- Gunakan soft disable untuk device dan user bila sesuai.
- Jangan mengubah status alert tanpa membuat `AlertEvent`.
- Jangan membuat alert baru berulang untuk kejadian aktif yang sama; gunakan deduplication key.

## 6. Aturan IoT ingestion

- Autentikasi setiap device dengan credential unik.
- Validasi `deviceId`, `messageId`, `timestamp`, `sequence`, `firmwareVersion`, dan readings.
- Terapkan idempotency berdasarkan `(deviceId, messageId)`; gunakan sequence sebagai perlindungan tambahan.
- Terima data yang terlambat untuk histori, tetapi jangan otomatis menjadikannya kondisi live terbaru.
- Bedakan `deviceTimestamp` dan `serverReceivedAt`.
- Simpan raw payload untuk audit/debugging dengan kebijakan retensi yang jelas.
- Server menghitung risk level sendiri; nilai risk dari firmware hanya pembanding.
- Data invalid harus dikarantina atau ditolak dengan error terstruktur.

## 7. Risk engine

Urutan evaluasi wajib:

1. Data invalid/stale/offline → `UNKNOWN`.
2. Memenuhi kondisi bahaya → `DANGER`.
3. Memenuhi seluruh kondisi aman → `SAFE`.
4. Kondisi valid lainnya → `WATCH`.

Risk engine harus pure, deterministic, dan memiliki unit test tabel lengkap. Jangan mengikat logika pada UI.

## 8. Security

- Hash password dan device secret.
- Terapkan RBAC di backend, bukan hanya menyembunyikan tombol frontend.
- Terapkan rate limiting untuk login dan ingestion.
- Audit perubahan role, threshold, device credential, dan status alert.
- Sanitasi file upload dan batasi tipe/ukuran.
- Jangan menambahkan endpoint remote siren.
- Jangan expose internal identifiers yang tidak perlu.

## 9. Testing wajib

Setiap fitur harus memiliki kombinasi test yang sesuai:

- Unit test untuk domain logic.
- Integration test untuk repository/service/API.
- E2E untuk alur utama.
- Test migration untuk schema kritis.
- k6 untuk ingestion dan dashboard endpoint sebelum produksi.

Tidak boleh menandai fase selesai bila test gagal atau acceptance criteria belum terpenuhi.

## 10. Dokumentasi

Setelah perubahan:

- Perbarui README bila setup berubah.
- Perbarui `.env.example` bila ada variabel baru.
- Perbarui OpenAPI bila contract berubah.
- Tambahkan migration note bila database berubah.
- Tambahkan keputusan arsitektur pada ADR bila relevan.

## 11. Larangan

- Jangan membangun semua fase sekaligus.
- Jangan menambahkan AI prediction pada MVP.
- Jangan membuat threshold klinis/geoteknis baru berdasarkan tebakan.
- Jangan menganggap koneksi internet selalu tersedia.
- Jangan menganggap satu alat akan selalu menjadi satu-satunya alat.
- Jangan menampilkan `SAFE` ketika data tidak segar.
- Jangan menghapus audit trail.
- Jangan melakukan auto-resolve alert kritis tanpa rule dan catatan yang jelas.

## 12. Definition of Done

Sebuah task selesai hanya jika:

- Kode berhasil lint dan type-check.
- Test relevan lulus.
- Migration aman dan dapat di-rollback atau memiliki recovery note.
- API terdokumentasi.
- Error state dan loading state ditangani.
- Permission diuji.
- Audit log tersedia untuk aksi sensitif.
- Acceptance criteria task terpenuhi.
