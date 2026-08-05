# Product Requirements Document — SiagaLongsor

## 1. Ringkasan

SiagaLongsor adalah dashboard monitoring keselamatan untuk **satu perangkat ESP32 fisik** pada implementasi riset. Produk menampilkan telemetry authoritative, riwayat sensor, status bahaya, kesehatan perangkat, konfigurasi profil risiko, dan jejak audit status bahaya.

Scope ini ditetapkan oleh supervisor dan dicatat di [`docs/20_SCOPE_RESET_SINGLE_DEVICE.md`](20_SCOPE_RESET_SINGLE_DEVICE.md). Implementasi yang lebih luas sebelumnya adalah bukti historis, bukan definisi produk final.

## 2. Tujuan produk

- Menyajikan nilai sensor terbaru dan histori untuk analisis kondisi longsor.
- Menyajikan status bahaya authoritative yang tidak memalsukan kondisi aman.
- Memperlihatkan konektivitas perangkat dan keterbacaan setiap sensor yang diperlukan.
- Memungkinkan administrator memperbarui profil threshold secara tervalidasi dan auditable.
- Menyediakan riwayat perubahan status bahaya yang dapat dijelaskan.

## 3. Pengguna dan batasan

Administrator terautentikasi mengakses dashboard dan profil risiko. Authentication mendukung produk, tetapi bukan halaman/modul utama terpisah. Produk tidak mendefinisikan workflow `PROJECT_OWNER`/`SCHOOL_ADMIN`, switching organisasi, atau operasi banyak perangkat.

## 4. Empat halaman produk

### 4.1 Overview

- Menampilkan status bahaya saat ini, nilai sensor terbaru, waktu pembaruan, dan freshness data.
- Menampilkan chart time-series terpisah untuk setiap sensor relevan bahaya dari histori persisted.
- Nilai kosong tidak boleh dirender sebagai nol; chart tidak menginterpolasi celah data.
- Status stale, offline, invalid, atau required data unavailable selalu `UNKNOWN`, bukan `SAFE`.

### 4.2 Perangkat

- Menampilkan keterhubungan ESP32 ke backend dan `last seen`.
- Menampilkan kesehatan/readability setiap sensor required: readable, unreadable, atau unknown.
- Dapat menampilkan firmware, identitas hardware, battery, dan diagnostik perangkat bila datanya authoritative. Nilai tersebut tidak otomatis menjadi kriteria bahaya longsor.

### 4.3 Profil Risiko

- Administrator dapat membaca dan memperbarui threshold `WATCH` dan `DANGER` bagi sensor relevan.
- Input divalidasi; kombinasi invalid ditolak; penerapan memerlukan konfirmasi.
- Versi dan waktu perubahan ditampilkan bila tersedia; setiap perubahan dapat diaudit.
- Tidak ada nilai threshold ilmiah/geoteknis yang dibuat-buat. Nilai lama, bila ada, hanya provisional/legacy hingga kalibrasi disetujui.

### 4.4 Audit Log

- Memprioritaskan transisi status bahaya, misalnya `SAFE → WATCH` atau `WATCH → DANGER`.
- Menampilkan status sebelum/sesudah, timestamp, alasan, serta snapshot sensor dan referensi profil risiko bila tersedia.
- Riwayat harus immutable/auditable. UI tidak memerlukan acknowledge, resolve, atau false-alarm.

## 5. Protokol dan kemampuan pendukung

- Login administrator dan health check API.
- Credential unik perangkat, telemetry ingestion tervalidasi, dan idempotency.
- Persistence telemetry untuk histori chart dan current state.
- Evaluasi risiko deterministic di server; evaluasi firmware hanya pembanding.
- Data terlambat disimpan sebagai histori tetapi tidak menggantikan current state yang lebih baru.
- Firmware ESP32 dikerjakan setelah API/dashboard dan simulator telemetry stabil.

## 6. Semantik keselamatan

Risk engine mengevaluasi: required data invalid/stale/offline/unavailable → `UNKNOWN`; kondisi bahaya → `DANGER`; seluruh kondisi aman → `SAFE`; kondisi valid lain → `WATCH`. Status disajikan dengan label/icon selain warna. Tidak ada remote siren atau AI prediction dalam produk.

## 7. Scope yang dihapus/digantikan

MonitoringPoint/device CRUD multi-device, organization/site management, Alerts lifecycle, Map & Evacuation, SOP, Reports, user management, notification settings, object-storage features, serta SSE sebagai persyaratan produk tidak lagi merupakan target final. Implementasi yang ada tidak dihapus dalam R1 dan akan dianalisis/refactor secara bertahap.

## 8. Acceptance produk tingkat tinggi

Produk diterima ketika empat halaman di atas menggunakan data authoritative, tidak menampilkan nol palsu atau `SAFE` palsu, perubahan profil dan status dapat diaudit, ingestion idempotent, serta regression, browser, dan performance acceptance pada scope final telah dibuktikan. Rincian ada di [`docs/09_TEST_ACCEPTANCE_PLAN.md`](09_TEST_ACCEPTANCE_PLAN.md).
