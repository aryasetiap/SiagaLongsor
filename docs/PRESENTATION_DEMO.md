# Presentation Demo (Isolated)

This demo uses the real pipeline: simulator → telemetry API → PostgreSQL → risk engine → Overview
and Audit Log. Its readings are synthetic presentation data, **not field data** and never a basis
for a safety decision.

## Isolation and safety

Physical mode uses the physical ESP32 credential and its development/field environment. Do not use
either for this demo. Presentation mode uses a separate Compose project, PostgreSQL, Redis, API,
web, accounts, and exactly one enabled demo device. The simulator writes nothing directly to the
database; it sends telemetry to the API and identifies itself as `presentation-simulator-1.0.0`.

## Exact startup sequence

Run from the repository root in PowerShell. Keep passwords and device credentials only in the
active shell; do not put them in tracked files.

1. Start disposable dependencies on isolated ports.

   ```powershell
   $env:POSTGRES_PASSWORD = Read-Host 'Presentation PostgreSQL password' -MaskInput
   $env:POSTGRES_DB = 'siagalongsor_presentation'
   $env:POSTGRES_PORT = '55433'
   $env:REDIS_PORT = '6380'
   docker compose -p siagalongsor-presentation up -d postgres redis
   ```

2. In an API shell, set isolated runtime and seed configuration, migrate, seed, then start API.

   ```powershell
   $env:DATABASE_URL = "postgresql://siagalongsor:$([uri]::EscapeDataString($env:POSTGRES_PASSWORD))@localhost:55433/siagalongsor_presentation"
   $env:REDIS_URL = 'redis://localhost:6380'
   $env:API_PORT = '3002'
   $env:SEED_ORGANIZATION_NAME = 'SiagaLongsor Presentation'
   $env:SEED_ORGANIZATION_SLUG = 'siagalongsor-presentation'
   $env:SEED_SITE_NAME = 'Demo Terisolasi'
   $env:SEED_SITE_SLUG = 'demo-terisolasi'
   $env:SEED_PROJECT_OWNER_NAME = 'Demo Owner'
   $env:SEED_PROJECT_OWNER_EMAIL = 'demo.owner@example.invalid'
   $env:SEED_PROJECT_OWNER_PASSWORD = Read-Host 'Demo owner password (min 12 chars)' -MaskInput
   $env:SEED_SCHOOL_ADMIN_NAME = 'Demo Admin'
   $env:SEED_SCHOOL_ADMIN_EMAIL = 'demo.admin@example.invalid'
   $env:SEED_SCHOOL_ADMIN_PASSWORD = Read-Host 'Demo admin password (min 12 chars)' -MaskInput
   corepack pnpm prisma:migrate:deploy
   corepack pnpm prisma:seed
   corepack pnpm --filter @siagalongsor/api dev
   ```

3. In a separate shell, start presentation web.

   ```powershell
   $env:NEXT_PUBLIC_API_BASE_URL = 'http://localhost:3002/api/v1'
   $env:NEXT_PUBLIC_PRESENTATION_MODE = 'true'
   corepack pnpm --filter @siagalongsor/web exec next dev --port 3003
   ```

4. Login at `http://localhost:3003` as the demo owner. Register exactly one device with the
   retained provisioning API, using its seeded monitoring point ID. Keep only
   `data.credential.secret` from the response in the next shell.

   ```http
   POST http://localhost:3002/api/v1/devices
   Authorization: Bearer <demo-owner-access-token>
   X-Organization-Id: <demo-organization-id>
   Content-Type: application/json

   { "hardwareId": "PRESENTATION-DEMO-001", "displayName": "Presentation Simulator", "monitoringPointId": "seed_sman17_primary_monitoring_point" }
   ```

5. Copy the six WATCH/DANGER values from the active Risk Profile as non-secret runtime input. This
   drives the synthetic pattern relative to the existing configured profile; it does not create or
   change scientific/calibration thresholds. Then start the stream.

   ```powershell
   $env:SIMULATOR_API_BASE_URL = 'http://localhost:3002/api/v1'
   $env:SIMULATOR_HARDWARE_ID = 'PRESENTATION-DEMO-001'
   $env:SIMULATOR_DEVICE_SECRET = Read-Host 'One-time demo device credential' -MaskInput
   $env:SIMULATOR_PRESENTATION_TILT_MAGNITUDE_DEG_WATCH = '<active WATCH value>'
   $env:SIMULATOR_PRESENTATION_TILT_MAGNITUDE_DEG_DANGER = '<active DANGER value>'
   $env:SIMULATOR_PRESENTATION_SOIL_MOISTURE_PCT_WATCH = '<active WATCH value>'
   $env:SIMULATOR_PRESENTATION_SOIL_MOISTURE_PCT_DANGER = '<active DANGER value>'
   $env:SIMULATOR_PRESENTATION_RAINFALL_MM_HOUR_WATCH = '<active WATCH value>'
   $env:SIMULATOR_PRESENTATION_RAINFALL_MM_HOUR_DANGER = '<active DANGER value>'
   corepack pnpm --filter @siagalongsor/api simulator:device -- --scenario presentation --interval 5000 --count 0
   ```

`--count 0` repeats until `Ctrl+C`. A cycle sends safe-like readings, increasing WATCH readings,
DANGER readings, a genuine required-sensor `null` gap that produces `UNKNOWN`, and fresh recovery
readings. The stream uses unique message IDs, increasing sequence, fresh timestamps, and a 5-second
pace. Server risk remains authoritative: consecutive-sample and downgrade behavior can delay a
visible transition.

## Stop and clean up

Stop simulator, API, and web with `Ctrl+C`. Verify the project name, then remove only disposable
data:

```powershell
docker compose -p siagalongsor-presentation down -v
Remove-Item Env:SIMULATOR_DEVICE_SECRET -ErrorAction SilentlyContinue
Remove-Item Env:POSTGRES_PASSWORD -ErrorAction SilentlyContinue
```

Never run that cleanup against physical/development infrastructure. Never represent synthetic data
as real field data.
