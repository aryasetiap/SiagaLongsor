# API Contract

> Redis Pub/Sub, reports, and SSE sections are superseded by the single-device HTTP contract and
> ADR 0006. `specs/openapi.yaml` is the machine-readable authority.

> **Revised target contract — R1 scope reset.** Runtime dan `specs/openapi.yaml` saat ini masih
> merepresentasikan implementasi pre-reset. Tidak ada endpoint runtime yang dihapus dalam R1;
> bagian Phase 01–06 di bawah adalah catatan runtime/history, bukan kebutuhan produk final.
>
> Arah kontrak minimal untuk refactor berikutnya adalah konseptual (bukan klaim bahwa endpoint ini
> sudah tersedia):
>
> ```text
> POST /api/v1/auth/login
> GET  /api/v1/auth/me
> GET  /api/v1/health
> POST /api/v1/iot/telemetry
> GET  /api/v1/overview
> GET  /api/v1/device
> GET  /api/v1/risk-profile
> PUT  /api/v1/risk-profile
> GET  /api/v1/audit-log
> ```
>
> Target semantics: login/me untuk administrator; health untuk liveness API; telemetry memakai
> credential perangkat dan idempotency; overview memberi current authoritative state dan history
> sensor; device memberi konektivitas/last seen/health setiap sensor; risk profile memberi profile
> threshold versioned dan PUT tervalidasi/auditable; audit log memprioritaskan transisi hazard
> beserta alasan, snapshot, dan referensi profile bila ada. Required telemetry stale, offline,
> invalid, atau unavailable selalu menghasilkan `UNKNOWN`, tidak pernah `SAFE`.
>
> R2 memperbarui machine-readable OpenAPI **sebelum atau bersama** perubahan implementasi
> menurut workflow contract-first. R1 sengaja tidak mengubah `specs/openapi.yaml` atau mendefinisikan
> schema OpenAPI lengkap.

## Pre-reset runtime/history

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

`network` optional. Semua object menolak property yang tidak dikenal. `bootId` panjangnya 1–64,
berubah pada setiap boot, dan tetap sama dalam satu boot session. Primary idempotency adalah
`(deviceId, messageId)`; sequence uniqueness adalah `(deviceId, bootId, sequence)`.

`readings` wajib memuat `tiltMagnitudeDeg`, `soilMoisturePct`, `rainfallMmHour`, dan
`batteryVoltage`. Nilai `null` berarti sensor unavailable/unreadable dan tidak boleh diganti dengan
`0`. `tiltXDeg` dan `tiltYDeg` adalah diagnostik optional yang menerima numeric finite atau `null`.

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

Notification eksternal, map, reporting, heartbeat, remote siren, firmware command, historical
warehouse/materialized analytics, dan KPI delta tetap di luar Phase 04. Operasi lifecycle alert dan
SSE dibekukan pada kontrak Phase 05 berikut.

## 15. Alert operations Phase 05

Semua endpoint memerlukan bearer token dan `X-Organization-Id`. Resource organisasi lain
dilaporkan sebagai `404 ALERT_NOT_FOUND`. Permission matrix:

| Operasi                              | PROJECT_OWNER | SCHOOL_ADMIN |
| ------------------------------------ | ------------- | ------------ |
| Alert list/detail/events             | Ya            | Ya           |
| `POST /alerts/{alertId}/acknowledge` | Ya            | Ya           |
| `POST /alerts/{alertId}/resolve`     | Ya            | Tidak        |
| `POST /alerts/{alertId}/false-alarm` | Ya            | Tidak        |
| `GET /audit-logs`                    | Ya            | Tidak        |
| `GET /realtime/stream`               | Ya            | Ya           |

### 15.1 Lifecycle dan request

- Acknowledge menerima `actionId`, `note` (1–2000), `fieldCondition` (1–1000), dan
  `sopExecuted`; hanya `ACTIVE -> ACKNOWLEDGED`.
- Resolve menerima `actionId` dan `resolutionNote` (1–2000); hanya
  `ACKNOWLEDGED -> RESOLVED`.
- False alarm menerima `actionId` dan `reason` (1–2000); menerima `ACTIVE` atau
  `ACKNOWLEDGED` menuju `FALSE_ALARM`.
- `RESOLVED` dan `FALSE_ALARM` terminal; tidak ada reopen. Observasi baru tidak mengubah
  `ACKNOWLEDGED` menjadi `ACTIVE`. Kondisi baru setelah terminal membuat alert baru.

Semua text field ditrim server sebelum divalidasi/disimpan. `actorId` berasal dari authenticated
user dan `actedAt` berasal dari clock server; client tidak dapat menentukan keduanya.

Setiap mutation wajib mengirim `Idempotency-Key` berupa UUID v4 yang dibuat client dan sama persis
dengan body `actionId`. Key terikat pada organization, alert, jenis aksi, dan canonical payload;
`requestId` bukan idempotency key. Retry identik mengembalikan hasil aksi pertama tanpa menambah
AlertEvent atau AuditLog. Penggunaan key yang sama untuk payload atau context berbeda menghasilkan
`409 IDEMPOTENCY_CONFLICT`. Status asal yang tidak valid menghasilkan
`409 ALERT_STATE_CONFLICT`.

Implementasi wajib melakukan authorization, serialisasi/lock Alert, validasi status, update Alert,
append AlertEvent, dan append AuditLog dalam satu transaksi. Publish realtime dilakukan hanya
setelah commit. Pada aksi paralel hanya satu pemenang; request lain menerima hasil retry identik
atau conflict deterministik, bukan error database. Urutan lock canonical harus sama dengan proses
observasi agar lifecycle action dan telemetry observation tidak deadlock atau membangkitkan status
lama.

### 15.2 Event dan audit history

`GET /alerts/{alertId}/events` tersedia untuk kedua role, newest-first, cursor pagination default 25
dan maksimum 100, tanpa `totalCount`. Event type mencakup `CREATED`, `OBSERVED`,
`CONNECTIVITY_TRANSITION`, `ALERT_ACKNOWLEDGED`, `ALERT_RESOLVED`, dan `ALERT_FALSE_ALARM`.
Projection memisahkan `observedAt` dan `actedAt`, serta dapat memuat actor summary,
`riskAssessmentId`, dan `telemetryId` nullable. Metadata strict dan tersanitasi.

`GET /audit-logs` hanya untuk `PROJECT_OWNER`. Filter yang tersedia: `eventType`, `entityType`,
`entityId`, `actorId`, `from`, `to`, cursor, dan limit. `from` inclusive, `to` exclusive,
`from < to`, urutan newest-first dengan stable ID tie-breaker, tanpa `totalCount`, dan rentang waktu
maksimum 30 hari. Public projection tidak memuat alamat IP, user agent, password,
token, credential, Authorization header, atau raw request.

## 16. Realtime notification Phase 05

`GET /realtime/stream` menggunakan bearer header dan `X-Organization-Id` melalui fetch-based SSE;
token query parameter dilarang. Event type dibatasi pada `ALERT_CREATED`, `ALERT_OBSERVED`,
`ALERT_ACKNOWLEDGED`, `ALERT_RESOLVED`, `ALERT_FALSE_ALARM`, dan
`MONITORING_POINT_STATE_CHANGED`.

SSE hanya notifikasi invalidation; REST tetap authoritative. Stream tidak durable, tidak menjamin
exactly-once, dapat mengirim notifikasi duplicate, dan tidak menjamin replay. `Last-Event-ID` hanya
untuk observability. Server mengirim comment `: keepalive` setiap 15 detik. Client reconnect dengan
jitter pada backoff 1, 2, 5, 10, lalu
maksimum 30 detik dan selalu refetch REST setelah reconnect. Refresh token/session invalidation dan
pergantian organisasi harus menutup stream lama sebelum membuka stream baru.

Redis Pub/Sub digunakan untuk fan-out multi-instance. Publisher mengirim setelah transaksi database
commit; kegagalan publish tidak membatalkan lifecycle action. Envelope SSE hanya membawa
`eventId`, `eventType`, `occurredAt`, dan ID resource nullable yang diperlukan untuk menentukan REST
resource yang harus di-refetch.

## 17. SOP boundary Phase 05

UI menyediakan quick access ke SOP yang sudah tersedia. Bila dokumen belum tersedia, UI harus
menampilkan keadaan jujur bahwa SOP belum tersedia. Phase 05 tidak membuat upload/persistence SOP,
tidak menghasilkan isi prosedur darurat sintetis, dan tidak menggantikan prosedur sekolah.

## 18. Phase 06 map, SOP documents, dan reports

Semua endpoint berikut memakai bearer authentication dan `X-Organization-Id`. Resource milik
organisasi lain dilaporkan `404`; kedua role dapat membaca, sedangkan mutation konfigurasi map dan
upload SOP hanya `PROJECT_OWNER`.

### 18.1 Map configuration dan overview

- `GET /sites/{siteId}/map-config` membaca versi aktif; Site tanpa konfigurasi menghasilkan
  `404 MAP_CONFIG_NOT_FOUND`.
- `PUT /sites/{siteId}/map-config` menerima `expectedVersion` (`null` hanya untuk versi pertama).
  Stale version menghasilkan `409 MAP_CONFIG_VERSION_CONFLICT`. Canonical-identical payload
  menghasilkan `changed:false`; payload berbeda membuat versi immutable baru dan audit
  `MAP_CONFIG_VERSION_CREATED` tanpa menyalin geometry penuh ke metadata audit.
- `GET /map/overview?siteId=...` mengembalikan snapshot whole-Site tanpa pagination atau
  `totalCount`. Tanpa konfigurasi, response tetap `200` dengan `configured:false`, center/version
  null, dan geometry/markers kosong.

Geometry mengikuti GeoJSON WGS84/EPSG:4326 dengan posisi `[longitude, latitude]`; altitude,
NaN/infinity, koordinat di luar rentang, ring terbuka, dan LineString tidak valid ditolak.
Validation portable Phase 06 tidak menjamin deteksi topology/self-intersection GIS penuh. Polygon
dan evacuation route adalah referensi manual statis, bukan prediksi atau automatic route.
Marker hanya dibuat untuk MonitoringPoint dengan koordinat dan memakai current projection
authoritative; tidak ada fabricated coordinates maupun status `SAFE` untuk data unknown/stale.

Risk-zone feature memakai `featureId` UUID v4, name, description nullable, dan GeoJSON Polygon;
ia sengaja tidak memiliki dynamic `riskLevel`. Evacuation-route feature memakai `featureId` UUID
v4, name, description/destination label nullable, dan GeoJSON LineString. ID MonitoringPoint wajib
unik dalam satu config serta harus berasal dari Site dan organisasi yang sama. Audit perubahan map
hanya menyimpan Site, previous/new version, dan jumlah point/zone/route—bukan full GeoJSON.

### 18.2 SOP PDF

- `GET /sites/{siteId}/sop` membaca active metadata; belum ada dokumen menghasilkan
  `404 SOP_NOT_FOUND`.
- `POST /sites/{siteId}/sop` adalah multipart upload owner-only dan selalu membuat versi baru.
- `GET /sites/{siteId}/sop/versions` memakai opaque cursor, default 25, maksimum 100,
  newest-first, tanpa `totalCount`.
- `GET /sop-documents/{documentId}/content` mengalirkan private PDF melalui authenticated API.

Upload dibatasi PDF non-empty maksimal 10 MiB. Server memeriksa declared MIME, ekstensi filename
tersanitasi, PDF magic signature, menghitung SHA-256, dan membuat opaque object key. Tidak ada
public/permanent signed URL. Version metadata dan active pointer berubah atomik; orphan object
dibersihkan bila persistence gagal. Audit `SOP_VERSION_UPLOADED` tidak memuat byte, key, hash
credential, atau request mentah. Validasi ini tidak menyatakan dokumen bebas malware.
Metadata audit upload dibatasi pada Site, document ID, version, ukuran, dan SHA-256.

### 18.3 CSV export

`GET /reports/telemetry.csv` tersedia bagi kedua role untuk satu Site dan rentang `[from,to)`
maksimum **31 hari**. Output stabil oldest-first (`recordedAt`, lalu telemetry ID), RFC
4180-compatible, tetap mengirim header untuk hasil kosong, mempertahankan null sebagai field kosong
dan `UNKNOWN` apa adanya. Text yang dimulai `=`, `+`, `-`, atau `@` dinetralkan untuk mencegah
formula injection. Raw payload, credential, hash, dan header tidak diekspor.

### 18.4 Asynchronous PDF reports

- `POST /report-jobs` menerima `SITE_PERIOD_SUMMARY_PDF`, Site, dan `[from,to)` maksimum 31 hari;
  response `202` dengan job `QUEUED` dan audit `REPORT_JOB_CREATED`.
- `GET /report-jobs` adalah organization-visible cursor list newest-first tanpa `totalCount`.
- `GET /report-jobs/{reportJobId}` membaca durable status.
- `GET /report-jobs/{reportJobId}/content` hanya mengunduh artifact `SUCCEEDED` yang belum expired;
  expired menghasilkan `410 REPORT_ARTIFACT_UNAVAILABLE`.

Kedua role dapat membuat/membaca job organisasi. Pembuatan tidak menunggu PDF; BullMQ worker
menjalankan retry terbatas dan idempotent. Regenerasi selalu membuat job baru. Artifact private
berumur 90 hari. PDF memakai persisted Telemetry/RiskAssessment/Alert history, menjaga nilai
missing, serta memberi label current snapshot sebagai **“Status saat laporan dibuat”**; sistem
tidak merekonstruksi current-state historis atau membuat kesimpulan geoteknis. Failure detail
yang keluar hanya kode tersanitasi.

Stable failure code Phase 06 adalah `REPORT_GENERATION_FAILED` dan
`REPORT_ARTIFACT_UNAVAILABLE`. Public projection boleh memuat failure message tersanitasi maksimal
500 karakter, tetapi tidak memuat exception, stack trace, queue internals, Redis key, object key,
atau provider path.
