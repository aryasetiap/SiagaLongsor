-- R7 removes database structures whose application and infrastructure consumers
-- were removed in R5/R6. Historical migrations remain unchanged.
DROP TABLE IF EXISTS "AlertLifecycleAction" CASCADE;
DROP TABLE IF EXISTS "AlertEvent" CASCADE;
DROP TABLE IF EXISTS "Alert" CASCADE;
DROP TABLE IF EXISTS "ReportJob" CASCADE;
DROP TABLE IF EXISTS "ActiveSiteSopDocument" CASCADE;
DROP TABLE IF EXISTS "SopDocumentVersion" CASCADE;
DROP TABLE IF EXISTS "ActiveSiteMapConfiguration" CASCADE;
DROP TABLE IF EXISTS "SiteMapConfiguration" CASCADE;

DROP TYPE IF EXISTS "AlertLifecycleActionType";
DROP TYPE IF EXISTS "AlertStatus";
DROP TYPE IF EXISTS "AlertSeverity";
DROP TYPE IF EXISTS "AlertType";
DROP TYPE IF EXISTS "ReportFailureCode";
DROP TYPE IF EXISTS "ReportJobStatus";
DROP TYPE IF EXISTS "ReportType";
