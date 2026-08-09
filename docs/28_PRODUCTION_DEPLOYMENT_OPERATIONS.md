# Production Deployment and Operations

This is an operational deployment guide for the accepted SiagaLongsor software/research implementation. It does **not** claim full scientific/field calibration, high availability, disaster-recovery certification, or an SLA.

## 1. Release scope

The accepted product is one physical ESP32 deployment with four web pages: Overview, Perangkat, Profil Risiko, and Audit Log. It uses Next.js web, NestJS API, PostgreSQL/Prisma, authenticated HTTP telemetry, and server-authoritative risk.

## 2. Required versions

- Node.js `>=24 <25`
- pnpm `>=10.34.5 <11`
- PostgreSQL 16-compatible baseline

## 3. Deployment topology

```text
Browser -> TLS reverse proxy / HTTPS boundary -> Web + API -> PostgreSQL
ESP32   -> HTTPS API telemetry endpoint
```

The repository does not ship a final cloud-provider-specific infrastructure definition. `docker-compose.yml` is development infrastructure, not a production deployment definition.

## 4. Environment configuration

Inject secrets outside source control. Server environment names are:

```text
NODE_ENV=production
API_PORT
API_TRUST_PROXY_HOPS
WEB_URL
DATABASE_URL
PUBLIC_DEVICE_HARDWARE_ID
AUTH_ACCESS_TOKEN_SECRET
AUTH_JWT_ISSUER
AUTH_JWT_AUDIENCE
AUTH_ACCESS_TOKEN_TTL_SECONDS
AUTH_REFRESH_TOKEN_TTL_SECONDS
AUTH_REFRESH_COOKIE_NAME
AUTH_LOGIN_RATE_LIMIT_TTL_MS
AUTH_LOGIN_RATE_LIMIT_MAX
```

`PUBLIC_DEVICE_HARDWARE_ID` selects the one enabled deployment exposed by the public read-only
Overview. Set it explicitly in production so legacy records cannot become the public source by
accident. Seed variables are bootstrap/development/operator-provisioning inputs, not a runtime
authentication fallback. Frontend build inputs are `NEXT_PUBLIC_API_BASE_URL` and
`NEXT_PUBLIC_PRESENTATION_MODE=false`. `NEXT_PUBLIC_*` values are embedded in the Next.js browser
build; production must not use presentation mode.

## 5. Pre-deployment checks

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm prisma:generate
corepack pnpm prisma:validate
corepack pnpm lint
corepack pnpm format:check
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm openapi:validate
```

## 6. Database migration

Run controlled migrations with:

```sh
corepack pnpm prisma:migrate:deploy
```

Migrations are forward-only; merged/applied migrations must not be edited. This repository does not establish tested production backup/restore automation, so recovery procedures must be separately tested before a real operational deployment.

## 7. Application start

```sh
corepack pnpm --filter @siagalongsor/api start
corepack pnpm --filter @siagalongsor/web start
```

The web development default is normally port 3000. API port is `API_PORT` (development default 3001). Process supervision or container orchestration is a deployment-environment responsibility unless implemented later.

## 8. TLS and trust proxy

Terminate public browser/API traffic with TLS; do not expose PostgreSQL publicly. `API_TRUST_PROXY_HOPS` must equal the actual trusted proxy topology, and `WEB_URL` must match the trusted browser origin. Do not use broad trust-proxy settings.

## 9. Health verification

Verify `GET /api/v1/health`, then open Overview without a session. Confirm that Perangkat, Profil
Risiko, and Audit Log still require a Project Owner login, then test logout. Verify device telemetry
only with authorized credentials.

## 10. Physical provisioning

Follow the [ESP32 integration contract](21_R9_ESP32_INTEGRATION_CONTRACT.md), [field checklist](22_R9_PROVISIONING_AND_FIELD_CHECKLIST.md), and [firmware README](../firmware/esp32/README.md). Do not duplicate device or Wi-Fi secrets in documentation.

## 11. Operational safety

Missing, stale, offline, invalid, or unavailable required hazard data produces `UNKNOWN`, never `SAFE`. Risk is server-authoritative. There is no remote siren control and no AI hazard prediction.

## 12. Logs and secrets

Never log or commit JWT secrets, database passwords, refresh/access tokens, device secrets, or Wi-Fi credentials. The repository does not claim a centralized observability platform.

## 13. Backup/restore status

R10 did not establish a production backup/restore or disaster-recovery guarantee. Do not reuse obsolete RPO/RTO values as validated capability. A separately tested backup/restore procedure is required before operational production deployment.

## 14. Rollback

Application rollback may use a prior known-good tag/build. Do not blindly reverse database migrations; migration-related rollback/recovery requires an explicit compatible plan.

## 15. Known limitations

Soil percentage calibration and final IMU mounting/reference calibration are deferred. Rain `0.70 mm/tip` remains a provisional vendor nominal. There is no battery measurement circuit; LCD is optional/deferred; cellular fallback and persistent flash telemetry queue are outside this release scope.

## 16. Shutdown and maintenance

Use the deployment environment's controlled service shutdown procedure. Presentation commands are not production operation commands.
