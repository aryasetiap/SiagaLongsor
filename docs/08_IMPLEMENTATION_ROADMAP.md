# Implementation Roadmap

> **Scope reset R1 — authoritative direction.** Phase 0–6 completion records below are retained
> as historical implementation evidence only; they no longer define the final product. The old
> Phase 07 production-readiness sequence is paused/superseded for final release purposes. See
> [`docs/20_SCOPE_RESET_SINGLE_DEVICE.md`](20_SCOPE_RESET_SINGLE_DEVICE.md) for the authoritative
> one-device, four-page scope. R1 is completed by the documentation freeze; R2+ remain pending.

## Revised refactor roadmap

| ID  | Workstream                                            | Status    |
| --- | ----------------------------------------------------- | --------- |
| R1  | Scope Freeze                                          | completed |
| R2  | Minimal Backend                                       | pending   |
| R3  | Minimal Frontend                                      | pending   |
| R4  | Telemetry Simulator / integration contract validation | pending   |
| R5  | Remove obsolete product features                      | pending   |
| R6  | Infrastructure cleanup                                | pending   |
| R7  | Database/schema cleanup                               | pending   |
| R8  | Regression + acceptance                               | pending   |
| R9  | ESP32 firmware/integration                            | pending   |
| R10 | Final performance/UAT/release readiness               | pending   |

## Historical pre-scope-reset roadmap

Jangan mengerjakan semua fase sekaligus. Setiap fase harus memiliki pull request/commit yang dapat ditinjau.

## Phase 0 — Repository and decisions — selesai

Output:

- Monorepo structure.
- README setup.
- pnpm workspace.
- lint, format, typecheck.
- ADR untuk SSE, HTTPS ingestion, dan multi-device model.
- CI dasar.

Exit criteria:

- `pnpm lint`, `pnpm typecheck`, dan test kosong berhasil.

Status: selesai dan telah digabung ke `main`.

## Phase 1 — Foundation — selesai

Output:

- NestJS API.
- Next.js web.
- PostgreSQL + Prisma.
- Redis.
- Authentication.
- Role `PROJECT_OWNER` dan `SCHOOL_ADMIN`.
- Organization/site seed.
- Docker Compose development dependencies.

Exit criteria:

- Login berhasil.
- RBAC backend diuji.
- Migration dan seed dapat dijalankan dari kosong.

Status: selesai dan telah digabung ke `main`.

## Phase 2 — Device management and ingestion — selesai

Output:

- Monitoring point CRUD.
- Device register/disable.
- Credential create/rotate.
- Telemetry endpoint.
- JSON validation.
- Idempotency.
- Device simulator CLI.

Exit criteria:

- Satu device simulator dapat mengirim data.
- Retry payload sama tidak membuat row baru.
- Credential invalid ditolak.

### Parallel workstream

- **Shared/contract**: permission matrix, error envelope, pagination, MonitoringPoint contract,
  Device/credential contract, telemetry authentication/idempotency contract, typed mock
  agreement, dan acceptance criteria.
- **Backend**: Prisma model dan migration, MonitoringPoint/Device endpoint, credential hashing dan
  rotation, telemetry authentication/validation/idempotency, raw payload, rate limiting,
  simulator CLI, dan integration test.
- **Frontend**: MonitoringPoint dan Device management UI, one-time credential display,
  rotate/disable confirmation, loading/error/empty states, role visibility, typed contract mocks,
  component test, dan Chromium browser test.

### Integration checkpoints

| Checkpoint | Output                                                                      |
| ---------- | --------------------------------------------------------------------------- |
| C1         | Shared permission matrix, error envelope, dan pagination disetujui          |
| C2a        | MonitoringPoint contract disetujui                                          |
| C2b        | Device dan one-time credential contract disetujui                           |
| C2c        | Telemetry authentication dan idempotency contract disetujui                 |
| A          | MonitoringPoint API dan frontend terintegrasi                               |
| B          | Device/credential API dan frontend terintegrasi                             |
| C3         | Full contract validation, API integration, dan Chromium browser smoke lulus |

### Keputusan batas Phase 2

- Authorization tetap organization-scoped; `siteId` hanya resource relation dan filter.
- Device authentication diarahkan ke `Authorization: Device <hardwareId>.<secret>`, dengan
  `hardwareId` sebagai identifier publik. Detail final masuk contract PR.
- Response Phase 2 tidak memiliki `serverRisk`; risk engine dimulai pada Phase 3.
- `POST /iot/heartbeat` ditunda dan hanya dibuat bila kebutuhan lapangan membuktikannya perlu.
- Generated OpenAPI types dan Playwright dibuat melalui PR tooling/testing terpisah.
- Risk engine, alert, dashboard KPI, sensor chart, SSE, map, reports, remote siren, firmware, dan
  heartbeat tetap di luar scope.

Status: seluruh contract, backend, frontend MonitoringPoint/Device, Site lookup, telemetry
ingestion, simulator, component/integration test, dan Chromium full acceptance telah selesai dan
digabung ke `main`. Bukti exit berada di `docs/14_PHASE_02_ACCEPTANCE_REPORT.md`.

## Phase 3 — Risk engine and alerts — selesai

Output:

- Versioned Site risk profile.
- Pure risk engine package.
- Risk assessment persistence.
- Current MonitoringPoint risk/connectivity projection.
- Alert generation, deduplication, and read API.
- Monitoring overview and assessment history read API.
- Offline/delayed scheduler.
- Unit/integration tests.

Exit criteria:

- Boundary test lengkap lulus.
- Offline tidak pernah SAFE.
- Late/duplicate telemetry tidak mengubah current state atau alert.
- Profile history dan assessment version binding tersimpan.
- Alert generation/deduplication tersimpan; lifecycle mutation tetap Phase 05.

Status: contract, backend, operational frontend, migration dari database kosong, pure-engine
boundary test, integration/scheduler test, dan Chromium full acceptance telah selesai. Bukti exit
berada di [`docs/15_PHASE_03_ACCEPTANCE_REPORT.md`](15_PHASE_03_ACCEPTANCE_REPORT.md).

Contract checkpoints:

| Checkpoint | Output                                                                               |
| ---------- | ------------------------------------------------------------------------------------ |
| R1         | Risk level, technical ranges, freshness, hysteresis, dan immutable profile disetujui |
| R2         | Assessment/current-state semantics serta late/duplicate behavior disetujui           |
| A1         | Alert type, severity, deduplication, dan scheduler contract disetujui                |
| A2         | Overview, assessment history, dan alert read API disetujui                           |
| I3         | Backend implementation serta full Phase 03 acceptance lulus                          |

## Phase 4 — Dashboard UI — selesai

Output:

- Layout mengikuti referensi.
- KPI cards.
- Monitoring table.
- Risk donut.
- Sensor chart.
- Recent alerts.
- Responsive UI.
- Loading/error/empty states.
- Authoritative dashboard summary API.
- MonitoringPoint sensor-series API dengan signed cursor dan late-data semantics.

Exit criteria:

- UI dapat menggunakan seed dan data simulator.
- Mobile basic usability lolos.
- KPI/risk/connectivity aggregate memenuhi invariant organization/Site scope.
- Sensor chart tidak menginterpolasi gap atau mengubah null/no-data menjadi nol.
- PROJECT_OWNER dan SCHOOL_ADMIN read path, organization isolation, dan Chromium acceptance lulus.

Status: contract, backend dashboard-data, frontend responsive, component test, API integration,
Chromium full acceptance, dan repository exit gate telah PASS. Root formatting sekarang
reproducible melalui kebijakan LF repository. Bukti berada di
[`docs/16_PHASE_04_ACCEPTANCE_REPORT.md`](16_PHASE_04_ACCEPTANCE_REPORT.md).

## Phase 5 — Alert operations and realtime — selesai

Output:

- SSE stream.
- Acknowledge dialog.
- Resolve/false alarm.
- SOP quick access.
- Audit log UI untuk Project Owner.

Exit criteria:

- Event realtime muncul.
- Reconnect melakukan refetch.
- Permission aksi diuji.
- Lifecycle mutation idempotent, atomic, audited, dan aman pada request paralel.
- `SCHOOL_ADMIN` hanya acknowledge; resolve/false alarm/audit tetap `PROJECT_OWNER`.
- SSE multi-instance mengirim notifikasi setelah commit dan REST tetap authoritative.

Workstream:

| ID    | Task                                                                    | Status  |
| ----- | ----------------------------------------------------------------------- | ------- |
| P5-01 | Contract lifecycle, event history, audit projection, SSE, dan UI states | selesai |
| P5-02 | Backend schema/migration serta alert lifecycle service/API              | selesai |
| P5-03 | Redis Pub/Sub SSE gateway dan resilience                                | selesai |
| P5-04 | Frontend operations, audit UI, realtime, dan full acceptance            | selesai |

Status: contract, lifecycle/audit backend, Redis Pub/Sub SSE backend, frontend operations,
component/integration test, dan Chromium full acceptance telah PASS. REST tetap authoritative;
SSE berfungsi sebagai invalidation signal dengan reconnect/refetch. SOP quick access menampilkan
batas unavailable secara jujur; upload/persistence SOP tetap Phase 06. Bukti berada di
[`docs/17_PHASE_05_ACCEPTANCE_REPORT.md`](17_PHASE_05_ACCEPTANCE_REPORT.md).

## Phase 6 — Map, documents, reports — selesai

Status: selesai. Evidence final berada di [`docs/18_PHASE_06_ACCEPTANCE_REPORT.md`](18_PHASE_06_ACCEPTANCE_REPORT.md).

Output:

- Map marker.
- Risk zone polygon.
- Evacuation route.
- SOP upload.
- CSV export.
- PDF report job.

Exit criteria:

- Map memiliki fallback.
- File upload aman.
- Report dapat dibuat ulang.

Workstream:

| ID    | Task                                                         | Status  |
| ----- | ------------------------------------------------------------ | ------- |
| P6-01 | Contract map, SOP documents, CSV export, dan PDF report jobs | selesai |
| P6-02 | Backend persistence, object storage, worker, dan API         | selesai |
| P6-03 | Frontend map, SOP, export, dan report job UI                 | selesai |
| P6-04 | Security, browser, integration, dan full acceptance          | selesai |

Phase 05 tetap selesai dan menjadi baseline lifecycle/realtime. Phase 06 tidak mengubah risk
engine, current-state semantics, alert lifecycle, atau Phase 05 SSE contract.

## Phase 7 — Hardening and deployment — historical contract paused

Phase 07 belum selesai dan belum memiliki bukti implementasi production-readiness. P7-01 sedang
aktif untuk membekukan kontrak dan acceptance criteria; workstream lain tetap pending. Kontrak
authoritative berada di
[`docs/19_PHASE_07_PRODUCTION_READINESS_CONTRACT.md`](19_PHASE_07_PRODUCTION_READINESS_CONTRACT.md).

| ID    | Task                                                | Status  |
| ----- | --------------------------------------------------- | ------- |
| P7-01 | Production-readiness contract + acceptance criteria | aktif   |
| P7-02 | k6 performance/load testing                         | pending |
| P7-03 | Backup + restore + operational runbook              | pending |
| P7-04 | Production deployment + error tracking              | pending |
| P7-05 | Security review + incident simulations              | pending |
| P7-06 | UAT + full acceptance + release decision            | pending |

Planned output (belum diimplementasikan):

- k6 tests.
- Backup scripts/runbook.
- Error tracking.
- Production Docker/deployment.
- Security review.
- UAT checklist.

Phase 07 exit criteria yang dibekukan:

- Restore backup diuji pada environment terisolasi.
- Target load-test engineering tercapai pada environment yang dicatat.
- Incident simulations aman dilakukan dan memiliki evidence.

## Work breakdown rule

Setiap fase dipecah menjadi task maksimal 0,5–2 hari. Codex harus berhenti setelah task yang diminta dan memberikan:

- Ringkasan perubahan.
- Daftar file.
- Perintah test.
- Risiko/known limitations.
- Langkah berikutnya yang direkomendasikan.
