#include "mpu6050.hpp"

#include <math.h>

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
  if (identity == 0x68) {
    Serial.println("WHO_AM_I=0x68: MPU-6050-compatible expected identity");
  } else if (identity == 0x70) {
    Serial.println("WHO_AM_I=0x70: different/compatible IMU identity; MPU6050 silicon is not confirmed");
  } else {
    Serial.printf("WHO_AM_I=0x%02X: unknown IMU identity; limited accelerometer compatibility will be tried\n", identity);
  }
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

bool Mpu6050::readRawOrientation(TiltReading& reading) {
  uint8_t bytes[6];
  if (!readRegisters(0x3B, bytes, sizeof(bytes))) return false;
  const int16_t rawX = static_cast<int16_t>((bytes[0] << 8) | bytes[1]);
  const int16_t rawY = static_cast<int16_t>((bytes[2] << 8) | bytes[3]);
  const int16_t rawZ = static_cast<int16_t>((bytes[4] << 8) | bytes[5]);
  TiltReference noReference;
  noReference.calibrated = true;
  reading = tiltFromAccelerometer(rawX / 16384.0F, rawY / 16384.0F, rawZ / 16384.0F, noReference);
  return true;
}

bool Mpu6050::read(TiltReading& reading) {
  if (!reference_.calibrated || !readRawOrientation(reading)) return false;
  reading.xDeg -= reference_.xDeg;
  reading.yDeg -= reference_.yDeg;
  reading.magnitudeDeg = sqrtf(reading.xDeg * reading.xDeg + reading.yDeg * reading.yDeg);
  return true;
}

}  // namespace firmware
