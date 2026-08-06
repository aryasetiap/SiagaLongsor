# R9 Final Acceptance Report

## 1. Scope and conclusion

R9 validates the first real ESP32 DevKit V1 integration against the existing
single-device backend. Evidence was collected from the physical bring-up and
the merged R9 firmware/integration work at baseline `f88e803`.

**Conclusion: R9 is COMPLETE for physical device integration.** The device
boot, network, authentication, telemetry transport, sensor acquisition, and
single-device backend path were proven. Calibration items that require the
final mechanical installation or reference media remain explicitly deferred;
they are not reported as passes.

## 2. Status classification

### PASS

- ESP32 DEVKIT V1 physical boot.
- Wi-Fi connection and NTP synchronization.
- ESP32 to NestJS API transport.
- A dummy Device credential was rejected with HTTP 401.
- Physical Device provisioning and real Device credential authentication.
- Repeated physical telemetry was accepted with HTTP 201 and
  `duplicate=false`.
- Authenticated physical telemetry reached the single-device backend and was
  persisted for server-side evaluation.
- The rain GPIO interrupt, debounce, counting, and measurement-window path.
- GPIO34 raw soil ADC acquisition.
- I2C discovery at address `0x68` and raw accelerometer/static-orientation
  diagnostics.

### DEFERRED WITH BLOCKER

- **Rain calibration:** `0.70 mm/tip` remains the vendor nominal starting value,
  not a final scientific or unit-specific calibration. The vendor reports an
  approximate experiment of 100 mL for about 70 tips; collector area is
  5.5 cm × 3.5 cm = 19.25 cm². Manufacturing tolerance, bucket geometry,
  flow rate, leveling, and mechanical adjustment require local verification.
- **Soil percentage calibration:** dry/wet reference media were unavailable.
  Bench raw readings were approximately 2550–2600 and must not be used as
  `SOIL_ADC_DRY` or `SOIL_ADC_WET` endpoints. Until calibrated, telemetry keeps
  `soilMoisturePct` null.
- **IMU reference calibration:** the module must first be soldered/mounted in
  its final neutral orientation. Raw orientation diagnostics are available,
  but the final reference values are not yet approved. Until then, tilt
  telemetry remains null.
- **Rain electrical topology:** the physical wiring was verified for this
  device as red → 3V3, black → GND, yellow → GPIO27. The product information
  does not establish whether the output is a passive contact, open collector,
  push-pull, or another topology; that detail remains a field verification
  item for future hardware acceptance.

### OUT OF CURRENT REQUIRED RELEASE SCOPE

- Battery measurement hardware; `batteryVoltage` remains null because no
  measurement circuit exists.
- LCD operation; the LCD is optional and deferred, and firmware continues if
  no backpack is detected.
- Persistent flash telemetry queue and cellular fallback; these remain
  deferred/non-blocking unless a later release scope explicitly requires them.
- Any remote siren behavior, AI prediction, or local risk authority.
- R10 performance/UAT/release-readiness work.

## 3. Physical evidence

### ESP32 and backend boundary

The physical ESP32 booted, joined Wi-Fi, synchronized NTP, and reached the
NestJS API. An intentionally dummy Device credential produced HTTP 401. A
physically provisioned Device credential then authenticated successfully.
Repeated telemetry requests were accepted with HTTP 201 and `duplicate=false`.
The authenticated samples reached the final single-device telemetry path;
the server remains responsible for risk evaluation and audit transitions.

### Rain sensor

The verified wiring was red → 3V3, black → GND, and yellow → GPIO27. The
interrupt/debounce/counting path passed physical testing. Nine manual physical
tips produced exactly:

```text
rain window tips=9 intervalMs=60000 rainfallMmHour=378.000
```

The next complete window with no tips produced:

```text
rain window tips=0 intervalMs=60000 rainfallMmHour=0.000
```

The firmware therefore distinguishes an uncompleted first window (unavailable)
from a completed zero-tip window (numeric zero). The configured `0.70 mm/tip`
value is retained as the vendor nominal starting calibration only.

### Soil sensor

GPIO34 raw ADC acquisition passed. Observed bench values were approximately
2550–2600. Percentage calibration is deferred because suitable dry/wet media
were unavailable; those readings are not calibration endpoints. Uncalibrated
telemetry remains null rather than fabricating a percentage.

### IMU

The compatible IMU responded at I2C address `0x68`. It reported
`WHO_AM_I=0x70`; this does not confirm MPU6050 silicon. Raw accelerometer/static
orientation diagnostics passed. Final reference calibration is deferred until
the module is soldered and mounted in its final neutral orientation, and
uncalibrated telemetry remains null.

## 4. Safety and operational state

Required hazard readings that are unavailable remain null and project to
authoritative `UNKNOWN`; they are never converted to zero or `SAFE`. Server
risk evaluation remains authoritative. Old development test devices were
disabled operationally so the physical ESP32 is the single enabled deployment.

The optional LCD, battery circuit, persistent flash queue, and cellular fallback
do not block the proven telemetry path and are outside the current required R9
integration release evidence.

## 5. R10 boundary

R10 remains **pending and not implemented**. Its planning is unblocked now that
R9 physical integration is complete, but final release/UAT sign-off must account
for the deferred rain, soil, and IMU calibration blockers before treating the
system as fully field-calibrated.

Physical ESP32 integration is complete for R9; this report does not claim that
the deferred calibration work or R10 performance/release work is complete.
