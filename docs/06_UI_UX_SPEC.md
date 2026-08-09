# UI/UX Specification

## 1. Scope and navigation

The product has exactly four primary pages: Overview, Perangkat, Profil Risiko, and Audit Log. Login is a supporting authentication flow. Monitoring, Alerts, Map & Evacuation, Reports, and similar legacy concepts are not final-product pages.

## 2. Visual language

The application uses a deep charcoal application shell/sidebar, mist/off-white canvas, editorial page headings, large rounded surfaces, restrained borders, and soft shadows. The active navigation item is a light pill on the charcoal shell.

Sensor category surfaces are descriptive, not risk states: tilt is lavender/cool neutral, soil is mint, and rain is cyan. Risk states use explicit text plus semantic accents: SAFE green, WATCH amber, DANGER red, and UNKNOWN neutral slate. UNKNOWN must never look SAFE.

## 3. Overview

Overview is a public read-only page and does not wait for or require an authenticated session. It
presents a compact demonstration disclosure only in presentation mode, range controls, an
authoritative dark risk hero, current sensor KPI cards, and ECharts time-series charts. The risk
hero displays authoritative status, reason, freshness, observation context, and configured state
without inventing metrics. Device diagnostics, risk-profile editing, and audit navigation remain
available only in the authenticated administrator shell.

Charts use actual timestamps, supplied active-profile WATCH/DANGER threshold lines, tooltip/crosshair interaction, and responsive ResizeObserver behavior. Missing readings remain null gaps: no interpolation, smoothing, line connection, or area fill crosses unavailable data. No fake search, notification, or monitoring metrics are displayed.

## 4. Perangkat

Perangkat is a diagnostics-only single-device page. It presents device identity, connectivity, firmware, last-seen/telemetry/network information, power diagnostics, and readable/unreadable/unknown sensor health. Battery and device health are diagnostic data, not landslide-risk criteria; null is not rendered as zero.

## 5. Profil Risiko

Profil Risiko presents the active version, calibration status, activation context, and editable WATCH/DANGER values for tilt, soil moisture, and rainfall. Labels and units remain visible, client validation requires WATCH below DANGER, and server validation remains authoritative. The UI must not imply that provisional calibration is scientifically field validated.

## 6. Audit Log

Audit Log is an accessible vertical risk-transition timeline. Each record shows timestamp, previous/current explicit status, reason, sensor snapshot, and available risk-profile version. Pagination remains available; no actor, severity, or other fabricated metadata is added.

## 7. Responsiveness and accessibility

Desktop uses the charcoal shell and balanced bento/card layouts; small screens stack content without horizontal page overflow. Navigation remains reachable, controls retain comfortable touch targets, focus is visible, and `prefers-reduced-motion` is respected. Status never depends on color alone, and no-data/freshness remains explicit.
