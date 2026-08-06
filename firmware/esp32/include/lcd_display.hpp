#pragma once

#include <Arduino.h>
#include <Wire.h>

namespace firmware {

class LcdDisplay {
 public:
  explicit LcdDisplay(TwoWire& wire) : wire_(wire) {}
  void scan();
  void show(const String& line1, const String& line2);

 private:
  TwoWire& wire_;
  uint8_t address_ = 0;
  bool available_ = false;
};

}  // namespace firmware
