-- Phase 06 immutable Site map configuration and private versioned SOP metadata.
-- Active pointers are separate rows so historical version rows are never rewritten.

CREATE TABLE "SiteMapConfiguration" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "configuration" JSONB NOT NULL,
    "canonicalHash" CHAR(64) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SiteMapConfiguration_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SiteMapConfiguration_version_check" CHECK ("version" >= 1),
    CONSTRAINT "SiteMapConfiguration_hash_check" CHECK ("canonicalHash" ~ '^[a-f0-9]{64}$')
);

CREATE TABLE "ActiveSiteMapConfiguration" (
    "siteId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "configurationId" TEXT NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "ActiveSiteMapConfiguration_pkey" PRIMARY KEY ("siteId")
);

CREATE TABLE "SopDocumentVersion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "originalFileName" VARCHAR(255) NOT NULL,
    "mediaType" VARCHAR(64) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "objectKey" VARCHAR(255) NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SopDocumentVersion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SopDocumentVersion_version_check" CHECK ("version" >= 1),
    CONSTRAINT "SopDocumentVersion_size_check" CHECK ("sizeBytes" > 0 AND "sizeBytes" <= 10485760),
    CONSTRAINT "SopDocumentVersion_media_check" CHECK ("mediaType" = 'application/pdf'),
    CONSTRAINT "SopDocumentVersion_hash_check" CHECK ("sha256" ~ '^[a-f0-9]{64}$')
);

CREATE TABLE "ActiveSiteSopDocument" (
    "siteId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "ActiveSiteSopDocument_pkey" PRIMARY KEY ("siteId")
);

CREATE UNIQUE INDEX "SiteMapConfiguration_siteId_version_key" ON "SiteMapConfiguration"("siteId", "version");
CREATE UNIQUE INDEX "SiteMapConfiguration_id_siteId_organizationId_key" ON "SiteMapConfiguration"("id", "siteId", "organizationId");
CREATE INDEX "SiteMapConfiguration_organizationId_siteId_version_idx" ON "SiteMapConfiguration"("organizationId", "siteId", "version" DESC);
CREATE INDEX "SiteMapConfiguration_createdById_createdAt_idx" ON "SiteMapConfiguration"("createdById", "createdAt" DESC);
CREATE UNIQUE INDEX "ActiveSiteMapConfiguration_configurationId_key" ON "ActiveSiteMapConfiguration"("configurationId");
CREATE UNIQUE INDEX "ActiveSiteMapConfiguration_siteId_organizationId_key" ON "ActiveSiteMapConfiguration"("siteId", "organizationId");
CREATE UNIQUE INDEX "ActiveSiteMapConfiguration_configurationId_siteId_organizat_key" ON "ActiveSiteMapConfiguration"("configurationId", "siteId", "organizationId");
CREATE INDEX "ActiveSiteMapConfiguration_organizationId_idx" ON "ActiveSiteMapConfiguration"("organizationId");
CREATE UNIQUE INDEX "SopDocumentVersion_siteId_version_key" ON "SopDocumentVersion"("siteId", "version");
CREATE UNIQUE INDEX "SopDocumentVersion_id_siteId_organizationId_key" ON "SopDocumentVersion"("id", "siteId", "organizationId");
CREATE UNIQUE INDEX "SopDocumentVersion_objectKey_key" ON "SopDocumentVersion"("objectKey");
CREATE INDEX "SopDocumentVersion_organizationId_siteId_uploadedAt_id_idx" ON "SopDocumentVersion"("organizationId", "siteId", "uploadedAt" DESC, "id" DESC);
CREATE INDEX "SopDocumentVersion_uploadedById_uploadedAt_idx" ON "SopDocumentVersion"("uploadedById", "uploadedAt" DESC);
CREATE UNIQUE INDEX "ActiveSiteSopDocument_documentId_key" ON "ActiveSiteSopDocument"("documentId");
CREATE UNIQUE INDEX "ActiveSiteSopDocument_siteId_organizationId_key" ON "ActiveSiteSopDocument"("siteId", "organizationId");
CREATE UNIQUE INDEX "ActiveSiteSopDocument_documentId_siteId_organizationId_key" ON "ActiveSiteSopDocument"("documentId", "siteId", "organizationId");
CREATE INDEX "ActiveSiteSopDocument_organizationId_idx" ON "ActiveSiteSopDocument"("organizationId");

ALTER TABLE "SiteMapConfiguration" ADD CONSTRAINT "SiteMapConfiguration_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SiteMapConfiguration" ADD CONSTRAINT "SiteMapConfiguration_siteId_organizationId_fkey" FOREIGN KEY ("siteId", "organizationId") REFERENCES "Site"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SiteMapConfiguration" ADD CONSTRAINT "SiteMapConfiguration_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActiveSiteMapConfiguration" ADD CONSTRAINT "ActiveSiteMapConfiguration_siteId_organizationId_fkey" FOREIGN KEY ("siteId", "organizationId") REFERENCES "Site"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActiveSiteMapConfiguration" ADD CONSTRAINT "ActiveSiteMapConfiguration_configurationId_siteId_organiza_fkey" FOREIGN KEY ("configurationId", "siteId", "organizationId") REFERENCES "SiteMapConfiguration"("id", "siteId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SopDocumentVersion" ADD CONSTRAINT "SopDocumentVersion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SopDocumentVersion" ADD CONSTRAINT "SopDocumentVersion_siteId_organizationId_fkey" FOREIGN KEY ("siteId", "organizationId") REFERENCES "Site"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SopDocumentVersion" ADD CONSTRAINT "SopDocumentVersion_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActiveSiteSopDocument" ADD CONSTRAINT "ActiveSiteSopDocument_siteId_organizationId_fkey" FOREIGN KEY ("siteId", "organizationId") REFERENCES "Site"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActiveSiteSopDocument" ADD CONSTRAINT "ActiveSiteSopDocument_documentId_siteId_organizationId_fkey" FOREIGN KEY ("documentId", "siteId", "organizationId") REFERENCES "SopDocumentVersion"("id", "siteId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
