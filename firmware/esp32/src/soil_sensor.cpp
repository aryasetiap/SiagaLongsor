#include "soil_sensor.hpp"

#include "sensor_logic.hpp"

namespace firmware {

void SoilSensor::begin(uint8_t pin, int dry, int wet) {
  pin_ = pin;
  dry_ = dry;
  wet_ = wet;
  analogReadResolution(12);
  calibrated_ = soilCalibrationValid(dry_, wet_);
  Serial.printf("soil ADC pin=%u calibration=%s dry=%d wet=%d\n", pin_,
                calibrated_ ? "ready" : "unavailable", dry_, wet_);
}

bool SoilSensor::read(float& percentage, int& raw) const {
  uint32_t total = 0;
  for (uint8_t index = 0; index < 4; ++index) total += static_cast<uint32_t>(analogRead(pin_));
  raw = static_cast<int>(total / 4U);
  if (!calibrated_) return false;
  percentage = mapSoilAdcToPercent(raw, dry_, wet_);
  return isfinite(percentage);
}

}  // namespace firmware
