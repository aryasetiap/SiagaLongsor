# ADR 0007: Prolonged rainfall duration rule

- Status: Accepted
- Date: 2026-08-07

## Context

The existing authoritative risk engine evaluates calibrated tilt, soil-moisture, and instantaneous
rainfall thresholds. The supervisor revision adds a duration criterion: moderate daily rainfall of
30–50 mm on three consecutive days must escalate to `DANGER` when rain continues on the fourth
day. The existing tilt rules remain unchanged.

Telemetry reports a rainfall rate in millimetres/hour, not a daily total. The server therefore has
to derive daily accumulation from persisted timestamped samples before the pure risk engine can
evaluate the duration rule.

## Decision

- Store the duration rule in each immutable, versioned risk profile:
  - moderate daily minimum, default `30 mm/day`;
  - moderate daily maximum, default `50 mm/day`;
  - required immediately preceding days, default `3`;
  - continuation rate threshold, default `> 0 mm/hour`.
- Integrate persisted `rainfallMmHour` samples over time and group the result by the Site's local
  calendar day (`Asia/Jakarta` by default).
- Carry a sample's rate only until the next sample and never for more than 60 seconds. This avoids
  fabricating rainfall during telemetry gaps.
- Evaluate only immediately preceding complete local days. A missing day or a total outside the
  configured inclusive moderate range breaks the consecutive sequence.
- If the sequence meets the profile and current rain exceeds the continuation threshold, return
  `DANGER` with reason `DANGER_PROLONGED_RAINFALL`.
- Keep instantaneous rainfall, soil-moisture, and tilt rules independent and unchanged.

## Consequences

- The result is deterministic from telemetry history, Site timezone, and the referenced risk
  profile version.
- Profile values remain provisional until approved through field calibration; the defaults record
  the requested revision but are not represented as universal geotechnical standards.
- Telemetry gaps cannot be treated as continuous rain. This can under-count a day with missing
  data, causing the duration rule not to trigger rather than fabricating a dangerous measurement.
- Risk-transition audit metadata records the consecutive-day count and derived prior daily totals.
