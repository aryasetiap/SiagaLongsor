#include "lcd_display.hpp"

#include "firmware_config.hpp"

namespace firmware {

namespace {
constexpr uint8_t LCD_COLUMNS = 16;
constexpr uint8_t LCD_ROWS = 2;
constexpr uint8_t LCD_COMMAND_MODE = LOW;
constexpr uint8_t LCD_DATA_MODE = HIGH;
}  // namespace

bool LcdDisplay::begin() {
  pinMode(LCD_RS_PIN, OUTPUT);
  pinMode(LCD_ENABLE_PIN, OUTPUT);
  pinMode(LCD_D4_PIN, OUTPUT);
  pinMode(LCD_D5_PIN, OUTPUT);
  pinMode(LCD_D6_PIN, OUTPUT);
  pinMode(LCD_D7_PIN, OUTPUT);

  digitalWrite(LCD_RS_PIN, LOW);
  digitalWrite(LCD_ENABLE_PIN, LOW);
  digitalWrite(LCD_D4_PIN, LOW);
  digitalWrite(LCD_D5_PIN, LOW);
  digitalWrite(LCD_D6_PIN, LOW);
  digitalWrite(LCD_D7_PIN, LOW);

  // HD44780 initialization when only D4-D7 are connected.
  delay(50);
  write4Bits(0x03);
  delayMicroseconds(4500);
  write4Bits(0x03);
  delayMicroseconds(4500);
  write4Bits(0x03);
  delayMicroseconds(150);
  write4Bits(0x02);

  available_ = true;
  command(0x28);  // 4-bit, two rows, 5x8 font.
  command(0x0C);  // Display on, cursor and blink off.
  command(0x01);  // Clear display.
  delayMicroseconds(2000);
  command(0x06);  // Left-to-right entry mode.

  Serial.printf("LCD1602 ready 4-bit size=%ux%u RS=%u E=%u D4=%u D5=%u D6=%u D7=%u\n",
                LCD_COLUMNS, LCD_ROWS, LCD_RS_PIN, LCD_ENABLE_PIN,
                LCD_D4_PIN, LCD_D5_PIN, LCD_D6_PIN, LCD_D7_PIN);
  return true;
}

void LcdDisplay::pulseEnable() {
  digitalWrite(LCD_ENABLE_PIN, LOW);
  delayMicroseconds(1);
  digitalWrite(LCD_ENABLE_PIN, HIGH);
  delayMicroseconds(1);
  digitalWrite(LCD_ENABLE_PIN, LOW);
  delayMicroseconds(50);
}

void LcdDisplay::write4Bits(uint8_t nibble) {
  digitalWrite(LCD_D4_PIN, (nibble >> 0) & 0x01);
  digitalWrite(LCD_D5_PIN, (nibble >> 1) & 0x01);
  digitalWrite(LCD_D6_PIN, (nibble >> 2) & 0x01);
  digitalWrite(LCD_D7_PIN, (nibble >> 3) & 0x01);
  pulseEnable();
}

void LcdDisplay::send(uint8_t value, uint8_t mode) {
  digitalWrite(LCD_RS_PIN, mode);
  write4Bits(value >> 4);
  write4Bits(value & 0x0F);
}

void LcdDisplay::command(uint8_t value) { send(value, LCD_COMMAND_MODE); }

void LcdDisplay::writeCharacter(uint8_t value) { send(value, LCD_DATA_MODE); }

void LcdDisplay::setCursor(uint8_t column, uint8_t row) {
  const uint8_t rowOffset = row == 0 ? 0x00 : 0x40;
  command(0x80 | (column + rowOffset));
}

void LcdDisplay::writeLine(const String& value, uint8_t row) {
  setCursor(0, row);
  for (uint8_t column = 0; column < LCD_COLUMNS; ++column) {
    const char character = column < value.length() ? value.charAt(column) : ' ';
    writeCharacter(static_cast<uint8_t>(character));
  }
}

void LcdDisplay::show(const String& line1, const String& line2) {
  if (!available_) return;
  writeLine(line1, 0);
  writeLine(line2, 1);
}

}  // namespace firmware
