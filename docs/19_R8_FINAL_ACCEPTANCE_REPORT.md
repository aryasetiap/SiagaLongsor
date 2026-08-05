# R8 Final Acceptance Report

## 1. Baseline and scope

- Baseline: `854a2e2`
- R8 validates the simulator/pre-hardware system only.
- Physical ESP32 integration remains R9.
- No firmware, performance, or release-readiness work was performed.

The retained product pages are Overview, Perangkat, Profil Risiko, and Audit Log. Authentication remains supporting functionality. Device, Site, MonitoringPoint, and credential provisioning remain available for R9.

## 2. Final API surface

The final product APIs remain:

- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `GET /api/v1/health`
- `POST /api/v1/iot/telemetry`
- `GET /api/v1/overview`
- `GET /api/v1/device`
- `GET /api/v1/risk-profile`
- `PUT /api/v1/risk-profile`
- `GET /api/v1/audit-log`

Temporary provisioning APIs remain intentionally documented. Alerts, Dashboard, Map, SOP, Reports, generic audit administration, monitoring overview, risk-assessment history, and realtime/SSE routes are absent from the active OpenAPI path set and runtime source.

## 3. Regression matrix

Existing R2-R4 acceptance already covers the complete simulator-to-API flow:

`POST /iot/telemetry` → `RiskAssessment` → `CurrentMonitoringPointState` → Overview/Device/Audit Log.

The focused simulator acceptance covers:

| Scenario                                       | Result |
| ---------------------------------------------- | ------ |
| Initial SAFE                                   | PASS   |
| SAFE → WATCH                                   | PASS   |
| WATCH → DANGER                                 | PASS   |
| DANGER → UNKNOWN from null sensor              | PASS   |
| UNKNOWN → SAFE recovery                        | PASS   |
| Exact duplicate idempotency                    | PASS   |
| Late telemetry and `affectsCurrentState=false` | PASS   |
| Battery neutrality                             | PASS   |
| Null versus numeric zero                       | PASS   |
| Delayed/offline UNKNOWN projection             | PASS   |
| Connectivity transition audit deduplication    | PASS   |

The backend integration suite passed 111 tests across 9 files.

## 4. Browser acceptance

Added `apps/web/e2e/r8-final.acceptance.spec.ts` to verify the four-page navigation and zero-device product state, including Overview ranges, diagnostics-only Perangkat, risk-profile availability/error state, and empty Audit Log state.

The local browser run executed 7 tests: 3 passed and 4 were blocked before assertions because the local shell did not provide `E2E_PROJECT_OWNER_EMAIL`/password credentials. CI supplies these credentials through its ephemeral-auth environment. No browser assertion failure was observed.

Existing browser coverage continues to verify unauthenticated redirects, login validation, session/logout behavior, primary navigation, and diagnostics-only Perangkat.

## 5. Safety and risk-transition acceptance

The retained tests prove:

- missing required sensor data is `UNKNOWN`, never `SAFE`;
- stale and offline states are `UNKNOWN`;
- null readings remain null and are not rendered as zero;
- server-side thresholds determine risk;
- battery changes do not affect hazard status;
- late telemetry does not replace authoritative current state;
- exact retries do not duplicate telemetry, assessment, or transition audit;
- each actual status transition creates one immutable `RISK_STATUS_CHANGED` event;
- repeated connectivity evaluation does not duplicate the transition audit.

## 6. Schema and migration status

R7 migration `20260805233000_r7_remove_obsolete_schema` is present and unchanged. The configured disposable development database reports all 12 migrations applied and up to date. R8 introduced no schema or migration changes.

Retained schema covers authentication, Organization/Membership, Site, MonitoringPoint, Device credentials/provisioning, Telemetry, RiskProfile, RiskAssessment, CurrentMonitoringPointState, connectivity, and AuditLog.

## 7. Removed-feature and dependency audit

Active source contains no references to:

- `AlertObservationService`
- `AlertsController`
- `ReportsModule`
- `RealtimeModule`
- `RealtimePostCommitService`
- `ObjectStorage`
- BullMQ
- `MapSopModule`
- `DashboardModule`

Exclusive report, object-storage, realtime, and BullMQ dependencies remain removed. Redis remains intentionally required by health checks, rate limiting, and connectivity distributed locking.

## 8. Commands and results

- `pnpm install --frozen-lockfile`: PASS
- `pnpm prisma:generate`: PASS
- `pnpm prisma:validate`: PASS
- `pnpm prisma migrate status`: PASS, database up to date
- `pnpm typecheck`: PASS
- `pnpm lint`: PASS
- `pnpm test`: PASS — API 58, web 40
- `pnpm build`: PASS
- `pnpm openapi:validate`: PASS
- `pnpm format:check`: PASS
- `pnpm test:integration`: PASS — 111 tests
- `pnpm --filter @siagalongsor/web test:e2e`: 3 passed, 4 credential-environment blocked locally
- `git diff --check`: PASS

## 9. CI review

CI retains install, Prisma generate, lint, format, typecheck, unit tests, build, OpenAPI validation, Prisma validation, migration deploy, seed, integration, and Playwright gates. PostgreSQL and Redis services remain. No MinIO/object-storage setup is present.

## 10. Decision

**R8 PASS with a local browser-environment limitation.** The simulator/pre-hardware backend and final product contract pass all available automated regression gates. Browser assertions require CI-provided seeded credentials for a complete local run. Physical ESP32 acceptance remains R9.
