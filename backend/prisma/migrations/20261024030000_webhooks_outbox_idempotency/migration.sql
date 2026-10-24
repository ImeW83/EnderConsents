-- AlterTable
-- seq is the pull-API cursor, so existing events are numbered in timestamp order
-- (a plain BIGSERIAL would number them in arbitrary physical order)
ALTER TABLE "ConsentEvent" ADD COLUMN "seq" BIGINT;
CREATE SEQUENCE "ConsentEvent_seq_seq" OWNED BY "ConsentEvent"."seq";
UPDATE "ConsentEvent" e SET "seq" = r.rn
FROM (SELECT id, row_number() OVER (ORDER BY "timestamp", id) AS rn FROM "ConsentEvent") r
WHERE e.id = r.id;
SELECT setval('"ConsentEvent_seq_seq"', COALESCE((SELECT max("seq") FROM "ConsentEvent"), 0) + 1, false);
ALTER TABLE "ConsentEvent" ALTER COLUMN "seq" SET DEFAULT nextval('"ConsentEvent_seq_seq"');
ALTER TABLE "ConsentEvent" ALTER COLUMN "seq" SET NOT NULL;

-- AlterTable
ALTER TABLE "Webhook" ADD COLUMN     "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "description" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "disabledReason" TEXT,
ADD COLUMN     "previousSecret" TEXT,
ADD COLUMN     "previousSecretExpiresAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventId" TEXT,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),
    "lastStatusCode" INTEGER,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookAttempt" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "statusCode" INTEGER,
    "error" TEXT,
    "durationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WebhookDelivery_status_nextAttemptAt_idx" ON "WebhookDelivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "WebhookDelivery_webhookId_createdAt_idx" ON "WebhookDelivery"("webhookId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookDelivery_webhookId_eventId_key" ON "WebhookDelivery"("webhookId", "eventId");

-- CreateIndex
CREATE INDEX "WebhookAttempt_deliveryId_createdAt_idx" ON "WebhookAttempt"("deliveryId", "createdAt");

-- CreateIndex
CREATE INDEX "IdempotencyKey_createdAt_idx" ON "IdempotencyKey"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_organizationId_key_key" ON "IdempotencyKey"("organizationId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "ConsentEvent_seq_key" ON "ConsentEvent"("seq");

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "Webhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookAttempt" ADD CONSTRAINT "WebhookAttempt_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "WebhookDelivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

