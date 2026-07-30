# Phase 02 domain foundation

Migration: `20260730120000_phase_02_domain_foundation`

## Perubahan

- Menambahkan enum `DeviceLifecycleStatus`, `NetworkType`, dan `FirmwareRiskLevel`.
- Menambahkan `MonitoringPoint`, `Device`, dan append-only `Telemetry`.
- Menyimpan hanya `Device.credentialHash`; raw device secret tidak memiliki kolom persistence.
- Menggunakan `timestamptz(3)` untuk timestamp domain baru, `BigInt` untuk sequence, dan `Decimal`
  untuk nilai sensor.

## Constraint dan SQL manual

- Composite foreign key menjaga Organization, Site, MonitoringPoint, dan Device tetap dalam scope
  yang konsisten.
- `hardwareId` unik global.
- Telemetry unik pada `(deviceId, messageId)` dan `(deviceId, bootId, sequence)`.
- Semua foreign key histori memakai `ON DELETE RESTRICT`.
- Check constraint menjaga format hardware ID, lifecycle/`disabledAt`, sequence nonnegative,
  rentang sensor yang telah ditetapkan contract, raw payload berbentuk object, dan rainfall
  nonnegative tanpa static maximum.
- Raw payload menolak property top-level credential/Authorization sebagai defense in depth;
  validation canonical payload tetap menjadi perlindungan utama pada ingestion layer.
- Partial unique index `Device_one_enabled_per_monitoring_point_key` menjamin hanya satu Device
  `ENABLED` per MonitoringPoint. SQL manual diperlukan karena partial unique index belum dapat
  diekspresikan oleh Prisma schema.

## Compatibility

Migration bersifat additive dan tidak mengubah atau menghapus data Phase 01. Device lama yang
`DISABLED` tetap tersimpan dan tidak menghalangi device pengganti. Tidak ada endpoint, server risk,
atau perubahan kontrak API pada migration ini.

## Rollback dan recovery

Rollback otomatis tidak disediakan karena penghapusan tabel telemetry dapat menghilangkan histori.
Jika migration gagal sebelum dipakai, perbaiki penyebab lalu gunakan Prisma migration resolution
sesuai status database. Setelah data Phase 02 ada, recovery yang aman adalah backup, membuat
migration forward, dan mempertahankan tabel histori; jangan menjalankan `DROP TABLE` di production.

## Verifikasi

1. Jalankan seluruh migration pada PostgreSQL kosong dengan `prisma migrate deploy`.
2. Jalankan seed dua kali dan pastikan row MonitoringPoint tidak bertambah.
3. Jalankan integration test database untuk unique constraint, partial unique index, hash-only
   credential, dan late telemetry.
4. Jalankan `prisma validate` dan periksa migration status.
