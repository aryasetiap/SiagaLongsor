# R9 ESP32 Integration Contract

This document freezes the current server contract for a physical ESP32. It is
an integration contract, not a sensor-driver design. The server remains the
authority for landslide risk.

## 1. Architecture and scope

```text
ESP32 sensors
  -> POST /api/v1/iot/telemetry
  -> device authentication and validation
  -> Telemetry + RiskAssessment persistence
  -> CurrentMonitoringPointState
  -> Overview / Perangkat / Audit Log
```

The device may report a comparison assessment, but `deviceAssessment` is not
the authoritative safety result. There is no remote siren command and no AI
prediction in this contract.

## 2. Telemetry HTTP contract

- Method: `POST`
- Endpoint: `${API_BASE_URL}/api/v1/iot/telemetry`
- Content type: `application/json` (the request must be JSON)
- Authentication: `Authorization: Device <hardwareId>.<deviceSecret>`
- Idempotency: `Idempotency-Key` is required and must exactly equal the body
  `messageId`.

The `hardwareId` is public device identity, not a secret. It must match
`^[A-Z0-9][A-Z0-9_-]{2,63}$` (3–64 characters). The secret is an opaque
base64url-compatible value issued by the API, currently at least 32 characters
and never returned by normal device reads or stored in plaintext.

### Responses and retry classes

| HTTP                   | Meaning                                                                                       | Device action                                                       |
| ---------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 201                    | New telemetry accepted (`duplicate: false`)                                                   | Remove the queued item.                                             |
| 200                    | Exact retry already stored (`duplicate: true`)                                                | Remove the queued item; do not generate a new message ID.           |
| 400                    | Invalid JSON, validation, timestamp, or idempotency contract                                  | Record a diagnostic; do not aggressively retry unchanged data.      |
| 401                    | Invalid device credential                                                                     | Stop and require credential/provisioning attention.                 |
| 403                    | Device is disabled                                                                            | Stop retrying until an operator provisions/enables a valid device.  |
| 409                    | Idempotency or boot-scoped sequence conflict                                                  | Record the conflict; do not mutate the payload to force acceptance. |
| 413/415/422            | Permanent request/media/validation contract error when returned by a gateway or future policy | Record a diagnostic and stop aggressive retry.                      |
| 429                    | Rate limited                                                                                  | Respect server guidance and back off.                               |
| 5xx or network timeout | Server or transport failure                                                                   | Retry with exponential backoff and jitter.                          |

The successful response contains `accepted`, `duplicate`, `telemetryId`, and
`receivedAt`. A timeout is not proof of rejection: retry the exact same payload
with the same `messageId` and `Idempotency-Key`.

## 3. Current payload

The request body has `additionalProperties: false` and these required top-level
fields:

| Field             | Type and meaning                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------- |
| `messageId`       | String, 8–64 characters; stable across retries.                                               |
| `bootId`          | Non-empty string, stable for one boot session and changed on reboot.                          |
| `sequence`        | Integer ≥ 0, monotonic within a `bootId`.                                                     |
| `timestamp`       | Strict ISO-8601 timestamp, normally UTC. The default server future-skew limit is 300 seconds. |
| `firmwareVersion` | Non-empty string, maximum 32 characters.                                                      |
| `readings`        | Object containing all four required reading keys below.                                       |

`network` is optional. Its `type` is `WIFI`, `CELLULAR`, or `UNKNOWN`; optional
`signalRssi` is in dBm and constrained to -150…0. `deviceAssessment` is also
optional and, when sent, contains `riskLevel` and `sirenActive`. It is firmware
comparison data only.

### Readings and units

| Reading            | Type/range                          | Unit and null meaning                                                   |
| ------------------ | ----------------------------------- | ----------------------------------------------------------------------- |
| `tiltXDeg`         | Optional number or `null`, -180…180 | Diagnostic tilt axis, degrees.                                          |
| `tiltYDeg`         | Optional number or `null`, -180…180 | Diagnostic tilt axis, degrees.                                          |
| `tiltMagnitudeDeg` | Required number or `null`, 0…180    | Hazard input, degrees. `null` means unavailable/unreadable, never zero. |
| `soilMoisturePct`  | Required number or `null`, 0…100    | Hazard input, percent. `null` means unavailable/unreadable.             |
| `rainfallMmHour`   | Required number or `null`, ≥0       | Hazard input, millimetres/hour. `null` means unavailable/unreadable.    |
| `batteryVoltage`   | Required number or `null`, 0…30     | Device health diagnostic, volts; it is not a hazard criterion.          |

The required keys must be present even when their values are `null`. Missing,
non-finite, or out-of-range non-null values are rejected. Numeric zero remains
numeric zero; it is never substituted for `null`.

A canonical synthetic payload is checked in at
[`specs/examples/r9/physical-device-telemetry.json`](../specs/examples/r9/physical-device-telemetry.json).
Its readings are development inputs, not scientific threshold advice.

## 4. Server-authoritative risk and freshness

The configured, versioned `RiskProfile` determines server risk. The evaluation
order is:

1. missing, invalid, stale, offline, or unavailable required hazard data → `UNKNOWN`;
2. any hazard reading at or above its configured DANGER threshold → `DANGER`;
3. otherwise any reading at or above WATCH → `WATCH`;
4. otherwise valid fresh readings below WATCH → `SAFE`.

Only tilt magnitude, soil moisture, and rainfall are hazard inputs. Battery and
firmware assessment do not determine landslide status. Late telemetry remains
historical and has `affectsCurrentState=false` when it is older than the
authoritative current sample. Fresh telemetry after reconnection can restore
the current state; stale/offline evaluation must never become `SAFE`.

## 5. Boot, sequence, time, and retry behavior

- Generate `messageId` once when a measurement is queued; never replace it on
  timeout or network change.
- Persist `bootId` and sequence state across reboot as far as the device design
  permits. Sequence uniqueness is scoped to the authenticated device and boot.
- Keep the original measurement `timestamp` when store-and-forward sends a
  queued historical sample later.
- Remove a queue item only after a 201 or an exact-duplicate 200.
- For 5xx/timeouts use bounded exponential backoff plus jitter. For 429 use
  server rate-limit guidance.

## 6. Security rules

- Use HTTPS outside local development.
- Never place credentials in query parameters, payload fields, URLs, or normal
  serial logs.
- The API stores an Argon2 hash; plaintext is returned only once by device
  registration/rotation and must be delivered securely to the physical device.
- A disabled device is rejected before telemetry persistence.
- Do not commit device secrets, Wi-Fi passwords, APNs, or local environment
  files.
- Credential rotation invalidates the previous secret and requires firmware
  reprovisioning.

## 7. Conceptual firmware modules (no hardware implementation yet)

The planned firmware boundaries are configuration, secure credential storage,
clock synchronisation, network manager, sensor-acquisition interfaces,
payload builder, persistent `bootId`/sequence state, message-ID generation,
local retry/store-and-forward queue, HTTP telemetry client, acknowledgement
handling, and diagnostics/logging. No board, sensor library, driver, or pin
mapping is selected in R9-A.

## Hardware Inventory Required Before R9-B

The following must be supplied and reviewed before any hardware-specific code:

- exact ESP32 board/model;
- tilt/IMU sensor model;
- soil-moisture sensor model;
- rainfall sensor model;
- battery/power measurement circuit;
- network hardware;
- GPIO, I2C, UART, and ADC pin mapping;
- voltage levels and power constraints;
- calibration conversion formulas and approved field procedure.

R9-A intentionally leaves every item unresolved. Physical ESP32 integration
and sensor drivers are R9-B work.
