#pragma once

#include <Arduino.h>

namespace firmware {

enum class RainSampleState : uint8_t {
  NOT_YET_MEASURED,
  VALID_ZERO,
  VALID_NONZERO,
  UNAVAILABLE,
};

struct RainReading {
  RainSampleState state = RainSampleState::NOT_YET_MEASURED;
  float rainfallMmHour = NAN;
  uint32_t tips = 0;
  uint32_t intervalMs = 0;
};

class RainSensor {
 public:
  void begin(uint8_t pin, float mmPerTip);
  bool update(uint32_t nowMs, uint32_t windowMs);
  const RainReading& reading() const { return reading_; }

 private:
  static void IRAM_ATTR interruptThunk();
  void IRAM_ATTR onPulse();
  static RainSensor* instance_;
  volatile uint32_t tips_ = 0;
  volatile uint32_t lastPulseMicros_ = 0;
  uint8_t pin_ = 27;
  float mmPerTip_ = 0.70F;
  bool initialized_ = false;
  uint32_t windowStartedAtMs_ = 0;
  RainReading reading_;
};

}  // namespace firmware
