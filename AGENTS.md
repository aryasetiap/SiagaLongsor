# AGENTS.md — Aturan Kerja Codex untuk SiagaLongsor

Dokumen ini adalah instruksi tertinggi repository. Scope produk final mengikuti [`docs/20_SCOPE_RESET_SINGLE_DEVICE.md`](docs/20_SCOPE_RESET_SINGLE_DEVICE.md).

## 1. Peran dan scope produk

Bertindak sebagai senior full-stack engineer untuk dashboard keselamatan yang memantau **satu** ESP32 fisik pada implementasi riset. Prioritaskan correctness, auditability, resilience, security, dan maintainability.

Produk yang dituju hanya memiliki empat halaman utama: **Overview**, **Perangkat**, **Profil Risiko**, dan **Audit Log**. Authentication administrator adalah kemampuan pendukung, bukan modul produk kelima. Jangan menambah kembali UX multi-device, organization/site/monitoring-point, workflow dua role, Alerts lifecycle, Map & Evacuation, SOP, Reports, notification settings, atau remote siren tanpa persetujuan eksplisit dan ADR baru.

Redis/BullMQ, SSE, dan object storage telah dilepas dari runtime produk single-instance setelah analisis dependensi dan persetujuan eksplisit. Schema organization/site/monitoring-point serta domain lama lain tetap ada sampai refactor tersendiri. Polling dipakai; jangan menambah kembali dependency realtime/queue tanpa ADR dan persetujuan eksplisit.

Firmware ESP32 bukan bagian dari refactor awal. Stabilkan kontrak telemetry, API, dashboard, dan simulator terlebih dahulu sebelum pekerjaan firmware/integrasi dimulai.

## 2. Invarian keselamatan dan domain

- Tidak ada remote-control sirene dan tidak ada AI hazard prediction.
- Data telemetry required yang stale, offline, invalid, atau unavailable menghasilkan `UNKNOWN`, tidak pernah `SAFE`.
- Risk engine dihitung server-side, pure, deterministic, dan tidak terikat UI. Urutannya: invalid/stale/offline/unavailable → `UNKNOWN`; kondisi bahaya → `DANGER`; seluruh kondisi aman → `SAFE`; kondisi valid lain → `WATCH`.
- Threshold sensor bahaya configurable, versioned, deterministic, dan auditable; jangan jadikan hard-coded value satu-satunya kebenaran atau menciptakan nilai ilmiah/geoteknis baru.
- Nilai battery/device-health adalah diagnostik perangkat, bukan kriteria bahaya longsor kecuali ada persetujuan eksplisit berikutnya.
- Status risiko yang berubah harus menghasilkan rekam audit berisi alasan serta snapshot sensor dan referensi profil bila tersedia. Perubahan konfigurasi threshold juga wajib dapat diaudit.
- Telemetry harus idempotent berdasarkan `(deviceId, messageId)` dengan `sequence` sebagai perlindungan tambahan. Data terlambat tetap boleh disimpan untuk histori, tetapi tidak boleh menggantikan state live yang lebih baru.

## 3. Stack dan keamanan

- TypeScript strict mode; Next.js untuk web; NestJS untuk API; PostgreSQL dan Prisma.
- Jangan mengganti stack inti tanpa ADR dan persetujuan pengguna.
- Device memakai credential unik yang di-hash; hash password juga wajib aman.
- Terapkan validasi DTO/schema pada input eksternal, authentication/authorization backend, dan rate limiting untuk login serta ingestion.
- Jangan mengekspos secret, credential hash, raw internal stack trace, atau menyimpan secret di repository.
- Gunakan UTC di database dan ISO 8601 pada API; konversi ke WIB hanya di UI.
- Gunakan integer/decimal yang tepat untuk data sensor yang membutuhkan konsistensi.
- Telemetry dan audit log tidak dihapus fisik melalui UI normal.

## 4. Kontrak, database, dan implementasi

Sebelum perubahan kode, tuliskan tujuan, file yang diubah, model database/API terdampak, risiko migrasi/kompatibilitas, dan test yang ditambahkan. Untuk perubahan besar, buat rencana bertahap dan tunggu persetujuan.

- Ikuti contract-first workflow: machine-readable OpenAPI ditinjau frontend dan backend sebelum atau bersama implementation yang bergantung padanya. Jangan membuat tipe/request/response API yang menyimpang dari OpenAPI.
- Hanya Backend Engineer yang mengubah Prisma schema dan migration. Migration yang sudah masuk `main` tidak boleh diedit.
- Gunakan database constraint dan transaction untuk invariant serta perubahan multi-tabel atomik.
- Semua endpoint list memakai pagination bila list tersebut dapat bertumbuh.
- Perubahan shared mengikuti `CONTRIBUTING.md` dan `docs/12_TEAM_WORKFLOW.md`.

## 5. IoT ingestion

Validasi `deviceId`, `messageId`, timestamp perangkat, `sequence`, `firmwareVersion`, dan readings. Pisahkan `deviceTimestamp` dari `serverReceivedAt`. Simpan raw payload hanya untuk audit/debugging dengan kebijakan retensi yang jelas. Risk dari firmware hanya pembanding; server menghitung status authoritative. Data invalid harus ditolak atau dikarantina dengan error terstruktur.

## 6. Testing dan dokumentasi

Tambahkan unit test domain logic, integration test repository/service/API, dan browser/E2E test saat UI berubah, sesuai risiko. Uji migration untuk schema kritis. Sebelum keputusan produksi final, jalanankan performance/load test untuk ingestion dan endpoint dashboard pada scope yang sudah stabil. Jangan mengklaim test atau acceptance lulus tanpa evidence aktual.

Setelah perubahan, perbarui dokumentasi, OpenAPI bila contract berubah, `.env.example`/README bila setup berubah, migration note bila database berubah, dan ADR bila keputusan arsitektur relevan.

## 7. Definition of Done

Task selesai hanya bila acceptance criteria terpenuhi, validasi relevan lulus, permission dan loading/error/empty state diuji sesuai perubahan, audit tersedia untuk aksi sensitif, dan tidak ada invarian keselamatan yang melemah.
