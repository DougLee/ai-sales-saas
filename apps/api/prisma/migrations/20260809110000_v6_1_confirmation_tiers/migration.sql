-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "projectType" TEXT NOT NULL DEFAULT 'software_mid',
ADD COLUMN     "waitingNote" TEXT,
ADD COLUMN     "waitingSince" TIMESTAMP(3),
ADD COLUMN     "waitingStatus" TEXT;

-- AlterTable
ALTER TABLE "Visit" ADD COLUMN     "rawInput" TEXT,
ADD COLUMN     "rawInputType" TEXT;

-- AlterTable
ALTER TABLE "VisitClosure" ADD COLUMN     "hasConfirmation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rubricDetails" JSONB,
ADD COLUMN     "rubricScore" INTEGER,
ADD COLUMN     "spotCheckAt" TIMESTAMP(3),
ADD COLUMN     "spotCheckBy" TEXT,
ADD COLUMN     "spotCheckScore" INTEGER,
ADD COLUMN     "spotChecked" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "TimelineEvent" ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "confirmedBy" TEXT,
ADD COLUMN     "factStatus" TEXT NOT NULL DEFAULT 'confirmed';

-- AlterTable
ALTER TABLE "CustomerSnapshot" ADD COLUMN     "coversUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AiPendingItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "projectId" TEXT,
    "visitId" TEXT,
    "itemType" TEXT NOT NULL,
    "itemData" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "resolvedData" JSONB,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiPendingItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectTypeConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "typeKey" TEXT NOT NULL,
    "typeName" TEXT NOT NULL,
    "attentionDays" INTEGER NOT NULL DEFAULT 14,
    "staleDays" INTEGER NOT NULL DEFAULT 28,
    "stageThresholds" JSONB NOT NULL DEFAULT '[]',
    "advancementRules" JSONB NOT NULL DEFAULT '{}',
    "effectiveFollowupMinScore" INTEGER NOT NULL DEFAULT 40,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectTypeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiPendingItem_tenantId_ownerId_status_idx" ON "AiPendingItem"("tenantId", "ownerId", "status");

-- CreateIndex
CREATE INDEX "AiPendingItem_tenantId_visitId_status_idx" ON "AiPendingItem"("tenantId", "visitId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectTypeConfig_tenantId_typeKey_key" ON "ProjectTypeConfig"("tenantId", "typeKey");

-- CreateIndex
CREATE INDEX "VisitClosure_spotChecked_closedAt_idx" ON "VisitClosure"("spotChecked", "closedAt");

-- CreateIndex
CREATE INDEX "TimelineEvent_tenantId_factStatus_idx" ON "TimelineEvent"("tenantId", "factStatus");

-- CreateIndex
CREATE UNIQUE INDEX "BehaviorLog_tenantId_userId_visitId_type_key" ON "BehaviorLog"("tenantId", "userId", "visitId", "type");

-- AddForeignKey
ALTER TABLE "AiPendingItem" ADD CONSTRAINT "AiPendingItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTypeConfig" ADD CONSTRAINT "ProjectTypeConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
