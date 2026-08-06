#include "mpu6050.hpp"

namespace firmware {

bool Mpu6050::begin(uint8_t address) {
  address_ = address;
  wire_.beginTransmission(address_);
  if (wire_.endTransmission() != 0) {
    Serial.printf("MPU6050 not found at 0x%02X\n", address_);
    return false;
  }
  wire_.beginTransmission(address_);
  wire_.write(0x6B);
  wire_.write(0x00);
  if (wire_.endTransmission() != 0) return false;
  uint8_t identity = 0;
  if (!readRegisters(0x75, &identity, 1)) return false;
  Serial.printf("MPU6050 detected WHO_AM_I=0x%02X\n", identity);
  return true;
}

bool Mpu6050::readRegisters(uint8_t reg, uint8_t* buffer, size_t length) {
  wire_.beginTransmission(address_);
  wire_.write(reg);
  if (wire_.endTransmission(false) != 0) return false;
  if (wire_.requestFrom(static_cast<int>(address_), static_cast<int>(length)) != length) return false;
  for (size_t index = 0; index < length; ++index) buffer[index] = wire_.read();
  return true;
}

bool Mpu6050::read(TiltReading& reading) {
  if (!reference_.calibrated) return false;
  uint8_t bytes[6];
  if (!readRegisters(0x3B, bytes, sizeof(bytes))) return false;
  const int16_t rawX = static_cast<int16_t>((bytes[0] << 8) | bytes[1]);
  const int16_t rawY = static_cast<int16_t>((bytes[2] << 8) | bytes[3]);
  const int16_t rawZ = static_cast<int16_t>((bytes[4] << 8) | bytes[5]);
  reading = tiltFromAccelerometer(rawX / 16384.0F, rawY / 16384.0F, rawZ / 16384.0F, reference_);
  return true;
}

}  // namespace firmware
