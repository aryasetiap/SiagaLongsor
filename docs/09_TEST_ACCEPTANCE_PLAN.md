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

### Selesai pada Phase 03

- Contract validation untuk immutable Site risk profile, assessment history, current monitoring
  projection, alert list/detail, organization scope, dan cursor pagination.
- Pure risk engine boundary matrix, technical range, reason, precedence, dan profile-version test.
- Integration test untuk exactly-one assessment, duplicate/late behavior, transactional current
  state, hysteresis, profile activation/no-op, alert deduplication, dan organization isolation.
- Scheduler test untuk boundary ONLINE/DELAYED/OFFLINE, distributed lock, idempotency, disabled
  Device, recovery tanpa auto-resolve, serta cadence default lima menit.
- Phase 03 hanya membuat/membaca alert; mutation lifecycle tetap diuji pada Phase 05.
- Operational Overview, Alert list/detail, assessment history, risk-profile versioning, role
  behavior, organization isolation, dan credential-safe Chromium acceptance telah lulus. Matriks
  hasil lengkap tersedia pada
  [`docs/15_PHASE_03_ACCEPTANCE_REPORT.md`](15_PHASE_03_ACCEPTANCE_REPORT.md).

### Acceptance behavior lulus, verification gate Phase 04 masih blocked

- Dashboard Summary menjadi sumber KPI dan distribusi authoritative, bukan list terpaginasikan.
- Monitoring Overview, risk/connectivity presentation, Sensor Series, serta Recent Alerts memiliki
  state loading, error, empty, retry, dan partial failure yang independen.
- Sensor chart menjaga oldest-first, null, late marker, dan gap tanpa interpolasi.
- PROJECT_OWNER dan SCHOOL_ADMIN read path, Site/window filter, manual refresh, organization
  header, responsive viewport, accessibility, dan browser-storage safety telah diverifikasi.
- Tiga putaran penuh API integration dan Chromium acceptance lulus. Phase exit belum ditutup karena
  repository-wide format gate menemukan file backend commit basis di luar scope frontend ini.
  Detail dicatat dalam
  [`docs/16_PHASE_04_ACCEPTANCE_REPORT.md`](16_PHASE_04_ACCEPTANCE_REPORT.md).

### Fase mendatang

- Alert operation, realtime, map, report, notification, performance, dan resilience test dijalankan
  ketika implementasi fasenya tersedia.
- k6 ingestion dan dashboard wajib sebelum produksi, bukan pada coordination stage.

## 2. Test pyramid

- Unit: risk engine, dedup key, permission helpers, aggregations.
- Integration: Prisma repositories, ingestion transaction, alert transitions.
- API E2E: auth, device ingest, dashboard, alerts.
- UI E2E: login, dashboard, acknowledge, permission denial.
- Performance: k6 ingestion and dashboard.
- Resilience: network retry, Redis unavailable, delayed data, duplicate payload.

## 3. Critical test cases

### Dashboard data Phase 04

1. Summary hanya menghitung resource dalam active organization.
2. Optional Site filter diterapkan konsisten pada seluruh aggregate; Site lintas organisasi 404.
3. `active + inactive = monitoringPoints.total`.
4. Seluruh risk bucket sama dengan active MonitoringPoint scope.
5. Missing/untrusted/delayed/offline/invalid/profile-unavailable state menjadi UNKNOWN, bukan SAFE.
6. Device DISABLED tidak dihitung OFFLINE.
7. Seluruh connectivity bucket sama dengan enabled Device scope.
8. `activeCritical` tidak melebihi unresolved active Alert.
9. `newInWindow` memakai `firstObservedAt` dalam `[from,to)`, bukan repeated occurrence.
10. Sensor series selalu oldest-first dengan stable telemetry ID tie-breaker.
11. Range memakai from inclusive dan to exclusive; `from >= to` ditolak.
12. Default range 24 jam dan late telemetry dikecualikan.
13. `includeLate=true` menyertakan late point dengan `isLate=true`.
14. Gap telemetry tidak diinterpolasi atau dihaluskan.
15. Nullable sensor tetap null dan tidak berubah menjadi nol.
16. Cursor page tidak menggandakan/melewatkan timestamp sama; mismatch/expired cursor ditolak.
17. MonitoringPoint lintas organisasi menghasilkan 404.
18. PROJECT_OWNER dan SCHOOL_ADMIN dapat membaca kedua endpoint.
19. Frontend KPI dan risk/connectivity distribution memakai summary API, bukan paginated list.
20. Chart memiliki textual summary accessible serta ikon/label untuk status dan late data.
21. Desktop, tablet, dan mobile mempertahankan status critical dan basic usability.
22. Loading, error, empty series, no-data, offline, dan single-point state ditangani eksplisit.
23. Simulator dapat mengisi data yang kemudian muncul pada summary, series, table, dan alerts.
24. Chromium acceptance membuktikan mapping endpoint serta filter/range utama.
25. Response dan browser storage tidak memuat secret, credential hash, raw payload, atau token.

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

- SAFE hanya bila tilt `< 3`, moisture `< 65`, dan rain `< 20`.
- Boundary tepat 3, 65, 20, 8, 50, dan 85.
- Gap moisture 65–70 -> WATCH.
- Rain > 50 tanpa moisture > 85 -> WATCH.
- Tilt > 8 -> DANGER.
- Rain > 50 dan moisture > 85 -> DANGER.
- Required sensor missing/invalid, timestamp untrusted, profile unavailable -> UNKNOWN.
- Device DISABLED dan DELAYED/OFFLINE -> UNKNOWN.
- DANGER precedence sebelum SAFE/WATCH.
- WATCH membutuhkan dua current sample; DANGER satu.
- Downgrade membutuhkan 10 menit stabil.
- Profile version berbeda tidak mengubah assessment lama.
- Exact duplicate tidak membuat assessment; late assessment tidak memengaruhi current state.

### Offline detector

- <=20 menit ONLINE.
- > 20 sampai <=35 DELAYED.
- > 35 OFFLINE.
- OFFLINE dashboard risk UNKNOWN.
- Device DISABLED -> connectivity/risk UNKNOWN dengan reason DEVICE_DISABLED.
- Late telemetry tidak memulihkan connectivity.
- Kembali online memperbarui current state tetapi tidak auto-resolve alert.
- Scheduler lock dan rerun idempotent.

### Alerts

- WATCH/DANGER dan DELAYED/OFFLINE transition membuat alert sesuai type.
- Mismatch firmware/server membutuhkan tiga current sample berurutan.
- Satu unresolved alert per organization/Site/MonitoringPoint/type.
- Repeated observation memperbarui lastObservedAt dan occurrenceCount.
- Duplicate dan late telemetry tidak membuat atau memperbarui alert.
- Risk downgrade/connectivity recovery tidak auto-resolve alert.
- List/detail organization-scoped tersedia untuk kedua role tanpa totalCount.
- Acknowledge, resolve, false alarm, AlertEvent mutation, dan audit mutation diuji pada Phase 05.

### Authorization

- School Admin tidak dapat mengganti active risk profile.
- School Admin tidak dapat rotate credential.
- Project Owner dapat mengganti profile dan rotate credential.
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
