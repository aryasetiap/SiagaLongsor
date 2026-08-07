# Presentation Demo (Isolated)

Synthetic presentation data uses the real API, database, risk engine, and dashboard pipeline. It is never field data or a basis for a safety decision. The server remains authoritative for risk; the simulator only sends telemetry.

## First time

```powershell
corepack pnpm presentation:setup
```

This creates the ignored `.env.presentation.local` with local random secrets. It contains no physical ESP32 credential and must never be committed. To choose values yourself, copy `.env.presentation.example` to that local file and use passwords of at least 12 characters plus a 32-character authentication secret.

## Every presentation

```powershell
corepack pnpm presentation:start
```

Open <http://localhost:3003> (or run `corepack pnpm presentation:open`). The presentation API is intentionally configured with `WEB_URL=http://localhost:3003`; this is the explicit CORS origin, not a wildcard.

## After presentation

```powershell
corepack pnpm presentation:stop
```

## Clean reset

```powershell
corepack pnpm presentation:reset
```

Reset asks you to type `siagalongsor-presentation` before it removes volumes. It targets only the Docker Compose project of that exact name and clears only ignored `tmp/presentation` state. The development database, normal Compose project, and physical-device tooling are never touched.

## What the runner does

`presentation:start` starts PostgreSQL on `55433` and Redis on `6380` under the isolated Compose project, applies migrations and the idempotent seed, then starts API `3002` and web `3003`. It logs in with the isolated Demo Owner, safely reuses or creates the one synthetic device `PRESENTATION-DEMO-001`, and stores its one-time credential only in ignored runtime state.

It reads the active risk profile from the API on every start and passes its actual six WATCH/DANGER values to the `presentation` simulator. No threshold is hard-coded, changed, or exported. The simulator sends one stream every five seconds using firmware `presentation-simulator-1.0.0`.

Use `corepack pnpm presentation:status` for a concise component table. Logs and runner state are under ignored `tmp/presentation/`; normal stop retains the database and local device credential for faster restarts, while reset removes both.

## Troubleshooting and manual checks

Run `corepack pnpm presentation:status`; if API or web cannot become healthy, inspect the corresponding ignored log in `tmp/presentation/`. Ports `55433`, `6380`, `3002`, and `3003` must not be owned by an unrelated process. The runner refuses API/web port collisions rather than terminating development processes.

The first start builds API/web only when their production build outputs are absent. Rebuild manually after source changes with `corepack pnpm build` if required. Docker and workspace dependencies (`corepack pnpm install`) must be available before starting.

To verify the live demo, sign in as the isolated Demo Owner, confirm the presentation banner, one enabled Presentation Simulator device, incoming history on Overview, and risk transitions including `UNKNOWN` for the deliberate required-sensor gap. Never use a physical ESP32 credential with this environment.
