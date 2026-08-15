-- #33 数据底座最后一公里
-- A1 EvidenceSource 落表 / A2 Visit+Task 软删 / A4 Project/Company 状态枚举化
-- 注意：项目迁移历史有漂移（20260815000000 之后 tenantId 均带 DEFAULT 'default'），新表沿用该约定

-- ============================================
-- A4. 状态枚举化（VALUES 内联转换模式，参照 20250627000000 LeadStatus 写法）
-- ============================================

-- Project.status: following / stale / won / lost，脏值归 'following'
-- 注意：TYPE 变更前必须 DROP DEFAULT（旧 text 默认值无法自动 cast 到枚举），变更后重设
CREATE TYPE "ProjectStatus" AS ENUM ('following', 'stale', 'won', 'lost');
ALTER TABLE "Project" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Project" ALTER COLUMN "status" TYPE "ProjectStatus" USING (
  CASE
    WHEN "status"::text IN ('following', 'stale', 'won', 'lost') THEN "status"::text
    ELSE 'following'
  END
)::"ProjectStatus";
ALTER TABLE "Project" ALTER COLUMN "status" SET DEFAULT 'following';

-- Company.status: target / following / won / lost，脏值归 'target'
CREATE TYPE "CompanyStatus" AS ENUM ('target', 'following', 'won', 'lost');
ALTER TABLE "Company" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Company" ALTER COLUMN "status" TYPE "CompanyStatus" USING (
  CASE
    WHEN "status"::text IN ('target', 'following', 'won', 'lost') THEN "status"::text
    ELSE 'target'
  END
)::"CompanyStatus";
ALTER TABLE "Company" ALTER COLUMN "status" SET DEFAULT 'target';

-- ============================================
-- A2. 软删一致性：Visit / Task 补 deletedAt（默认 NULL = 未删）
-- TimelineEvent 不加（事实源 append-only，消费侧按父级软删过滤）
-- ============================================

ALTER TABLE "Visit" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "Visit_tenantId_deletedAt_idx" ON "Visit"("tenantId", "deletedAt");

ALTER TABLE "Task" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "Task_tenantId_deletedAt_idx" ON "Task"("tenantId", "deletedAt");

-- ============================================
-- A1. EvidenceSource（字段级来源链落表，ADR-0005 四级水位）
-- 存量数据不回填：读路径表内无记录时回退 evidence._gateFieldSource JSON
-- ============================================

CREATE TABLE "EvidenceSource" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "projectId" TEXT NOT NULL,
    "milestone" INTEGER NOT NULL DEFAULT 0,
    "fieldPath" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'manual',
    "sourceName" TEXT NOT NULL,
    "sourceRefId" TEXT,
    "extractedValue" JSONB NOT NULL DEFAULT '{}',
    "verifiedLevel" TEXT NOT NULL DEFAULT 'single',
    "extractedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EvidenceSource_tenantId_projectId_fieldPath_idx" ON "EvidenceSource"("tenantId", "projectId", "fieldPath");
CREATE INDEX "EvidenceSource_tenantId_projectId_revokedAt_idx" ON "EvidenceSource"("tenantId", "projectId", "revokedAt");

-- AddForeignKey
ALTER TABLE "EvidenceSource" ADD CONSTRAINT "EvidenceSource_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidenceSource" ADD CONSTRAINT "EvidenceSource_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
