# API Contract

Base path: `/api/v1`

`specs/openapi.yaml` adalah kontrak machine-readable. Dokumen ini menjelaskan semantics yang tidak
cukup diwakili schema. Contract Phase 02 ini belum menyatakan bahwa endpoint sudah
diimplementasikan.

## 1. Aturan umum

- Semua timestamp API menggunakan ISO 8601 UTC. Konversi ke WIB hanya dilakukan UI.
- Semua response menyertakan header `x-request-id`.
- Resource API untuk user memakai `{ "data": ... }`.
- List memakai `{ "data": [], "page": { "nextCursor": null, "hasMore": false } }`.
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

Semua endpoint `/monitoring-points/**` dan `/devices/**` wajib menerima:

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
| MonitoringPoint | List/detail                    |                Ya |                Ya |
| MonitoringPoint | Create/update                  |                Ya |             Tidak |
| Device          | List/detail                    |                Ya |                Ya |
| Device          | Register/update/rotate/disable |                Ya |             Tidak |
| Telemetry       | Ingest                         | Device credential | Device credential |

UI boleh menggunakan role untuk visibility, tetapi guard backend tetap sumber authorization.

## 4. MonitoringPoint Phase 02

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

## 5. Device dan credential Phase 02

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

## 6. Telemetry Phase 02

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

## 7. Kontrak fase selanjutnya

Dashboard, alerts, threshold profile, risk history, SSE, map, reporting, notification worker, dan
remote siren bukan bagian implementasi Phase 02. Placeholder OpenAPI yang masih ada untuk kontrak
fase berikutnya tidak mengubah scope delivery Phase 02.
