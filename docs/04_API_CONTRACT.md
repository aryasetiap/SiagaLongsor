# API Contract

Base path: `/api/v1`

Semua timestamp menggunakan ISO 8601 UTC. Frontend menampilkan WIB.

## 1. Error envelope

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Payload tidak valid",
    "details": [
      { "field": "readings.soilMoisturePct", "message": "must be between 0 and 100" }
    ],
    "requestId": "req_01..."
  }
}
```

## 2. Pagination

Request:

`GET /alerts?cursor=...&limit=25`

Response:

```json
{
  "data": [],
  "page": {
    "nextCursor": null,
    "hasMore": false
  }
}
```

Gunakan cursor pagination untuk list besar.

## 3. Device ingestion

### POST `/iot/telemetry`

Header minimum:

```http
Authorization: Device <deviceId>.<secret>
Content-Type: application/json
Idempotency-Key: <messageId>
```

Success baru:

```json
{
  "accepted": true,
  "duplicate": false,
  "telemetryId": "clx...",
  "serverRisk": "SAFE",
  "receivedAt": "2026-07-29T08:00:01.120Z"
}
```

Success duplikat:

```json
{
  "accepted": true,
  "duplicate": true,
  "telemetryId": "clx...",
  "serverRisk": "SAFE",
  "receivedAt": "2026-07-29T08:00:01.120Z"
}
```

Status code:

- `201` data baru.
- `200` duplicate yang sudah pernah diterima.
- `400` schema invalid.
- `401` credential invalid.
- `403` device disabled.
- `409` sequence conflict dengan payload berbeda.
- `429` rate limited.

### POST `/iot/heartbeat`

Untuk heartbeat ringan bila telemetry tidak dikirim sering.

```json
{
  "messageId": "01J...",
  "deviceId": "SMAN17-LS-001",
  "timestamp": "2026-07-29T08:00:00Z",
  "sequence": 18423,
  "firmwareVersion": "1.0.0",
  "batteryVoltage": 12.7,
  "signalRssi": -67,
  "networkType": "WIFI"
}
```

## 4. Dashboard

### GET `/dashboard/summary`

```json
{
  "data": {
    "monitoringPoints": 1,
    "criticalAlerts": 0,
    "devicesOffline": 0,
    "newAlerts24h": 0,
    "riskDistribution": {
      "safe": 1,
      "watch": 0,
      "danger": 0,
      "unknown": 0
    },
    "generatedAt": "2026-07-29T08:00:03Z"
  }
}
```

### GET `/dashboard/recent-alerts?limit=5`

Mengembalikan alert terbaru sesuai permission user.

## 5. Monitoring points

- `GET /monitoring-points`
- `GET /monitoring-points/:id`
- `GET /monitoring-points/:id/telemetry?from=&to=&resolution=`
- `GET /monitoring-points/:id/risk-history?from=&to=`

Resolution:

- `raw`
- `1m`
- `5m`
- `1h`
- `1d`

Backend dapat menolak `raw` untuk rentang terlalu panjang.

## 6. Alerts

- `GET /alerts`
- `GET /alerts/:id`
- `POST /alerts/:id/acknowledge`
- `POST /alerts/:id/resolve`
- `POST /alerts/:id/false-alarm`

Acknowledge body:

```json
{
  "note": "Petugas telah memeriksa area belakang kelas.",
  "fieldCondition": "Tidak ditemukan pergerakan visual, hujan masih berlangsung.",
  "sopExecuted": false
}
```

Resolve body:

```json
{
  "note": "Kondisi kembali stabil dan telah diverifikasi.",
  "resolutionCode": "CONDITION_NORMALIZED"
}
```

## 7. Devices

Project Owner:

- `POST /devices`
- `PATCH /devices/:id`
- `POST /devices/:id/rotate-credential`
- `POST /devices/:id/start-maintenance`
- `POST /devices/:id/end-maintenance`
- `POST /devices/:id/disable`

Semua user terotorisasi:

- `GET /devices`
- `GET /devices/:id`
- `GET /devices/:id/status-history`
- `GET /devices/:id/maintenance`

Credential hanya ditampilkan satu kali saat dibuat/dirotasi.

## 8. Threshold profiles

- `GET /threshold-profiles`
- `POST /threshold-profiles` — Project Owner.
- `GET /threshold-profiles/:id`
- `POST /threshold-profiles/:id/activate` — Project Owner.

Activation harus transaction:

1. Nonaktifkan profile lama.
2. Aktifkan profile baru.
3. Tulis audit log.
4. Publish config-changed event.

## 9. Users

- `GET /users`
- `POST /users/invite`
- `PATCH /users/:id/role`
- `POST /users/:id/disable`

Project Owner tidak boleh menghapus role PROJECT_OWNER terakhir.

## 10. Reports

- `POST /reports` membuat job.
- `GET /reports/:id` melihat status.
- `GET /reports/:id/download` mengunduh hasil.

Jenis awal:

- `TELEMETRY_CSV`
- `ALERT_SUMMARY_PDF`
- `DEVICE_UPTIME_CSV`
- `INCIDENT_REPORT_PDF`

## 11. SSE

Endpoint:

`GET /events/stream`

Contoh event:

```text
event: risk.changed
id: evt_01...
data: {"monitoringPointId":"...","from":"SAFE","to":"WATCH","occurredAt":"..."}
```

Client wajib reconnect dan refetch setelah koneksi kembali.
