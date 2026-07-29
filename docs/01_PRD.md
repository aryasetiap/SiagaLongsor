# Product Requirements Document — SiagaLongsor

## 1. Ringkasan

SiagaLongsor adalah dashboard web untuk menerima telemetri perangkat Sistem Deteksi Dini Tanah Longsor, menampilkan kondisi lereng, mengelola peringatan, memantau kesehatan perangkat, serta menyediakan peta risiko, SOP, dan laporan.

Implementasi awal berlokasi di SMAN 17 Bandar Lampung dengan 1 alat. Sistem harus dirancang multi-device sejak awal agar penambahan alat tidak memerlukan perubahan arsitektur utama.

## 2. Masalah yang diselesaikan

- Data sensor belum memiliki pusat monitoring yang mudah dipahami.
- Kondisi perangkat dan koneksi perlu diketahui dari jarak jauh.
- Peringatan perlu dicatat, diakui, ditindaklanjuti, dan diaudit.
- Peta zona rawan dan jalur evakuasi perlu dapat diakses dari satu tempat.
- Sekolah dan pemilik proyek membutuhkan hak akses berbeda.
- Internet dapat terputus sehingga sistem perlu membedakan kondisi aman dari kondisi tidak diketahui.

## 3. Tujuan produk

1. Menampilkan kondisi risiko terbaru dalam kurang dari 10 detik untuk dibaca operator.
2. Menyimpan telemetri secara idempotent dan dapat diaudit.
3. Menghasilkan alert operasional dan risiko secara konsisten.
4. Memastikan perangkat offline tidak dianggap aman.
5. Membantu admin sekolah mengambil tindakan berdasarkan SOP.
6. Membantu pemilik proyek mengelola perangkat, threshold, pengguna, dan evaluasi sistem.
7. Mendukung ekspansi ke banyak alat dan lokasi.

## 4. Non-goals MVP

- Prediksi longsor berbasis AI/ML.
- Kendali sirene jarak jauh.
- Aplikasi mobile native.
- Integrasi resmi ke sistem pemerintah.
- Analisis geoteknik sebagai pengganti ahli.
- GIS editor profesional.

## 5. Pengguna dan role

### 5.1 PROJECT_OWNER

Pemilik proyek memiliki akses penuh untuk:

- Mengelola site, monitoring point, dan device.
- Membuat/aktivasi threshold profile.
- Mengelola pengguna sekolah.
- Melihat seluruh telemetry, alert, audit log, dan laporan.
- Rotasi credential device.
- Menandai maintenance.
- Mengunggah peta, SOP, dan dokumen.

### 5.2 SCHOOL_ADMIN

Admin sekolah dapat:

- Melihat dashboard, monitoring, peta, dan laporan.
- Menerima dan acknowledge alert.
- Menambahkan catatan tindakan.
- Resolve atau menandai false alarm dengan alasan.
- Melaporkan kerusakan dan membuka SOP.

Admin sekolah tidak dapat:

- Mengubah threshold aktif.
- Mengelola credential device.
- Menghapus telemetry atau audit log.
- Mengubah role pemilik proyek.

## 6. Modul MVP

### 6.1 Authentication & RBAC

- Login email/password.
- Session/JWT aman.
- Role enforcement di backend.
- Audit login gagal berulang dan aksi sensitif.

### 6.2 Overview Dashboard

Kartu utama:

- Monitoring Points.
- Critical Alerts.
- Devices Offline.
- New Alerts.

Konten:

- Tabel monitoring point.
- Donut distribusi status risiko.
- Grafik tren sensor.
- Daftar alert terbaru.
- Indikator last updated.

### 6.3 Monitoring

- Daftar titik monitoring.
- Detail titik.
- Nilai tilt, soil moisture, rainfall, battery, RSSI.
- Grafik 1 jam, 6 jam, 24 jam, 7 hari, 30 hari.
- Status live/delayed/offline.
- Riwayat risk assessment.

### 6.4 Alerts

Jenis minimum:

- `RISK_WATCH`.
- `RISK_DANGER`.
- `DEVICE_DELAYED`.
- `DEVICE_OFFLINE`.
- `INVALID_SENSOR`.
- `LOW_BATTERY`.
- `WEAK_SIGNAL`.

Lifecycle:

`OPEN -> ACKNOWLEDGED -> RESOLVED`

Alternatif:

`OPEN/ACKNOWLEDGED -> FALSE_ALARM`

Setiap transisi wajib memiliki event dan actor.

### 6.5 Devices

- Registrasi device.
- Credential unik per device.
- Device status dan last seen.
- Firmware version.
- Battery dan RSSI.
- Maintenance mode.
- Rotasi credential.
- Riwayat status.

### 6.6 Map & Evacuation

- Lokasi sekolah.
- Monitoring point marker.
- Warna marker berdasarkan risk level.
- Polygon zona rawan sederhana.
- Jalur evakuasi.
- Titik kumpul.
- Dokumen SOP.

### 6.7 Reports

- Export CSV telemetry.
- Rekap alert.
- Rekap device uptime/offline.
- Laporan kejadian dan tindakan.
- Print/PDF sederhana.

### 6.8 Settings

Project Owner:

- Threshold profiles.
- User management.
- Notification settings.
- Site profile.
- Document/SOP management.

## 7. Persyaratan realtime

- Telemetry yang baru diterima muncul di dashboard maksimal 3 detik setelah commit database dalam kondisi normal.
- Gunakan SSE untuk MVP.
- Bila SSE putus, frontend menggunakan refetch berkala.
- UI menampilkan waktu terakhir data benar-benar diterima, bukan hanya waktu render.

## 8. Persyaratan dual connectivity

- Wi-Fi menjadi jalur utama.
- Modem seluler menjadi fallback.
- Backend tidak perlu membedakan payload berdasarkan jalur jaringan.
- Payload wajib memiliki messageId dan sequence agar retry dari dua koneksi tidak membuat duplikasi.
- Firmware menyimpan antrean data singkat ketika kedua koneksi gagal.
- Dashboard menampilkan koneksi terakhir yang digunakan bila informasi tersedia.

## 9. Success metrics MVP

| Metrik | Target |
|---|---:|
| Telemetry valid tersimpan tanpa duplikasi | 100% pada test idempotency |
| Device offline tidak tampil SAFE | 100% |
| Alert lifecycle tercatat | 100% |
| Aksi sensitif menghasilkan audit log | 100% |
| p95 API summary | < 500 ms pada beban MVP |
| Telemetry-to-dashboard latency | < 3 detik dalam kondisi normal |
| Uptime target awal | >= 99% bulanan, di luar maintenance terjadwal |

## 10. Acceptance criteria tingkat produk

- Satu device dapat terdaftar dan mengirim data.
- Menambah device kedua tidak memerlukan perubahan schema.
- Wi-Fi dan modem retry tidak menghasilkan duplikasi.
- Device stale/offline menghasilkan status UNKNOWN dan alert yang sesuai.
- Admin sekolah dapat acknowledge dan resolve alert.
- Project Owner dapat mengubah threshold melalui profile baru, bukan edit tanpa histori.
- Peta menampilkan monitoring point dan jalur evakuasi.
- Laporan telemetry dan alert dapat diekspor.
- Semua permission utama diuji.
