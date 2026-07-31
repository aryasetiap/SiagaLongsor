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

### Terverifikasi pada Phase 02

- Contract validation tersedia untuk error envelope, organization context, pagination, Site lookup,
  MonitoringPoint, Device, one-time credential, dan telemetry.
- Migration test dari database bersih dan seed idempotent tersedia.
- API integration test mencakup permission, CRUD, credential lifecycle, ingestion, validation,
  idempotency, raw payload, rate limiting, organization isolation, dan late data.
- Frontend component test memakai typed contract mocks untuk akses PROJECT_OWNER dan read-only
  SCHOOL_ADMIN.
- Chromium browser smoke mencakup authentication, MonitoringPoint, Device, dan full lifecycle
  acceptance lintas kapabilitas dengan simulator CLI aktual.
- Full monorepo verification Phase 02 dicatat dalam
  [`docs/14_PHASE_02_ACCEPTANCE_REPORT.md`](14_PHASE_02_ACCEPTANCE_REPORT.md).

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
3. Duplicate mengembalikan `telemetryId` dan `receivedAt` asli.
4. `messageId` sama tetapi canonical payload hash berbeda -> 409 `IDEMPOTENCY_CONFLICT`.
5. `Idempotency-Key` berbeda dari body `messageId` -> 400.
6. Body memiliki `deviceId`, `hardwareId`, atau property asing -> 400.
7. `bootId` tidak ada, kosong, atau lebih dari 64 karakter -> 400.
8. `(deviceId, bootId, sequence)` sama dengan message berbeda -> 409 `SEQUENCE_CONFLICT`.
9. Sequence yang sama setelah `bootId` berubah tidak dianggap conflict.
10. Credential salah -> 401.
11. Device disabled -> 403.
12. Sensor di luar range -> 400/invalid policy.
13. `rainfallMmHour` negatif, NaN, atau infinite -> 400; tidak ada static upper bound.
14. Timestamp lebih jauh dari configurable future skew (default 300 detik) -> 400.
15. Timestamp lama -> tersimpan historis tetapi tidak mengganti latest state yang lebih baru.
16. Wi-Fi retry dan cellular retry payload sama -> tidak duplikat.
17. Raw payload tidak menyimpan Authorization header atau credential.
18. Response tidak memiliki `serverRisk`; tidak tersedia `/iot/heartbeat`.
19. `deviceAssessment` tersimpan sebagai data pembanding/audit, bukan keputusan safety server.

### Contract foundation

1. Semua error sesuai `ErrorResponse`, memakai stable error code, ISO UTC timestamp, dan request ID.
2. Semua response menyertakan header `x-request-id`.
3. Validation error memiliki detail `{ field, messages[] }` bila relevan.
4. Resource response user dibungkus `data`; list juga memiliki `page`.
5. Limit default 25, maksimum 100, cursor opaque, dan sorting stabil.
6. Missing `X-Organization-Id` -> 400 `ORGANIZATION_CONTEXT_REQUIRED`.
7. Membership aktif tidak tersedia -> 403 `ORGANIZATION_ACCESS_DENIED`.
8. Cross-organization resource -> 404 resource-specific not found.
9. Site dari organisasi lain ditolak.
10. Runtime CORS mengizinkan header `X-Organization-Id`.

### Site lookup

1. PROJECT_OWNER dan SCHOOL_ADMIN dapat membaca Site dalam organisasi aktif.
2. Response tidak memuat Site dari organisasi lain.
3. Missing organization context dan membership tidak aktif mengikuti error contract.
4. Search mencakup `name` dan `address`, dengan panjang maksimum 100 karakter.
5. Limit default 25 dan maksimum 100; tidak ada `totalCount`.
6. Sort default `name:asc`; `name:desc` dan `createdAt:desc` diterima.
7. Cursor opaque terikat pada organization, search, sort, nilai sort terakhir, dan stable id.
8. Cursor invalid atau dari konteks query lain menghasilkan 400 `INVALID_CURSOR`.
9. Item hanya memuat `id`, `name`, nullable `address`, dan `timezone`.
10. Tidak tersedia endpoint create, detail, update, atau delete Site pada Phase 02.

### MonitoringPoint

1. PROJECT_OWNER dapat list, detail, create, dan update.
2. SCHOOL_ADMIN dapat list/detail dalam organization sendiri.
3. SCHOOL_ADMIN tidak dapat create/update.
4. Cross-organization detail disamarkan sebagai 404.
5. List filter, stable sort, cursor, default limit, dan maximum limit mengikuti contract.
6. Create menolak site di luar organization aktif.
7. PATCH menolak body kosong dan property asing.
8. Monitoring point dengan enabled device tidak dapat dinonaktifkan.
9. Response nullable `currentDevice` tidak memuat credential.
10. Tidak tersedia delete, map, risk, telemetry history, alert, atau KPI endpoint.

### Device dan credential

1. PROJECT_OWNER dapat register, update, rotate credential, dan disable.
2. SCHOOL_ADMIN hanya dapat list/detail dalam organization sendiri.
3. `hardwareId` unik global dan immutable.
4. Hanya satu enabled device dapat ditautkan ke satu MonitoringPoint.
5. Lifecycle response hanya `ENABLED` atau `DISABLED`.
6. Register dan rotate mengembalikan raw secret tepat sekali dengan `displayOnce: true`.
7. GET/list tidak memuat secret atau hash.
8. Secret lama langsung invalid setelah rotation berhasil.
9. Disable ulang idempotent; disabled device ditolak saat ingestion.
10. Tidak tersedia enable atau maintenance endpoint Phase 02.

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
- Header organisasi tidak menggantikan pemeriksaan membership aktif.

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
