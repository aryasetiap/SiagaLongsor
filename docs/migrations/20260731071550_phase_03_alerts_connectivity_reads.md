# Phase 03 alerts, connectivity, and read projections

Migration `20260731071550_phase_03_alerts_connectivity_reads` menambahkan enum `AlertType`,
`AlertSeverity`, dan `AlertStatus`, serta tabel `Alert` dan `AlertEvent`.

## Constraint dan concurrency

- Partial unique index membatasi satu Alert unresolved (`ACTIVE` atau `ACKNOWLEDGED`) untuk setiap
  `deduplicationKey`.
- Service memakai PostgreSQL transaction advisory lock sebelum create/update sehingga concurrent
  observation terserialisasi dan `occurrenceCount` bertambah tepat satu kali.
- `AlertEvent.observationKey` unik membuat observation telemetry atau scheduler idempotent.
- Reasons wajib JSON array non-kosong, metadata event wajib JSON object, dan occurrence count
  minimal satu.
- Trigger database menolak update AlertEvent. Tidak ada physical-delete path pada runtime.
- Composite foreign key menjaga konsistensi identitas Organization, Site, MonitoringPoint, dan
  Device opsional; seluruh relasi histori memakai `RESTRICT`.

## Compatibility dan recovery

Migration bersifat additive dan tidak mengubah data Risk Core. Tidak ada backfill Alert; alert
mulai terbentuk dari current telemetry atau connectivity evaluation setelah deployment.

Verifikasi menggunakan database kosong, `prisma migrate deploy`, seed dua kali, integration test
concurrency, dan schema drift check. Jika deployment gagal sebelum menerima Alert, pulihkan backup
dan perbaiki migration sebelum retry. Setelah Alert tersimpan, gunakan forward-fix migration dan
jangan drop histori.
