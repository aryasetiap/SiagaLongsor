# R12 Telegram notification outbox

This forward migration adds the `NotificationDeliveryStatus` enum and `NotificationOutbox` table.
It does not delete or rewrite telemetry, risk assessments, current monitoring state, or audit logs.

The table provides durable, idempotently-created work for outbound Telegram risk-transition
notifications. Delivery records intentionally retain status, bounded error details, attempt count,
and Telegram message identifier for operational diagnosis. Bot tokens and destination chat IDs are
not stored in this table.

Before deployment, back up PostgreSQL and run `corepack pnpm prisma:migrate:deploy`. The application
can be deployed with `TELEGRAM_NOTIFICATIONS_ENABLED=false`; this is the safe default and does not
create outbox work.

Rollback of application behavior is performed by disabling Telegram delivery and deploying the
previous application version. Dropping the table or enum would remove notification delivery
history and should only be done through a separately reviewed forward migration after confirming
that no pending work is needed. Risk and telemetry records are independent of this table.
