#pragma once

#include <Arduino.h>

namespace firmware {

class SoilSensor {
 public:
  void begin(uint8_t pin, int dry, int wet);
  bool read(float& percentage, int& raw) const;
  bool calibrated() const { return calibrated_; }

 private:
  uint8_t pin_ = 34;
  int dry_ = 0;
  int wet_ = 0;
  bool calibrated_ = false;
};

}  // namespace firmware
