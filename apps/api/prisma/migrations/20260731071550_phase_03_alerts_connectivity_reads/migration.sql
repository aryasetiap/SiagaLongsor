-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('RISK_WATCH', 'RISK_DANGER', 'DEVICE_DELAYED', 'DEVICE_OFFLINE', 'DEVICE_SERVER_MISMATCH');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'FALSE_ALARM');

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "monitoringPointId" TEXT NOT NULL,
    "deviceId" TEXT,
    "type" "AlertType" NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'ACTIVE',
    "deduplicationKey" VARCHAR(512) NOT NULL,
    "reasons" JSONB NOT NULL,
    "firstObservedAt" TIMESTAMPTZ(3) NOT NULL,
    "lastObservedAt" TIMESTAMPTZ(3) NOT NULL,
    "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertEvent" (
    "id" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "eventType" VARCHAR(64) NOT NULL,
    "observationKey" VARCHAR(512) NOT NULL,
    "riskAssessmentId" TEXT,
    "telemetryId" TEXT,
    "observedAt" TIMESTAMPTZ(3) NOT NULL,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Alert_organizationId_lastObservedAt_id_idx" ON "Alert"("organizationId", "lastObservedAt" DESC, "id");

-- CreateIndex
CREATE INDEX "Alert_organizationId_status_severity_lastObservedAt_id_idx" ON "Alert"("organizationId", "status", "severity", "lastObservedAt" DESC, "id");

-- CreateIndex
CREATE INDEX "Alert_siteId_monitoringPointId_type_status_idx" ON "Alert"("siteId", "monitoringPointId", "type", "status");

-- CreateIndex
CREATE INDEX "Alert_deduplicationKey_status_idx" ON "Alert"("deduplicationKey", "status");

-- One unresolved lifecycle per conceptual organization/Site/MonitoringPoint/type key.
CREATE UNIQUE INDEX "Alert_one_unresolved_deduplication_key"
ON "Alert"("deduplicationKey")
WHERE "status" IN ('ACTIVE', 'ACKNOWLEDGED');

ALTER TABLE "Alert"
ADD CONSTRAINT "Alert_reasons_array_check"
CHECK (jsonb_typeof("reasons") = 'array' AND jsonb_array_length("reasons") > 0),
ADD CONSTRAINT "Alert_occurrence_count_check"
CHECK ("occurrenceCount" >= 1);

-- CreateIndex
CREATE UNIQUE INDEX "AlertEvent_observationKey_key" ON "AlertEvent"("observationKey");

-- CreateIndex
CREATE INDEX "AlertEvent_alertId_observedAt_id_idx" ON "AlertEvent"("alertId", "observedAt" DESC, "id");

-- CreateIndex
CREATE INDEX "AlertEvent_riskAssessmentId_idx" ON "AlertEvent"("riskAssessmentId");

-- CreateIndex
CREATE INDEX "AlertEvent_telemetryId_idx" ON "AlertEvent"("telemetryId");

ALTER TABLE "AlertEvent"
ADD CONSTRAINT "AlertEvent_metadata_object_check"
CHECK (jsonb_typeof("metadata") = 'object');

CREATE FUNCTION "prevent_alert_event_update"()
RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'AlertEvent history is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AlertEvent_immutable_update"
BEFORE UPDATE ON "AlertEvent"
FOR EACH ROW
EXECUTE FUNCTION "prevent_alert_event_update"();

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_siteId_organizationId_fkey" FOREIGN KEY ("siteId", "organizationId") REFERENCES "Site"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_monitoringPointId_siteId_organizationId_fkey" FOREIGN KEY ("monitoringPointId", "siteId", "organizationId") REFERENCES "MonitoringPoint"("id", "siteId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_deviceId_monitoringPointId_fkey" FOREIGN KEY ("deviceId", "monitoringPointId") REFERENCES "Device"("id", "monitoringPointId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertEvent" ADD CONSTRAINT "AlertEvent_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Alert"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertEvent" ADD CONSTRAINT "AlertEvent_riskAssessmentId_fkey" FOREIGN KEY ("riskAssessmentId") REFERENCES "RiskAssessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertEvent" ADD CONSTRAINT "AlertEvent_telemetryId_fkey" FOREIGN KEY ("telemetryId") REFERENCES "Telemetry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
