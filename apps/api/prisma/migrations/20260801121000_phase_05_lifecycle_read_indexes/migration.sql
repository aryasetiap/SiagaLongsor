-- Stable newest-first AlertEvent lifecycle history pagination.
CREATE INDEX "AlertEvent_alertId_createdAt_id_idx"
ON "AlertEvent"("alertId", "createdAt" DESC, "id");

-- Stable newest-first organization-scoped AuditLog pagination.
CREATE INDEX "AuditLog_organizationId_createdAt_id_idx"
ON "AuditLog"("organizationId", "createdAt" DESC, "id");
