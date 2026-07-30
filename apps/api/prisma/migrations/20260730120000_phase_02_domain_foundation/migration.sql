-- CreateEnum
CREATE TYPE "DeviceLifecycleStatus" AS ENUM ('ENABLED', 'DISABLED');

-- CreateEnum
CREATE TYPE "NetworkType" AS ENUM ('WIFI', 'CELLULAR', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "FirmwareRiskLevel" AS ENUM ('SAFE', 'WATCH', 'DANGER', 'UNKNOWN');

-- CreateTable
CREATE TABLE "MonitoringPoint" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "locationDescription" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MonitoringPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "monitoringPointId" TEXT NOT NULL,
    "hardwareId" VARCHAR(64) NOT NULL,
    "displayName" VARCHAR(120) NOT NULL,
    "lifecycleStatus" "DeviceLifecycleStatus" NOT NULL DEFAULT 'ENABLED',
    "credentialHash" VARCHAR(255) NOT NULL,
    "credentialRotatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firmwareVersion" VARCHAR(32),
    "lastSeenAt" TIMESTAMPTZ(3),
    "lastTelemetryAt" TIMESTAMPTZ(3),
    "lastNetworkType" "NetworkType",
    "lastSignalRssi" DECIMAL(7,2),
    "disabledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Device_hardwareId_format_check"
        CHECK ("hardwareId" ~ '^[A-Z0-9][A-Z0-9_-]{2,63}$'),
    CONSTRAINT "Device_credentialHash_not_empty_check"
        CHECK (char_length("credentialHash") > 0),
    CONSTRAINT "Device_lastSignalRssi_range_check"
        CHECK ("lastSignalRssi" IS NULL OR "lastSignalRssi" BETWEEN -150 AND 0),
    CONSTRAINT "Device_lifecycle_disabledAt_check"
        CHECK (
            ("lifecycleStatus" = 'ENABLED' AND "disabledAt" IS NULL)
            OR ("lifecycleStatus" = 'DISABLED' AND "disabledAt" IS NOT NULL)
        )
);

-- CreateTable
CREATE TABLE "Telemetry" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "monitoringPointId" TEXT NOT NULL,
    "messageId" VARCHAR(64) NOT NULL,
    "bootId" VARCHAR(64) NOT NULL,
    "sequence" BIGINT NOT NULL,
    "deviceTimestamp" TIMESTAMPTZ(3) NOT NULL,
    "serverReceivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firmwareVersion" VARCHAR(32) NOT NULL,
    "networkType" "NetworkType",
    "signalRssi" DECIMAL(7,2),
    "tiltXDeg" DECIMAL(8,4),
    "tiltYDeg" DECIMAL(8,4),
    "tiltMagnitudeDeg" DECIMAL(8,4) NOT NULL,
    "soilMoisturePct" DECIMAL(7,4) NOT NULL,
    "rainfallMmHour" DECIMAL(65,20) NOT NULL,
    "batteryVoltage" DECIMAL(8,4) NOT NULL,
    "firmwareRiskLevel" "FirmwareRiskLevel" NOT NULL,
    "firmwareSirenActive" BOOLEAN NOT NULL,
    "canonicalPayloadHash" CHAR(64) NOT NULL,
    "rawPayload" JSONB NOT NULL,

    CONSTRAINT "Telemetry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Telemetry_messageId_length_check"
        CHECK (char_length("messageId") BETWEEN 8 AND 64),
    CONSTRAINT "Telemetry_bootId_length_check"
        CHECK (char_length("bootId") BETWEEN 1 AND 64),
    CONSTRAINT "Telemetry_firmwareVersion_not_empty_check"
        CHECK (char_length("firmwareVersion") > 0),
    CONSTRAINT "Telemetry_sequence_nonnegative_check"
        CHECK ("sequence" >= 0),
    CONSTRAINT "Telemetry_signalRssi_range_check"
        CHECK ("signalRssi" IS NULL OR "signalRssi" BETWEEN -150 AND 0),
    CONSTRAINT "Telemetry_tiltXDeg_range_check"
        CHECK ("tiltXDeg" IS NULL OR "tiltXDeg" BETWEEN -180 AND 180),
    CONSTRAINT "Telemetry_tiltYDeg_range_check"
        CHECK ("tiltYDeg" IS NULL OR "tiltYDeg" BETWEEN -180 AND 180),
    CONSTRAINT "Telemetry_tiltMagnitudeDeg_range_check"
        CHECK ("tiltMagnitudeDeg" BETWEEN 0 AND 180),
    CONSTRAINT "Telemetry_soilMoisturePct_range_check"
        CHECK ("soilMoisturePct" BETWEEN 0 AND 100),
    CONSTRAINT "Telemetry_rainfallMmHour_nonnegative_check"
        CHECK ("rainfallMmHour" >= 0),
    CONSTRAINT "Telemetry_batteryVoltage_range_check"
        CHECK ("batteryVoltage" BETWEEN 0 AND 30),
    CONSTRAINT "Telemetry_rawPayload_object_check"
        CHECK (jsonb_typeof("rawPayload") = 'object'),
    CONSTRAINT "Telemetry_rawPayload_no_credential_check"
        CHECK (
            NOT ("rawPayload" ?| ARRAY[
                'Authorization',
                'authorization',
                'credential',
                'secret'
            ])
        )
);

-- CreateIndex
CREATE UNIQUE INDEX "Site_id_organizationId_key"
ON "Site"("id", "organizationId");

-- CreateIndex
CREATE INDEX "MonitoringPoint_organizationId_createdAt_id_idx"
ON "MonitoringPoint"("organizationId", "createdAt" DESC, "id");

-- CreateIndex
CREATE INDEX "MonitoringPoint_organizationId_isActive_createdAt_id_idx"
ON "MonitoringPoint"("organizationId", "isActive", "createdAt" DESC, "id");

-- CreateIndex
CREATE INDEX "MonitoringPoint_siteId_createdAt_id_idx"
ON "MonitoringPoint"("siteId", "createdAt" DESC, "id");

-- CreateIndex
CREATE INDEX "MonitoringPoint_organizationId_name_id_idx"
ON "MonitoringPoint"("organizationId", "name", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MonitoringPoint_id_siteId_organizationId_key"
ON "MonitoringPoint"("id", "siteId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Device_hardwareId_key"
ON "Device"("hardwareId");

-- Prisma cannot express a partial unique index. This enforces one enabled
-- device per monitoring point while retaining disabled device history.
CREATE UNIQUE INDEX "Device_one_enabled_per_monitoring_point_key"
ON "Device"("monitoringPointId")
WHERE "lifecycleStatus" = 'ENABLED';

-- CreateIndex
CREATE INDEX "Device_organizationId_createdAt_id_idx"
ON "Device"("organizationId", "createdAt" DESC, "id");

-- CreateIndex
CREATE INDEX "Device_siteId_createdAt_id_idx"
ON "Device"("siteId", "createdAt" DESC, "id");

-- CreateIndex
CREATE INDEX "Device_monitoringPointId_lifecycleStatus_idx"
ON "Device"("monitoringPointId", "lifecycleStatus");

-- CreateIndex
CREATE INDEX "Device_organizationId_displayName_id_idx"
ON "Device"("organizationId", "displayName", "id");

-- CreateIndex
CREATE INDEX "Device_organizationId_lastSeenAt_id_idx"
ON "Device"("organizationId", "lastSeenAt" DESC, "id");

-- CreateIndex
CREATE UNIQUE INDEX "Device_id_monitoringPointId_key"
ON "Device"("id", "monitoringPointId");

-- CreateIndex
CREATE INDEX "Telemetry_deviceId_deviceTimestamp_id_idx"
ON "Telemetry"("deviceId", "deviceTimestamp" DESC, "id");

-- CreateIndex
CREATE INDEX "Telemetry_monitoringPointId_deviceTimestamp_id_idx"
ON "Telemetry"("monitoringPointId", "deviceTimestamp" DESC, "id");

-- CreateIndex
CREATE INDEX "Telemetry_serverReceivedAt_id_idx"
ON "Telemetry"("serverReceivedAt" DESC, "id");

-- CreateIndex
CREATE UNIQUE INDEX "Telemetry_deviceId_messageId_key"
ON "Telemetry"("deviceId", "messageId");

-- CreateIndex
CREATE UNIQUE INDEX "Telemetry_deviceId_bootId_sequence_key"
ON "Telemetry"("deviceId", "bootId", "sequence");

-- AddForeignKey
ALTER TABLE "MonitoringPoint"
ADD CONSTRAINT "MonitoringPoint_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Composite scope FK ensures the site belongs to the same organization.
ALTER TABLE "MonitoringPoint"
ADD CONSTRAINT "MonitoringPoint_siteId_organizationId_fkey"
FOREIGN KEY ("siteId", "organizationId") REFERENCES "Site"("id", "organizationId")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device"
ADD CONSTRAINT "Device_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device"
ADD CONSTRAINT "Device_siteId_organizationId_fkey"
FOREIGN KEY ("siteId", "organizationId") REFERENCES "Site"("id", "organizationId")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Composite scope FK prevents cross-site or cross-organization assignment.
ALTER TABLE "Device"
ADD CONSTRAINT "Device_monitoringPointId_siteId_organizationId_fkey"
FOREIGN KEY ("monitoringPointId", "siteId", "organizationId")
REFERENCES "MonitoringPoint"("id", "siteId", "organizationId")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Telemetry retains the monitoring point assignment used at ingestion time.
ALTER TABLE "Telemetry"
ADD CONSTRAINT "Telemetry_deviceId_monitoringPointId_fkey"
FOREIGN KEY ("deviceId", "monitoringPointId")
REFERENCES "Device"("id", "monitoringPointId")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Telemetry cannot be orphaned by a monitoring point deletion.
ALTER TABLE "Telemetry"
ADD CONSTRAINT "Telemetry_monitoringPointId_fkey"
FOREIGN KEY ("monitoringPointId") REFERENCES "MonitoringPoint"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
