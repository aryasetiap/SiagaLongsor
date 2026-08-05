# Scope Reset R1 — Single-Device Monitoring Dashboard

## Status dan konteks

**Status: authoritative for final product scope.** R1 records the supervisor-approved reduction from the earlier extensible IoT product to a focused research implementation with one deployed ESP32 monitoring device. This decision deliberately supersedes older product assumptions; it does not delete prior work or erase its evidence.

Phase 02–06 work remains historical implementation and acceptance evidence. It must not be used to define the final product scope. P7-02 smoke/load/stress evidence is likewise a pre-scope-reset baseline only, not final production acceptance.

## Previous versus revised scope

| Previous implementation direction                                  | Revised final product direction                                                     |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Multi-device, multi-organization, multi-site operations            | One deployed physical ESP32 device                                                  |
| Two-role workflow and management UX                                | Administrator authentication as supporting capability                               |
| Alerts lifecycle, map, SOP, reports, settings                      | Four focused monitoring pages                                                       |
| SSE/Redis/BullMQ/object storage as product-supporting expectations | Persistence and safety retained; infrastructure cleanup follows dependency analysis |

## Four product pages

1. **Overview** — latest relevant sensor readings, independent historical charts, authoritative hazard status, and last update/freshness. Missing data is not zero.
2. **Perangkat** — backend/device connectivity, last seen, per-sensor readable/unreadable/unknown condition, and authoritative firmware/hardware/battery diagnostics where available. This is not multi-device CRUD.
3. **Profil Risiko** — administrator configuration of `WATCH` and `DANGER` thresholds for relevant hazard sensors, with validation, determinism, versioning, and auditability.
4. **Audit Log** — hazard-status transitions with previous/current status, timestamp, reason, and sensor/profile context where available. Alert acknowledgement/resolve/false-alarm UI is not required.

## Supporting capabilities

Authentication, API health check, authenticated device credential, telemetry ingestion, idempotency, PostgreSQL/Prisma persistence, history for charts, deterministic server-side risk evaluation, current device/risk state, and auditability remain required technical capabilities.

## Explicitly out of scope

- Multi-device UX; MonitoringPoint CRUD; organization switching/management; multi-site management; two-role product workflow.
- Alerts page and acknowledgement, resolve, or false-alarm lifecycle.
- Map & Evacuation, risk-zone maps, evacuation routes, SOP management, reports, CSV/PDF jobs, user management, and notification settings.
- SSE as a product requirement and object-storage-backed product features.
- ESP32 firmware implementation during the initial refactor; remote siren; AI hazard prediction.

Existing modules, schemas, and infrastructure are not removed in R1. Redis/BullMQ, SSE, object storage, organization/site/monitoring-point and alert/report schemas are candidates for later removal only after dependency analysis; no document may claim they are already safe to delete.

## Safety invariants and sensor responsibilities

- Required telemetry that is stale, offline, invalid, or unavailable is `UNKNOWN`, never `SAFE`.
- The server owns deterministic hazard evaluation. Firmware-reported risk is comparison/audit input only.
- Risk evaluation order is invalid/stale/offline/unavailable → `UNKNOWN`; hazard condition → `DANGER`; all safe conditions → `SAFE`; other valid conditions → `WATCH`.
- Hazard sensors provide readings used by the configured risk profile and their persisted history feeds Overview charts.
- Each expected sensor also has a device-health responsibility: it is reported readable, unreadable, or unknown on Perangkat.
- Battery, firmware, and general device-health readings remain diagnostic, not landslide hazard criteria, unless approved later.
- No scientific/geotechnical threshold value may be fabricated. Existing values are provisional/legacy until calibrated and approved.

## Data flow and sequencing

`ESP32 → telemetry ingestion → persistence → risk evaluation → current state/history → dashboard/audit`

R2–R4 stabilize the minimal API, dashboard behavior, and telemetry simulator/contract validation. ESP32 firmware design and integration follow only after that stabilization; firmware is R9 work.

## Refactor and rollback strategy

Use replacement-before-deletion: introduce and verify the minimal replacement path, migrate callers and acceptance tests, analyze dependencies, then remove obsolete product capabilities in later R tasks. Preserve durable telemetry and audit history unless a separately approved data-migration/recovery plan exists.

Each refactor step must be reversible through a documented compatibility path, retained historical data, and migration recovery note where applicable. Do not edit already-merged migrations. Roll back the new path rather than destructively rewriting historical evidence or data.

## Revised roadmap

| Refactor | Scope                                                 | Status                                 |
| -------- | ----------------------------------------------------- | -------------------------------------- |
| R1       | Scope Freeze                                          | Completed by this documentation change |
| R2       | Minimal Backend and target OpenAPI                    | Pending                                |
| R3       | Minimal Frontend                                      | Pending                                |
| R4       | Telemetry Simulator / integration contract validation | Pending                                |
| R5       | Remove obsolete product features                      | Pending                                |
| R6       | Infrastructure cleanup                                | Pending                                |
| R7       | Database/schema cleanup                               | Pending                                |
| R8       | Regression + acceptance                               | Pending                                |
| R9       | ESP32 firmware/integration                            | Pending                                |
| R10      | Final performance/UAT/release readiness               | Pending                                |

No R2+ work is implied or completed by R1.
