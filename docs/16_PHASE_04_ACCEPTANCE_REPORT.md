# Phase 04 Acceptance Report

Tanggal verifikasi: 1 Agustus 2026  
Commit basis: `d5b88ea`  
Environment: Windows development host, Node.js 24, pnpm 10.34.5, PostgreSQL 16, Redis 7,
Chromium Playwright, NestJS API, dan Next.js web.

## Keputusan

**FAIL — capability acceptance lulus, tetapi repository verification gate belum hijau.**

Dashboard data backend dan UI responsive telah diuji sebagai satu alur aktual dan seluruh test
lulus. Namun, `format:check` repository gagal pada sembilan file backend Dashboard yang identik
dengan commit basis dan tidak boleh diubah dalam scope frontend ini. Phase exit tidak dinyatakan
selesai sampai defect format tersebut diperbaiki melalui perubahan backend terpisah. Hasil
capability tidak mengubah risk profile `PROVISIONAL` menjadi threshold bencana yang sudah
terkalibrasi.

## Capability matrix

| Capability                                         | Hasil | Evidence                                                               |
| -------------------------------------------------- | ----- | ---------------------------------------------------------------------- |
| Dashboard Summary organization/Site/window scoped  | PASS  | API integration, adapter/component test, Chromium response observation |
| Empat KPI hanya memakai Summary API                | PASS  | Component test dan nilai UI dibanding response aktual Chromium         |
| Risk Distribution dan connectivity summary         | PASS  | Accessible SVG, legend tekstual, zero state, component/Chromium        |
| Monitoring Overview filter/sort/cursor/selection   | PASS  | Adapter/component test dan unique-point Chromium flow                  |
| Sensor Series range/cursor/includeLate             | PASS  | API integration, adapter/component test, Chromium network observation  |
| Oldest-first, gap, late marker, null/no-data       | PASS  | Backend integration, SVG/component test, Chromium series response      |
| Recent Alerts read-only dan detail                 | PASS  | Component dan Chromium DANGER Alert flow                               |
| Partial panel failure dan stale-response isolation | PASS  | Component regression test                                              |
| PROJECT_OWNER dan SCHOOL_ADMIN read behavior       | PASS  | API authorization dan Chromium serial flow                             |
| Desktop/tablet/mobile basic usability              | PASS  | Chromium viewport 1440×900, 900×1000, dan 390×844                      |
| Accessibility dan non-color status                 | PASS  | Semantic/component assertions dan browser role queries                 |
| Secret, storage, dan Playwright artifact safety    | PASS  | Static scan dan Chromium in-memory credential checks                   |

## Dashboard Summary dan KPI evidence

- `monitoringPoints.active`, `alerts.activeCritical`, `connectivityDistribution.offline`, dan
  `alerts.newInWindow` dirender langsung dari satu response Summary.
- Chromium membandingkan label/nilai ke response aktual serta memastikan penambahan titik unik
  menaikkan aggregate terhadap baseline.
- `active + inactive = total`, risk buckets, connectivity buckets, disabled Device semantics,
  first-observed Alert window, snapshot consistency, dan organization isolation dibuktikan oleh
  122 API integration test.
- Tidak ada `totalCount`, delta periode, atau tren KPI yang difabrikasi.

## Risk, monitoring, dan sensor evidence

- Dua current telemetry menghasilkan WATCH sesuai active profile; telemetry berikutnya menghasilkan
  DANGER dan Alert CRITICAL.
- Monitoring Overview menampilkan point unik, Site, Device, server risk, connectivity, sensor,
  waktu, Alert, history action, dan selection untuk grafik.
- Sensor Series default mengecualikan late telemetry. Toggle `includeLate` memunculkannya sebagai
  wajik berlabel, bukan hanya warna.
- Response aktual diverifikasi oldest-first. Interval 10 menit lalu 40 menit menghasilkan gap
  visual tanpa garis interpolasi lintas gap.
- Nilai nullable tetap `null`; chart tidak mengubah null/no telemetry menjadi angka nol. Summary
  tekstual memuat jumlah point, minimum, maksimum, waktu awal/akhir, late count, dan gap count.
- Historical Device telemetry, range `[from,to)`, signed cursor context, dan concurrency konsisten
  dengan test backend existing.

## Recent Alerts, role, dan isolation evidence

- Recent Alerts memakai Site global, urutan `lastObservedAt:desc`, limit kecil, occurrence count,
  status/severity, dan detail read-only.
- Tidak tersedia acknowledge, resolve, atau false-alarm pada Phase 04.
- PROJECT_OWNER menjalankan setup data aktual dan seluruh dashboard. SCHOOL_ADMIN membaca KPI,
  Monitoring Overview, Sensor Trend, dan Alerts tanpa mutation.
- Semua request organization-scoped yang diamati membawa `X-Organization-Id`; response lama
  diabaikan saat scope berubah dan selected point hanya berada dalam React state.

## Responsive dan accessibility evidence

- KPI menjadi empat kolom pada desktop, 2×2 pada tablet, dan stack pada mobile.
- Monitoring table menggunakan header semantik serta horizontal overflow untuk viewport sempit.
- Chart memiliki `role="img"`, accessible name, textual summary, marker late berbentuk wajik, dan
  gap berlabel.
- DANGER dan Alert CRITICAL tetap berupa teks/ikon pada desktop, tablet, dan mobile.
- Heading, label control, keyboard-reachable buttons, focus ring, `aria-live`, skeleton non-data,
  dan reduced-motion mengikuti fondasi UI existing.

## Verification counts

- API unit: 68 test, 9 file.
- Web unit/component: 99 test, 13 file.
- API integration: 122 test, 9 file; tiga full run berturut-turut lulus.
- Chromium: 12 test termasuk 2 serial Phase 04 acceptance test.
- Prisma: 6 migration terpasang; schema valid; seed dua kali idempotent.
- OpenAPI, NestJS production build, dan Next.js production build: lulus.
- Tidak ditemukan PostgreSQL `SQLSTATE 40P01` dalam tiga integration run.
- `format:check`: gagal hanya pada sembilan file `apps/api/src/dashboard/**`/`app.module.ts` dari
  commit basis; hash working tree sama dengan `HEAD`. Seluruh changed file Phase 04 sesuai Prettier.

## Security dan artifact evidence

- Device secret hanya disimpan pada variable memory test lalu referensinya dibuang.
- Phase 04 flow menetapkan screenshot, trace, dan video `off`; tidak membuat attachment.
- UI, URL, JavaScript cookie, localStorage, dan sessionStorage tidak memuat secret atau token.
- Tipe UI tidak memuat raw payload, credential hash, atau Authorization.
- Static scan tidak menemukan secret nyata pada changed files.

## Known limitations

- Late marker saat ini bergantung pada `RiskAssessment.affectsCurrentState`.
- Site operasional harus memiliki active risk profile.
- Ingestion-level late persistence independen tetap menjadi follow-up sebelum production.
- Dashboard menggunakan refresh manual; realtime SSE memang deferred ke Phase 05.
- k6 ingestion dan dashboard tetap wajib sebelum production.

## Deferred Phase 05+

- Alert acknowledge, resolve, false-alarm, notification delivery, dan SSE.
- Map, evacuation, reporting, heartbeat, remote siren, serta firmware command.
