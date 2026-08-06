#pragma once

#include <Arduino.h>

namespace firmware {

struct TelemetrySample {
  String messageId;
  String bootId;
  uint32_t sequence = 0;
  String timestamp;
  String firmwareVersion;
  int signalRssi = 0;
  float tiltXDeg = NAN;
  float tiltYDeg = NAN;
  float tiltMagnitudeDeg = NAN;
  float soilMoisturePct = NAN;
  float rainfallMmHour = NAN;
  float batteryVoltage = NAN;
};

String telemetryJson(const TelemetrySample& sample);

}  // namespace firmware
