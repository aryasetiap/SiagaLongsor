# R9 Provisioning and Field Checklist

This checklist provisions one physical device without placing a real secret in
the repository. Replace every `<PLACEHOLDER>` locally and keep the device
secret out of shell history, logs, screenshots, and Git.

## 1. Prepare the backend

1. Apply the current migrations and start PostgreSQL and the API.
2. Set `API_BASE_URL` to the API origin, for example
   `https://api.example.invalid` (use `http://localhost:3001` only for local
   development).
3. Confirm `GET /api/v1/health` succeeds.

```bash
export API_BASE_URL="https://api.example.invalid"
curl --fail "$API_BASE_URL/api/v1/health"
```

## 2. Login as PROJECT_OWNER

```bash
export OWNER_EMAIL="<project-owner-email>"
read -r -s -p "Project Owner password: " OWNER_PASSWORD
echo
export ACCESS_TOKEN="$(curl --fail --silent \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$OWNER_EMAIL\",\"password\":\"$OWNER_PASSWORD\"}" \
  "$API_BASE_URL/api/v1/auth/login" | jq -r '.accessToken')"
```

Do not echo `ACCESS_TOKEN` or `OWNER_PASSWORD`.

## 3. Determine organization context

```bash
curl --fail --silent \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  "$API_BASE_URL/api/v1/auth/me"
```

Select an organization membership whose role is `PROJECT_OWNER` and export its
identifier:

```bash
export ORGANIZATION_ID="<organization-id-from-auth-me>"
```

Provisioning endpoints require `X-Organization-Id`. The four final
single-device read pages do not require this header.

## 4. Determine the Site

The current public Site API is a read-only organization-scoped lookup:

```bash
curl --fail --silent \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "X-Organization-Id: $ORGANIZATION_ID" \
  "$API_BASE_URL/api/v1/sites?limit=100"
```

Export the selected existing Site:

```bash
export SITE_ID="<site-id>"
```

There is no public `POST /sites` route in the current contract. If an
organization has no Site, create one through the approved operational/seed
provisioning process before continuing; do not invent a replacement endpoint.

## 5. Determine the MonitoringPoint

List points for the selected Site:

```bash
curl --fail --silent \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "X-Organization-Id: $ORGANIZATION_ID" \
  "$API_BASE_URL/api/v1/monitoring-points?siteId=$SITE_ID&isActive=true&limit=100"
```

Create one if required:

```bash
curl --fail --silent -X POST \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "X-Organization-Id: $ORGANIZATION_ID" \
  -H 'Content-Type: application/json' \
  -d "{\"siteId\":\"$SITE_ID\",\"name\":\"<monitoring-point-name>\",\"description\":null,\"locationDescription\":null}" \
  "$API_BASE_URL/api/v1/monitoring-points"
```

```bash
export MONITORING_POINT_ID="<monitoring-point-id>"
```

## 6. Register the physical Device and capture its credential

Choose an uppercase hardware identifier matching
`^[A-Z0-9][A-Z0-9_-]{2,63}$` and export it locally:

```bash
export HARDWARE_ID="<HARDWARE-ID>"
curl --fail --silent -X POST \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "X-Organization-Id: $ORGANIZATION_ID" \
  -H 'Content-Type: application/json' \
  -d "{\"hardwareId\":\"$HARDWARE_ID\",\"displayName\":\"<device-display-name>\",\"monitoringPointId\":\"$MONITORING_POINT_ID\"}" \
  "$API_BASE_URL/api/v1/devices"
```

The 201 response contains the raw credential once under `data.credential`:
`scheme`, `hardwareId`, `secret`, `issuedAt`, and `displayOnce: true`. Capture
the plaintext securely and transfer it to the device. The database stores only
the Argon2 hash; a normal Device GET/list never returns the secret.

```bash
export DEVICE_SECRET="<one-time-secret-from-registration>"
```

Do not put this value in firmware source control, a URL, or a normal serial
log. Rotation invalidates the old secret and requires reprovisioning.

## 7. Configure firmware

Configure the device locally with `API_BASE_URL`, `HARDWARE_ID`, and
`DEVICE_SECRET` using the eventual secure device-storage mechanism. Also set
the approved clock/network configuration. Do not choose sensor models, pins,
or conversion formulas until the R9-B hardware inventory is approved.

For the locked R9-B1 hardware, the wiring is:

| Function                     | Pin    |
| ---------------------------- | ------ |
| Shared I2C SDA (MPU6050/LCD) | GPIO21 |
| Shared I2C SCL (MPU6050/LCD) | GPIO22 |
| Soil analog output (ADC1)    | GPIO34 |
| Rain pulse input             | GPIO27 |

Use 3.3 V logic. The LCD backpack address/controller remains unconfirmed;
the firmware scans I2C and continues without an LCD. There is no battery
measurement circuit, cellular modem, RTC, SD card, buzzer, or siren in R9-B1.

## 8. Send first telemetry

Send a payload matching
[`specs/examples/r9/physical-device-telemetry.json`](../specs/examples/r9/physical-device-telemetry.json)
through `POST /api/v1/iot/telemetry` with:

```text
Authorization: Device <HARDWARE_ID>.<DEVICE_SECRET>
Idempotency-Key: <same messageId as JSON body>
Content-Type: application/json
```

Use the same `messageId`, header, and payload on a timeout retry. A new sample
gets a new message ID and sequence; a retry does not.

## 9. Verify acknowledgement

The first accepted sample returns HTTP 201 and `duplicate: false`. An exact
retry returns HTTP 200 and `duplicate: true`. Invalid credentials, a disabled
device, idempotency/sequence conflicts, validation errors, rate limits, and
server failures follow the retry policy in the integration contract.

## 10. Verify Perangkat

Login as the owner and open `GET /api/v1/device` (or the Perangkat page). Check
connectivity, last-seen/telemetry timestamps, firmware/network metadata,
battery diagnostics, and each sensor's readable state. A null reading must be
shown as unavailable, not zero.

## 11. Verify Overview

Open `GET /api/v1/overview` (or Overview). Confirm the transmitted hazard
readings, history, freshness, and server-calculated risk. The configured
RiskProfile—not a firmware assessment—determines the status.

## 12. Verify Risk Profile

Open `GET /api/v1/risk-profile`. Review the active version, calibration status,
notes, and WATCH/DANGER values. Update only with validated field decisions via
`PUT /api/v1/risk-profile`; do not treat synthetic or simulator readings as
scientific threshold recommendations.

## 13. Verify Audit Log

Open `GET /api/v1/audit-log` after a genuine server risk transition. Confirm
the previous/current status, reason, sensor snapshot, profile reference, and
telemetry reference. Do not expect an entry for an unchanged status or an
exact duplicate retry.

## 14. Test disconnect and stale behavior

Stop delivery or disconnect the device long enough for the configured
freshness policy to classify current data as delayed/offline. The authoritative
risk must become `UNKNOWN`, never `SAFE`, and the transition is auditable when
the risk actually changes.

## 15. Test reconnect

Restore network connectivity and send fresh telemetry. Queued historical
samples may be stored as late history but must not move current state backward.
A new fresh sample can restore the authoritative state. Verify Perangkat,
Overview, and Audit Log again.

## 16. Secure local cleanup

Unset local secrets after the session and remove temporary shell files. Never
commit `DEVICE_SECRET`, Wi-Fi passwords, access tokens, or captured API
responses containing credentials.

## Hardware Inventory Required Before R9-B

Before hardware-specific implementation, obtain and approve the exact ESP32
board/model, tilt/IMU model, soil-moisture sensor model, rainfall sensor model,
battery/power measurement circuit, network hardware, GPIO/I2C/UART/ADC mapping,
voltage levels, and calibration conversion formulas. These are intentionally
unresolved in R9-A.
