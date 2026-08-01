# API Contract

Base path: `/api/v1`

`specs/openapi.yaml` adalah kontrak machine-readable. Dokumen ini menjelaskan semantics yang tidak
cukup diwakili schema. Phase 01–03 telah diimplementasikan. Endpoint dashboard-data Phase 04 pada
contract ini belum menyatakan bahwa runtime-nya sudah tersedia.

## 1. Aturan umum

- Semua timestamp API menggunakan ISO 8601 UTC. Konversi ke WIB hanya dilakukan UI.
- Semua response menyertakan header `x-request-id`.
- Resource API untuk user memakai `{ "data": ... }`.
- List memakai `{ "data": [], "page": { "nextCursor": null, "hasMore": false } }`.
- Sensor series memakai page resource khusus
  `{ "data": { "items": [], "nextCursor": null, "hasMore": false } }`.
- Telemetry acknowledgement tetap flat karena merupakan device protocol.
- Cursor bersifat opaque dan tidak boleh dibangun atau diubah client.
- Default `limit` adalah 25 dan maksimum 100.
- Sorting harus stabil dengan opaque resource ID sebagai tie-breaker.

Error envelope:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Payload tidak valid.",
    "details": [
      {
        "field": "readings.soilMoisturePct",
        "messages": ["Harus bernilai antara 0 dan 100."]
      }
    ]
  },
  "requestId": "req_01K1B6JZTHB7M8Q9K2R4V6W8XY",
  "timestamp": "2026-07-30T08:00:00.000Z"
}
```

`details` hanya ada jika relevan. Validation detail memakai path field stabil dan array pesan.
Error code stabil didefinisikan oleh `ErrorCode` di OpenAPI. Internal stack trace tidak dikirim ke
client.

## 2. Authentication Phase 01

- `POST /auth/login` menerima email/password dan mengembalikan access JWT singkat. Refresh token
  hanya melalui cookie `httpOnly`, `SameSite=Lax`, path `/api/v1/auth`, dan `Secure` di production.
- `POST /auth/refresh` merotasi refresh token sekali pakai. Replay mencabut session family.
- `POST /auth/logout` idempotent, mencabut session family di server, dan menghapus cookie.
- `GET /auth/me` memakai bearer access JWT dan membaca principal/membership terbaru.

Backend tetap memvalidasi session, status user, membership, dan role dari database; authorization
tidak hanya mempercayai claim JWT.

## 3. Organization context dan permission

Semua endpoint user yang organization-scoped, termasuk `/sites`, `/monitoring-points/**`,
`/devices/**`, `/monitoring-overview`, `/dashboard/**`, dan `/alerts/**`, wajib menerima:

```http
X-Organization-Id: <organizationId>
```

Semantics:

- Header tidak ada: `400 ORGANIZATION_CONTEXT_REQUIRED`.
- User tidak memiliki membership aktif: `403 ORGANIZATION_ACCESS_DENIED`.
- Resource berasal dari organisasi lain: `404` dengan code not-found spesifik resource.
- `siteId` dan resource terkait harus berada pada organisasi aktif yang sama.
- Runtime CORS Phase 02 wajib mengizinkan `X-Organization-Id`.
- Telemetry tidak memakai header ini; organisasi diturunkan dari device yang terautentikasi.

Permission matrix:

| Resource        | Operasi                        |     PROJECT_OWNER |      SCHOOL_ADMIN |
| --------------- | ------------------------------ | ----------------: | ----------------: |
| Site            | Lookup list                    |                Ya |                Ya |
| MonitoringPoint | List/detail                    |                Ya |                Ya |
| MonitoringPoint | Create/update                  |                Ya |             Tidak |
| Device          | List/detail                    |                Ya |                Ya |
| Device          | Register/update/rotate/disable |                Ya |             Tidak |
| Telemetry       | Ingest                         | Device credential | Device credential |
| Risk profile    | Read                           |                Ya |                Ya |
| Risk profile    | Replace active version         |                Ya |             Tidak |
| Risk/overview   | Read current/history           |                Ya |                Ya |
| Dashboard data  | Summary dan sensor series      |                Ya |                Ya |
| Alert           | List/detail                    |                Ya |                Ya |
| Alert           | Lifecycle mutation             | Phase 05 deferred | Phase 05 deferred |

UI boleh menggunakan role untuk visibility, tetapi guard backend tetap sumber authorization.

## 4. Site lookup Phase 02

Endpoint read-only:

- `GET /sites`

Endpoint ini hanya lookup untuk pilihan Site pada alur MonitoringPoint dan Device. Site management,
termasuk create, detail, update, dan delete, tetap di luar Phase 02. PROJECT_OWNER dan SCHOOL_ADMIN
dapat membaca hanya Site dari organisasi aktif berdasarkan `X-Organization-Id` dan membership
backend yang masih aktif.

Response hanya memuat opaque `id`, `name`, nullable `address`, dan IANA `timezone`. List memakai
cursor pagination tanpa `totalCount`, dengan limit default 25 dan maksimum 100. Search opsional
mencari `name` dan `address` dengan panjang maksimum 100 karakter. Sort default `name:asc`; pilihan
lain adalah `name:desc` dan `createdAt:desc`.

Cursor tidak boleh diparse client dan terikat pada organisasi aktif, search, sort, nilai sort
terakhir, serta stable id tie-breaker. Cursor invalid atau tidak cocok dengan konteks query
menghasilkan `400 INVALID_CURSOR`.

## 5. MonitoringPoint Phase 02

Endpoint:

- `GET /monitoring-points`
- `POST /monitoring-points`
- `GET /monitoring-points/{monitoringPointId}`
- `PATCH /monitoring-points/{monitoringPointId}`

Resource berisi opaque `id`, `organizationId`, `siteId`, `name`, nullable `description`, nullable
`locationDescription`, `isActive`, nullable `currentDevice`, `createdAt`, dan `updatedAt`.
`organizationId` dan `siteId` immutable setelah dibuat. Monitoring point tidak dapat dinonaktifkan
selama masih memiliki enabled device.

List mendukung filter `siteId`, `isActive`, `search`; sort yang disetujui ada di OpenAPI. Phase 02
tidak memiliki delete, koordinat/peta, risk, telemetry history, alert, atau KPI pada resource ini.

## 6. Device dan credential Phase 02

Endpoint:

- `GET /devices`
- `POST /devices`
- `GET /devices/{deviceId}`
- `PATCH /devices/{deviceId}`
- `POST /devices/{deviceId}/rotate-credential`
- `POST /devices/{deviceId}/disable`

Lifecycle hanya `ENABLED` dan `DISABLED`. Status konektivitas seperti `ONLINE`, `DELAYED`,
`OFFLINE`, dan `MAINTENANCE` bukan lifecycle Phase 02. Tidak ada endpoint enable pada fase ini.
Satu MonitoringPoint maksimal memiliki satu enabled device.

`hardwareId` adalah identifier publik, unik global, dan immutable. Credential memakai:

```http
Authorization: Device <hardwareId>.<secret>
```

Secret mentah hanya muncul pada response register dan rotate dengan `displayOnce: true`. Secret
lama invalid segera setelah rotation berhasil. Secret atau hash tidak boleh ada pada GET/list,
audit log, application log, URL, fixture, atau frontend storage. Disable bersifat idempotent dan
langsung memblokir telemetry.

## 7. Telemetry Phase 02

### Request

`POST /iot/telemetry`

```http
Authorization: Device <hardwareId>.<secret>
Content-Type: application/json
Idempotency-Key: <messageId>
```

`Idempotency-Key` wajib sama persis dengan body `messageId`. Canonical body schema berada di
`specs/telemetry-payload.schema.json`; OpenAPI mereferensikannya langsung. Body tidak memiliki
`deviceId` atau `hardwareId`.

Required body:

- `messageId`
- `bootId`
- `sequence`
- `timestamp`
- `firmwareVersion`
- `readings`
- `deviceAssessment`

`network` optional. Semua object menolak property yang tidak dikenal. `bootId` panjangnya 1–64,
berubah pada setiap boot, dan tetap sama dalam satu boot session. Primary idempotency adalah
`(deviceId, messageId)`; sequence uniqueness adalah `(deviceId, bootId, sequence)`.

`rainfallMmHour` adalah finite number minimum 0 dan tidak memiliki static maximum. Batas atas
teknis baru ditentukan secara configurable setelah datasheet sensor dan kalibrasi lapangan
tersedia.

Runtime memakai batas future timestamp configurable dengan default
`TELEMETRY_MAX_FUTURE_SKEW_SECONDS=300`. Timestamp lebih dari 300 detik ke masa depan ditolak
dengan default tersebut. Telemetry lama tetap diterima sebagai histori, tetapi tidak otomatis
menggantikan latest telemetry state.

`deviceAssessment` memuat `riskLevel` dan `sirenActive` yang dilaporkan firmware. Data ini bukan
`serverRisk`, tidak dipercaya sebagai keputusan keselamatan server, dan hanya disimpan sebagai
pembanding/audit. Management frontend Phase 02 tidak menampilkannya sebagai status risiko.
`serverRisk` baru tersedia setelah risk engine Phase 03.

### Urutan idempotency

1. Autentikasi device.
2. Validasi header dan schema.
3. Canonicalize body tervalidasi dan hitung payload hash.
4. Lookup `(deviceId, messageId)`.
5. Jika baru, insert append-only dan response `201`.
6. Jika hash sama, response `200` dengan `duplicate: true`.
7. Jika hash berbeda, response `409 IDEMPOTENCY_CONFLICT`.
8. Periksa conflict sequence pada `(deviceId, bootId, sequence)`.

Duplicate mengembalikan `telemetryId` dan `receivedAt` asli. Raw payload tidak boleh menyimpan
Authorization header atau credential.

Acknowledgement:

```json
{
  "accepted": true,
  "duplicate": false,
  "telemetryId": "tel_01K1B6N6TDP1R3S7X9Z2B4C6EF",
  "receivedAt": "2026-07-30T07:59:01.120Z"
}
```

Status utama:

- `201`: telemetry baru tersimpan.
- `200`: exact duplicate; row tetap satu.
- `400`: header/schema/timestamp invalid.
- `401`: credential invalid.
- `403`: device disabled.
- `409`: idempotency atau boot-scoped sequence conflict.
- `413`: payload terlalu besar.
- `415`: media type tidak didukung.
- `429`: rate limited.

Phase 02 tidak memiliki heartbeat endpoint atau server risk response.

## 8. Risk profile Phase 03

Endpoint:

- `GET /sites/{siteId}/risk-profile`
- `PUT /sites/{siteId}/risk-profile`

Profile organization-scoped melalui Site. Kedua role dapat membaca, sedangkan PUT hanya untuk
PROJECT_OWNER. Setiap configuration berbeda membuat immutable version baru dan mengaktifkannya
secara atomik. Version lama tidak diedit/dihapus dan assessment lama tidak dihitung ulang.

PUT canonically identik adalah no-op: response `200` mengembalikan active profile dengan
`changed: false`. Request berbeda mengembalikan version baru dengan `changed: true`. Canonical
comparison mencakup calibration status, thresholds, technical ranges, freshness, hysteresis, dan
normalized notes. Site di luar organisasi menghasilkan `404 SITE_NOT_FOUND`.

Profile version 1 memakai threshold provisional:

- SAFE: tilt `< 3`, moisture `< 65`, dan rain `< 20`;
- DANGER: tilt `> 8`, atau rain `> 50` dan moisture `> 85`;
- valid lainnya WATCH.

Nilai ini belum threshold bencana final dan wajib dikalibrasi bersama ahli serta data lapangan.
Profile menyimpan `PROVISIONAL` atau `CALIBRATED`, technical sensor ranges, freshness 20/35 menit,
hysteresis 2/1/10 menit, mismatch tiga sample, notes, version, dan activation timestamps.

## 9. Assessment dan current state Phase 03

Satu telemetry baru membuat paling banyak satu immutable `RiskAssessment` yang terikat pada
`telemetryId` dan profile ID/version. Exact duplicate tidak membuat assessment baru. Assessment
menyimpan server risk, stable reasons, evaluated time, firmware comparison, dan
`affectsCurrentState`.

Late telemetry boleh dinilai untuk histori tetapi memakai `affectsCurrentState: false`: tidak
mengubah projection, counter hysteresis, connectivity, atau alert. Hanya telemetry newly accepted
yang memajukan latest Device state boleh memengaruhi state live. Telemetry acknowledgement Phase 02
tetap tidak memuat `serverRisk`.

Connectivity memakai last newly accepted server receipt:

- ONLINE `<= 20` menit;
- DELAYED `> 20` dan `<= 35` menit;
- OFFLINE `> 35` menit;
- Device DISABLED menjadi UNKNOWN dengan reason `DEVICE_DISABLED`.

DELAYED/OFFLINE selalu membuat current risk UNKNOWN. Current MonitoringPoint state adalah
projection/read model, bukan pengganti immutable assessment history.

## 10. Risk and alert read API Phase 03

Endpoint:

- `GET /monitoring-overview`
- `GET /monitoring-points/{monitoringPointId}/risk-assessments`
- `GET /alerts`
- `GET /alerts/{alertId}`

Semua endpoint memerlukan bearer authentication dan `X-Organization-Id`, tersedia untuk
PROJECT_OWNER dan SCHOOL_ADMIN, serta menyamarkan cross-organization detail sebagai 404. Semua list
memakai cursor opaque, limit default 25/maksimum 100, stable ID tie-breaker, dan tidak memiliki
`totalCount`.

Overview adalah projection untuk konsumsi UI fase berikutnya: MonitoringPoint/Site identity,
nullable active Device/latest telemetry summary, current server risk/connectivity, reasons,
evaluation time, profile version, dan active alert summary. Ini bukan dashboard KPI Phase 04.

Assessment history selalu newest-first (`evaluatedAt:desc`, stable ID). Alert list mendukung filter
Site, MonitoringPoint, type, severity, status, serta sort yang dibekukan di OpenAPI.

## 11. Alert generation dan deduplication Phase 03

Type: `RISK_WATCH`, `RISK_DANGER`, `DEVICE_DELAYED`, `DEVICE_OFFLINE`, dan
`DEVICE_SERVER_MISMATCH`. Severity: `INFO`, `WARNING`, atau `CRITICAL`. Status model disiapkan
sebagai `ACTIVE`, `ACKNOWLEDGED`, `RESOLVED`, dan `FALSE_ALARM`, tetapi Phase 03 hanya membuat alert
ACTIVE dan membacanya.

Satu unresolved alert diperbolehkan per organization/Site/MonitoringPoint/type. Repeated current
observation memperbarui `lastObservedAt` dan `occurrenceCount`; duplicate dan late telemetry tidak.
Risk downgrade atau connectivity recovery tidak auto-resolve alert.

Tidak tersedia endpoint acknowledge, resolve, false-alarm, notification, atau external scheduler
trigger pada Phase 03. Mutation lifecycle alert tetap Phase 05.

## 12. Scheduler contract Phase 03

Connectivity evaluator berjalan default setiap lima menit, menggunakan distributed lock,
idempotent, mengevaluasi Device ENABLED tanpa bergantung pada browser, dan menghasilkan
deduplicated connectivity alerts. Scheduler tidak mengirim notifikasi eksternal dan tidak
memiliki HTTP endpoint.

## 13. Dashboard data foundation Phase 04

Endpoint baru:

- `GET /dashboard/summary`
- `GET /monitoring-points/{monitoringPointId}/sensor-series`

Keduanya memerlukan bearer authentication dan `X-Organization-Id`, tersedia untuk PROJECT_OWNER
dan SCHOOL_ADMIN, serta memakai organization scope backend. Filter `siteId` summary hanya menerima
Site dalam organisasi aktif; Site lain menghasilkan `404 SITE_NOT_FOUND`. Sensor series untuk
MonitoringPoint lintas organisasi menghasilkan `404 MONITORING_POINT_NOT_FOUND`.

Monitoring table dan Recent Alerts tetap memakai endpoint Phase 03:

- Monitoring table: `GET /monitoring-overview`;
- Recent Alerts: `GET /alerts` dengan sort terbaru dan limit kecil;
- Alert detail: `GET /alerts/{alertId}`;
- Assessment history: `GET /monitoring-points/{monitoringPointId}/risk-assessments`.

Tidak dibuat endpoint dashboard yang menduplikasi list tersebut.

### 13.1 Dashboard summary

`GET /dashboard/summary` menerima optional `siteId` dan `windowHours` dengan default 24, minimum 1,
serta maksimum 168. `generatedAt` sama dengan `window.to`; `window.from` tepat `windowHours` sebelum
`to`. Batas window adalah from-inclusive dan to-exclusive.

Aggregate selalu dihitung server-side dari seluruh organization/Site scope, bukan dari satu page
cursor Monitoring Overview atau Alert list. Invariant authoritative:

- `monitoringPoints.active + monitoringPoints.inactive = monitoringPoints.total`;
- risk distribution hanya mencakup MonitoringPoint aktif dan jumlah seluruh bucket sama dengan
  `monitoringPoints.active`;
- MonitoringPoint aktif tanpa trusted current state masuk UNKNOWN; inactive tidak masuk distribusi;
- delayed, offline, invalid, profile unavailable, atau data tak tersedia tidak pernah dihitung SAFE;
- `devices.enabled + devices.disabled = devices.total` untuk Device yang assignment-nya berada
  dalam scope;
- connectivity distribution hanya mencakup Device ENABLED dan seluruh bucket sama dengan
  `devices.enabled`;
- Device ENABLED tanpa trusted connectivity masuk UNKNOWN; Device DISABLED tidak pernah OFFLINE;
- `alerts.active` menghitung unresolved Alert dalam scope;
- `alerts.activeCritical` adalah subset unresolved CRITICAL dan tidak boleh melebihi active;
- `alerts.newInWindow` memakai `firstObservedAt` dalam `[from,to)`, bukan `lastObservedAt` atau
  `occurrenceCount`. Repeated observation bukan Alert baru.

Mapping authoritative UI:

| Komponen                      | Sumber                                               |
| ----------------------------- | ---------------------------------------------------- |
| KPI Titik Monitoring Aktif    | `monitoringPoints.active`                            |
| KPI Peringatan Kritis Aktif   | `alerts.activeCritical`                              |
| KPI Perangkat Tidak Terhubung | `connectivityDistribution.offline`                   |
| KPI Peringatan Baru           | `alerts.newInWindow`                                 |
| Risk distribution donut       | `riskDistribution`                                   |
| Connectivity textual summary  | `connectivityDistribution`                           |
| Monitoring table              | `GET /monitoring-overview`                           |
| Sensor chart                  | `GET /monitoring-points/{id}/sensor-series`          |
| Recent Alerts                 | `GET /alerts?sort=lastObservedAt:desc&limit=<small>` |
| Alert detail                  | `GET /alerts/{alertId}`                              |
| Assessment history            | `GET /monitoring-points/{id}/risk-assessments`       |

Frontend tidak menghitung KPI organisasi dari list paginated. Summary tidak memiliki `totalCount`
atau historical delta palsu. Historical current-state analytics ditunda sampai tersedia histori
authoritative; frontend hanya boleh menampilkan `generatedAt` dan window sebagai konteks.

### 13.2 Sensor series

`GET /monitoring-points/{monitoringPointId}/sensor-series` menerima optional `from`, `to`,
`includeLate`, `cursor`, dan `limit`. Default `to` adalah server evaluation time dan default `from`
24 jam sebelum normalized `to`. `from` wajib lebih kecil dari `to`; range maksimum tujuh hari.
Range lebih panjang menghasilkan `400 VALIDATION_ERROR`.

Default `includeLate=false`. Jika true, accepted late telemetry disertakan dengan `isLate=true`.
Data berasal dari telemetry tervalidasi dan tersimpan. `recordedAt` adalah device timestamp,
sedangkan `serverReceivedAt` tetap terpisah. Histori Device pengganti tetap boleh muncul selama
telemetry tersebut terkait MonitoringPoint yang sama.

Ordering selalu `recordedAt:asc, telemetryId:asc`. Range memakai `[from,to)`. Cursor opaque dan
signed terikat pada organization, MonitoringPoint, normalized range, includeLate, ordering,
boundary recordedAt, dan stable telemetryId. Cursor invalid, expired, atau tidak cocok konteks
menghasilkan `400 INVALID_CURSOR`. Limit default 500 dan maksimum 1000. Tidak ada offset atau
`totalCount`.

Server tidak melakukan interpolation, smoothing, downsampling, atau pembuatan nilai. Gap tetap gap
dan nullable tetap null. Response tidak memuat raw payload, Authorization, credential, hash, atau
field internal organisasi.

## 14. Kontrak fase selanjutnya

SSE, acknowledge/resolve/false-alarm, notification, map, reporting, heartbeat, remote siren,
firmware command, historical warehouse/materialized analytics, dan KPI delta tetap di luar Phase 04.
