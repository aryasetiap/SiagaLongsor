# R2 nullable telemetry readings

This forward migration relaxes four `Telemetry` reading columns so a device can persist explicit
`null` for an unavailable sensor. It does not delete or rewrite existing telemetry data.

Rollback must not coerce `null` readings to zero or another fabricated sensor value.

Before restoring `NOT NULL` constraints in a future migration, every existing `NULL` value must
first be handled through an explicitly approved data-recovery policy, such as restoring a verified
source reading or intentionally removing an affected invalid record where data-retention policy
permits it.

Only after no `NULL` values remain may a new forward migration restore the `NOT NULL` constraints.
Previously merged migrations must not be edited.
