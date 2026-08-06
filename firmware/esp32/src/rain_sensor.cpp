#include "rain_sensor.hpp"

#include "sensor_logic.hpp"

namespace firmware {

RainSensor* RainSensor::instance_ = nullptr;

void RainSensor::begin(uint8_t pin, float mmPerTip) {
  pin_ = pin;
  mmPerTip_ = mmPerTip;
  pinMode(pin_, INPUT_PULLUP);
  instance_ = this;
  attachInterrupt(digitalPinToInterrupt(pin_), interruptThunk, FALLING);
  initialized_ = true;
  Serial.printf("rain pulse pin=%u nominal_mm_per_tip=%.2f (field calibration required)\n", pin_, mmPerTip_);
}

void IRAM_ATTR RainSensor::interruptThunk() {
  if (instance_ != nullptr) instance_->onPulse();
}

void IRAM_ATTR RainSensor::onPulse() {
  const uint32_t now = micros();
  if (now - lastPulseMicros_ >= 50000UL) {
    ++tips_;
    lastPulseMicros_ = now;
  }
}

float RainSensor::sample(uint32_t intervalMs) {
  if (!initialized_) return NAN;
  noInterrupts();
  const uint32_t tips = tips_;
  tips_ = 0;
  interrupts();
  return rainfallMmPerHour(tips, mmPerTip_, intervalMs);
}

}  // namespace firmware
