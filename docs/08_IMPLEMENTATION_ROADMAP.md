# Implementation Roadmap

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

## Phase 6 — Map, documents, reports

Status: fase berikutnya; implementasi belum dimulai.

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

## Phase 7 — Hardening and deployment

Output:

- k6 tests.
- Backup scripts/runbook.
- Error tracking.
- Production Docker/deployment.
- Security review.
- UAT checklist.

Exit criteria:

- Restore backup diuji.
- Load test target tercapai.
- Incident simulations dilakukan.

## Work breakdown rule

Setiap fase dipecah menjadi task maksimal 0,5–2 hari. Codex harus berhenti setelah task yang diminta dan memberikan:

- Ringkasan perubahan.
- Daftar file.
- Perintah test.
- Risiko/known limitations.
- Langkah berikutnya yang direkomendasikan.
