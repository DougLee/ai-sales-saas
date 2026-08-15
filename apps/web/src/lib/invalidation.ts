import type { QueryClient } from '@tanstack/react-query'

/**
 * 实体关联失效矩阵（P1-#10）
 *
 * 原则：任何 mutation 成功后，除了失效本实体列表，还要失效
 * 1) 本实体详情查询 ['entity', id]（详情抽屉走独立查询）
 * 2) 会被连带改写的关联实体（如拜访闭环会创建任务、刷新项目健康度）
 * 3) 聚合视图（dashboard-stats / pipeline 等）
 *
 * 新增 mutation 时先来这里找对应的失效函数，不要手写散落的 invalidateQueries。
 */

export function invalidateVisitRelated(
  qc: QueryClient,
  opts: { visitId?: string; projectId?: string } = {},
) {
  qc.invalidateQueries({ queryKey: ['visits'] })
  if (opts.visitId) {
    qc.invalidateQueries({ queryKey: ['visit', opts.visitId] })
    qc.invalidateQueries({ queryKey: ['visit-closure', opts.visitId] })
  }
  // 拜访闭环/AI 分析会回写：项目健康度、下次跟进、关联任务、客户快照
  if (opts.projectId) qc.invalidateQueries({ queryKey: ['project', opts.projectId] })
  // 前缀失效：覆盖当前可能打开的其他项目详情（只会 refetch 活跃查询）
  qc.invalidateQueries({ queryKey: ['project'] })
  qc.invalidateQueries({ queryKey: ['projects'] })
  qc.invalidateQueries({ queryKey: ['project-metrics'] })
  qc.invalidateQueries({ queryKey: ['tasks'] })
  qc.invalidateQueries({ queryKey: ['dashboard'] })
  qc.invalidateQueries({ queryKey: ['confirmations'] })
}

export function invalidateProjectRelated(qc: QueryClient, projectId?: string) {
  qc.invalidateQueries({ queryKey: ['projects'] })
  if (projectId) qc.invalidateQueries({ queryKey: ['project', projectId] })
  qc.invalidateQueries({ queryKey: ['project-metrics'] })
  qc.invalidateQueries({ queryKey: ['decision-chain'] })
  qc.invalidateQueries({ queryKey: ['pipeline'] })
  qc.invalidateQueries({ queryKey: ['dashboard'] })
}

export function invalidateTaskRelated(qc: QueryClient, taskId?: string) {
  qc.invalidateQueries({ queryKey: ['tasks'] })
  if (taskId) qc.invalidateQueries({ queryKey: ['task', taskId] })
  // 任务完成情况会反映在项目详情的关联任务区
  qc.invalidateQueries({ queryKey: ['project'] })
  qc.invalidateQueries({ queryKey: ['dashboard'] })
}

export function invalidateContactRelated(qc: QueryClient, contactId?: string) {
  qc.invalidateQueries({ queryKey: ['contacts'] })
  if (contactId) qc.invalidateQueries({ queryKey: ['contact', contactId] })
  // 联系人是决策链/项目详情的组成部分
  qc.invalidateQueries({ queryKey: ['project'] })
  qc.invalidateQueries({ queryKey: ['decision-chain'] })
}

export function invalidateLeadRelated(qc: QueryClient, leadId?: string) {
  qc.invalidateQueries({ queryKey: ['leads'] })
  if (leadId) qc.invalidateQueries({ queryKey: ['lead', leadId] })
  qc.invalidateQueries({ queryKey: ['lead-metrics'] })
  qc.invalidateQueries({ queryKey: ['lead-follow-ups'] })
  qc.invalidateQueries({ queryKey: ['dashboard'] })
}

export function invalidateCompanyRelated(qc: QueryClient, companyId?: string) {
  qc.invalidateQueries({ queryKey: ['companies'] })
  if (companyId) qc.invalidateQueries({ queryKey: ['company', companyId] })
  qc.invalidateQueries({ queryKey: ['company-metrics'] })
  qc.invalidateQueries({ queryKey: ['company-history'] })
  qc.invalidateQueries({ queryKey: ['company-missing-fields'] })
  qc.invalidateQueries({ queryKey: ['projects'] })
  qc.invalidateQueries({ queryKey: ['dashboard'] })
}
