# ADR 0008: Public read-only monitoring overview

- Status: Accepted
- Date: 2026-08-09

## Context

The monitoring overview must be useful to viewers who do not have an administrator account. The
existing page and `GET /overview` operation required a Project Owner session, and the chart fetched
thresholds from the protected risk-profile operation. Making the complete administrator projection
public would expose device identity, calibration notes, and operational audit data unnecessarily.

## Decision

- Make `/overview` and `GET /api/v1/overview` public and read-only.
- Select the public deployment with `PUBLIC_DEVICE_HARDWARE_ID`. If it is omitted, the existing
  single-device invariant still requires exactly one enabled active deployment and rejects an
  ambiguous database instead of selecting a record arbitrarily.
- Return only authoritative risk, freshness, current hazard-sensor readings, historical series,
  selected range, and the three `watch`/`danger` threshold pairs needed to interpret the charts.
- Do not expose hardware ID, firmware, network diagnostics, battery data, calibration status,
  profile notes, profile history, user data, or audit records in the public projection.
- Keep `/devices`, `/settings/risk-profile`, and `/settings/audit-log`, together with their API
  operations, protected by authentication and Project Owner authorization.
- Apply an in-process limit of 120 overview requests per IP per minute. This supports normal polling
  and presentation mode under the single-instance runtime constraint from ADR 0006.
- Continue returning `UNKNOWN` when data is missing, stale, delayed, offline, or cannot be trusted.

## Consequences

- Viewers can open the monitoring dashboard without signing in.
- Administrators can move from the public dashboard to the protected operational pages after login.
- The public response is intentionally a separate safe projection; future fields are not public by
  default and require an explicit contract and privacy review.
- A deployment with more than one enabled active device remains invalid for the single-device
  product and returns the existing ambiguity error instead of selecting a device arbitrarily.
