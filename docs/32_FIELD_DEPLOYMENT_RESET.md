# Field deployment reset

`pnpm field:reset` prepares the existing Teknila Siaga Longsor production foundation for its
first field installation. It is an operational cleanup tool, **not** a database reset: never use
`prisma migrate reset`, never drop the schema, and never reseed development data in production.

## Prerequisites

1. Stop the API process and its notification worker so no telemetry or Telegram delivery races the
   reset.
2. Confirm `DATABASE_URL` targets the intended deployment database. The command never prints it.
3. Ensure `pg_dump`, `pg_restore`, and `git` are available on the operator host.
4. Confirm the database still has Organization, Site, MonitoringPoint, Device, User, Membership,
   and at least one active RiskProfile. The command aborts if any are missing.

## Dry-run and execute

Dry-run is the default and performs no mutation:

```sh
corepack pnpm field:reset
```

It prints only row counts and the planned scope. To execute, provide an absolute backup directory:

```sh
corepack pnpm field:reset --execute --backup-dir /srv/siagalongsor-backups
```

For `NODE_ENV=production`, destructive execution additionally requires this exact phrase:

```sh
corepack pnpm field:reset --execute --backup-dir /srv/siagalongsor-backups \
  --confirm RESET_FIELD_DEPLOYMENT
```

## Backup and restore

Before any destructive transaction, execute mode creates a PostgreSQL custom-format dump with
`pg_dump`, verifies it using `pg_restore --list`, and writes a sidecar manifest with the Git release
SHA. A failed or empty backup, failed verification, missing tools, or failed manifest prevents the
reset transaction.

To restore, stop the API, create or select the target PostgreSQL database according to the approved
recovery procedure, then use the verified backup file:

```sh
pg_restore --clean --if-exists --no-owner --dbname "$DATABASE_URL" /srv/siagalongsor-backups/<backup>.dump
```

Review the backup manifest release SHA before restoring. Restore changes data; test the procedure
on a separate target before relying on it operationally.

## Preserved foundation

The command preserves Prisma migrations/schema; Organization, Site, MonitoringPoint; all Users,
Memberships, and refresh sessions; all RiskProfiles; Device identity, lifecycle, credential hash,
and credential rotation timestamp; and security/configuration audit records.

## Removed or reset operational state

The command transactionally removes all Telemetry, RiskAssessment, CurrentMonitoringPointState,
NotificationOutbox, and `RISK_STATUS_CHANGED` audit records. It clears Device runtime observations:
firmware version, `lastSeenAt`, `lastTelemetryAt`, last network type, and last signal RSSI.

No Device credential is rotated. Rotate the credential separately, immediately before final field
installation, using the existing controlled credential-rotation procedure.

## Post-reset verification

Verify the printed after-counts are zero for all affected operational tables, and that Device runtime
timestamps are null. Start the API and send fresh telemetry from the physical ESP32. Until fresh
telemetry arrives, the public operational projection is unavailable/`UNKNOWN`; the reset never
creates `SAFE`/AMAN sensor state. Verify NotificationOutbox has no old pending delivery before
enabling Telegram delivery again.
