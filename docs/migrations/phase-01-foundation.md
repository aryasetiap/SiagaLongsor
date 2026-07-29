# Migration Note — Phase 01 Foundation

Migration: `20260729090000_phase_01_foundation`

## Scope

Migration pertama hanya membuat:

- enum `Role`;
- `Organization`;
- `Site`;
- `User`;
- `Membership`;
- `RefreshSession`;
- `AuditLog`.

Tidak ada model device, telemetry, risk, alert, notification, map, atau report.

## Recovery

Pada development kosong, recovery yang disarankan adalah menghentikan aplikasi, menghapus volume
PostgreSQL development yang targetnya telah diverifikasi, lalu menjalankan migration dari awal.

Pada environment yang telah memiliki data, jangan menghapus tabel secara manual. Pulihkan backup
terverifikasi atau buat forward-fix migration. Urutan dependensi bila rollback manual benar-benar
diperlukan adalah `AuditLog`, `RefreshSession`, `Membership`, `Site`, `User`, `Organization`, lalu
enum `Role`.

Seed development aman dijalankan berulang. Password hash tidak ditulis ulang bila password
environment masih cocok, tetapi diperbarui bila nilai environment berubah. Di luar development,
rotasi credential harus dilakukan melalui alur authentication yang diaudit pada fase berikutnya.
