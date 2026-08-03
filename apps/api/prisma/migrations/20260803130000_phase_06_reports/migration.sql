CREATE TYPE "ReportType" AS ENUM ('SITE_PERIOD_SUMMARY_PDF');
CREATE TYPE "ReportJobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'EXPIRED');
CREATE TYPE "ReportFailureCode" AS ENUM ('REPORT_GENERATION_FAILED', 'REPORT_ARTIFACT_UNAVAILABLE');

CREATE TABLE "ReportJob" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "reportType" "ReportType" NOT NULL,
    "from" TIMESTAMPTZ(3) NOT NULL,
    "to" TIMESTAMPTZ(3) NOT NULL,
    "status" "ReportJobStatus" NOT NULL DEFAULT 'QUEUED',
    "createdById" TEXT NOT NULL,
    "requestedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3),
    "failureCode" "ReportFailureCode",
    "failureMessage" VARCHAR(500),
    "artifactFileName" VARCHAR(255),
    "artifactMediaType" VARCHAR(64),
    "artifactSizeBytes" INTEGER,
    "artifactSha256" CHAR(64),
    "artifactObjectKey" VARCHAR(255),
    "artifactGeneratedAt" TIMESTAMPTZ(3),
    "processingToken" UUID,
    "processingLeaseUntil" TIMESTAMPTZ(3),
    CONSTRAINT "ReportJob_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ReportJob_range_check" CHECK ("from" < "to"),
    CONSTRAINT "ReportJob_artifact_size_check" CHECK ("artifactSizeBytes" IS NULL OR "artifactSizeBytes" > 0),
    CONSTRAINT "ReportJob_failure_message_check" CHECK ("failureMessage" IS NULL OR char_length("failureMessage") BETWEEN 1 AND 500),
    CONSTRAINT "ReportJob_artifact_consistency_check" CHECK (
      ("status" IN ('SUCCEEDED', 'EXPIRED') AND "artifactFileName" IS NOT NULL AND "artifactMediaType" = 'application/pdf' AND "artifactSizeBytes" IS NOT NULL AND "artifactSha256" IS NOT NULL AND "artifactObjectKey" IS NOT NULL AND "artifactGeneratedAt" IS NOT NULL AND "completedAt" IS NOT NULL AND "expiresAt" IS NOT NULL)
      OR
      ("status" NOT IN ('SUCCEEDED', 'EXPIRED') AND "artifactFileName" IS NULL AND "artifactMediaType" IS NULL AND "artifactSizeBytes" IS NULL AND "artifactSha256" IS NULL AND "artifactObjectKey" IS NULL AND "artifactGeneratedAt" IS NULL)
    )
);

CREATE UNIQUE INDEX "ReportJob_id_organizationId_key" ON "ReportJob"("id", "organizationId");
CREATE UNIQUE INDEX "ReportJob_artifactObjectKey_key" ON "ReportJob"("artifactObjectKey");
CREATE INDEX "ReportJob_organizationId_requestedAt_id_idx" ON "ReportJob"("organizationId", "requestedAt" DESC, "id" DESC);
CREATE INDEX "ReportJob_organizationId_status_requestedAt_id_idx" ON "ReportJob"("organizationId", "status", "requestedAt" DESC, "id" DESC);
CREATE INDEX "ReportJob_organizationId_siteId_requestedAt_id_idx" ON "ReportJob"("organizationId", "siteId", "requestedAt" DESC, "id" DESC);
CREATE INDEX "ReportJob_organizationId_reportType_requestedAt_id_idx" ON "ReportJob"("organizationId", "reportType", "requestedAt" DESC, "id" DESC);
CREATE INDEX "ReportJob_status_processingLeaseUntil_idx" ON "ReportJob"("status", "processingLeaseUntil");
CREATE INDEX "ReportJob_createdById_requestedAt_idx" ON "ReportJob"("createdById", "requestedAt" DESC);

ALTER TABLE "ReportJob" ADD CONSTRAINT "ReportJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReportJob" ADD CONSTRAINT "ReportJob_siteId_organizationId_fkey" FOREIGN KEY ("siteId", "organizationId") REFERENCES "Site"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReportJob" ADD CONSTRAINT "ReportJob_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
