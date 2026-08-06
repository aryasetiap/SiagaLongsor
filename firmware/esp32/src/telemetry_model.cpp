#include "telemetry_model.hpp"

namespace firmware {

namespace {
String jsonString(const String& value) {
  String escaped;
  escaped.reserve(value.length() + 2);
  escaped += '"';
  for (size_t index = 0; index < value.length(); ++index) {
    const char character = value[index];
    if (character == '"' || character == '\\') escaped += '\\';
    escaped += character;
  }
  escaped += '"';
  return escaped;
}

String jsonNumber(float value) { return isfinite(value) ? String(value, 4) : String("null"); }
}  // namespace

String telemetryJson(const TelemetrySample& sample) {
  String body;
  body.reserve(560);
  body += "{\"messageId\":" + jsonString(sample.messageId);
  body += ",\"bootId\":" + jsonString(sample.bootId);
  body += ",\"sequence\":" + String(sample.sequence);
  body += ",\"timestamp\":" + jsonString(sample.timestamp);
  body += ",\"firmwareVersion\":" + jsonString(sample.firmwareVersion);
  body += ",\"network\":{\"type\":\"WIFI\",\"signalRssi\":" + String(sample.signalRssi) + "}";
  body += ",\"readings\":{";
  body += "\"tiltXDeg\":" + jsonNumber(sample.tiltXDeg);
  body += ",\"tiltYDeg\":" + jsonNumber(sample.tiltYDeg);
  body += ",\"tiltMagnitudeDeg\":" + jsonNumber(sample.tiltMagnitudeDeg);
  body += ",\"soilMoisturePct\":" + jsonNumber(sample.soilMoisturePct);
  body += ",\"rainfallMmHour\":" + jsonNumber(sample.rainfallMmHour);
  body += ",\"batteryVoltage\":" + jsonNumber(sample.batteryVoltage);
  body += "}}";
  return body;
}

}  // namespace firmware
