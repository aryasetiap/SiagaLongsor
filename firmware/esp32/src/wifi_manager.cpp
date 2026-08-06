#include "wifi_manager.hpp"

#include <WiFi.h>

#include "firmware_config.hpp"

namespace firmware {

void WifiManager::begin() {
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.println("Wi-Fi connection requested");
}

bool WifiManager::connected() const { return WiFi.status() == WL_CONNECTED; }

int WifiManager::rssi() const { return connected() ? WiFi.RSSI() : 0; }

void WifiManager::update() {
  const uint32_t now = millis();
  if (connected()) {
    if (!announced_) {
      Serial.printf("Wi-Fi connected ip=%s rssi=%d\n", WiFi.localIP().toString().c_str(), rssi());
      announced_ = true;
    }
    return;
  }
  announced_ = false;
  if (static_cast<int32_t>(now - nextAttemptAt_) < 0) return;
  Serial.println("Wi-Fi disconnected; reconnecting");
  WiFi.reconnect();
  nextAttemptAt_ = now + 10000UL;
}

}  // namespace firmware
