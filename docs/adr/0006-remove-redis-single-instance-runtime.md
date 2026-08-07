# ADR 0006: Remove Redis from the single-instance runtime

- Status: Accepted
- Date: 2026-08-07

## Context

The final product monitors one physical ESP32 and runs as a single API instance. Redis remained from
the earlier multi-instance architecture for telemetry rate limiting, connectivity scheduler locking,
and health reporting. The remaining Redis requirement complicated local and presentation startup
without providing a required product capability.

## Decision

- Remove `ioredis`, the Redis Nest module, Redis configuration, Compose service, and Redis health
  contract.
- Keep HTTP as the telemetry transport and PostgreSQL as the only stateful runtime dependency.
- Use a bounded in-process fixed-window limiter for telemetry. Login limiting continues to use the
  Nest throttler's in-process storage.
- Use a TTL-protected in-process ownership lock for the connectivity scheduler.
- Continue running a single API instance. Horizontal multi-instance deployment requires a new ADR
  and a shared limiter/lock design before it is supported.

## Consequences

- Local development and presentation need only PostgreSQL.
- Rate-limit and scheduler-lock state reset when the API restarts.
- The limiter and lock are not shared across API processes; deploying more than one API replica is
  explicitly unsupported by this decision.
- Historical acceptance documents may still mention Redis because they describe earlier releases;
  they are not current runtime instructions.
