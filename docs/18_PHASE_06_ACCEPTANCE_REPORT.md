# Phase 06 acceptance report

Status akhir: **PASS/COMPLETE**. Phase 06 mencakup Map, SOP documents, telemetry CSV, dan PDF
report jobs. Kontrak authoritative tetap [`specs/openapi.yaml`](../specs/openapi.yaml); 72 kriteria
yang tidak diubah berada di [`docs/09_TEST_ACCEPTANCE_PLAN.md`](09_TEST_ACCEPTANCE_PLAN.md).

## Scope dan capability

P6-01 membekukan contract. P6-02 menyediakan map configuration immutable/versioned, isolasi
organisasi, WGS84 `[longitude, latitude]`, SOP PDF privat/versioned, SHA-256, dan unduhan API
autentikasi. P6-03 menyediakan CSV RFC 4180 dengan neutralisasi formula, `[from,to)` maksimal 31
hari, dan job `SITE_PERIOD_SUMMARY_PDF` durable (`QUEUED`, `PROCESSING`, `SUCCEEDED`, `FAILED`,
`EXPIRED`) dengan retry BullMQ terbatas. P6-04 menyediakan UI Map/SOP/Reports, fallback tekstual
accessible, Blob download autentikasi, polling report sekitar tiga detik dengan bounded transient
backoff, dan flow kedua role.

## Environment dan evidence

Acceptance menggunakan PostgreSQL, Redis, dan MinIO privat nyata. Database bersih menerapkan **10
migrations** lalu seed dua kali secara idempoten. Gate final: API unit **153/153**, web
unit/component **165/165**, integration **13 files, 172/172 tests**, dan Phase 06 Chromium **6/6
tests**. Integration bersih lulus **5/5** run dan Chromium bersih lulus **5/5** run.

## Role, privacy, dan semantics

Kedua role memiliki read/export/create-report flow; hanya Owner memutasi map dan mengunggah SOP.
Endpoint memakai bearer dan `X-Organization-Id`; cross-organization tidak membocorkan data.
Unduhan SOP/CSV/PDF memakai API autentikasi dan temporary Blob URL yang direvoke. Tidak ada token di
URL/browser storage, direct browser access ke object storage privat, public URL, object key,
credential, bytes file, raw telemetry, atau provider internal yang diekspos.

PDF menyatakan **“Status saat laporan dibuat”** dan bukan keputusan darurat, prediksi, atau
rekonstruksi current-state historis.

## Pemetaan 72 kriteria

| Kriteria | Status | Evidence utama |
| --- | --- | --- |
| 1–3 | PASS | OpenAPI, authorization/isolation integration, Chromium role flow |
| 4–13 | PASS | map service unit/integration, concurrency, Owner Chromium |
| 14–20 | PASS | DTO/GeoJSON validation unit dan integration |
| 21–30 | PASS | overview integration, component fallback/accessibility, Chromium |
| 31–50 | PASS | SOP integration/component/Chromium dan MinIO privat |
| 51–59 | PASS | CSV unit/integration/component download |
| 60–70 | PASS | report job/worker/integration/component/Chromium |
| 71 | PASS | PDF contract/integration dan Reports UI |
| 72 | PASS | polling cancellation component dan Chromium security/accessibility |

Rentang di atas memetakan setiap nomor secara berurutan ke daftar 72 kriteria yang tetap utuh;
tidak ada kriteria yang dilemahkan atau dihilangkan.

## Acceptance-harness hardening

1. Test organization switch Reports menunggu nilai Site authoritative, bukan hanya select tersedia.
2. Integration E2E diserialkan karena connectivity evaluation global memindai enabled current state;
   file paralel yang berbagi DB dapat mengganggu fixture.
3. API server Playwright menaikkan `AUTH_LOGIN_RATE_LIMIT_MAX` hanya untuk login legitimate suite
   browser serial; login rate limiting tetap dicakup integration API.

## Limitasi dan out-of-scope

Tidak ada klaim full GIS topology validation, malware-free PDF guarantees, AI hazard prediction,
dynamic risk-zone generation, automatic evacuation routing, public object-storage URLs, report
realtime/SSE, atau remote siren. Zona dan rute adalah konfigurasi manual statis.

## Conclusion

Phase 06 selesai: flow Map, SOP, CSV, dan report job memenuhi kontrak beku dengan evidence database,
integration, component, dan Chromium yang dapat direproduksi.
