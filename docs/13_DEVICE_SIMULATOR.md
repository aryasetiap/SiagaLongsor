# Device Telemetry Simulator

Simulator mengirim telemetry canonical ke API nyata untuk development dan acceptance sebelum firmware ESP32 tersedia. Nilai `deviceAssessment.riskLevel: SAFE` dihasilkan sebagai simulasi laporan
firmware, bukan server risk assessment dan bukan keputusan keselamatan server.

## Prasyarat

1. PostgreSQL berjalan:

   ```bash
   docker compose up -d postgres
   ```

2. Migration sudah diterapkan dan API berjalan. Pada setup monorepo saat ini API langsung biasanya
   tersedia di `http://localhost:3001/api/v1`.
3. Login sebagai `PROJECT_OWNER`. Simpan access token hanya pada environment atau memory shell
   selama sesi development:

   ```http
   POST /api/v1/auth/login
   Content-Type: application/json

   {
     "email": "<project-owner-email>",
     "password": "<local-password>"
   }
   ```

4. Gunakan access token tersebut untuk register device pada monitoring point aktif:

   ```http
   POST /api/v1/devices
   Authorization: Bearer <access-token>
   X-Organization-Id: <organization-id>
   Content-Type: application/json

   {
     "hardwareId": "DEVICE-001",
     "displayName": "Simulator Device",
     "monitoringPointId": "<monitoring-point-id>"
   }
   ```

5. Salin raw secret dari response register sekali saja ke environment lokal. Jangan menaruhnya di
   source code, file dokumentasi, command argument, shell history, fixture, atau Git.

## Configuration

| Variable                       | Wajib | Default                        |
| ------------------------------ | ----: | ------------------------------ |
| `SIMULATOR_API_BASE_URL`       | Tidak | `http://localhost:3000/api/v1` |
| `SIMULATOR_HARDWARE_ID`        |    Ya | -                              |
| `SIMULATOR_DEVICE_SECRET`      |    Ya | -                              |
| `SIMULATOR_SCENARIO`           | Tidak | `normal`                       |
| `SIMULATOR_COUNT`              | Tidak | `10`                           |
| `SIMULATOR_INTERVAL_MS`        | Tidak | `5000`                         |
| `SIMULATOR_SEQUENCE_START`     | Tidak | `1`                            |
| `SIMULATOR_TILT_MAGNITUDE_DEG` | Tidak | `0.9` (demo)                   |
| `SIMULATOR_SOIL_MOISTURE_PCT`  | Tidak | `62.5` (demo)                  |
| `SIMULATOR_RAINFALL_MM_HOUR`   | Tidak | `12.4` (demo)                  |
| `SIMULATOR_BATTERY_VOLTAGE`    | Tidak | `12.7` (demo)                  |

Default port 3000 mendukung deployment yang mengekspos API melalui gateway yang sama. Untuk API
development NestJS secara langsung, set `SIMULATOR_API_BASE_URL` ke
`http://localhost:3001/api/v1`.

CLI hanya menerima option non-rahasia: `--scenario`, `--count`, `--interval`, dan
`--sequence-start`. Secret sengaja tidak memiliki CLI option.

Nilai sensor adalah input development/test, bukan rekomendasi threshold longsor ilmiah. Gunakan literal kecil `null` untuk menyatakan sensor tidak tersedia secara jujur (misalnya `$env:SIMULATOR_TILT_MAGNITUDE_DEG = "null"` atau `export SIMULATOR_TILT_MAGNITUDE_DEG=null`); nilai tidak disubstitusi menjadi nol.

## PowerShell

Gunakan input bertopeng agar secret tidak masuk command history:

```powershell
$env:SIMULATOR_API_BASE_URL = "http://localhost:3001/api/v1"
$env:SIMULATOR_HARDWARE_ID = "DEVICE-001"
$env:SIMULATOR_DEVICE_SECRET = Read-Host "One-time device secret" -MaskInput

corepack pnpm --filter @siagalongsor/api simulator:device -- `
  --scenario normal --count 10 --interval 1000

Remove-Item Env:SIMULATOR_DEVICE_SECRET
```

## Git Bash

```bash
export SIMULATOR_API_BASE_URL="http://localhost:3001/api/v1"
export SIMULATOR_HARDWARE_ID="DEVICE-001"
read -r -s -p "One-time device secret: " SIMULATOR_DEVICE_SECRET
echo
export SIMULATOR_DEVICE_SECRET

corepack pnpm --filter @siagalongsor/api simulator:device -- \
  --scenario normal --count 10 --interval 1000

unset SIMULATOR_DEVICE_SECRET
```

## Scenario

Jalankan salah satu nama berikut melalui `--scenario <nama>`:

- `normal`: mengirim `count` telemetry valid, message ID unik, dan sequence bertambah.
- `duplicate`: mengirim payload identik dua kali dan memverifikasi response `201` lalu `200`.
- `sequence-conflict`: memverifikasi `409 SEQUENCE_CONFLICT`.
- `idempotency-conflict`: memverifikasi `409 IDEMPOTENCY_CONFLICT`.
- `late`: mengirim data terkini lalu data satu jam lebih lama; keduanya harus diterima.
- `missing-tilt`: mengirim telemetri dengan `tiltMagnitudeDeg: null` untuk memverifikasi status server `UNKNOWN`.
- `presentation`: stream sintetis untuk environment demo terisolasi. Memerlukan enam environment
  `SIMULATOR_PRESENTATION_<SENSOR>_{WATCH,DANGER}` yang disalin dari Profil Risiko aktif dan
  memakai firmware `presentation-simulator-1.0.0`. Lihat `PRESENTATION_DEMO.md`; jangan gunakan
  credential atau database perangkat fisik.

Contoh:

```bash
corepack pnpm --filter @siagalongsor/api simulator:device -- --scenario duplicate
corepack pnpm --filter @siagalongsor/api simulator:device -- --scenario sequence-conflict
corepack pnpm --filter @siagalongsor/api simulator:device -- --scenario idempotency-conflict
corepack pnpm --filter @siagalongsor/api simulator:device -- --scenario late
```

Gunakan `--help` untuk ringkasan konfigurasi. Simulator berhenti dengan exit code non-zero ketika
konfigurasi invalid, API tidak tersedia, response tidak dapat diparse, atau hasil scenario tidak
sesuai kontrak. `SIGINT` dan `SIGTERM` menghentikan simulator secara graceful.

Setelah mengirim sample, verifikasi alur manual di dashboard: **Overview** menampilkan pembacaan/histori/risk otoritatif, **Perangkat** menampilkan keterbacaan sensor, lalu **Audit Log** menampilkan transisi risk. Server tetap merupakan penentu risk; simulator tidak menentukan keselamatan.
