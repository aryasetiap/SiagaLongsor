# Phase 05 Acceptance Report

Tanggal verifikasi: 1 Agustus 2026

Commit basis: `9d2207cee41d4e81e46e7fb25145e968a7c5265d`

Environment: Windows development host, Node.js 24, pnpm 10.34.5, PostgreSQL 16, Redis 7,
Chromium Playwright, NestJS API, dan Next.js web.

## Keputusan

**Phase 05 capability acceptance: PASS**

**Phase 05 repository exit gate: PASS**

Contract P5-01, lifecycle/audit backend P5-02, Redis Pub/Sub SSE backend P5-03, serta frontend dan
full acceptance P5-04 telah memenuhi exit criteria. REST tetap menjadi sumber authoritative; SSE
hanya menjadi invalidation signal dan tidak menerapkan transisi domain langsung pada browser.

## Workstream matrix

| Workstream | Hasil | Evidence |
| ---------- | ----- | -------- |
| P5-01 contract | PASS | OpenAPI validator, examples, dan contract documentation existing |
| P5-02 lifecycle/audit backend | PASS | API integration permission, state, idempotency, atomicity, audit, dan concurrency |
| P5-03 SSE/Redis backend | PASS | Integration stream auth, publish-after-commit, watchdog, multi-instance, dan resilience |
| P5-04 frontend/full acceptance | PASS | 134 web unit/component test serta 2 Chromium serial acceptance test |

## Lifecycle dan durable idempotency evidence

- PROJECT_OWNER menjalankan `ACTIVE → ACKNOWLEDGED → RESOLVED` melalui dialog non-one-click.
- PROJECT_OWNER menandai Alert `ACTIVE` lain sebagai `FALSE_ALARM`; observation berikutnya membuat
  instance `ACTIVE` baru sesuai deduplication backend.
- SCHOOL_ADMIN dapat acknowledge `ACTIVE`, tetapi tidak melihat resolve/false-alarm controls.
- Setiap dialog membuat satu UUID `actionId`. Retry network memakai ID yang sama; header
  `Idempotency-Key` selalu sama dengan body `actionId`.
- `ALERT_STATE_CONFLICT` dan `IDEMPOTENCY_CONFLICT` tidak membuat ID baru atau optimistic domain
  transition; UI menutup stale flow dan meminta REST state terbaru.
- Backend integration membuktikan one-winner concurrency, immutable AlertEvent, atomic AuditLog,
  terminal-state protection, serta retry identik tanpa event ganda.

## AlertEvent dan Audit Log evidence

- Detail menampilkan identity, severity, status, reasons, point, waktu, occurrence count, dan
  history newest-first dengan cursor tanpa `totalCount`.
- History hanya memproyeksikan actor, note, field condition, SOP flag, resolution note, dan false
  alarm reason; arbitrary metadata tidak dirender.
- Audit Log route dan navigation hanya tersedia bagi PROJECT_OWNER. Filter event/entity/entity ID/
  actor/from/to, reset, loading/error/empty state, dan cursor pagination diuji.
- SCHOOL_ADMIN direct navigation mendapat not-allowed state dan tidak mengambil data audit.
- IP address, user agent, Authorization, token, credential, raw request, dan raw telemetry tidak
  ditampilkan.

## SSE, auth lifecycle, dan recovery

- Client memakai `fetch` + `ReadableStream` + `AbortController`, bukan native `EventSource`.
- Request stream membawa bearer access token memory-only dan `X-Organization-Id`; URL/query tidak
  memuat token.
- Parser menangani arbitrary chunks, CRLF, `id`, `event`, multiline `data`, blank dispatch, dan
  keepalive comment. Event malformed/unknown diabaikan tanpa mutasi state.
- Status UI adalah CONNECTING, CONNECTED, dan DEGRADED. Putus stream tidak disamakan dengan Device
  offline dan tidak menghapus data REST yang sudah tersedia.
- Backoff 1/2/5/10/30 detik dengan jitter 80–120%; timer dan stream dibatalkan saat logout,
  organization switch, atau unmount.
- 401 saat membuka ulang stream memakai rotating refresh flow existing melalui HttpOnly cookie;
  access token baru tetap memory-only.
- Reconnect melakukan coalesced authoritative REST refetch. Chromium memutus stream dengan
  `window.stop()`, melihat DEGRADED dengan data tetap tampil, kemudian melihat CONNECTED kembali.
- Generation guard mencegah event/refetch organisasi lama memengaruhi organisasi baru.

## Realtime invalidation dan request control

- Alert create/observe/lifecycle serta MonitoringPoint state dipetakan ke kategori alerts,
  monitoring, dashboard, dan selected Alert/events.
- Coalescing 150 ms membatasi burst menjadi paling banyak satu refetch per kategori.
- Dashboard Summary, Monitoring Overview, Recent Alerts, Alert list/detail/history terintegrasi
  tanpa menambah polling. Manual refresh tetap tersedia.
- Redis publish bersifat after-commit; kegagalan publish tidak me-rollback transaksi domain.

## SOP, responsive, dan accessibility

- Critical Alert dan acknowledge dialog menyediakan `Buka SOP`.
- Karena persistence dokumen belum ada, copy yang ditampilkan persis: “SOP resmi belum tersedia
  pada sistem”. Tidak ada instruksi darurat, link palsu, atau SOP fabrikasi.
- Dialog memakai label terkait, focus awal, Escape/cancel, validation live, disabled loading state,
  viewport-bounded scroll, serta action layout yang tetap terjangkau di mobile.
- Status menggunakan ikon dan teks, bukan warna saja. Realtime indicator memakai `aria-live` tanpa
  alarm visual berlebihan.

## Verification evidence

- Web unit/component: 134 test, 17 file.
- API unit: 101 test, 13 file.
- API integration: 148 test, 11 file; lima full run berturut-turut PASS.
- Realtime frontend targeted: 20 run berturut-turut PASS.
- Chromium Phase 05: 2 serial test PASS (PROJECT_OWNER dan SCHOOL_ADMIN).
- Chromium repository penuh: 14 test PASS dari database `siagalongsor_e2e` yang dimigrasikan dari
  nol dan di-seed dua kali secara idempotent.
- Migration deploy PASS; schema Prisma valid; seed dua kali menghasilkan count identik.
- Production NestJS/Next.js build, root lint/typecheck/test, OpenAPI validation, dan formatting gate
  diverifikasi pada repository exit gate.
- Tidak ditemukan HTTP 500 atau PostgreSQL `SQLSTATE 40P01` dalam acceptance/repeated integration.

## Security dan artifact evidence

- Access token hanya berada di memory; refresh token tetap HttpOnly backend cookie.
- Tidak ada token query, native EventSource, localStorage token, sessionStorage token, atau
  JavaScript auth cookie.
- Device credential hanya berada di variable memory test lalu referensinya dibuang.
- Phase 05 Chromium menetapkan screenshot, trace, dan video `off`; tidak membuat attachment.
- Browser request scan tidak menemukan missing organization header pada endpoint scoped.
- Scope dan secret scan tidak menemukan secret nyata atau perubahan backend/schema/contract/
  dependency.

## Known limitations

- Redis Pub/Sub bersifat best-effort tanpa durable replay atau exactly-once SSE.
- REST tetap authoritative; reconnect harus refetch karena event yang terlewat tidak direplay.
- Slow SSE client diputus alih-alih diberi buffer tanpa batas.
- Deteksi membership revocation dibatasi interval watchdog backend.
- Penyimpanan SOP authoritative baru tersedia pada Phase 06.
- Belum ada provider notifikasi eksternal.
- k6 ingestion/dashboard/realtime tetap deferred ke hardening phase.

## Deferred Phase 06+

- SOP document persistence/upload, map, evacuation route, report/export, dan notification provider.
- Heartbeat, remote siren, firmware command, AI prediction, serta capability di luar roadmap MVP.
