# SiagaLongsor

SiagaLongsor is a single-device software/research implementation for landslide-condition monitoring with one physical ESP32 deployment.

## Release status

- Intended first tag: `v0.1.0-research`
- Decision: **READY WITH DOCUMENTED LIMITATIONS**
- This is not a claim of full scientific or field calibration.

## Product

The product has four pages: Overview, Perangkat, Profil Risiko, and Audit Log. Login supports access to those pages; it is not a fifth product module.

## Architecture

- Next.js 16, React 19, TypeScript, Tailwind CSS, and Apache ECharts
- NestJS 11, Prisma 7, and PostgreSQL 16 baseline
- ESP32 with PlatformIO and Arduino framework
- Authenticated HTTP telemetry with deterministic, server-authoritative risk

## Safety invariant

Missing, stale, offline, invalid, or unavailable required hazard data results in `UNKNOWN`, never `SAFE`. The dashboard does not control a remote siren and does not provide AI hazard prediction.

## Quick development setup

1. Copy `.env.example` to `.env` and `apps/web/.env.example` to `apps/web/.env.local`; use local secrets only.
2. Run `corepack pnpm install` and `docker compose up -d postgres`.
3. Run `corepack pnpm prisma:generate`, `corepack pnpm prisma:migrate:deploy`, and `corepack pnpm prisma:seed`.
4. Start API with `corepack pnpm --filter @siagalongsor/api dev` and web with `corepack pnpm --filter @siagalongsor/web dev`.

## Presentation/demo

See [Presentation Demo](docs/PRESENTATION_DEMO.md).

## Deployment and operations

See [Production Deployment and Operations](docs/28_PRODUCTION_DEPLOYMENT_OPERATIONS.md).

## Documentation

See the [documentation index](docs/README.md).

## Validation and release evidence

See the [R10 Final Acceptance Report](docs/27_R10_FINAL_ACCEPTANCE_REPORT.md).

## Known limitations

Soil calibration, final IMU mounting/reference calibration, and final rain calibration remain deferred; the release has no battery measurement circuit, and LCD, cellular fallback, and persistent flash telemetry queue are outside its required scope. Details are recorded in the [R10 Final Acceptance Report](docs/27_R10_FINAL_ACCEPTANCE_REPORT.md).
