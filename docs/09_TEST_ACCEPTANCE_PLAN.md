# Test and Acceptance Plan

## 1. Status test per fase

### Tersedia pada Phase 01

- Unit test konfigurasi, refresh token, API client, login form, dan auth state.
- API integration test untuk health, authentication, refresh rotation/replay, Origin protection,
  logout, rate limiting, organization-scoped RBAC, user/membership state, dan session revocation.
- Frontend component test untuk login, session bootstrap, protected content, retry/single-flight
  refresh, logout, role display, dan larangan browser token storage.
- Prisma validation, migration deploy dari database CI bersih, dan seed dua kali.
- API dan web production build serta OpenAPI validation dalam full monorepo CI.

Browser E2E belum tersedia dan tidak diklaim sebagai bagian Phase 01 yang sudah dibuat.

### Direncanakan untuk Phase 02

- Contract validation untuk MonitoringPoint, Device, credential, dan telemetry.
- Migration test dari database bersih.
- API integration test untuk permission, CRUD, credential lifecycle, ingestion, validation,
  idempotency, raw payload, dan rate limiting.
- Frontend component test dengan typed contract mocks.
- Chromium browser smoke pada checkpoint integrasi sebelum management UI pertama digabung.
- Full monorepo CI pada setiap pull request.

### Fase mendatang

- Risk engine, alert, offline detector, dashboard, realtime, map, report, performance, dan
  resilience test dijalankan ketika implementasi fasenya tersedia.
- k6 ingestion dan dashboard wajib sebelum produksi, bukan pada coordination stage.

## 2. Test pyramid

- Unit: risk engine, dedup key, permission helpers, aggregations.
- Integration: Prisma repositories, ingestion transaction, alert transitions.
- API E2E: auth, device ingest, dashboard, alerts.
- UI E2E: login, dashboard, acknowledge, permission denial.
- Performance: k6 ingestion and dashboard.
- Resilience: network retry, Redis unavailable, delayed data, duplicate payload.

## 3. Critical test cases

### Telemetry ingestion

1. Credential valid + payload valid -> 201.
2. Payload yang sama -> 200 duplicate, row tetap satu.
3. MessageId sama tetapi body berbeda -> 409.
4. Credential salah -> 401.
5. Device disabled -> 403.
6. Sensor di luar range -> 400/invalid policy.
7. Timestamp lama -> tersimpan historis tetapi tidak mengganti live state.
8. Sequence mundur -> ditangani sesuai policy dan dicatat.
9. Wi-Fi retry dan cellular retry payload sama -> tidak duplikat.

### Risk engine

- SAFE normal.
- Semua boundary.
- Gap 65–70 moisture -> WATCH.
- Rain > 50 tanpa moisture > 85 -> WATCH kecuali profile mendefinisikan lain.
- Tilt > 8 -> DANGER.
- Invalid/stale -> UNKNOWN.
- Danger precedence.

### Offline detector

- <=20 menit ONLINE.
- > 20 sampai <=35 DELAYED.
- > 35 OFFLINE.
- OFFLINE dashboard risk UNKNOWN.
- Kembali online mencatat status event.

### Alerts

- Transition risk membuat alert.
- Duplicate state tidak membuat alert baru.
- School Admin acknowledge dengan note.
- Resolve tanpa note ditolak.
- False alarm wajib alasan.
- AlertEvent tercatat.
- AuditLog tercatat.

### Authorization

- School Admin tidak dapat activate threshold.
- School Admin tidak dapat rotate credential.
- Project Owner dapat melakukan keduanya.
- User dari organization lain tidak dapat membaca data.

### UI

- Loading skeleton.
- Empty state.
- Error state.
- Stale badge.
- UNKNOWN tidak berwarna hijau.
- Critical alert accessible via keyboard.
- Mobile view tidak menyembunyikan aksi penting.

## 4. Performance target awal

### Ingestion

- 20 requests/second selama 5 menit sebagai target jauh di atas kebutuhan satu alat.
- Error rate < 1% di luar intentional validation error.
- p95 < 500 ms.
- Tidak ada duplicate row.

### Dashboard

- 20 concurrent users.
- p95 summary < 500 ms.
- p95 telemetry chart query < 1 detik untuk rentang 24 jam dengan agregasi.

## 5. Resilience scenarios

- Server tidak tersedia 30 menit; device queue lalu retry.
- Wi-Fi gagal dan cellular aktif.
- Cellular dan Wi-Fi mengirim pesan sama karena race; server tetap idempotent.
- Redis tidak tersedia; telemetry tetap tersimpan, notification job ditandai pending/retry.
- Database restart; aplikasi recovery.
- Device clock meleset.
- Firmware mengirim NaN/string invalid.

## 6. UAT School Admin

Admin sekolah harus dapat:

- Login.
- Memahami status dalam <10 detik.
- Membuka SOP.
- Menemukan titik yang bermasalah.
- Acknowledge alert.
- Menambahkan kondisi lapangan.
- Mengunduh laporan sederhana.

## 7. Definition of Done per feature

- Acceptance criteria tertulis.
- Unit/integration test lulus.
- Permission test lulus.
- Error state ditangani.
- Audit log bila sensitif.
- Dokumentasi API diperbarui.
- Tidak ada secret di commit.
