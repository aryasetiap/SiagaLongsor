#pragma once

#include <Arduino.h>

namespace firmware {

class DeviceIdentity {
 public:
  void begin();
  const String& bootId() const { return bootId_; }
  uint32_t nextSequence() { return sequence_++; }
  String nextMessageId();

 private:
  String bootId_;
  uint32_t sequence_ = 0;
};

}  // namespace firmware
