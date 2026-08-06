#pragma once

#include <cstdint>

namespace firmware {

struct TiltReading {
  float xDeg;
  float yDeg;
  float magnitudeDeg;
};

struct TiltReference {
  float xDeg = 0.0F;
  float yDeg = 0.0F;
  bool calibrated = false;
};

float mapSoilAdcToPercent(int raw, int dry, int wet);
bool soilCalibrationValid(int dry, int wet);
TiltReading tiltFromAccelerometer(float ax, float ay, float az, const TiltReference& reference);
float rainfallMmPerHour(uint32_t tips, float mmPerTip, uint32_t intervalMs);
uint32_t retryDelayMs(uint8_t attempt, bool rateLimited, uint32_t entropy);

}  // namespace firmware
