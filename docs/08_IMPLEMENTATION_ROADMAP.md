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

## Phase 2 — Device management and ingestion — coordination/contract planning

Implementasi belum dimulai. Backend dan frontend baru mulai bekerja paralel setelah contract
checkpoint terkait disepakati dan digabung.

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

## Phase 3 — Risk engine and alerts

Output:

- Threshold profile.
- Pure risk engine package.
- Risk assessment persistence.
- Alert engine and deduplication.
- Offline/delayed scheduler.
- Unit/integration tests.

Exit criteria:

- Boundary test lengkap lulus.
- Offline tidak pernah SAFE.
- Alert lifecycle tersimpan.

## Phase 4 — Dashboard UI

Output:

- Layout mengikuti referensi.
- KPI cards.
- Monitoring table.
- Risk donut.
- Sensor chart.
- Recent alerts.
- Responsive UI.
- Loading/error/empty states.

Exit criteria:

- UI dapat menggunakan seed dan data simulator.
- Mobile basic usability lolos.

## Phase 5 — Alert operations and realtime

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

## Phase 6 — Map, documents, reports

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
