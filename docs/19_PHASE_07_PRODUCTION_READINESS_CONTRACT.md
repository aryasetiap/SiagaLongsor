# Phase 07 production-readiness contract

Status: **P7-01 active/current**. This document freezes Phase 07 requirements before implementation.
It does not claim k6 tests, backup/restore, production deployment, error tracking, security review,
incident simulation, UAT, or a release decision have been completed.

Phase 06 remains complete; its final evidence is
[`docs/18_PHASE_06_ACCEPTANCE_REPORT.md`](18_PHASE_06_ACCEPTANCE_REPORT.md). All Phase 07
acceptance criteria remain pending in
[`docs/09_TEST_ACCEPTANCE_PLAN.md`](09_TEST_ACCEPTANCE_PLAN.md).

## 1. Scope, safety boundaries, and non-goals

Phase 07 provides evidence for performance testing, backup/restore, production deployment,
observability, security review, incident simulation, and UAT. REST remains authoritative; Phase 05
SSE is only an invalidation signal, and report realtime/SSE remains out of scope.

Phase 02–06 invariants do not change: TypeScript strict, Next.js, NestJS, PostgreSQL/Prisma,
Redis/BullMQ, private object storage, bearer authentication plus `X-Organization-Id`,
organization isolation, and MVP roles `PROJECT_OWNER` and `SCHOOL_ADMIN`. `SAFE`, `WATCH`,
`DANGER`, and `UNKNOWN` semantics also remain authoritative: stale, offline, invalid, disabled,
or profile-unavailable data must never fabricate `SAFE`.

Non-goals are AI hazard prediction, dynamic risk prediction, automatic evacuation routing, remote
siren, public emergency simulation, and unapproved changes to API/OpenAPI, schema/migration, or
runtime behavior. No high-availability, disaster-recovery, capacity, or SLA claim exists until it
is implemented and tested.

`compose.yaml` is development infrastructure only. `infra/docker-compose.reference.yml` is
reference/development only, including placeholder credentials and some `latest` images; neither is
a production deployment contract.

## 2. Workstream

| ID    | Workstream                                          | Status         |
| ----- | --------------------------------------------------- | -------------- |
| P7-01 | Production-readiness contract + acceptance criteria | active/current |
| P7-02 | k6 performance/load testing                         | pending        |
| P7-03 | Backup + restore + operational runbook              | pending        |
| P7-04 | Production deployment + error tracking              | pending        |
| P7-05 | Security review + incident simulations              | pending        |
| P7-06 | UAT + full Phase 07 acceptance + release decision   | pending        |

P7-01 freezes requirements only. P7-02 through P7-06 remain pending until implementation evidence
is reviewed against the acceptance plan.

## 3. Performance-test contract (P7-02)

These are initial **Phase 07 engineering acceptance targets**, not universal capacity guarantees,
hardware benchmarks, or SLAs. They apply only to a dedicated measured non-production environment
with production-like API/web builds and isolated organization/device test data.

| Test      | Initial workload                                                      | Acceptance target                                                                        |
| --------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Smoke     | 1 VU, 2 minutes, critical reads and authenticated requests            | 0 request failure; checks 100%; p95 ≤ 1 s; p99 ≤ 2 s                                     |
| Load      | 20 VU, 15 minutes; 10 authenticated reads/s and 2 telemetry ingests/s | failures < 1%; checks ≥ 99%; p95 ≤ 1.5 s; p99 ≤ 3 s; target throughput sustained         |
| Stress    | ramp 5 to 40 VU over 20 minutes                                       | record first failure > 2% or p99 > 5 s; no silent data corruption; recovery tested       |
| Spike     | 2 to 40 VU for 1 minute, then 2 VU for 5 minutes                      | after recovery: failures < 1%; p95 ≤ 1.5 s; p99 ≤ 3 s                                    |
| Endurance | 10 VU for 60 minutes, including telemetry rate                        | failures < 1%; checks ≥ 99%; p95 ≤ 1.5 s; p99 ≤ 3 s; no unexplained resource/error trend |

Workloads must cover authenticated critical reads: dashboard summary, monitoring overview, alert list,
and other documented critical read paths. Where appropriate, they also cover telemetry ingestion with
valid unique/idempotent messages, sequences, and non-production test devices. They must use bearer
authentication and `X-Organization-Id` for isolated non-production organizations.

Each run must preserve UTC timestamp, commit/release, image/build, k6 version and script checksum,
host/region, CPU/RAM/disk/network, service limits, dependency versions, dataset cardinality,
VU/rate/duration, request/check/latency results, and sanitized error summary. Load tests against
uncontrolled production require explicit authorization. No test may trigger a real emergency action,
public emergency, real siren, or remote-siren capability.

## 4. Backup and restore contract (P7-03)

PostgreSQL is the authoritative durable application-data store. Private object storage is the durable
store for document/SOP/report artifacts. Redis is not authoritative business history; its cache,
Pub/Sub, and queue recovery must be documented without replacing database history.

Backups must include the complete PostgreSQL database, schema/migration compatibility metadata, and
private object artifacts with manifests linking them to database records. Backup transfer and storage
must be encrypted. Keys and credentials remain outside source control, are least-privilege, and are
not written to logs. Artifacts need structured names with environment, UTC timestamp, backup ID and
type, plus manifest, size, and SHA-256 checksum.

Initial MVP engineering targets, not HA/SLA guarantees: RPO ≤ 24 hours through daily full backup and
RTO ≤ 8 hours for an isolated clean-environment restore drill. Retain at least 14 daily backups and
3 monthly backups, unless a stricter owner-data policy applies. Verification includes completion,
checksum/manifest, and artifact readability. Restore must use a clean isolated environment and verify
schema compatibility, referential integrity, row-count/checksum sampling, and private object-artifact
access. Evidence records operator, source backup ID, start/end UTC, result, RPO/RTO deviation, secret
handling, and rollback/recovery steps for restore failure. No disaster-recovery claim exceeds drills
actually performed.

## 5. Production deployment contract (P7-04)

A production-specific deployment definition must be separate from `compose.yaml` and the reference
compose; no cloud provider is selected unless already frozen elsewhere in the repository. API and web
must be production builds traceable to a commit. Every production image must use a pinned version or
immutable digest, never `latest`.

PostgreSQL, Redis, and object storage require private network boundaries. Database, Redis, and
object-storage admin ports must not be public. TLS/reverse proxy is the boundary for necessary public
endpoints. Environment values and secrets are injected outside source control and sanitized from
deployment output/logs.

The deployment must use health/readiness checks, least-privilege identities, durable volumes where
needed, documented restart behavior, and a recorded exposure review. Run migration before app startup
under a controlled procedure, and verify a backup before risky migration/deployment. The runbook must
provide application rollback and realistic migration recovery. Evidence records UTC time, operator,
commit, image digest, sanitized environment, build/migration/check outcomes, and tested rollback.
High availability must not be claimed unless implemented and tested.

## 6. Error tracking and observability contract (P7-04)

Error tracking is vendor-neutral. Backend captures relevant unhandled exceptions and frontend captures
relevant application errors. Events contain correlation/request ID plus release/commit and environment
identity. Diagnostic context is minimal and preserves organization privacy.

Events and associated logs must exclude Authorization headers, refresh/access tokens, passwords,
device credentials or hashes, raw telemetry payloads, private object-storage keys or provider
credentials, uploaded document bytes, and sensitive browser storage. Tracking failure must not break
core requests, ingestion, or UI fallback. Alerting/escalation for repeated or high-impact errors must
define severity, owner, and response path. Safe failure injection must prove capture and sanitization
without sending secrets to a tracker.

## 7. Security-review contract (P7-05)

Review authentication, authorization, bearer plus `X-Organization-Id`, organization isolation,
cross-organization behavior, and both roles. It also covers dependency audit, secret scanning and
manual secret review, security headers/CORS, rate limits, upload validation, private object storage,
formula-injection defense, log/error sanitization, backup security, deployment exposure, and role
permissions. The review must prove UNKNOWN safety semantics are not weakened and no remote-siren
capability exists.

Findings are classified as Critical (active exploit, data breach, or safety boundary broken), High
(serious access/impact), Medium (limited exposure or defense-in-depth), or Low (minor hardening).
Critical and High block P7-06 until remediated and verified. Medium blocks unless an authorized
written risk acceptance names an owner and target date. Low requires recorded ownership/target or
closure rationale.

## 8. Incident-simulation contract (P7-05)

Simulations are safe, isolated, reversible, and use non-production test data. They must not simulate
a public emergency or trigger a real siren. Evidence includes preconditions, steps, UTC timestamps,
observations, recovery, impact, and untested limits.

| Simulation                          | Required observation                                    |
| ----------------------------------- | ------------------------------------------------------- |
| API unavailable/restart             | measured recovery and failure state; no fabricated SAFE |
| PostgreSQL unavailable/recovery     | actual failure mode and recovery documented             |
| Redis unavailable/recovery          | realtime/queue impact and recovery documented           |
| Object storage unavailable/recovery | safe upload/download/report failure state and recovery  |
| Report worker interruption/recovery | job state, retry/recovery, and artifact integrity       |
| SSE disconnect/reconnect            | reconnect/refetch occurs; REST remains authoritative    |
| Stale/offline telemetry             | remains UNKNOWN, never SAFE                             |
| Failed deployment/rollback          | failure, rollback, and health-check outcome documented  |
| Failed/corrupted backup detection   | checksum/verification detects it before unsafe restore  |

These simulations do not substantiate disaster recovery or availability beyond their actual evidence.

## 9. UAT and release decision (P7-06)

Project Owner and School Admin UAT covers authentication/session, Monitoring Points, Devices,
Dashboard, Alerts, Map & Evacuation, SOP, Reports, and Settings/Audit Log permissions. It also covers
basic accessibility/responsive behavior and loading, error, empty, offline, stale, and UNKNOWN
presentation without fabricated SAFE.

Sign-off evidence records commit/version, environment, participants and roles, cases, UTC timestamp,
sanitized screenshots/recording where useful, PASS/FAIL, defect ID, and product-owner decision.
Blocking criteria include open Critical/High findings, failed required acceptance criteria, broken
permission/organization isolation, fabricated SAFE, remote siren, or missing required performance,
backup, deployment, incident, or UAT evidence.

Only P7-06 determines production/release-milestone eligibility. P7-01 creates neither a semantic
version nor a Phase 07 tag. The `phase-XX-complete` milestone convention may be applied only after
P7-06 is merged and final Phase 07 acceptance is PASS.
