-- Batch 5.1：所有 tenantId 列变 nullable + DEFAULT 'default'
-- 设计：可回滚（保留 NOT NULL 时一行 ALTER 即可）
-- 范围：25 张业务表 + 3 张审计表（共 28 张）
-- 影响：业务代码 `data.tenantId` 仍写入 'default'（user.tenantId 由 tenant-context.ts 自动注入），where.tenantId 仍写入
--       但都不再强校验 —— 单租户假设

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.columns
    WHERE table_name IN (
      'User','Org','Lead','LeadFollowUp','LeadAssessmentJob','Project',
      'Company','Contact','ProjectContact','Visit','VisitClosure','Task',
      'MethodologyConfig','TimelineEvent','CustomerSnapshot','KbDocument',
      'KbChunk','BehaviorLog','Goal','AiConfig','ChatSession','ChatMessage',
      'AiPendingItem','ProjectTypeConfig','AuditLog','ChangeHistory'
    )
    AND column_name = 'tenantId'
  LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN "tenantId" DROP NOT NULL', t);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN "tenantId" SET DEFAULT %L', t, 'default');
  END LOOP;
END $$;

-- LoginHistory 本就可空，仅确认无影响（不重复 DROP NOT NULL，幂等）
-- Tenant 表本身保留（用户口径：保留 Tenant 表 + 默认 slug='default-demo' 行）