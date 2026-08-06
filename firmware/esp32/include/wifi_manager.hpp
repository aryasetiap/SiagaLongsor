#pragma once

#include <Arduino.h>

namespace firmware {

class WifiManager {
 public:
  void begin();
  void update();
  bool connected() const;
  int rssi() const;

 private:
  uint32_t nextAttemptAt_ = 0;
  bool announced_ = false;
};

}  // namespace firmware
