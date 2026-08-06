#include <Arduino.h>
#include <Wire.h>

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
firmware::LcdDisplay lcd(Wire);
firmware::TelemetryClient telemetry;
uint32_t nextSensorAt = 0;
bool mpuAvailable = false;
}

void setup() {
  Serial.begin(firmware::SERIAL_BAUD);
  delay(100);
  Serial.println("SiagaLongsor ESP32 firmware R9-B1");
  identity.begin();

  Wire.begin(firmware::I2C_SDA_PIN, firmware::I2C_SCL_PIN);
  lcd.scan();
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
    firmware::TiltReading rawTilt{};
    const bool rawTiltReadable = mpuAvailable && mpu.readRawOrientation(rawTilt);
    if (!mpu.calibrated() && rawTiltReadable) {
      Serial.printf("tilt raw reference candidate x=%.2f y=%.2f\n", rawTilt.xDeg, rawTilt.yDeg);
    }
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

      firmware::TiltReading tilt{};
      if (mpuAvailable && mpu.read(tilt)) {
        sample.tiltXDeg = tilt.xDeg;
        sample.tiltYDeg = tilt.yDeg;
        sample.tiltMagnitudeDeg = tilt.magnitudeDeg;
      } else {
        sample.tiltXDeg = NAN;
        sample.tiltYDeg = NAN;
        sample.tiltMagnitudeDeg = NAN;
      }

      int rawSoil = 0;
      float soilPercentage = NAN;
      if (soil.read(soilPercentage, rawSoil)) sample.soilMoisturePct = soilPercentage;
      Serial.printf("soil raw=%d calibration=%s\n", rawSoil, soil.calibrated() ? "ready" : "unavailable");

      const firmware::RainReading rainReading = rain.reading();
      if (rainReading.state == firmware::RainSampleState::VALID_ZERO ||
          rainReading.state == firmware::RainSampleState::VALID_NONZERO) {
        sample.rainfallMmHour = rainReading.rainfallMmHour;
      }
      sample.batteryVoltage = NAN;
      telemetry.enqueue(sample);
    }
  }

  delay(1);
}
