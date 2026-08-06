# R10 Final Acceptance Contract

## 1. Purpose and release boundary

R10 determines final release readiness for the single-device research
implementation after R1–R9. The retained product surface is Overview,
Perangkat, Profil Risiko, and Audit Log, supported by authentication, health,
telemetry ingestion, idempotency, persistence, server-authoritative risk, and
auditability.

This contract separates two decisions:

- **Software/integration readiness:** the repository, API, browser, performance,
  security/configuration, and physical-device smoke gates operate correctly.
- **Field/scientific calibration readiness:** sensor-specific calibration is
  physically established and approved. R9 did not complete this work; no R10
  result may silently convert it into a PASS.

R10 is a plan only. No measurements or release decision are claimed here.

## 2. Preconditions

R10-B may start only when:

- R1–R9 are merged and the working tree is clean on the intended main commit.
- Current migrations are applied successfully to the disposable acceptance
  database.
- PostgreSQL and Redis are healthy.
- One enabled physical ESP32 deployment is available for the final smoke.
- No production secrets are committed; local `secrets.h` remains ignored.
- Tests use the current four-page, single-device scope rather than historical
  multi-device product assumptions.

## 3. R10 acceptance gates

### G1 — Repository regression

Run the repository's existing commands, without inventing replacement scripts:

```text
corepack pnpm install --frozen-lockfile
corepack pnpm prisma:generate
corepack pnpm prisma:validate
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm build
corepack pnpm openapi:validate
corepack pnpm format:check
corepack pnpm test:integration
py -m platformio run -d firmware/esp32
```

Capture each command, commit, environment, and result. CI additionally runs
migration deploy, seed, and browser E2E; those steps remain part of the release
evidence when executed in CI.

### G2 — Final API acceptance

Exercise the current public/supporting contract:

- `POST /api/v1/auth/login`, `GET /api/v1/auth/me`, and `GET /api/v1/health`.
- `POST /api/v1/iot/telemetry` with valid Device authentication.
- `GET /api/v1/overview` and `GET /api/v1/device`.
- `GET` and `PUT /api/v1/risk-profile`.
- `GET /api/v1/audit-log`.

The acceptance must prove valid telemetry, invalid Device credential rejection,
exact idempotent retry behavior, null required hazard input projecting
`UNKNOWN` rather than `SAFE`, late data not moving current state backward, and
deterministic single-device context resolution. It must retain the existing
R4/R8 assertions for persistence, RiskAssessment, CurrentMonitoringPointState,
and authoritative transition audits.

### G3 — Performance

Performance must be rerun against the post-reset implementation. No k6 asset is
currently present in the repository, so R10-B must add or run a reviewed,
temporary k6 harness without claiming historical results. The matrix below is
the smallest useful final-scope set. Historical P7-02 values are engineering
targets only, not measurements or safety limits.

### G4 — Browser/UAT

Use the current Playwright suite and a one-session manual checklist for the
four pages. Release UAT must cover login, the current physical device, explicit
null/unavailable states, `UNKNOWN` safety presentation, chart gaps without
interpolation, threshold form validation and persistence, audit rendering,
responsive/basic usability, and absence of obsolete product dependencies.

### G5 — Physical-device release smoke

Reuse R9 bring-up evidence and perform only a short final smoke: ESP32 boot,
Wi-Fi/NTP, authenticated telemetry HTTP 201, recent telemetry visible through
the backend, and rainfall observation when practical. Soil and IMU final
calibration are not required to pass software integration.

### G6 — Security/configuration sanity

Verify `secrets.h` is ignored and untracked; no Device secret, token, password,
or production credential is committed; development values are not presented as
production credentials; and invalid Device authentication is rejected.

### G7 — Release decision

R10 permits only:

- **READY** — all required software, performance, UAT, and physical smoke gates
  pass, with no release-blocking limitation.
- **READY WITH DOCUMENTED LIMITATIONS** — software/integration release is sound,
  but known non-safety-critical limitations such as deferred calibration are
  explicitly recorded.
- **NOT READY** — a required gate fails or evidence is missing.

Given R9 evidence, fully field/scientific-calibrated readiness cannot be
declared until soil, tilt, and rain calibration blockers are resolved. A
software/research release may still be **READY WITH DOCUMENTED LIMITATIONS** if
all R10 software, UAT, performance, and smoke gates pass.

## 4. Performance execution matrix

| Scenario | Endpoints | Purpose | Duration/load | Pass criteria | Evidence |
| --- | --- | --- | --- | --- | --- |
| Smoke | Telemetry plus Overview, Device, Risk Profile, Audit Log | Confirm the complete authenticated path | 1 VU, 2 minutes | 0 request failures, checks 100%, p95 ≤ 1 s, p99 ≤ 2 s | k6 summary, script checksum, sanitized errors |
| Representative load | Same endpoint set, with valid unique telemetry messages | Measure normal research deployment behavior | 20 VU, 15 minutes; target 2 telemetry ingests/s and 10 reads/s | Failures < 1%, checks ≥ 99%, p95 ≤ 1.5 s, p99 ≤ 3 s, no persistence/audit corruption | k6 summary plus DB/audit integrity assertions |
| Short capacity/stress | Telemetry and final read endpoints | Identify an early saturation or recovery point without destructive load | Ramp 5 → 40 VU over 20 minutes, or stop earlier at the first safety boundary | Record first failure > 2% or p99 > 5 s; no silent data corruption; service recovers | k6 summary, resource/error trend, stop reason |

These are software engineering targets adapted from the historical P7-02
contract. They are not geotechnical thresholds, safety limits, or measured
results. R10-B must record the actual environment, dataset cardinality,
versions, VU/rate/duration, latency, errors, and stop reason.

## 5. UAT checklist

Complete in one authenticated session using the current physical deployment:

1. Log in as the seeded `PROJECT_OWNER`; confirm the four-item primary
   navigation and no obsolete product dependency.
2. Overview: confirm authoritative status, current tilt/soil/rain values,
   timestamp/freshness, range controls, manual refresh, and explicit unavailable
   text instead of numeric zero. Confirm a null history point leaves a chart gap.
3. Perangkat: confirm connectivity, last-seen/telemetry timestamps, firmware
   and network metadata, readable/unreadable/unknown sensor states, and battery
   as secondary health information only.
4. Profil Risiko: confirm server values populate all six hazard threshold
   fields; reject WATCH ≥ DANGER; submit a valid update in an isolated fixture
   and restore the original values before completion.
5. Audit Log: confirm transition entries show previous/current status, reasons,
   sensor snapshot, profile reference/version, timestamp, and pagination without
   duplicate entries.
6. Exercise a known unavailable/stale state and confirm `UNKNOWN`, never
   fabricated `SAFE`; recover with fresh valid telemetry.
7. Verify logout and that protected pages require authentication afterward.

## 6. Evidence to capture

R10-B must retain command output and commit for G1, API request/response
summaries with secrets removed, k6 summaries and script checksums, the completed
browser/UAT checklist, firmware build output, physical telemetry HTTP 201
evidence, known limitations, and the final G7 decision. Screenshots are only
needed where text or structured output cannot prove the result.

## 7. Deferred blockers and limitations

Carry forward from R9:

- soil percentage calibration is deferred;
- final IMU mounting/reference calibration is deferred;
- rain `0.70 mm/tip` remains provisional vendor nominal calibration;
- no battery measurement circuit exists, so `batteryVoltage` remains null;
- LCD is optional/deferred;
- cellular fallback and persistent flash queue are outside the current required
  release scope.

## 8. R10-B execution order

Execute fastest-failure-first:

1. Repository regression (G1).
2. Final API acceptance (G2).
3. Performance matrix (G3).
4. Browser/UAT checklist (G4).
5. Physical-device smoke (G5).
6. Security/configuration sanity and final report/decision (G6–G7).

R10-B must stop and report rather than weaken safety semantics, invent
calibration values, or broaden into deployment, firmware redesign, or R11 work.
