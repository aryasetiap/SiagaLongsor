# Phase 02 Acceptance Report

## 1. Basis dan environment

- Tanggal verifikasi: 31 Juli 2026.
- Commit basis: `669a6ec4a81395ba2cc967a2e3733d8e2591cf38`
  (`feat: add device management UI (#16)`).
- Branch acceptance: `test/phase-02-full-acceptance`.
- Runtime: Windows/PowerShell, Node.js 24.11.1, pnpm 10.34.5, Docker Compose 5.3.0.
- Services: PostgreSQL 16 Alpine pada host port 55432 dan Redis 7 Alpine; keduanya healthy.
- Browser: Playwright 1.62.1, Chromium, serial worker.
- API dan web dijalankan oleh Playwright `webServer` terhadap database dan Redis aktual.
- Credential PROJECT_OWNER berasal dari environment lokal yang diabaikan Git. Nilainya tidak
  dicatat dalam report atau artifact.

## 2. Ringkasan hasil

**PASS.** Phase 02 memenuhi exit criteria untuk Site lookup, MonitoringPoint management, Device
management dan lifecycle credential, telemetry ingestion, simulator, organization scope, serta
read-only behavior SCHOOL_ADMIN.

Satu defect pada observability simulator ditemukan dan diperbaiki: ketika scenario `normal`
ditolak API dengan error terstruktur, simulator sebelumnya mengubah respons tersebut menjadi
`RESPONSE_INVALID`. Simulator sekarang mencatat hanya HTTP status dan stable error code yang aman,
kemudian tetap berhenti non-zero. Perubahan tidak mengubah kontrak HTTP atau penyimpanan data.

## 3. Acceptance matrix

| Capability | Evidence | Hasil |
| --- | --- | --- |
| Login PROJECT_OWNER | Chromium login menuju `/overview` | PASS |
| Site lookup aktual | Form memilih Site dari `GET /sites`, tanpa hard-coded ID | PASS |
| MonitoringPoint create | Nama unik per run muncul pada list | PASS |
| Device registration | Hardware ID unik dan one-time credential dialog tampil | PASS |
| One-time credential safety | Hilang setelah acknowledgement/reload; tidak ada pada URL, JavaScript cookie, localStorage, sessionStorage, list, atau detail | PASS |
| Telemetry normal | Simulator CLI aktual selesai dengan `201`, `duplicate: false` | PASS |
| Exact duplicate | Simulator memverifikasi `201` lalu `200`, telemetry ID sama, tanpa row kedua | PASS |
| Late telemetry | Telemetry terkini dan satu jam lebih lama diterima; latest state tidak mundur | PASS |
| Sequence conflict | Simulator memverifikasi `409 SEQUENCE_CONFLICT` | PASS |
| Idempotency conflict | Simulator memverifikasi `409 IDEMPOTENCY_CONFLICT` | PASS |
| Latest Device metadata | Detail menampilkan firmware `simulator-1.0.0`, Wi-Fi, dan RSSI -67 | PASS |
| Credential rotation | Secret baru berbeda, hanya tampil sekali | PASS |
| Old credential rejection | Simulator berhenti non-zero dengan `401 DEVICE_CREDENTIAL_INVALID` | PASS |
| Rotated credential | Simulator berhasil mengirim telemetry | PASS |
| Device disable | Status menjadi `DISABLED`; rotate/disable control hilang | PASS |
| Disabled ingestion | Simulator berhenti non-zero dengan `403 DEVICE_DISABLED` | PASS |
| MonitoringPoint deactivation | Berhasil setelah tidak ada Device `ENABLED` | PASS |
| Organization header | Semua request Site, MonitoringPoint, dan Device dari browser membawa `X-Organization-Id` | PASS |
| Organization isolation | API integration menolak membership/cross-organization access dan menyamarkan resource sesuai contract | PASS |
| Logout | Kembali ke `/login` | PASS |
| Browser runtime | Tidak ada uncaught `pageerror` | PASS |

## 4. Simulator scenarios

Acceptance Chromium menjalankan CLI aktual melalui child process Node.js dengan secret hanya pada
`SIMULATOR_DEVICE_SECRET` di environment proses anak. Secret tidak menjadi argument command.

| Scenario | Hasil yang dibuktikan |
| --- | --- |
| `normal` | Telemetry baru diterima |
| `duplicate` | Pengiriman identik kedua mengembalikan duplicate tanpa row baru |
| `late` | Data lama tetap append-only dan tidak memundurkan latest state |
| `sequence-conflict` | Message berbeda pada boot/sequence sama ditolak |
| `idempotency-conflict` | Message ID sama dengan canonical payload berbeda ditolak |

Sesudah rotasi, `normal` dengan credential lama membuktikan 401 dan credential baru membuktikan
penerimaan. Sesudah disable, `normal` dengan credential aktif terakhir membuktikan 403.

## 5. Security dan contract checks

- Screenshot, trace, dan video dimatikan khusus pada acceptance flow pemegang raw credential.
- Test tidak mencetak, memberi judul, meng-attach, atau menulis raw credential ke file.
- Simulator tidak mencetak Authorization atau raw secret; regression test memeriksa sanitasi log.
- Reference raw credential dibersihkan setelah lifecycle terkait selesai.
- Access token tetap hanya di memory dan tidak ditemukan pada localStorage/sessionStorage.
- GET/list Device tidak mengandung `secret` atau `credentialHash`.
- Site projection hanya `id`, `name`, nullable `address`, dan `timezone`.
- List contract tidak mengandung `totalCount`.
- Telemetry acknowledgement tidak mengandung `serverRisk`.
- Raw telemetry payload tidak mengandung Authorization atau credential.
- Seluruh request browser yang organization-scoped membawa `X-Organization-Id`.
- API integration membuktikan tidak ada cross-organization data leakage.

## 6. Role evidence

SCHOOL_ADMIN diverifikasi melalui evidence berlapis yang tidak membutuhkan credential browser
tambahan:

- Site API integration: PROJECT_OWNER dan SCHOOL_ADMIN dapat list dalam organisasi aktif.
- MonitoringPoint API integration: kedua role dapat list/detail; SCHOOL_ADMIN ditolak untuk create
  dan update dengan `ROLE_ACCESS_DENIED`.
- Device API integration: kedua role dapat list/detail; SCHOOL_ADMIN ditolak untuk register,
  update, rotate, dan disable dengan `ROLE_ACCESS_DENIED`.
- Component tests: navigasi MonitoringPoint dan Device tersedia untuk SCHOOL_ADMIN, sedangkan
  mutation controls tidak dirender.

Browser read-only smoke SCHOOL_ADMIN tidak ditambahkan karena repository belum mendefinisikan
credential E2E khusus role tersebut pada konfigurasi Playwright/CI. Seed atau password hard-coded
tidak ditambahkan.

## 7. Jumlah test

- Unit API: 18 test pada 4 file.
- Unit/component web: 75 test pada 9 file.
- API integration: 96 test pada 6 file.
- Chromium E2E: 8 test pada 4 file, termasuk satu full Phase 02 acceptance flow.
- Total suite terhitung: 197 test.

## 8. Known limitations

- UI Phase 02 belum memiliki telemetry history view. Jaminan tidak ada row duplicate dan latest
  state tidak mundur dibuktikan oleh simulator dan API/database integration test; browser
  memverifikasi metadata Device terbaru yang tersedia.
- Browser SCHOOL_ADMIN belum menjadi smoke test karena credential E2E role tersebut belum tersedia
  melalui konfigurasi aman dan reproducible.
- Data acceptance sengaja tidak dihapus secara fisik. Identifier unik per run mencegah collision
  dan mempertahankan prinsip histori/audit.
- Performance k6, resilience gangguan jaringan panjang, serta retention raw telemetry tetap wajib
  sebelum produksi sesuai roadmap, tetapi bukan exit criteria implementasi fungsional Phase 02.

## 9. Deferred

Risk engine, alert engine, dashboard KPI, realtime SSE, map, reporting, heartbeat, remote siren,
notification worker, dan firmware implementation tetap ditunda ke fase berikutnya. Tidak ada item
tersebut yang ditambahkan dalam acceptance ini.

## 10. Keputusan exit

Phase 02 **memenuhi exit criteria** berdasarkan full browser lifecycle aktual, simulator aktual,
API integration, component/unit suite, production build, migration/seed verification, Prisma
validation, OpenAPI validation, scope guard, dan security scan. Limitasi di atas tidak mengubah
kontrak atau acceptance behavior Phase 02.
