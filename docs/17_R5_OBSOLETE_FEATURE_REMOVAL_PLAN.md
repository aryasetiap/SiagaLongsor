# R5 Obsolete Feature Removal Plan

## 1. Final retained product surface

The R1–R4 product surface is the administrator dashboard for one deployed device:

- `Overview` — `GET /api/v1/overview`
- `Perangkat` — `GET /api/v1/device`
- `Profil Risiko` — `GET/PUT /api/v1/risk-profile`
- `Audit Log` — `GET /api/v1/audit-log`

Supporting APIs remain authentication, health, device telemetry ingestion, and provisioning support. R5 removes obsolete product presentation in replacement-before-deletion batches; it does not remove internal deployment context or safety-critical persistence.

## 2. Dependency map

| Feature                                  | Frontend                                                                                                  | Backend/API                                                                  | DB models                            | Infra                           | R5 classification                                                         | Evidence                                                                                                                                                                                       |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------ | ------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monitoring / MonitoringPoint UI          | `apps/web/src/app/monitoring-points`, `apps/web/src/monitoring-points`, `monitoring-points.smoke.spec.ts` | `apps/api/src/monitoring-points`                                             | `MonitoringPoint`                    | PostgreSQL                      | REMOVE_IN_R5 (UI); KEEP_FOR_R5 (context/API)                              | R3 primary navigation no longer links it; `SingleDeviceService` resolves `device.monitoringPointId`; provisioning tests use the API.                                                           |
| Alerts / Peringatan UI/API               | `apps/web/src/app/alerts`, `apps/web/src/risk/alerts-manager.tsx`, alert operation components             | `apps/api/src/alerts`, `RiskEvaluationService`                               | `Alert`, `AlertEvent`                | Realtime post-commit            | REQUIRES_INVESTIGATION                                                    | `risk-evaluation.service.ts` injects `AlertObservationService` and calls `observe()` for every assessed telemetry result. Cannot delete in R5 without first replacing that runtime dependency. |
| Map / evacuation                         | `apps/web/src/app/map`, `apps/web/src/map`                                                                | `apps/api/src/map-sop/map-configuration.service.ts`, `map-sop.controller.ts` | map configuration fields/models      | object storage where applicable | REMOVE_IN_R5 (UI); DEFER_TO_R6/R7 (storage/schema)                        | No imports from `single-device`; OpenAPI paths are `/sites/{siteId}/map-config`.                                                                                                               |
| SOP documents                            | map quick access and SOP components under `apps/web/src/map`                                              | `apps/api/src/map-sop/sop.service.ts`                                        | SOP/version fields                   | object storage                  | REMOVE_IN_R5 (UI/API candidate); DEFER_TO_R6/R7 (storage/schema)          | Upload/download uses `ObjectStorage`; removal must follow dependency and retention review.                                                                                                     |
| Reports CSV/PDF                          | `apps/web/src/app/reports`, `apps/web/src/reports`                                                        | `apps/api/src/reports`                                                       | report jobs/artifacts                | BullMQ, object storage          | REMOVE_IN_R5 (UI/API candidate); DEFER_TO_R6/R7 (jobs/schema/storage)     | `ReportsModule` owns queues and artifacts; no single-device import uses it.                                                                                                                    |
| Legacy Dashboard                         | `apps/web/src/dashboard`, old `/overview` implementation history                                          | `apps/api/src/dashboard`                                                     | dashboard reads existing models      | realtime invalidation           | REMOVE_IN_R5                                                              | R3 `/overview` uses `single-device/panels.tsx`; dashboard code still imports organization APIs and realtime context.                                                                           |
| Realtime/SSE presentation                | `apps/web/src/realtime`, old dashboard consumers                                                          | `apps/api/src/realtime`, `RealtimeModule`                                    | none directly                        | Redis/SSE                       | REMOVE_IN_R5 (presentation); DEFER_TO_R6 (plumbing)                       | R3 shell has no `RealtimeIndicator`; risk/alerts still publish descriptors and `RiskModule` imports `RealtimeModule`.                                                                          |
| Generic Audit Log UI                     | `apps/web/src/audit/audit-log-manager.tsx`, `audit-api.ts`, `audit-contracts.ts`                          | `audit-logs.controller.ts/service.ts`                                        | `AuditLog`                           | none                            | REMOVE_IN_R5 (UI); KEEP_FOR_R5 (model/service pending migration)          | R3 audit page uses typed single-device endpoint; `RISK_STATUS_CHANGED` still depends on `AuditLog`.                                                                                            |
| Site/organization selectors/presentation | `apps/web/src/organization`, legacy site selectors                                                        | authorization/site/org controllers                                           | `Organization`, `Membership`, `Site` | none                            | REMOVE_IN_R5 (obsolete presentation); KEEP_FOR_R5 (resolver/auth/context) | New endpoints derive context from principal; `SingleDeviceService` traverses Device → Site → active RiskProfile; auth still uses Membership.                                                   |
| Device management UI                     | `apps/web/src/devices`, old register/detail dialogs                                                       | `apps/api/src/devices`                                                       | `Device`, credential fields          | none                            | REMOVE_IN_R5 (UI); KEEP_FOR_R5 (provisioning/R9 API)                      | R3 `/devices` is diagnostics-only; `DeviceCredentialService` is used by R4 fixtures and is needed before firmware/R9.                                                                          |

## 3. Endpoint disposition

| Endpoint group                                                     | Classification                           | Reason                                                                | Target phase                           |
| ------------------------------------------------------------------ | ---------------------------------------- | --------------------------------------------------------------------- | -------------------------------------- |
| `/api/v1/auth/login`, `/auth/me`, `/health`                        | FINAL_API                                | Administrator authentication and health                               | Keep                                   |
| `/api/v1/iot/telemetry`                                            | FINAL_API                                | Canonical device ingestion boundary                                   | Keep                                   |
| `/api/v1/overview`, `/device`, `/risk-profile`, `/audit-log`       | FINAL_API                                | Four R3 pages and authoritative risk/audit                            | Keep                                   |
| `/api/v1/devices` registration, rotation, disable; `/devices/{id}` | PROVISIONING_SUPPORT                     | Needed for controlled setup and future R9, not product navigation     | Keep temporarily; reassess R9          |
| `/api/v1/sites`, `/monitoring-points`                              | PROVISIONING_SUPPORT                     | Internal placement and controlled provisioning; legacy UI is obsolete | Keep API temporarily                   |
| `/api/v1/alerts`, alert lifecycle/events                           | REQUIRES_INVESTIGATION                   | Runtime risk evaluation currently creates observations                | R5 dependency replacement first        |
| `/api/v1/dashboard`, `/monitoring-overview`, legacy risk reads     | LEGACY_REMOVE_R5                         | Superseded by single-device facade                                    | R5-C/D after import audit              |
| `/api/v1/realtime/stream`                                          | INFRA/SCHEMA_DEFERRED                    | Product no longer requires SSE, but backend publishers remain coupled | R6 after decoupling                    |
| `/api/v1/map-config`, SOP, reports/report-jobs                     | LEGACY_REMOVE_R5 / INFRA/SCHEMA_DEFERRED | Removed product capabilities; storage/jobs need separate cleanup      | R5 API/UI, R6/R7 infrastructure/schema |

## 4. Frontend removal inventory

Candidate R5 UI/routes, after import and browser-test review:

- `apps/web/src/app/monitoring-points/page.tsx`
- `apps/web/src/monitoring-points/**`
- `apps/web/src/app/alerts/page.tsx`
- `apps/web/src/risk/alerts-manager.tsx`, `alert-operation-dialog.tsx`, `alert-event-history.tsx`, legacy monitoring overview components
- `apps/web/src/app/map/page.tsx`, `apps/web/src/map/**`
- `apps/web/src/app/reports/page.tsx`, `apps/web/src/reports/**`
- `apps/web/src/dashboard/**`
- `apps/web/src/realtime/**` and remaining old shell integration
- `apps/web/src/audit/audit-log-manager.tsx`, `audit-api.ts`, `audit-contracts.ts`
- `apps/web/src/organization/**` and site selector components once no legacy route imports remain
- `apps/web/src/devices/**` mutation dialogs/managers; retain or replace diagnostics-only code until provisioning ownership is decided

The R3 replacement under `apps/web/src/single-device/**` and the four app routes must not be removed.

## 5. Backend removal inventory

Potential R5 module/controller batches:

- `apps/api/src/dashboard/**` and legacy dashboard DTO/service/controller
- `apps/api/src/map-sop/**` controllers/services after object-storage references are isolated
- `apps/api/src/reports/**` controllers/services/queue workers after job consumers are removed
- legacy alert controllers/lifecycle UI-facing services only after `RiskEvaluationService` no longer requires `AlertObservationService`
- legacy risk-read and monitoring-overview controllers after endpoint consumers/tests are migrated
- legacy audit administration controller/service after typed transition endpoint has complete coverage
- legacy organization/site/monitoring-point controllers only after provisioning and internal-context callers are separated
- device mutation controller/service methods only after provisioning/R9 ownership is explicitly retained elsewhere

Keep `TelemetryModule`, `RiskEvaluationService`, `RiskEngine`, `SingleDeviceModule`, `DeviceCredentialService`, and persistence required by R1–R4.

## 6. Test disposition

| Tests                                                                                         | Disposition                                                                                                        |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `apps/web/e2e/phase-02.acceptance.spec.ts`, monitoring-points smoke                           | Replace with direct retained-route/provisioning coverage or move to internal provisioning tests.                   |
| `apps/web/e2e/phase-03.acceptance.spec.ts`, `apps/api/src/alerts/phase-03-alerts.e2e.spec.ts` | Remove product UI lifecycle assertions in R5; retain alert-observation tests only while runtime dependency exists. |
| `apps/web/e2e/phase-04.acceptance.spec.ts`, `apps/api/src/dashboard/**.spec.ts`               | Delete obsolete dashboard assertions; retain R3 single-device acceptance.                                          |
| `apps/web/e2e/phase-05.acceptance.spec.ts`, realtime e2e/specs                                | Remove product realtime/generic audit assertions; move infrastructure tests to R6 if plumbing remains.             |
| `apps/web/e2e/phase-06-map-sop.acceptance.spec.ts`, reports acceptance; API map/reports e2e   | Delete with corresponding product feature after storage/job dependency checks.                                     |
| `apps/api/src/single-device/*.e2e.spec.ts`, simulator e2e, telemetry/risk tests               | Retain as final contract/regression tests.                                                                         |
| Device/sites/monitoring-point API tests                                                       | Move to provisioning/internal coverage while APIs remain.                                                          |

## 7. Critical retained dependencies

- **Organization/Membership:** authentication principal and authorization scope still originate here. Removing them now would break administrator resolution.
- **Site:** active RiskProfile is site-scoped and `SingleDeviceService` reaches it through the deployed Device.
- **MonitoringPoint:** current state, telemetry association, audit entity, and historical series use its identity.
- **Device:** authenticated telemetry identity, current state, diagnostics, and single-device context.
- **DeviceCredentialService:** hashes and verifies device credentials; required for simulator and future R9 provisioning.
- **RiskProfile:** threshold source, versioning, auditability, deterministic evaluation.
- **CurrentMonitoringPointState:** authoritative current risk/connectivity/latest telemetry projection.
- **RiskAssessment:** immutable evaluation history and late-data semantics.
- **AuditLog:** immutable `RISK_STATUS_CHANGED` history and profile audit trail.

## 8. Alert/AlertEvent dependency analysis

Alerts are not currently removable as an isolated R5 change. `apps/api/src/risk/risk-evaluation.service.ts` imports `AlertObservationService` and `riskAlertTypes`; after each accepted telemetry evaluation it builds an assessment base and calls `this.alerts.observe(...)`. That service creates or updates `Alert` and `AlertEvent` records and can return realtime descriptors. `apps/api/src/risk/risk.module.ts` registers and exports the alert services, and `AlertLifecyclePostCommit` depends on realtime publication.

Therefore:

- `Alert` and `AlertEvent` are not required by the R3 public pages, but they are a hard runtime dependency of the current telemetry/risk path.
- Deleting alert tables or modules in R5 would either break ingestion or require a deliberate replacement seam that preserves risk evaluation and transition audit semantics.
- First prove, with focused tests, that the final path can evaluate telemetry and publish only `RISK_STATUS_CHANGED` without alert observation. Then remove alert controllers/UI and finally schema in R7.
- Do not delete `Alert`/`AlertEvent` in the first R5 batch.

## 9. R6 deferred infrastructure

- Redis modules and connections
- BullMQ/report queues and workers
- Realtime Redis publisher/subscriber, SSE controller, registry, and post-commit plumbing
- Object-storage/MinIO/S3 configuration and artifact retention
- Connectivity scheduler/distributed-lock infrastructure if no retained consumer remains

R6 begins only after R5 API/UI removal proves these services have no remaining runtime consumers.

## 10. R7 deferred schema/database cleanup

Potential schema cleanup includes Organization/Membership/Site/MonitoringPoint legacy fields, Alert/AlertEvent, dashboard/report/map/SOP tables, report artifact metadata, and obsolete device lifecycle fields. This must wait until provisioning ownership, R9 requirements, alert decoupling, and migration/recovery plans are approved. Existing migrations must not be edited.

## 11. Proposed R5 execution batches

### R5-B — obsolete frontend routes and tests

Scope: remove MonitoringPoint, Alerts, Map/SOP, Reports, legacy Dashboard, generic audit, selectors, and device mutation UI after import graph review. Keep four R3 routes, `single-device/**`, auth shell, and diagnostics.

Prerequisites: browser acceptance replaced; no imports from retained pages; provisioning tests identified.

Verification: `rg` import audit, web typecheck/lint/test/build, focused R3 browser tests.

Status: completed in this R5-B pass for the frontend-only batch. Removed legacy MonitoringPoint, Alerts, Map/SOP, Reports, dashboard, generic audit, organization/realtime presentation, and device-management UI/routes/tests. Retained `/overview`, `/devices`, `/settings/risk-profile`, `/settings/audit-log`, authentication, and `single-device/**`. Backend provisioning, alert observation, models, and infrastructure remain untouched for R5-C/R6/R7 decisions.

### R5-C — isolated backend product APIs

Scope: remove dashboard, map/SOP, reports controllers and legacy UI-only read APIs whose consumers are gone. Do not remove alert services, device provisioning, sites, or monitoring points yet.

Prerequisites: endpoint consumers and OpenAPI history reviewed; API tests moved or deleted with feature.

Verification: API typecheck/lint/unit/integration, OpenAPI validation, R2–R4 acceptance.

### R5-D — legacy API contracts and tests

Scope: remove remaining obsolete alert administration, generic audit, selector, and mutation presentation endpoints only after alert-runtime decoupling and provisioning replacement are proven.

Prerequisites: explicit AlertObservation replacement decision; R9 provisioning owner; no frontend or test consumers.

Verification: dependency graph, full integration, contract validation, migration-independent regression.

## 12. R5 stop conditions

Block deletion when any of the following is true:

- `RiskEvaluationService` still imports or calls alert observation.
- Single-device resolver still requires Organization, Site, MonitoringPoint, Membership, or Device relationships.
- Device credential provisioning has no approved replacement for simulator/R9.
- A retained R2–R4 test, telemetry path, current-state projection, or transition audit loses coverage.
- Redis/realtime/object storage is still required by an undeleted module.
- OpenAPI consumers or browser tests still reference the endpoint.
- A schema deletion would require editing a merged migration or lacks recovery evidence.
- The change could turn stale/offline/null telemetry into `SAFE`, expose secrets, or remove immutable audit history.
- R5-C status: completed. Dashboard and Map/SOP modules/controllers, tests, and OpenAPI paths were removed from runtime. Reports product endpoints/controller and API acceptance were removed; Reports queue/worker and object-storage dependencies remain dormant for R6. Alert observation remains a hard R5-D dependency. Device, Site, and MonitoringPoint provisioning support remains retained. No Prisma schema or migration changed.
- R5-D1 status: completed. RiskEvaluationService and ConnectivityEvaluatorService no longer observe legacy alerts. Connectivity-driven SAFE/WATCH/DANGER to UNKNOWN transitions now write the canonical RISK_STATUS_CHANGED audit when the risk actually changes. Alert administration APIs and Alert/AlertEvent schema remain for R5-D2/R7; realtime infrastructure remains for R6.
- R5-D2 status: completed. Legacy Alert administration, legacy risk-read, generic audit API, and alert-only realtime acceptance were removed. R5 is complete at the application/API layer. Alert/AlertEvent, map/SOP/report models, Redis/SSE, BullMQ, object storage, and other infrastructure remain deferred to R6/R7; Device provisioning remains retained for R9.

## R6 infrastructure cleanup result

R6 cleanup removed the unreachable Realtime/SSE application infrastructure, dormant Reports application and queue/worker code, and object-storage application services/configuration. Exclusive BullMQ, PDF, and S3 dependencies were removed and the lockfile was regenerated. Redis remains retained because health checks, authentication/telemetry rate limiting, and distributed connectivity locking still use it. Connectivity scheduling and stale/offline `UNKNOWN` behavior remain active. Prisma models, migrations, report/map/SOP schema, and Alert/AlertEvent schema remain deferred to R7.

## R7 database/schema cleanup result

R7 removed the obsolete `Alert`, `AlertEvent`, `AlertLifecycleAction`, `ReportJob`, map configuration, and SOP document models, together with their alert/report/map/SOP enums and relations. The forward migration `20260805233000_r7_remove_obsolete_schema` drops only those tables/types; historical migrations remain unchanged. Organization, Membership, Site, MonitoringPoint, Device provisioning, Telemetry, RiskProfile, RiskAssessment, CurrentMonitoringPointState, AuditLog, authentication, and connectivity schema remain retained for the final runtime and R9 provisioning.
