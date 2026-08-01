-- CreateEnum
CREATE TYPE "AlertLifecycleActionType" AS ENUM ('ACKNOWLEDGE', 'RESOLVE', 'FALSE_ALARM');

-- AlterTable
ALTER TABLE "AlertEvent" ADD COLUMN     "actedAt" TIMESTAMPTZ(3),
ADD COLUMN     "actorId" TEXT,
ALTER COLUMN "observationKey" DROP NOT NULL,
ALTER COLUMN "observedAt" DROP NOT NULL;

-- CreateTable
CREATE TABLE "AlertLifecycleAction" (
    "actionId" UUID NOT NULL,
    "organizationId" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "actionType" "AlertLifecycleActionType" NOT NULL,
    "payloadHash" CHAR(64) NOT NULL,
    "eventId" TEXT NOT NULL,
    "auditLogId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "originalResponse" JSONB NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertLifecycleAction_pkey" PRIMARY KEY ("actionId")
);

-- CreateIndex
CREATE UNIQUE INDEX "AlertLifecycleAction_eventId_key" ON "AlertLifecycleAction"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "AlertLifecycleAction_auditLogId_key" ON "AlertLifecycleAction"("auditLogId");

-- CreateIndex
CREATE INDEX "AlertLifecycleAction_organizationId_alertId_createdAt_idx" ON "AlertLifecycleAction"("organizationId", "alertId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AlertLifecycleAction_actorId_createdAt_idx" ON "AlertLifecycleAction"("actorId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Alert_id_organizationId_key" ON "Alert"("id", "organizationId");

-- CreateIndex
CREATE INDEX "AlertEvent_actorId_createdAt_id_idx" ON "AlertEvent"("actorId", "createdAt" DESC, "id");

-- AddForeignKey
ALTER TABLE "AlertEvent" ADD CONSTRAINT "AlertEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertLifecycleAction" ADD CONSTRAINT "AlertLifecycleAction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertLifecycleAction" ADD CONSTRAINT "AlertLifecycleAction_alertId_organizationId_fkey" FOREIGN KEY ("alertId", "organizationId") REFERENCES "Alert"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertLifecycleAction" ADD CONSTRAINT "AlertLifecycleAction_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "AlertEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertLifecycleAction" ADD CONSTRAINT "AlertLifecycleAction_auditLogId_fkey" FOREIGN KEY ("auditLogId") REFERENCES "AuditLog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertLifecycleAction" ADD CONSTRAINT "AlertLifecycleAction_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
