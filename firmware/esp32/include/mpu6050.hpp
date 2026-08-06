#pragma once

#include <Arduino.h>
#include <Wire.h>

#include "sensor_logic.hpp"

namespace firmware {

class Mpu6050 {
 public:
  explicit Mpu6050(TwoWire& wire) : wire_(wire) {}
  bool begin(uint8_t address = 0x68);
  bool readRawOrientation(TiltReading& reading);
  bool read(TiltReading& reading);
  void setReference(const TiltReference& reference) { reference_ = reference; }
  bool calibrated() const { return reference_.calibrated; }

 private:
  bool readRegisters(uint8_t reg, uint8_t* buffer, size_t length);
  TwoWire& wire_;
  uint8_t address_ = 0x68;
  TiltReference reference_;
};

}  // namespace firmware
