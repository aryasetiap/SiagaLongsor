# Risk Engine and Alert Specification

## 1. Tujuan

Risk engine mengubah telemetry tervalidasi menjadi status yang konsisten, dapat diuji, dan dapat diaudit. Nilai berikut berasal dari rancangan awal alat dan belum boleh dianggap threshold final tanpa kalibrasi ahli.

## 2. Threshold awal

### SAFE

Semua kondisi harus benar:

- Tilt magnitude `< 3°`.
- Soil moisture `< 65%`.
- Rainfall `< 20 mm/hour`.

### WATCH

Salah satu kondisi benar:

- Tilt `>= 3°` dan `<= 8°`.
- Soil moisture `> 70%`.
- Rainfall `>= 20` dan `<= 50 mm/hour`.

Selain itu, kondisi valid yang tidak memenuhi SAFE dan tidak memenuhi DANGER juga masuk WATCH agar gap threshold tidak salah dianggap aman.

### DANGER

Salah satu kondisi benar:

- Tilt `> 8°`.
- Rainfall `> 50 mm/hour` DAN soil moisture `> 85%`.

### UNKNOWN

- Data invalid.
- Sensor wajib tidak tersedia.
- Device stale/delayed melewati batas evaluasi live.
- Device offline.
- Clock device tidak dapat dipercaya dan data tidak dapat direkonsiliasi.

## 3. Urutan evaluasi

```ts
if (!isValid || isStale || deviceUnavailable) return UNKNOWN;
if (dangerRuleMatched) return DANGER;
if (safeRuleMatched) return SAFE;
return WATCH;
```

Tidak boleh mengevaluasi WATCH sebelum DANGER.

## 4. Freshness

Default awal, configurable per site:

- `ONLINE`: last accepted telemetry <= 20 menit.
- `DELAYED`: > 20 menit dan <= 35 menit.
- `OFFLINE`: > 35 menit.

Karena mode normal rancangan alat dapat mengirim setiap 15 menit, toleransi harus lebih besar dari interval tersebut.

Untuk dashboard risk:

- ONLINE + valid → hasil risk engine.
- DELAYED/OFFLINE → UNKNOWN.
- MAINTENANCE → UNKNOWN dengan badge maintenance.

## 5. Validasi sensor

Range awal untuk validasi teknis, bukan threshold bencana:

- `tiltXDeg`, `tiltYDeg`: -180 sampai 180.
- `tiltMagnitudeDeg`: 0 sampai 180.
- `soilMoisturePct`: 0 sampai 100.
- `rainfallMmHour`: 0 sampai batas teknis configurable, misalnya 1000.
- `batteryVoltage`: 0 sampai 30.
- `signalRssi`: -150 sampai 0.

Nilai di luar range ditolak atau ditandai invalid berdasarkan severity.

## 6. Hysteresis dan debounce

Untuk mengurangi alert flapping:

- DANGER dari lonjakan tilt dapat dibuat segera setelah rule terpenuhi dan validasi noise lolos.
- WATCH dapat membutuhkan N pembacaan berurutan atau durasi minimal configurable.
- Downgrade status memerlukan kondisi lebih stabil dibanding upgrade.
- Jangan auto-resolve DANGER hanya karena satu sampel kembali normal.

Contoh parameter profile:

```json
{
  "watchConsecutiveSamples": 2,
  "dangerConsecutiveSamples": 1,
  "downgradeStableMinutes": 10,
  "offlineAfterMinutes": 35
}
```

## 7. Alert generation

### Risk alert

- SAFE -> WATCH: buat `RISK_WATCH`.
- SAFE/WATCH -> DANGER: buat `RISK_DANGER`.
- WATCH -> DANGER: update/close strategy harus eksplisit; rekomendasi membuat critical alert baru dan menghubungkannya ke alert sebelumnya.
- DANGER -> WATCH/SAFE: jangan otomatis resolve tanpa verifikasi operator pada MVP.

### Connectivity alert

- ONLINE -> DELAYED: `DEVICE_DELAYED`, severity warning.
- DELAYED -> OFFLINE: `DEVICE_OFFLINE`, severity critical/ warning sesuai site policy.
- Kembali online: event recovery; alert dapat menunggu operator resolve atau auto-resolve untuk alert operasional non-kritis bila policy mengizinkan.

## 8. Deduplication key

Contoh:

```text
site:<siteId>:point:<pointId>:type:RISK_DANGER:active
```

Saat alert active dengan key sama sudah ada, tambahkan event/update `lastObservedAt`, jangan insert alert baru.

## 9. Server vs firmware assessment

Simpan keduanya:

- `deviceAssessment.riskLevel`.
- `riskAssessment.serverRisk`.

Bila berbeda:

- Simpan reason `DEVICE_SERVER_MISMATCH`.
- Buat operational alert setelah mismatch berulang, bukan berdasarkan satu sampel.
- Jangan otomatis mematikan sirene lokal.

## 10. Versioning

Setiap RiskAssessment menyimpan:

- `thresholdProfileId`.
- `thresholdProfileVersion`.
- `reasons`.
- `evaluatedAt`.

Perubahan threshold tidak mengubah histori lama. Reprocessing histori harus menjadi job terpisah dengan versi hasil berbeda.

## 11. Unit test matrix minimum

- Semua nilai di bawah SAFE.
- Tilt tepat 3, tepat 8, di atas 8.
- Moisture tepat 65, 70, 85, di atas 85.
- Rainfall tepat 20, 50, di atas 50.
- Gap moisture 65–70.
- Rainfall > 50 tanpa moisture > 85.
- Invalid/null sensor.
- Stale data.
- Danger precedence.
- Threshold profile berbeda.
- Hysteresis/downgrade.
