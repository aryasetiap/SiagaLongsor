#pragma once

#include <Arduino.h>

#include "telemetry_model.hpp"
#include "firmware_config.hpp"

namespace firmware {

class TelemetryClient {
 public:
  void begin();
  bool enqueue(const TelemetrySample& sample);
  uint8_t depth() const { return size_; }

 private:
  struct QueueItem {
    TelemetrySample sample;
    String body;
    uint8_t attempts = 0;
    uint32_t nextAttemptAt = 0;
  };

  QueueItem queue_[TELEMETRY_QUEUE_CAPACITY];
  uint8_t size_ = 0;
  portMUX_TYPE mutex_ = portMUX_INITIALIZER_UNLOCKED;

  static void taskThunk(void* argument);
  void runTask();
  void sendFront();
  bool networkAvailable() const;
  void removeIfMessage(const String& messageId);
  void scheduleRetry(const String& messageId, uint8_t attempts, bool rateLimited);
};

}  // namespace firmware
