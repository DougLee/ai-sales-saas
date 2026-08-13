-- =============================================================================
-- V3.3 状态语义对齐：业务侧 ACTIVE → FOLLOWING
-- 云端旧数据使用 LeadStatus.ACTIVE，V3.3 模型改为 NEW/FOLLOWING/...
-- 用 USING CASE WHEN 内联转换（不依赖 BEGIN 块外的 UPDATE）
-- =============================================================================

-- AlterEnum
BEGIN;
CREATE TYPE "LeadStatus_new" AS ENUM ('NEW', 'FOLLOWING', 'CONVERTED', 'LOST', 'PAUSED');
ALTER TABLE "public"."Lead" ALTER COLUMN "status" DROP DEFAULT;
-- 内联转换：ACTIVE → FOLLOWING（业务语义对齐）；其他值原样保留
ALTER TABLE "Lead" ALTER COLUMN "status" TYPE "LeadStatus_new" USING (
  CASE WHEN "status"::text = 'ACTIVE' THEN 'FOLLOWING' ELSE "status"::text END
)::"LeadStatus_new";
ALTER TYPE "LeadStatus" RENAME TO "LeadStatus_old";
ALTER TYPE "LeadStatus_new" RENAME TO "LeadStatus";
DROP TYPE "public"."LeadStatus_old";
ALTER TABLE "Lead" ALTER COLUMN "status" SET DEFAULT 'FOLLOWING';
COMMIT;

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "completenessScore" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "dataConfidence" TEXT NOT NULL DEFAULT 'medium',
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'target';

-- AlterTable
-- V3.3 拆分 NOT NULL：先可空、UPDATE 填充、再 SET NOT NULL
-- 避免在已有 Lead 数据的部署中 ADD COLUMN NOT NULL 失败
ALTER TABLE "Lead" ADD COLUMN     "companyId" TEXT,
ADD COLUMN     "contactId" TEXT,
ADD COLUMN     "visitId" TEXT,
ALTER COLUMN "status" SET DEFAULT 'FOLLOWING';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "sourceLeadId" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'following';

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "companyId" TEXT;

-- AlterTable
ALTER TABLE "Visit" ADD COLUMN     "companyId" TEXT,
ADD COLUMN     "leadId" TEXT;

-- CreateTable
CREATE TABLE "ChangeHistory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "changedBy" TEXT NOT NULL,
    "changeSource" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChangeHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChangeHistory_tenantId_entityType_entityId_createdAt_idx" ON "ChangeHistory"("tenantId", "entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "Company_tenantId_status_idx" ON "Company"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_convertedProjectId_key" ON "Lead"("convertedProjectId");

-- CreateIndex
CREATE INDEX "Lead_tenantId_companyId_idx" ON "Lead"("tenantId", "companyId");

-- CreateIndex
CREATE INDEX "Project_tenantId_companyId_idx" ON "Project"("tenantId", "companyId");

-- CreateIndex
CREATE INDEX "Project_tenantId_status_idx" ON "Project"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Task_tenantId_companyId_idx" ON "Task"("tenantId", "companyId");

-- CreateIndex
CREATE INDEX "Visit_tenantId_companyId_idx" ON "Visit"("tenantId", "companyId");

-- CreateIndex
CREATE INDEX "Visit_tenantId_leadId_idx" ON "Visit"("tenantId", "leadId");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_convertedProjectId_fkey" FOREIGN KEY ("convertedProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeHistory" ADD CONSTRAINT "ChangeHistory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================================================
-- DataFix: V3.3 客户根数据迁移 — 孤儿 Lead 关联默认客户
-- 仅在数据库已有 Lead 数据但都还没 companyId 的场景下生效
-- =============================================================================
-- 1) 对每个存在孤儿 Lead 的 tenant 创建【迁移默认客户】
INSERT INTO "Company" (id, "tenantId", name, "createdAt", "updatedAt")
SELECT
  'cmq_v330_def_' || SUBSTRING(MD5("tenantId"), 1, 16),
  "tenantId",
  '【V3.3迁移】默认客户',
  NOW(),
  NOW()
FROM "Lead"
WHERE "companyId" IS NULL
GROUP BY "tenantId"
ON CONFLICT (id) DO NOTHING;

-- 2) 把所有孤儿 Lead 关联到该 tenant 的【迁移默认客户】
UPDATE "Lead"
SET "companyId" = (
  SELECT id FROM "Company"
  WHERE "Company"."tenantId" = "Lead"."tenantId"
    AND "Company".name = '【V3.3迁移】默认客户'
  LIMIT 1
)
WHERE "companyId" IS NULL;

-- 3) 兜底：极少数情况下仍有孤儿（多租户数据不完整），用 prisma 校验兜底关联
UPDATE "Lead"
SET "companyId" = (SELECT id FROM "Company" LIMIT 1)
WHERE "companyId" IS NULL;

-- 4) 现在安全设置 NOT NULL
ALTER TABLE "Lead" ALTER COLUMN "companyId" SET NOT NULL;

