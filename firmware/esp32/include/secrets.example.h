#pragma once

// Copy this file to secrets.h locally. Never commit secrets.h.
#define WIFI_SSID "<wifi-ssid>"
#define WIFI_PASSWORD "<wifi-password>"
#define API_BASE_URL "https://api.example.invalid/api/v1"
#define API_CA_CERT ""
#define DEVICE_HARDWARE_ID "<HARDWARE-ID>"
#define DEVICE_SECRET "<one-time-device-secret>"

// Soil calibration is intentionally unset until field measurements exist.
// Set both values to non-zero, distinct ADC readings after calibration.
#define SOIL_ADC_DRY 0
#define SOIL_ADC_WET 0
#define TILT_REFERENCE_X_DEG 0.0F
#define TILT_REFERENCE_Y_DEG 0.0F
#define TILT_REFERENCE_CALIBRATED false
#define RAIN_MM_PER_TIP 0.70F
