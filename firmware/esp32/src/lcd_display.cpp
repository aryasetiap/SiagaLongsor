#include "lcd_display.hpp"

namespace firmware {

void LcdDisplay::scan() {
  Serial.print("I2C addresses:");
  for (uint8_t address = 1; address < 127; ++address) {
    wire_.beginTransmission(address);
    if (wire_.endTransmission() == 0) Serial.printf(" 0x%02X", address);
  }
  Serial.println();
  // Backpack controller and pin mapping are not confirmed; no hard-coded LCD init is performed.
  available_ = false;
}

void LcdDisplay::show(const String&, const String&) {
  if (!available_) return;
}

}  // namespace firmware
