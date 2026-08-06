# R10 Final Acceptance Report

## 1. Executive conclusion

R10 final acceptance is complete for the single-device software/research
implementation. G1 through G6 passed. The release decision is:

**READY WITH DOCUMENTED LIMITATIONS**

This is not a claim of full field or scientific calibration.

## 2. Tested baseline/environment

- Baseline: `e78cb60f204a6bae416e592da2a942b0e40864`
- Product scope: Overview, Perangkat, Profil Risiko, Audit Log, authentication,
  health, telemetry, persistence, server-side risk, and auditability.
- Physical device: `ESP32-SIAGALONGSOR-01`.
- G5 backend: `192.168.101.77:3001`; no credentials are recorded here.

## 3. Gate summary G1-G7

| Gate                             | Result                            |
| -------------------------------- | --------------------------------- |
| G1 Repository regression         | PASS                              |
| G2 Final API acceptance          | PASS                              |
| G3 Performance acceptance        | PASS                              |
| G4 Browser/UAT acceptance        | PASS                              |
| G5 Physical device smoke         | PASS                              |
| G6 Security/configuration sanity | PASS                              |
| G7 Release decision              | READY WITH DOCUMENTED LIMITATIONS |

## 4. Repository regression evidence

The required install, Prisma generate/validate, typecheck, lint, unit tests,
build, OpenAPI, formatting, integration, and PlatformIO gates passed. No runtime
source or schema changes were made for final acceptance.

## 5. API acceptance evidence

G2 passed authentication/health, final single-device reads, valid and invalid
device authentication, exact idempotency, null-to-UNKNOWN behavior, late-data
semantics, deterministic context resolution, risk-profile validation/versioning,
and authoritative audit semantics.

## 6. Performance results

| Scenario                        | Result                                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Smoke, 2 minutes                | 290 requests, 0% failures, checks 100%, p95 53.57 ms, p99 67.35 ms                                     |
| Representative load, 15 minutes | 12,605 requests, 0% failures, checks 100%, p95 52.34 ms, p99 61.93 ms                                  |
| Stress, 20 minutes              | 31,175 requests, approximately 0.006% failures, checks 99.99%, p95 ~2.00 s, p99 ~2.95 s; recovery PASS |

Post-stress integrity reported 19,344 telemetry rows and 19,344 unique message
IDs, with no silent corruption.

## 7. Browser/UAT results

Chromium acceptance passed 7/7 tests with no failures or skips. The temporary
390x844 mobile smoke passed. The four final pages, navigation, diagnostics-only
device surface, null/UNKNOWN behavior, and chart-gap component behavior passed.

## 8. Physical ESP32 final smoke

G5 observed serial `telemetry delivered status=201 duplicate=false`. Health was
HTTP 200 with database and Redis up. `/device`, `/overview`, `/risk-profile`,
and `/audit-log` all returned HTTP 200. The physical device was configured and
ONLINE; tilt and soil were null/unreadable, rainfall was numeric `0`, and risk
was authoritative `UNKNOWN`. A completed zero-tip rain window reported
`rainfallMmHour=0.000`.

No reflash, credential rotation, Risk Profile mutation, or administrative/
destructive database action occurred.

## 9. Security/configuration sanity

- `firmware/esp32/include/secrets.h` is ignored and not tracked.
- No tracked `.env`, local secrets header, private key, bearer token, or JWT
  value was found.
- Seed/example assignments are placeholders or runtime environment names only.
- The R10 k6 harness receives all credentials through runtime environment
  variables and uses synthetic readings only; it contains no physical secret or
  calibration claim.
- G2 supplied negative authentication evidence: invalid Device credentials
  return HTTP 401 without leakage.
- No generated performance dump, isolated database artifact, or temporary mobile
  test remains tracked.

## 10. Known limitations/deferred calibration

- Soil percentage calibration is deferred.
- Final IMU mounting/reference calibration is deferred.
- Rain `0.70 mm/tip` remains a provisional vendor nominal value.
- No battery measurement circuit exists; `batteryVoltage` remains null.
- LCD is optional/deferred.
- Cellular fallback and persistent flash telemetry queue are outside the current
  required release scope.

## 11. Final release decision

The software/integration/research implementation is **READY WITH DOCUMENTED
LIMITATIONS**. A fully field/scientifically calibrated system is **NOT YET
CLAIMED**. Physical calibration blockers must be resolved and reviewed before
making that stronger claim.
