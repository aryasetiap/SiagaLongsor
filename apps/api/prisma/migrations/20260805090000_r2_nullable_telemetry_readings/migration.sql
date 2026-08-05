-- R2 permits an ESP32 to report an unreadable physical sensor honestly as JSON null.
-- Existing numeric historical readings remain unchanged; rollback requires proving no NULL values
-- exist before restoring NOT NULL constraints.
ALTER TABLE "Telemetry"
  ALTER COLUMN "tiltMagnitudeDeg" DROP NOT NULL,
  ALTER COLUMN "soilMoisturePct" DROP NOT NULL,
  ALTER COLUMN "rainfallMmHour" DROP NOT NULL,
  ALTER COLUMN "batteryVoltage" DROP NOT NULL;
