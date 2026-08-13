# ADR 0009: Telegram risk-transition notifications

- Status: Accepted
- Date: 2026-08-13

## Context

The single-device product already persists authoritative server-side risk transitions and their
sensor/profile context in the audit log. Field operators also need an outbound Telegram message
when the authoritative condition changes. Sending Telegram requests from the ESP32 would duplicate
risk logic and expose a bot credential. Sending synchronously inside telemetry ingestion would make
device acceptance depend on an external service.

The runtime remains one API instance with PostgreSQL and no Redis/BullMQ. Notification settings UI,
incoming bot commands, and Telegram as an authentication or control channel are not requested.

## Decision

- Send notifications from the backend only, based on persisted authoritative risk transitions.
- Notify transitions to `WATCH`, `DANGER`, `UNKNOWN`, and recovery to `SAFE`; do not notify repeated
  telemetry while the status is unchanged.
- Create a `NotificationOutbox` row in the same PostgreSQL transaction as the risk-transition audit
  record. Use the immutable audit-log identifier as a unique event key.
- Deliver outside the telemetry transaction with a bounded single-instance polling worker.
- Retry network errors, HTTP `408`, `429`, and `5xx`; respect Telegram `retry_after`; permanently
  fail invalid payloads and non-retryable API responses. Retain the delivery record for operations.
- Configure one Telegram destination through backend-only environment variables. Do not place the
  bot token in firmware, frontend variables, source control, logs, audit metadata, or outbox payload.
- Use Telegram only as an additional notification channel. Dashboard state and official emergency
  procedures remain authoritative; `UNKNOWN` is explicitly described as not safe.
- Do not add Redis, a public notification endpoint, incoming commands, settings UI, or remote device
  control.

## Consequences

- Telemetry persistence and its `201` response do not wait for Telegram availability.
- A process restart can recover pending or expired-processing records from PostgreSQL.
- Outbox creation is exactly-once per audit transition. External delivery is at-least-once: a rare
  crash after Telegram accepts a message but before PostgreSQL records `SENT` can cause a duplicate.
  The immutable event identifier in the message lets operators recognize it.
- The database gains one forward migration and delivery-retention data. No HTTP/OpenAPI contract or
  firmware contract changes.
- Enabling delivery requires outbound HTTPS access to `api.telegram.org` and secure deployment of a
  bot token and destination chat identifier.
