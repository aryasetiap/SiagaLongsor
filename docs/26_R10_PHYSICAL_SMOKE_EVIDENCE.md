# R10 G5 Physical Device Smoke Evidence

## Run context

- Tested SHA: `e78cb60f204a6bae416e592da2a942b0e40864`
- Date: 2026-08-06
- Device: `ESP32-SIAGALONGSOR-01` (no credential material recorded)
- Physical serial port: CP210x bridge on COM3

## Observations

| Check                                         | Result               | Evidence                                                                                |
| --------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------- |
| ESP32 present and serial diagnostics readable | PASS                 | COM3 opened at 115200 baud; acquisition continued                                       |
| Boot/Wi-Fi/NTP                                | PASS carried forward | R9 physical acceptance evidence; no reflash performed                                   |
| `/health`                                     | PASS                 | HTTP 200; database and Redis reported up                                                |
| Fresh physical telemetry                      | PASS                 | Serial observed `telemetry delivered status=201 duplicate=false` repeatedly             |
| `/device` reflection                          | PASS                 | HTTP 200; configured, hardwareId resolved, ONLINE, recent timestamps, rainfall READABLE |
| `/overview` reflection                        | PASS                 | HTTP 200; configured, risk `UNKNOWN`, tilt/soil null, rainfall numeric `0`              |
| `/risk-profile`                               | PASS                 | HTTP 200; active profile version 2 readable; no update issued                           |
| `/audit-log`                                  | PASS                 | HTTP 200; valid response with one item                                                  |
| Rainfall observation                          | PASS                 | `rain window tips=0 intervalMs=60000 rainfallMmHour=0.000`                              |

The first attempt was environmentally blocked because the configured API host
was unreachable. After reachability was restored, the same minimal smoke was
completed against `http://192.168.101.77:3001/api/v1` using read-only user
access for backend reflection.

## Safety and mutation statement

- Device was **not reflashed**.
- Device credentials were **not rotated**.
- Risk Profile was **not changed**.
- No registration, disable, delete, calibration, or manual database mutation
  was performed.
- Normal physical telemetry persistence occurred as expected from the fresh
  201 deliveries.
- Uncalibrated tilt and soil remained null/unreadable; authoritative risk was
  `UNKNOWN`, never fabricated `SAFE`.
- Battery remained null and is not a hazard input.

## Limitations carried forward

Soil percentage calibration, final IMU reference calibration, and rain
`0.70 mm/tip` unit calibration remain deferred exactly as documented in R9.
The zero-tip rainfall window is valid numeric zero evidence and is not a claim
of final scientific rain calibration. LCD remains optional.

## Conclusion

**G5 PASS.** The physical ESP32 delivered fresh authenticated telemetry with
HTTP 201, the backend reflected the intended single-device deployment, the
completed zero-tip rain window was represented numerically, and unavailable
required hazards preserved the safe `UNKNOWN` semantics.
