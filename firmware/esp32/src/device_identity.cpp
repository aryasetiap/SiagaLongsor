#include "device_identity.hpp"

#include <esp_system.h>

namespace firmware {

namespace {
String hex32(uint32_t value) {
  char output[9];
  snprintf(output, sizeof(output), "%08lx", static_cast<unsigned long>(value));
  return String(output);
}
}  // namespace

void DeviceIdentity::begin() {
  const uint32_t first = esp_random();
  const uint32_t second = esp_random();
  bootId_ = "boot-" + hex32(first) + hex32(second);
  sequence_ = 0;
  Serial.printf("bootId=%s sequence=0\n", bootId_.c_str());
}

String DeviceIdentity::nextMessageId() {
  return "msg-" + hex32(esp_random()) + hex32(esp_random());
}

}  // namespace firmware
