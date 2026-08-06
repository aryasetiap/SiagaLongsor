# SiagaLongsor ESP32 R9-B1

This PlatformIO project targets the locked ESP32 DEVKIT V1 hardware. It is the
first physical firmware core; R9-C is still required for bench and field
acceptance. The firmware does sensor acquisition and delivery only. Risk status
remains server-authoritative.

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

### MPU6050

The driver probes address `0x68`, wakes the device, and reads the accelerometer.
Static tilt is derived from the gravity vector:

```text
x = atan2(ay, az)
y = atan2(-ax, sqrt(ay² + az²))
magnitude = sqrt(x² + y²)
```

Angles are in degrees. A mounting reference is supplied through the
`TILT_REFERENCE_*` configuration values; no perfectly level mounting is
assumed. Until that reference is marked calibrated, tilt values are null so
calibration uncertainty cannot be projected as a false SAFE state. A failed
read also produces null tilt values and never zero.

### Soil moisture

GPIO34 is deliberately ADC1 so Wi-Fi does not interfere with ADC reads. Raw
values are logged. Until distinct valid `SOIL_ADC_DRY` and `SOIL_ADC_WET`
values are configured, `soilMoisturePct` is null. Once calibrated, the raw
value is linearly mapped between the endpoints and clamped to 0–100%; either
sensor polarity is supported by the endpoint order.

### Rainfall

GPIO27 counts falling-edge pulses in an ISR. Debounce is 50 ms and expensive
work is outside the ISR. The formula is:

```text
rainfallMmHour = tips * RAIN_MM_PER_TIP * 3,600,000 / intervalMs
```

`RAIN_MM_PER_TIP = 0.70` is only the vendor nominal starting value and must be
field-calibrated. Zero tips during a valid interval reports numeric `0`.
An uninitialized rain subsystem reports null. A passive disconnected pulse
sensor cannot be distinguished from genuine zero rainfall without additional
electrical diagnostics; this limitation must be covered during field testing.

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
