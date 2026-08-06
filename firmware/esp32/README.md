# SiagaLongsor ESP32 R9-B1

This PlatformIO project targets the locked ESP32 DEVKIT V1 hardware. R9-C
physical integration is complete; final sensor calibration evidence remains
deferred where noted below. The firmware does sensor acquisition and delivery
only. Risk status remains server-authoritative.

## Hardware and pins

| Function           | Hardware                             | ESP32 pin          |
| ------------------ | ------------------------------------ | ------------------ |
| I2C SDA            | MPU6050 and optional LCD backpack    | GPIO21             |
| I2C SCL            | MPU6050 and optional LCD backpack    | GPIO22             |
| Soil analog output | Capacitive Soil Moisture Sensor V2.0 | GPIO34 / ADC1      |
| Rain pulse         | PLA+ tipping bucket                  | GPIO27 / interrupt |

All sensor logic uses 3.3 V. There is no battery measurement circuit,
cellular modem, RTC, SD card, buzzer, or siren in this pass.

## Build and upload

Install PlatformIO, then from this directory:

```bash
pio run
pio run --target upload
pio device monitor -b 115200
```

The target is `esp32doit-devkit-v1` with the Arduino framework.

During physical bring-up, the GY-521 responded at I2C address `0x68` but
reported `WHO_AM_I=0x70`. The firmware therefore reports `0x70` as a
different/compatible IMU identity and does not claim confirmed MPU-6050
silicon. `WHO_AM_I=0x68` is reported as the expected MPU-6050-compatible
identity; other values are explicitly unknown. The limited accelerometer
register path may still be tried for compatible devices.

## Local secrets

Copy `include/secrets.example.h` to `include/secrets.h` and fill it locally:

- `WIFI_SSID`
- `WIFI_PASSWORD`
- `API_BASE_URL` (including `/api/v1`)
- `DEVICE_HARDWARE_ID`
- `DEVICE_SECRET`
- optional `API_CA_CERT` for HTTPS (required outside local HTTP development)
- `SOIL_ADC_DRY` and `SOIL_ADC_WET` after field calibration

`secrets.h` is ignored by Git. The device secret and Wi-Fi password are never
printed by the firmware.

## First boot diagnostics

Serial output reports boot ID, discovered I2C addresses, MPU6050 identity,
soil raw ADC/calibration status, rain pulse configuration, Wi-Fi/RSSI, NTP
state, queue depth, and HTTP delivery status. No password, secret, or
Authorization header is printed.

The LCD is optional. Startup scans all I2C addresses and reports them; no
backpack address or controller mapping is assumed. If no LCD is found, all
sensors and telemetry continue normally.

## Sensor behavior

### MPU6050 / compatible IMU

The driver probes address `0x68`, wakes the device, and reads the accelerometer.
Static tilt is derived from the gravity vector:

```text
x = atan2(ay, az)
y = atan2(-ax, sqrt(ay² + az²))
magnitude = sqrt(x² + y²)
```

Angles are in degrees. A mounting reference is supplied through the
`TILT_REFERENCE_*` configuration values; no perfectly level mounting is
assumed. Until that reference is marked calibrated, raw orientation is used
only for serial calibration diagnostics and telemetry tilt values remain null so
calibration uncertainty cannot be projected as a false SAFE state. A failed
read also produces null tilt values and never zero.

#### Physical reference calibration

1. Mount the ESP32/IMU in its intended neutral physical orientation.
2. Keep the device still.
3. Collect multiple `tilt raw reference candidate x=... y=...` samples.
4. Confirm the values are stable.
5. Choose representative X/Y reference values.
6. Set them locally in the ignored `include/secrets.h`:

   ```cpp
   #define TILT_REFERENCE_X_DEG <measured-x-reference>
   #define TILT_REFERENCE_Y_DEG <measured-y-reference>
   #define TILT_REFERENCE_CALIBRATED true
   ```

7. Rebuild and reflash.
8. Verify neutral calibrated tilt is approximately near zero.
9. Manually tilt the module and confirm magnitude responds.

No acceptance tolerance is invented in R9-C; define it only after physical
measurements and review.

### Soil moisture

GPIO34 is deliberately ADC1 so Wi-Fi does not interfere with ADC reads. Raw
values are logged. Until distinct valid `SOIL_ADC_DRY` and `SOIL_ADC_WET`
values are configured, `soilMoisturePct` is null. Once calibrated, the raw
value is linearly mapped between the endpoints and clamped to 0–100%; either
sensor polarity is supported by the endpoint order.

### Rainfall

GPIO27 uses `INPUT_PULLUP` and a falling-edge interrupt. The ISR only applies
the approximately 50 ms debounce and increments a counter. Tips accumulate in
the independent `RAIN_SAMPLE_INTERVAL_MS` window (currently 60 seconds), not
the general five-second sensor loop. Before the first completed window the
reading is null; a completed zero-tip window is numeric `0`.

At the end of each completed window the firmware prints one diagnostic:

```text
rain window tips=<count> intervalMs=<actual> rainfallMmHour=<value>
```

The formula is:

```text
rainfallMmHour = tips * RAIN_MM_PER_TIP * 3,600,000 / intervalMs
```

`RAIN_MM_PER_TIP = 0.70` is the vendor nominal starting value and remains
configurable; it is not field-calibrated for this unit. The vendor describes a
5.5 cm × 3.5 cm collector (19.25 cm²) and an experiment where approximately
100 mL produced 70 tips. That is approximately 1.43 mL/tip and numerically
about 0.74 mm/tip before vendor rounding. Manufacturing tolerance, bucket
geometry, 3D-print tolerance, flow rate, leveling, and mechanical adjustment
can change the real value, so local physical verification is required. Do not
silently replace the published 0.70 value with 0.74.

The vendor description says the supply supports 3.3 V / 5 V and uses an
interrupt pin, but it does not establish whether the output is a passive reed
contact, open collector, active push-pull, or another topology. Final sensor
wiring remains unresolved until connector labels, example source, a schematic,
or continuity/multimeter evidence is available. A passive disconnected sensor
cannot be distinguished from genuine zero rainfall without electrical
diagnostics.

#### GPIO27 jumper self-test

Before connecting the sensor, keep it disconnected and use only a temporary
contact from GPIO27 to GND:

1. Wait for a new rain measurement window.
2. Briefly connect GPIO27 to GND, then disconnect it.
3. Wait longer than the debounce interval and repeat a known number of times.
4. Wait for the 60-second window to complete and verify the serial tip count.

Never apply 5 V directly to GPIO27. This test proves only GPIO27 input,
falling-edge interrupt detection, debounce, counting, and window calculation.
It does not prove sensor wiring, electrical output topology, mechanical tipping,
or final 0.70 mm/tip calibration.

### Battery

There is no battery measurement circuit. `batteryVoltage` is always serialized
as JSON `null`; it is never inferred from USB/VIN.

## Telemetry, time, and retry

The firmware sends `POST <API_BASE_URL>/iot/telemetry` with JSON and:

```text
Authorization: Device <hardwareId>.<deviceSecret>
Idempotency-Key: <messageId>
```

`bootId` is random per boot, sequence is monotonic in RAM for that boot, and
each sample receives a new random message ID. The complete serialized body is
queued before transmission. Retries reuse the exact message ID, sequence,
timestamp, body, and idempotency key.

201 and 200 remove an item from the bounded four-item RAM queue. Network errors,
5xx, and 429 use bounded exponential backoff with jitter; permanent 4xx
responses are diagnosed and dropped rather than retried forever. The queue is
RAM-only in R9-B1, so persistent store-and-forward and flash-wear policy are
deferred to R9-B2.

NTP synchronisation is required before transmission. Sensor acquisition and
diagnostics continue while time is unavailable, but no fabricated timestamp is
sent.

## Calibration and field checks

1. Verify 3.3 V wiring and common ground.
2. Confirm MPU6050 responds on the scanned I2C bus and record its mounting
   reference.
3. Record soil ADC values in known dry and wet conditions, then set the two
   calibration constants locally.
4. Manually tip the bucket several times and compare counted pulses with the
   vendor nominal 0.70 mm/tip; update the local calibration only after field
   measurement.
5. Verify the optional LCD backpack voltage/controller before connecting it;
   never assume 5 V I2C is safe for ESP32 pins.
6. Provision the Device using the R9 checklist, send one sample, and inspect
   Perangkat, Overview, and Audit Log.

No sensor driver claims physical acceptance. Bench and field evidence belongs
to R9-C.
