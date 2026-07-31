# Phase 03 Acceptance Report

Tanggal verifikasi: 31 Juli 2026  
Commit basis: `8b71f98d1b9c55b5bf6273df0c8334fcbc04e038`  
Environment: Windows development host, Node.js 24, pnpm 10, PostgreSQL 16, Redis 7, Chromium
Playwright, NestJS API, dan Next.js web.

## Keputusan

**PASS — Phase 03 memenuhi exit criteria.**

Contract, backend risk/alert/connectivity, operational frontend, test, migration, dan acceptance
lintas kapabilitas konsisten. Profil aktif tetap `PROVISIONAL`; status PASS tidak berarti ambang
tersebut telah divalidasi sebagai ambang bencana final.

## Capability matrix

| Capability                                                      | Hasil | Evidence                                                                  |
| --------------------------------------------------------------- | ----- | ------------------------------------------------------------------------- |
| Immutable Site RiskProfile dan no-op canonical update           | PASS  | API integration, component test, Chromium version/no-op flow              |
| Pure risk evaluation SAFE/WATCH/DANGER/UNKNOWN                  | PASS  | Backend boundary unit test dan Chromium WATCH/DANGER flow                 |
| RiskAssessment terikat telemetry serta profile ID/version       | PASS  | API integration dan assessment-history UI                                 |
| Late telemetry historis tanpa memundurkan current state         | PASS  | Backend integration dan Chromium late-data flow                           |
| Exact duplicate tanpa assessment/alert occurrence tambahan      | PASS  | Backend integration dan Chromium duplicate check                          |
| WATCH dan DANGER Alert terpisah serta ACTIVE                    | PASS  | Backend deduplication test dan Chromium Alert list                        |
| Firmware/server mismatch setelah consecutive threshold          | PASS  | Backend unit/integration test                                             |
| ONLINE/DELAYED/OFFLINE dan disabled UNKNOWN                     | PASS  | Backend connectivity policy/integration test                              |
| Redis distributed lock, owner-only release, expiry, dan cleanup | PASS  | Backend unit test dan integration dengan Redis aktual                     |
| Monitoring Overview dengan filter, cursor, empty/error/loading  | PASS  | Frontend adapter/component test dan Chromium                              |
| Alert list/detail read-only                                     | PASS  | Frontend component/Chromium; tidak ada lifecycle mutation                 |
| RiskProfile owner update dan SCHOOL_ADMIN read-only             | PASS  | Component, API authorization, dan Chromium read-only flow                 |
| Organization header/isolation serta stale-response discard      | PASS  | API integration, adapter/component test, dan Chromium request observation |
| Credential dan browser-storage safety                           | PASS  | Chromium tanpa screenshot/trace/video, storage scan, dan static scan      |

## Risk dan telemetry evidence

- Dua current sample yang dibentuk dari active profile menghasilkan effective `WATCH`.
- Current sample di atas active DANGER threshold menghasilkan `DANGER`.
- UI menggunakan server risk dan menampilkan ikon serta label Bahasa Indonesia, bukan warna saja.
- Exact duplicate mempertahankan occurrence Alert.
- Late telemetry muncul sebagai `affectsCurrentState: false` dan berlabel **Data historis
  terlambat**, sementara Overview tetap pada current DANGER.
- `UNKNOWN` digunakan untuk data hilang, invalid, delayed/offline, Device disabled, atau profile
  unavailable; UI tidak menyimpulkan SAFE.

## Alert dan connectivity evidence

- Satu unresolved Alert per deduplication key dijamin oleh database dan transaction.
- WATCH, DANGER, connectivity, serta mismatch memakai type/dedup key berbeda.
- Alert Phase 03 hanya dibuat dan dibaca. Recovery tidak me-resolve Alert.
- DELAYED/OFFLINE boundary, direct OFFLINE transition, disabled Device, late recovery protection,
  scheduler idempotency, dan Redis lock dibuktikan oleh backend integration test aktual. Browser
  tidak menunggu freshness window dan tidak memiliki endpoint pemicu scheduler.

## Role dan isolation evidence

- `PROJECT_OWNER`: read Overview/Alert/history/profile dan membuat immutable profile version.
- `SCHOOL_ADMIN`: read capability yang sama tanpa profile mutation control.
- Backend tetap menjadi sumber authorization; UI menangani 403 tanpa memperluas hak.
- Perubahan organisasi membuang resource lama melalui keyed manager dan effect cancellation.
  Organization ID tidak disimpan pada localStorage atau sessionStorage.

## Verification counts

- API unit: 59 test.
- Web unit/component: 88 test.
- API integration: 111 test.
- Chromium: 10 test setelah penambahan full-acceptance dan SCHOOL_ADMIN read-only flow.
- OpenAPI: valid, termasuk enam example Phase 03.
- NestJS dan Next.js production build: lulus.
- Migration dari database kosong dan seed idempotency: lulus.

## Safety

Profil default masih `PROVISIONAL`. Pemberitahuan berikut ditampilkan di UI:

> Profil ini masih bersifat sementara dan belum boleh dianggap sebagai ambang bencana final sebelum
> melalui kalibrasi ahli dan pengujian lapangan.

Frontend tidak menyediakan perubahan `calibrationStatus`. PUT mempertahankan status aktif yang
diterima dari server.

## Known limitations

- Full Chromium suite dapat menunggu jendela `Retry-After` login sebelum acceptance Phase 03
  karena seluruh flow sengaja dijalankan serial dengan rate limiter produksi tetap aktif.
- Monitoring Overview Phase 03 bersifat operasional berbentuk card, belum menjadi dashboard
  visualization penuh.
- Tidak ada realtime refresh; pengguna memuat ulang atau berpindah route untuk mengambil state
  terbaru.

## Deferred

- Phase 04: KPI cards, risk donut, sensor trend chart, dan dashboard layout penuh.
- Phase 05: acknowledge, resolve, false-alarm, SSE, dan notification delivery.
- Phase berikutnya: map, report, heartbeat, remote siren, dan firmware command sesuai roadmap.
