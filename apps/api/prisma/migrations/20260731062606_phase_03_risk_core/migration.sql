-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('SAFE', 'WATCH', 'DANGER', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ConnectivityStatus" AS ENUM ('ONLINE', 'DELAYED', 'OFFLINE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "CalibrationStatus" AS ENUM ('PROVISIONAL', 'CALIBRATED');

-- CreateTable
CREATE TABLE "RiskProfile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "calibrationStatus" "CalibrationStatus" NOT NULL,
    "notes" TEXT,
    "safeTiltMagnitudeDegLt" DECIMAL(8,4) NOT NULL,
    "safeSoilMoisturePctLt" DECIMAL(7,4) NOT NULL,
    "safeRainfallMmHourLt" DECIMAL(65,20) NOT NULL,
    "dangerTiltMagnitudeDegGt" DECIMAL(8,4) NOT NULL,
    "dangerRainfallMmHourGt" DECIMAL(65,20) NOT NULL,
    "dangerSoilMoisturePctGt" DECIMAL(7,4) NOT NULL,
    "technicalTiltXDegMin" DECIMAL(8,4) NOT NULL,
    "technicalTiltXDegMax" DECIMAL(8,4),
    "technicalTiltYDegMin" DECIMAL(8,4) NOT NULL,
    "technicalTiltYDegMax" DECIMAL(8,4),
    "technicalTiltMagnitudeMin" DECIMAL(8,4) NOT NULL,
    "technicalTiltMagnitudeMax" DECIMAL(8,4),
    "technicalSoilMoistureMin" DECIMAL(7,4) NOT NULL,
    "technicalSoilMoistureMax" DECIMAL(7,4),
    "technicalRainfallMin" DECIMAL(65,20) NOT NULL,
    "technicalRainfallMax" DECIMAL(65,20),
    "technicalBatteryVoltageMin" DECIMAL(8,4) NOT NULL,
    "technicalBatteryVoltageMax" DECIMAL(8,4),
    "technicalSignalRssiMin" DECIMAL(7,2) NOT NULL,
    "technicalSignalRssiMax" DECIMAL(7,2),
    "onlineWithinMinutes" INTEGER NOT NULL,
    "offlineAfterMinutes" INTEGER NOT NULL,
    "watchConsecutiveSamples" INTEGER NOT NULL,
    "dangerConsecutiveSamples" INTEGER NOT NULL,
    "downgradeStableMinutes" INTEGER NOT NULL,
    "mismatchConsecutiveSamples" INTEGER NOT NULL,
    "activatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deactivatedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskAssessment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "monitoringPointId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "telemetryId" TEXT NOT NULL,
    "riskProfileId" TEXT NOT NULL,
    "riskProfileVersion" INTEGER NOT NULL,
    "serverRisk" "RiskLevel" NOT NULL,
    "firmwareRisk" "FirmwareRiskLevel" NOT NULL,
    "firmwareSirenActive" BOOLEAN NOT NULL,
    "reasons" JSONB NOT NULL,
    "affectsCurrentState" BOOLEAN NOT NULL,
    "evaluatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RiskAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CurrentMonitoringPointState" (
    "monitoringPointId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "deviceId" TEXT,
    "serverRisk" "RiskLevel" NOT NULL DEFAULT 'UNKNOWN',
    "connectivityStatus" "ConnectivityStatus" NOT NULL DEFAULT 'UNKNOWN',
    "reasons" JSONB NOT NULL,
    "latestTelemetryId" TEXT,
    "evaluatedAt" TIMESTAMPTZ(3) NOT NULL,
    "lastTelemetryAt" TIMESTAMPTZ(3),
    "riskProfileId" TEXT,
    "riskProfileVersion" INTEGER,
    "watchConsecutiveSamples" INTEGER NOT NULL DEFAULT 0,
    "dangerConsecutiveSamples" INTEGER NOT NULL DEFAULT 0,
    "mismatchConsecutiveSamples" INTEGER NOT NULL DEFAULT 0,
    "pendingDowngradeRisk" "RiskLevel",
    "pendingDowngradeSince" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CurrentMonitoringPointState_pkey" PRIMARY KEY ("monitoringPointId")
);

-- CreateIndex
CREATE INDEX "RiskProfile_organizationId_siteId_isActive_idx" ON "RiskProfile"("organizationId", "siteId", "isActive");

-- CreateIndex
CREATE INDEX "RiskProfile_siteId_isActive_version_idx" ON "RiskProfile"("siteId", "isActive", "version" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "RiskProfile_siteId_version_key" ON "RiskProfile"("siteId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "RiskProfile_id_version_key" ON "RiskProfile"("id", "version");

-- Exactly one active immutable profile version may exist for each Site.
CREATE UNIQUE INDEX "RiskProfile_one_active_per_site_key"
ON "RiskProfile"("siteId")
WHERE "isActive" = true;

ALTER TABLE "RiskProfile"
ADD CONSTRAINT "RiskProfile_activation_state_check"
CHECK (
    ("isActive" = true AND "deactivatedAt" IS NULL)
    OR ("isActive" = false AND "deactivatedAt" IS NOT NULL)
),
ADD CONSTRAINT "RiskProfile_configuration_check"
CHECK (
    "version" >= 1
    AND "safeTiltMagnitudeDegLt" > 0
    AND "safeTiltMagnitudeDegLt" <= "dangerTiltMagnitudeDegGt"
    AND "safeSoilMoisturePctLt" > 0
    AND "safeSoilMoisturePctLt" <= "dangerSoilMoisturePctGt"
    AND "safeRainfallMmHourLt" > 0
    AND "safeRainfallMmHourLt" <= "dangerRainfallMmHourGt"
    AND ("technicalTiltXDegMax" IS NULL OR "technicalTiltXDegMin" < "technicalTiltXDegMax")
    AND ("technicalTiltYDegMax" IS NULL OR "technicalTiltYDegMin" < "technicalTiltYDegMax")
    AND ("technicalTiltMagnitudeMax" IS NULL OR "technicalTiltMagnitudeMin" < "technicalTiltMagnitudeMax")
    AND ("technicalSoilMoistureMax" IS NULL OR "technicalSoilMoistureMin" < "technicalSoilMoistureMax")
    AND (
        "technicalRainfallMax" IS NULL
        OR "technicalRainfallMin" < "technicalRainfallMax"
    )
    AND ("technicalBatteryVoltageMax" IS NULL OR "technicalBatteryVoltageMin" < "technicalBatteryVoltageMax")
    AND ("technicalSignalRssiMax" IS NULL OR "technicalSignalRssiMin" < "technicalSignalRssiMax")
    AND "onlineWithinMinutes" >= 1
    AND "onlineWithinMinutes" < "offlineAfterMinutes"
    AND "watchConsecutiveSamples" >= 1
    AND "dangerConsecutiveSamples" >= 1
    AND "downgradeStableMinutes" >= 0
    AND "mismatchConsecutiveSamples" >= 1
);

-- Configuration and identity are immutable. The only allowed update is one-way deactivation.
CREATE FUNCTION "enforce_risk_profile_immutability"()
RETURNS trigger AS $$
BEGIN
    IF OLD."isActive" = false
       OR NEW."id" IS DISTINCT FROM OLD."id"
       OR NEW."organizationId" IS DISTINCT FROM OLD."organizationId"
       OR NEW."siteId" IS DISTINCT FROM OLD."siteId"
       OR NEW."version" IS DISTINCT FROM OLD."version"
       OR NEW."calibrationStatus" IS DISTINCT FROM OLD."calibrationStatus"
       OR NEW."notes" IS DISTINCT FROM OLD."notes"
       OR NEW."safeTiltMagnitudeDegLt" IS DISTINCT FROM OLD."safeTiltMagnitudeDegLt"
       OR NEW."safeSoilMoisturePctLt" IS DISTINCT FROM OLD."safeSoilMoisturePctLt"
       OR NEW."safeRainfallMmHourLt" IS DISTINCT FROM OLD."safeRainfallMmHourLt"
       OR NEW."dangerTiltMagnitudeDegGt" IS DISTINCT FROM OLD."dangerTiltMagnitudeDegGt"
       OR NEW."dangerRainfallMmHourGt" IS DISTINCT FROM OLD."dangerRainfallMmHourGt"
       OR NEW."dangerSoilMoisturePctGt" IS DISTINCT FROM OLD."dangerSoilMoisturePctGt"
       OR NEW."technicalTiltXDegMin" IS DISTINCT FROM OLD."technicalTiltXDegMin"
       OR NEW."technicalTiltXDegMax" IS DISTINCT FROM OLD."technicalTiltXDegMax"
       OR NEW."technicalTiltYDegMin" IS DISTINCT FROM OLD."technicalTiltYDegMin"
       OR NEW."technicalTiltYDegMax" IS DISTINCT FROM OLD."technicalTiltYDegMax"
       OR NEW."technicalTiltMagnitudeMin" IS DISTINCT FROM OLD."technicalTiltMagnitudeMin"
       OR NEW."technicalTiltMagnitudeMax" IS DISTINCT FROM OLD."technicalTiltMagnitudeMax"
       OR NEW."technicalSoilMoistureMin" IS DISTINCT FROM OLD."technicalSoilMoistureMin"
       OR NEW."technicalSoilMoistureMax" IS DISTINCT FROM OLD."technicalSoilMoistureMax"
       OR NEW."technicalRainfallMin" IS DISTINCT FROM OLD."technicalRainfallMin"
       OR NEW."technicalRainfallMax" IS DISTINCT FROM OLD."technicalRainfallMax"
       OR NEW."technicalBatteryVoltageMin" IS DISTINCT FROM OLD."technicalBatteryVoltageMin"
       OR NEW."technicalBatteryVoltageMax" IS DISTINCT FROM OLD."technicalBatteryVoltageMax"
       OR NEW."technicalSignalRssiMin" IS DISTINCT FROM OLD."technicalSignalRssiMin"
       OR NEW."technicalSignalRssiMax" IS DISTINCT FROM OLD."technicalSignalRssiMax"
       OR NEW."onlineWithinMinutes" IS DISTINCT FROM OLD."onlineWithinMinutes"
       OR NEW."offlineAfterMinutes" IS DISTINCT FROM OLD."offlineAfterMinutes"
       OR NEW."watchConsecutiveSamples" IS DISTINCT FROM OLD."watchConsecutiveSamples"
       OR NEW."dangerConsecutiveSamples" IS DISTINCT FROM OLD."dangerConsecutiveSamples"
       OR NEW."downgradeStableMinutes" IS DISTINCT FROM OLD."downgradeStableMinutes"
       OR NEW."mismatchConsecutiveSamples" IS DISTINCT FROM OLD."mismatchConsecutiveSamples"
       OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
       OR NOT (
           OLD."isActive" = true
           AND OLD."deactivatedAt" IS NULL
           AND NEW."isActive" = false
           AND NEW."deactivatedAt" IS NOT NULL
       )
    THEN
        RAISE EXCEPTION 'RiskProfile versions are immutable';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "RiskProfile_immutable_update"
BEFORE UPDATE ON "RiskProfile"
FOR EACH ROW
EXECUTE FUNCTION "enforce_risk_profile_immutability"();

-- CreateIndex
CREATE UNIQUE INDEX "RiskAssessment_telemetryId_key" ON "RiskAssessment"("telemetryId");

-- CreateIndex
CREATE INDEX "RiskAssessment_organizationId_evaluatedAt_id_idx" ON "RiskAssessment"("organizationId", "evaluatedAt" DESC, "id");

-- CreateIndex
CREATE INDEX "RiskAssessment_monitoringPointId_evaluatedAt_id_idx" ON "RiskAssessment"("monitoringPointId", "evaluatedAt" DESC, "id");

-- CreateIndex
CREATE INDEX "RiskAssessment_deviceId_evaluatedAt_id_idx" ON "RiskAssessment"("deviceId", "evaluatedAt" DESC, "id");

-- CreateIndex
CREATE INDEX "RiskAssessment_riskProfileId_riskProfileVersion_idx" ON "RiskAssessment"("riskProfileId", "riskProfileVersion");

-- CreateIndex
CREATE UNIQUE INDEX "CurrentMonitoringPointState_latestTelemetryId_key" ON "CurrentMonitoringPointState"("latestTelemetryId");

-- CreateIndex
CREATE INDEX "CurrentMonitoringPointState_organizationId_siteId_serverRis_idx" ON "CurrentMonitoringPointState"("organizationId", "siteId", "serverRisk", "connectivityStatus");

-- CreateIndex
CREATE INDEX "CurrentMonitoringPointState_siteId_updatedAt_monitoringPoin_idx" ON "CurrentMonitoringPointState"("siteId", "updatedAt" DESC, "monitoringPointId");

-- CreateIndex
CREATE INDEX "CurrentMonitoringPointState_deviceId_idx" ON "CurrentMonitoringPointState"("deviceId");

ALTER TABLE "RiskAssessment"
ADD CONSTRAINT "RiskAssessment_reasons_array_check"
CHECK (jsonb_typeof("reasons") = 'array');

-- Assessments are immutable audit history.
CREATE FUNCTION "prevent_risk_assessment_mutation"()
RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'RiskAssessment history is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "RiskAssessment_immutable_update"
BEFORE UPDATE ON "RiskAssessment"
FOR EACH ROW
EXECUTE FUNCTION "prevent_risk_assessment_mutation"();

ALTER TABLE "CurrentMonitoringPointState"
ADD CONSTRAINT "CurrentMonitoringPointState_reasons_array_check"
CHECK (jsonb_typeof("reasons") = 'array'),
ADD CONSTRAINT "CurrentMonitoringPointState_counters_check"
CHECK (
    "watchConsecutiveSamples" >= 0
    AND "dangerConsecutiveSamples" >= 0
    AND "mismatchConsecutiveSamples" >= 0
),
ADD CONSTRAINT "CurrentMonitoringPointState_profile_pair_check"
CHECK (
    ("riskProfileId" IS NULL AND "riskProfileVersion" IS NULL)
    OR ("riskProfileId" IS NOT NULL AND "riskProfileVersion" IS NOT NULL)
),
ADD CONSTRAINT "CurrentMonitoringPointState_pending_downgrade_check"
CHECK (
    ("pendingDowngradeRisk" IS NULL AND "pendingDowngradeSince" IS NULL)
    OR ("pendingDowngradeRisk" IS NOT NULL AND "pendingDowngradeSince" IS NOT NULL)
);

-- AddForeignKey
ALTER TABLE "RiskProfile" ADD CONSTRAINT "RiskProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskProfile" ADD CONSTRAINT "RiskProfile_siteId_organizationId_fkey" FOREIGN KEY ("siteId", "organizationId") REFERENCES "Site"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskAssessment" ADD CONSTRAINT "RiskAssessment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskAssessment" ADD CONSTRAINT "RiskAssessment_siteId_organizationId_fkey" FOREIGN KEY ("siteId", "organizationId") REFERENCES "Site"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskAssessment" ADD CONSTRAINT "RiskAssessment_monitoringPointId_siteId_organizationId_fkey" FOREIGN KEY ("monitoringPointId", "siteId", "organizationId") REFERENCES "MonitoringPoint"("id", "siteId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskAssessment" ADD CONSTRAINT "RiskAssessment_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskAssessment" ADD CONSTRAINT "RiskAssessment_telemetryId_fkey" FOREIGN KEY ("telemetryId") REFERENCES "Telemetry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskAssessment" ADD CONSTRAINT "RiskAssessment_riskProfileId_riskProfileVersion_fkey" FOREIGN KEY ("riskProfileId", "riskProfileVersion") REFERENCES "RiskProfile"("id", "version") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurrentMonitoringPointState" ADD CONSTRAINT "CurrentMonitoringPointState_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurrentMonitoringPointState" ADD CONSTRAINT "CurrentMonitoringPointState_siteId_organizationId_fkey" FOREIGN KEY ("siteId", "organizationId") REFERENCES "Site"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurrentMonitoringPointState" ADD CONSTRAINT "CurrentMonitoringPointState_monitoringPointId_fkey" FOREIGN KEY ("monitoringPointId") REFERENCES "MonitoringPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurrentMonitoringPointState" ADD CONSTRAINT "CurrentMonitoringPointState_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurrentMonitoringPointState" ADD CONSTRAINT "CurrentMonitoringPointState_latestTelemetryId_fkey" FOREIGN KEY ("latestTelemetryId") REFERENCES "Telemetry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurrentMonitoringPointState" ADD CONSTRAINT "CurrentMonitoringPointState_riskProfileId_riskProfileVersi_fkey" FOREIGN KEY ("riskProfileId", "riskProfileVersion") REFERENCES "RiskProfile"("id", "version") ON DELETE RESTRICT ON UPDATE CASCADE;
