# Firmware and Dual Connectivity Integration

> Historical connectivity planning record. The accepted R9/R10 physical baseline is Wi-Fi/NTP; cellular fallback and persistent flash queue remain outside required final release scope. Use [R9 integration contract](21_R9_ESP32_INTEGRATION_CONTRACT.md), [provisioning checklist](22_R9_PROVISIONING_AND_FIELD_CHECKLIST.md), and the firmware README for current guidance.

## 1. Target konektivitas

- Wi-Fi: primary.
- Modem seluler: fallback.
- Keduanya mengirim kontrak payload yang sama ke endpoint HTTPS.

ESP32 standar tidak memiliki koneksi seluler internal. Implementasi seluler memerlukan salah satu opsi:

1. External LTE modem via UART, misalnya keluarga SIM7600 atau perangkat setara.
2. Router/modem seluler yang menyediakan Wi-Fi kepada ESP32.

Untuk MVP, opsi router/modem seluler yang memberikan jaringan Wi-Fi cadangan biasanya lebih sederhana. Bila perangkat harus berpindah otomatis di level firmware antara Wi-Fi lokal dan modem UART, diperlukan implementasi serta pengujian tambahan.

## 2. Network manager state

```text
WIFI_CONNECTED
WIFI_CONNECTING
CELLULAR_CONNECTED
CELLULAR_CONNECTING
OFFLINE_BUFFERING
```

Urutan dasar:

1. Coba Wi-Fi selama timeout configurable.
2. Bila gagal, coba cellular.
3. Bila keduanya gagal, simpan data ke queue lokal.
4. Retry dengan exponential backoff + jitter.
5. Saat koneksi pulih, kirim queue dari data terlama.
6. Gunakan messageId yang sama pada setiap retry.

## 3. Store-and-forward

Setiap item queue minimum:

- messageId.
- sequence.
- deviceTimestamp.
- readings.
- firmwareVersion.
- local risk.
- siren state.

Queue dapat menggunakan flash ring buffer atau SD card bila hardware ditambahkan. Kapasitas dan wear harus diperhitungkan.

## 4. Idempotency

`messageId` dibuat sekali saat pembacaan dihasilkan. Jangan membuat messageId baru ketika berganti jaringan.

`sequence` monoton per device dan disimpan agar tidak reset diam-diam setelah reboot. Bila sequence dapat reset, sertakan bootId.

Payload yang disarankan:

```json
{
  "messageId": "01JXYZ...",
  "deviceId": "SMAN17-LS-001",
  "bootId": "boot-20260729-001",
  "sequence": 18422,
  "timestamp": "2026-07-29T08:00:00Z",
  "firmwareVersion": "1.0.0",
  "network": {
    "type": "WIFI",
    "signalRssi": -67
  },
  "readings": {
    "tiltXDeg": 1.25,
    "tiltYDeg": 0.86,
    "tiltMagnitudeDeg": 1.52,
    "soilMoisturePct": 61.4,
    "rainfallMmHour": 12.8,
    "batteryVoltage": 12.7
  },
  "deviceAssessment": {
    "riskLevel": "SAFE",
    "sirenActive": false
  }
}
```

## 5. Local safety logic

- Server tidak diperlukan untuk mengaktifkan sirene.
- Kehilangan internet tidak menonaktifkan local risk engine.
- Remote command untuk sirene tidak dibuat pada MVP.
- Firmware harus memiliki watchdog.
- Kalibrasi sensor harus disimpan dengan version/config ID.

## 6. Server acknowledgement

Device menghapus queue item hanya ketika server memberi respons accepted/duplicate.

Contoh:

```json
{
  "accepted": true,
  "duplicate": false,
  "telemetryId": "...",
  "receivedAt": "..."
}
```

Untuk 4xx permanen, firmware menyimpan error diagnostic dan tidak retry agresif. Untuk 5xx/timeout, retry.

## 7. Security provisioning

- Device ID dan secret diprovision oleh Project Owner.
- Secret tidak ditulis pada log serial produksi.
- Wi-Fi password/APN tidak di-hard-code di repository publik.
- Sediakan recovery/provisioning mode fisik yang aman.
- Rotasi credential memerlukan proses reprovisioning terkontrol.

## 8. Simulator

Sebelum firmware selesai, buat CLI simulator TypeScript yang dapat:

- Mengirim SAFE/WATCH/DANGER.
- Mengirim payload invalid.
- Mengirim duplicate.
- Mensimulasikan offline.
- Mengirim historical queued data.
- Mengganti network type WIFI/CELLULAR.
