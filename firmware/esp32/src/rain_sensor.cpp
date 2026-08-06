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
  windowStartedAtMs_ = millis();
  reading_ = {};
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

bool RainSensor::update(uint32_t nowMs, uint32_t windowMs) {
  if (!initialized_ || windowMs == 0) {
    reading_.state = RainSampleState::UNAVAILABLE;
    reading_.rainfallMmHour = NAN;
    return false;
  }
  if (static_cast<uint32_t>(nowMs - windowStartedAtMs_) < windowMs) {
    return false;
  }
  const uint32_t actualIntervalMs = nowMs - windowStartedAtMs_;
  noInterrupts();
  const uint32_t tips = tips_;
  tips_ = 0;
  interrupts();
  const float rainfall = rainfallMmPerHour(tips, mmPerTip_, actualIntervalMs);
  reading_.tips = tips;
  reading_.intervalMs = actualIntervalMs;
  reading_.rainfallMmHour = rainfall;
  reading_.state = isfinite(rainfall)
                       ? (tips == 0 ? RainSampleState::VALID_ZERO : RainSampleState::VALID_NONZERO)
                       : RainSampleState::UNAVAILABLE;
  Serial.printf("rain window tips=%lu intervalMs=%lu rainfallMmHour=%.3f\n",
                static_cast<unsigned long>(tips), static_cast<unsigned long>(actualIntervalMs), rainfall);
  windowStartedAtMs_ = nowMs;
  return true;
}

}  // namespace firmware
