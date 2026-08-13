-- CreateEnum
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "NotificationOutbox" (
    "id" TEXT NOT NULL,
    "eventKey" VARCHAR(191) NOT NULL,
    "channel" VARCHAR(32) NOT NULL,
    "eventType" VARCHAR(64) NOT NULL,
    "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processingStartedAt" TIMESTAMP(3) WITH TIME ZONE,
    "sentAt" TIMESTAMP(3) WITH TIME ZONE,
    "externalMessageId" VARCHAR(64),
    "lastErrorCode" VARCHAR(64),
    "lastErrorMessage" VARCHAR(500),
    "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,

    CONSTRAINT "NotificationOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationOutbox_eventKey_key" ON "NotificationOutbox"("eventKey");

-- CreateIndex
CREATE INDEX "NotificationOutbox_status_nextAttemptAt_createdAt_idx"
ON "NotificationOutbox"("status", "nextAttemptAt", "createdAt");
