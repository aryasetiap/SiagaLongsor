-- A refresh session may be replaced by at most one newer session.
CREATE UNIQUE INDEX "RefreshSession_replacedById_key" ON "RefreshSession"("replacedById");

ALTER TABLE "RefreshSession"
ADD CONSTRAINT "RefreshSession_replacedById_fkey"
FOREIGN KEY ("replacedById")
REFERENCES "RefreshSession"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
