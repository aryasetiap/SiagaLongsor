#include <Arduino.h>
#include <Wire.h>
#include <math.h>

#include "clock_service.hpp"
#include "device_identity.hpp"
#include "firmware_config.hpp"
#include "lcd_display.hpp"
#include "mpu6050.hpp"
#include "rain_sensor.hpp"
#include "soil_sensor.hpp"
#include "telemetry_client.hpp"
#include "telemetry_model.hpp"
#include "wifi_manager.hpp"

namespace {
firmware::DeviceIdentity identity;
firmware::ClockService clockService;
firmware::WifiManager wifi;
firmware::Mpu6050 mpu(Wire);
firmware::SoilSensor soil;
firmware::RainSensor rain;
firmware::LcdDisplay lcd;
firmware::TelemetryClient telemetry;
uint32_t nextSensorAt = 0;
bool mpuAvailable = false;
bool showSensorPage = true;

String measurementLine(const char* label, float value, const char* unit) {
  String line(label);
  line += ':';
  if (isnan(value)) {
    line += " --";
    return line;
  }
  line += String(value, 1);
  line += unit;
  return line;
}

String connectivityLine() {
  String line;
  if (wifi.connected()) {
    line = "WiFi:";
    line += String(wifi.rssi());
    line += "dBm";
  } else {
    line = "WiFi:putus";
  }
  line += " Q:";
  line += String(telemetry.depth());
  return line;
}

}  // namespace

void setup() {
  Serial.begin(firmware::SERIAL_BAUD);
  delay(100);
  Serial.println("SiagaLongsor ESP32 firmware R9-B1");
  identity.begin();

  Wire.begin(firmware::I2C_SDA_PIN, firmware::I2C_SCL_PIN);
  lcd.begin();
  lcd.show("SiagaLongsor", "Memulai sistem");
  mpuAvailable = mpu.begin();
  firmware::TiltReference tiltReference;
  tiltReference.xDeg = TILT_REFERENCE_X_DEG;
  tiltReference.yDeg = TILT_REFERENCE_Y_DEG;
  tiltReference.calibrated = TILT_REFERENCE_CALIBRATED;
  mpu.setReference(tiltReference);
  Serial.printf("tilt reference calibration=%s x=%.2f y=%.2f\n",
                TILT_REFERENCE_CALIBRATED ? "configured" : "unavailable",
                TILT_REFERENCE_X_DEG, TILT_REFERENCE_Y_DEG);
  if (!mpuAvailable) Serial.println("tilt sensor unavailable; tilt readings will be null");
  soil.begin(firmware::SOIL_ADC_PIN, SOIL_ADC_DRY, SOIL_ADC_WET);
  rain.begin(firmware::RAIN_PULSE_PIN, firmware::RAIN_MM_PER_TIP_VALUE);
  Serial.println("battery measurement hardware absent; batteryVoltage=null");

  wifi.begin();
  lcd.show("SiagaLongsor", "WiFi menghubung");
  clockService.begin();
  telemetry.begin();
  nextSensorAt = millis();
}

void loop() {
  wifi.update();
  const uint32_t now = millis();
  rain.update(now, firmware::RAIN_SAMPLE_INTERVAL_MS);
  if (static_cast<int32_t>(now - nextSensorAt) >= 0) {
    nextSensorAt = now + firmware::SENSOR_INTERVAL_MS;

    firmware::TiltReading tilt{};
    bool tiltReadable = false;
    if (mpuAvailable && mpu.calibrated()) {
      tiltReadable = mpu.read(tilt);
    } else if (mpuAvailable) {
      firmware::TiltReading rawTilt{};
      if (mpu.readRawOrientation(rawTilt)) {
        Serial.printf("tilt raw reference candidate x=%.2f y=%.2f\n", rawTilt.xDeg, rawTilt.yDeg);
      }
    }

    int rawSoil = 0;
    float soilPercentage = NAN;
    const bool soilReadable = soil.read(soilPercentage, rawSoil);
    Serial.printf("soil raw=%d calibration=%s\n", rawSoil,
                  soil.calibrated() ? "ready" : "unavailable");

    const firmware::RainReading rainReading = rain.reading();
    const bool rainReadable = rainReading.state == firmware::RainSampleState::VALID_ZERO ||
                              rainReading.state == firmware::RainSampleState::VALID_NONZERO;

    if (showSensorPage) {
      lcd.show(measurementLine("Tilt", tiltReadable ? tilt.magnitudeDeg : NAN, "deg"),
               measurementLine("Tanah", soilReadable ? soilPercentage : NAN, "%"));
    } else {
      lcd.show(measurementLine("Hujan", rainReadable ? rainReading.rainfallMmHour : NAN, "mm/j"),
               connectivityLine());
    }
    showSensorPage = !showSensorPage;

    if (!clockService.synchronized()) {
      Serial.println("clock unavailable; sensor acquisition continues, telemetry deferred");
    } else {
      firmware::TelemetrySample sample;
      sample.messageId = identity.nextMessageId();
      sample.bootId = identity.bootId();
      sample.sequence = identity.nextSequence();
      sample.timestamp = clockService.utcNow();
      sample.firmwareVersion = "r9b1-esp32";
      sample.signalRssi = wifi.rssi();

      if (tiltReadable) {
        sample.tiltXDeg = tilt.xDeg;
        sample.tiltYDeg = tilt.yDeg;
        sample.tiltMagnitudeDeg = tilt.magnitudeDeg;
      } else {
        sample.tiltXDeg = NAN;
        sample.tiltYDeg = NAN;
        sample.tiltMagnitudeDeg = NAN;
      }

      if (soilReadable) sample.soilMoisturePct = soilPercentage;

      if (rainReadable) {
        sample.rainfallMmHour = rainReading.rainfallMmHour;
      }
      sample.batteryVoltage = NAN;
      telemetry.enqueue(sample);
    }
  }

  delay(1);
}
