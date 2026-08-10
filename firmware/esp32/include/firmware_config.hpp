#pragma once

#include <Arduino.h>

#if __has_include("secrets.h")
#include "secrets.h"
#else
#error "Copy include/secrets.example.h to include/secrets.h and configure it locally."
#endif

#ifndef API_CA_CERT
#define API_CA_CERT ""
#endif

#ifndef RAIN_MM_PER_TIP
#define RAIN_MM_PER_TIP 0.70F
#endif

#ifndef TILT_REFERENCE_X_DEG
#define TILT_REFERENCE_X_DEG 0.0F
#endif
#ifndef TILT_REFERENCE_Y_DEG
#define TILT_REFERENCE_Y_DEG 0.0F
#endif
#ifndef TILT_REFERENCE_CALIBRATED
#define TILT_REFERENCE_CALIBRATED false
#endif
namespace firmware {

constexpr uint8_t I2C_SDA_PIN = 21;
constexpr uint8_t I2C_SCL_PIN = 22;
constexpr uint8_t SOIL_ADC_PIN = 34;
constexpr uint8_t RAIN_PULSE_PIN = 27;
constexpr uint8_t LCD_RS_PIN = 13;
constexpr uint8_t LCD_ENABLE_PIN = 14;
constexpr uint8_t LCD_D4_PIN = 16;
constexpr uint8_t LCD_D5_PIN = 17;
constexpr uint8_t LCD_D6_PIN = 18;
constexpr uint8_t LCD_D7_PIN = 19;

constexpr uint32_t SERIAL_BAUD = 115200;
constexpr uint32_t SENSOR_INTERVAL_MS = 5000;
constexpr uint32_t RAIN_SAMPLE_INTERVAL_MS = 60000;
constexpr uint32_t HTTP_TIMEOUT_MS = 8000;
constexpr uint8_t TELEMETRY_QUEUE_CAPACITY = 4;
constexpr uint8_t MAX_RETRIES = 5;
constexpr float RAIN_MM_PER_TIP_VALUE = RAIN_MM_PER_TIP; // Vendor nominal; calibrate in field.

static_assert(SOIL_ADC_PIN >= 32 && SOIL_ADC_PIN <= 39, "Soil input must use ESP32 ADC1.");

}  // namespace firmware
