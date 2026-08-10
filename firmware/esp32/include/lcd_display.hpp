#pragma once

#include <Arduino.h>

namespace firmware {

class LcdDisplay {
 public:
  bool begin();
  void show(const String& line1, const String& line2);
  bool available() const { return available_; }

 private:
  void pulseEnable();
  void write4Bits(uint8_t nibble);
  void send(uint8_t value, uint8_t mode);
  void command(uint8_t value);
  void writeCharacter(uint8_t value);
  void setCursor(uint8_t column, uint8_t row);
  void writeLine(const String& value, uint8_t row);

  bool available_ = false;
};

}  // namespace firmware
