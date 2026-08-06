#include "telemetry_client.hpp"

#include <HTTPClient.h>
#include <cstring>
#include <WiFi.h>
#include <WiFiClientSecure.h>

#include "firmware_config.hpp"
#include "sensor_logic.hpp"

namespace firmware {

void TelemetryClient::begin() {
  xTaskCreatePinnedToCore(taskThunk, "telemetry_http", 8192, this, 1, nullptr, 0);
}

bool TelemetryClient::enqueue(const TelemetrySample& sample) {
  if (size_ >= TELEMETRY_QUEUE_CAPACITY) {
    Serial.println("telemetry queue full; sample dropped (RAM queue is bounded)");
    return false;
  }
  queue_[size_].sample = sample;
  queue_[size_].body = telemetryJson(sample);
  queue_[size_].attempts = 0;
  queue_[size_].nextAttemptAt = millis();
  ++size_;
  Serial.printf("telemetry queued depth=%u messageId=%s\n", size_, sample.messageId.c_str());
  return true;
}

bool TelemetryClient::networkAvailable() const { return WiFi.status() == WL_CONNECTED; }

void TelemetryClient::taskThunk(void* argument) {
  static_cast<TelemetryClient*>(argument)->runTask();
}

void TelemetryClient::runTask() {
  for (;;) {
    if (size_ == 0 || !networkAvailable()) {
      vTaskDelay(pdMS_TO_TICKS(100));
      continue;
    }
    bool due = false;
    portENTER_CRITICAL(&mutex_);
    due = static_cast<int32_t>(millis() - queue_[0].nextAttemptAt) >= 0;
    portEXIT_CRITICAL(&mutex_);
    if (due) sendFront();
    else vTaskDelay(pdMS_TO_TICKS(100));
  }
}

void TelemetryClient::removeIfMessage(const String& messageId) {
  portENTER_CRITICAL(&mutex_);
  if (size_ > 0 && queue_[0].sample.messageId == messageId) {
    for (uint8_t index = 1; index < size_; ++index) queue_[index - 1] = queue_[index];
    --size_;
  }
  portEXIT_CRITICAL(&mutex_);
}

void TelemetryClient::scheduleRetry(const String& messageId, uint8_t attempts, bool rateLimited) {
  portENTER_CRITICAL(&mutex_);
  if (size_ > 0 && queue_[0].sample.messageId == messageId) {
    queue_[0].attempts = attempts;
    queue_[0].nextAttemptAt = millis() + retryDelayMs(attempts, rateLimited, esp_random());
  }
  portEXIT_CRITICAL(&mutex_);
}

void TelemetryClient::sendFront() {
  QueueItem item;
  portENTER_CRITICAL(&mutex_);
  if (size_ == 0) {
    portEXIT_CRITICAL(&mutex_);
    return;
  }
  item = queue_[0];
  portEXIT_CRITICAL(&mutex_);

  const String url = String(API_BASE_URL) + "/iot/telemetry";
  const bool secure = url.startsWith("https://");
  HTTPClient http;
  WiFiClient plainClient;
  WiFiClientSecure secureClient;
  if (secure) {
    if (strlen(API_CA_CERT) == 0) {
      Serial.println("HTTPS requires API_CA_CERT; telemetry deferred");
      scheduleRetry(item.sample.messageId, item.attempts, true);
      return;
    }
    secureClient.setCACert(API_CA_CERT);
    if (!http.begin(secureClient, url)) {
      Serial.println("secure telemetry HTTP client initialization failed");
      scheduleRetry(item.sample.messageId, item.attempts + 1, false);
      return;
    }
  } else if (!http.begin(plainClient, url)) {
    Serial.println("telemetry HTTP client initialization failed");
    scheduleRetry(item.sample.messageId, item.attempts + 1, false);
    return;
  }
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Device ") + DEVICE_HARDWARE_ID + "." + DEVICE_SECRET);
  http.addHeader("Idempotency-Key", item.sample.messageId);
  const int status = http.POST(item.body);
  http.end();

  if (status == 200 || status == 201) {
    Serial.printf("telemetry delivered status=%d duplicate=%s\n", status, status == 200 ? "true" : "false");
    removeIfMessage(item.sample.messageId);
    return;
  }

  const bool retryable = status == 0 || status >= 500 || status == 429;
  if (!retryable || item.attempts >= MAX_RETRIES) {
    Serial.printf("telemetry permanent failure status=%d messageId=%s\n", status, item.sample.messageId.c_str());
    removeIfMessage(item.sample.messageId);
    return;
  }
  const bool rateLimited = status == 429;
  scheduleRetry(item.sample.messageId, item.attempts + 1, rateLimited);
  Serial.printf("telemetry retry scheduled status=%d attempt=%u\n", status, item.attempts + 1);
}

}  // namespace firmware
