#include "clock_service.hpp"

#include <time.h>

namespace firmware {

void ClockService::begin() {
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  Serial.println("NTP synchronization requested");
}

bool ClockService::synchronized() const {
  return time(nullptr) >= 1700000000;
}

String ClockService::utcNow() const {
  time_t current = time(nullptr);
  struct tm utc{};
  gmtime_r(&current, &utc);
  char output[25];
  strftime(output, sizeof(output), "%Y-%m-%dT%H:%M:%SZ", &utc);
  return String(output);
}

void ClockService::diagnostics() const {
  Serial.printf("clock=%s%s\n", synchronized() ? "synchronized " : "unsynchronized", utcNow().c_str());
}

}  // namespace firmware
