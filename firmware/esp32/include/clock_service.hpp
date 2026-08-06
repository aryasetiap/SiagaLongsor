#pragma once

#include <Arduino.h>

namespace firmware {

class ClockService {
 public:
  void begin();
  bool synchronized() const;
  String utcNow() const;
  void diagnostics() const;
};

}  // namespace firmware
