#include "sensor_logic.hpp"

#include <algorithm>
#include <cmath>

namespace firmware {

constexpr float PI_VALUE = 3.14159265358979323846F;

bool soilCalibrationValid(int dry, int wet) {
  return dry >= 0 && dry <= 4095 && wet >= 0 && wet <= 4095 && dry != wet;
}

float mapSoilAdcToPercent(int raw, int dry, int wet) {
  if (!soilCalibrationValid(dry, wet)) return NAN;
  const float percentage = (static_cast<float>(raw - dry) * 100.0F) /
                          static_cast<float>(wet - dry);
  return std::max(0.0F, std::min(100.0F, percentage));
}

TiltReading tiltFromAccelerometer(float ax, float ay, float az, const TiltReference& reference) {
  const float x = atan2f(ay, az) * 180.0F / PI_VALUE - reference.xDeg;
  const float y = atan2f(-ax, sqrtf(ay * ay + az * az)) * 180.0F / PI_VALUE - reference.yDeg;
  return {x, y, sqrtf(x * x + y * y)};
}

float shortestSignedAngleDifference(float readingDeg, float referenceDeg) {
  float difference = fmodf(readingDeg - referenceDeg, 360.0F);
  if (difference < -180.0F) return difference + 360.0F;
  if (difference >= 180.0F) return difference - 360.0F;
  return difference;
}

TiltReading applyTiltReference(const TiltReading& rawReading, const TiltReference& reference) {
  const float x = shortestSignedAngleDifference(rawReading.xDeg, reference.xDeg);
  const float y = shortestSignedAngleDifference(rawReading.yDeg, reference.yDeg);
  return {x, y, sqrtf(x * x + y * y)};
}

float rainfallMmPerHour(uint32_t tips, float mmPerTip, uint32_t intervalMs) {
  if (intervalMs == 0 || mmPerTip < 0.0F) return NAN;
  return static_cast<float>(tips) * mmPerTip * (3600000.0F / static_cast<float>(intervalMs));
}

uint32_t retryDelayMs(uint8_t attempt, bool rateLimited, uint32_t entropy) {
  const uint8_t bounded = attempt > 5 ? 5 : attempt;
  const uint32_t base = rateLimited ? 10000UL : 1000UL;
  const uint32_t exponential = base << bounded;
  const uint32_t jitter = entropy % (base + 1);
  const uint32_t maximum = rateLimited ? static_cast<uint32_t>(120000) : static_cast<uint32_t>(60000);
  return std::min(exponential + jitter, maximum);
}

}  // namespace firmware
