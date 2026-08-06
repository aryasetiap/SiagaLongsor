#pragma once

#include <Arduino.h>

namespace firmware {

class RainSensor {
 public:
  void begin(uint8_t pin, float mmPerTip);
  float sample(uint32_t intervalMs);
  uint32_t tipCount() const { return tips_; }
  void resetForSelfTest() { tips_ = 0; }

 private:
  static void IRAM_ATTR interruptThunk();
  void IRAM_ATTR onPulse();
  static RainSensor* instance_;
  volatile uint32_t tips_ = 0;
  volatile uint32_t lastPulseMicros_ = 0;
  uint8_t pin_ = 27;
  float mmPerTip_ = 0.70F;
  bool initialized_ = false;
};

}  // namespace firmware
