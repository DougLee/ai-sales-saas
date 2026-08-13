import type { PrismaClient } from '@prisma/client'
import type { Briefing, PriorityAction, BriefingInsight } from '@ai-sales/shared'
import { runDailyScan } from './daily-scan.js'

/**
 * 每日作战简报生成器
 * Phase 1: 规则模板模式（不依赖 LLM，确保稳定性）
 * Phase 2: 可升级为 LLM 增强模式
 */
export async function generateBriefing(
  prisma: PrismaClient,
  tenantId: string,
  _userId: string,
): Promise<Briefing> {
  const now = new Date()

  // 1. 获取预警数据
  const scanResult = await runDailyScan(prisma, tenantId)

  // 2. 获取统计指标
  const [
    newLeadsThisWeek,
    activeProjects,
    staleProjects,
    avgHealthScore,
  ] = await Promise.all([
    prisma.lead.count({
      where: {
        tenantId,
        createdAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
      },
    }),
    prisma.project.count({
      where: { tenantId, closedAt: null, deletedAt: null },
    }),
    prisma.project.count({
      where: { tenantId, closedAt: null, deletedAt: null, isStale: true },
    }),
    prisma.project.aggregate({
      where: { tenantId, closedAt: null, deletedAt: null },
      _avg: { healthScore: true },
    }).then(r => Math.round(r._avg.healthScore ?? 0)),
  ])

  // 3. 生成优先动作（从预警中提取 TOP 3）
  // 先过滤掉关联实体已被软删除的预警，避免出现"删完了还显示"的幽灵动作
  const validAlerts = await filterValidAlerts(prisma, scanResult.alerts)

  const priorityActions: PriorityAction[] = validAlerts
    .filter(a => a.severity === 'HIGH')
    .slice(0, 3)
    .map((alert, index) => ({
      id: alert.id,
      rank: index + 1,
      title: alert.title,
      entityType: alert.entityType,
      entityId: alert.entityId,
      entityName: alert.entityName,
      reason: alert.description,
      suggestedAction: getSuggestedAction(alert.type),
      path: getEntityPath(alert.entityType),
      canExecute: false,
    }))

  // 如果 HIGH 不足 3 个，补 MEDIUM
  if (priorityActions.length < 3) {
    const mediumAlerts = validAlerts.filter(a => a.severity === 'MEDIUM')
    for (let i = priorityActions.length; i < 3 && i - priorityActions.length < mediumAlerts.length; i++) {
      const alert = mediumAlerts[i - priorityActions.length]
      priorityActions.push({
        id: alert.id,
        rank: i + 1,
        title: alert.title,
        entityType: alert.entityType,
        entityId: alert.entityId,
        entityName: alert.entityName,
        reason: alert.description,
        suggestedAction: getSuggestedAction(alert.type),
        path: getEntityPath(alert.entityType),
        canExecute: false,
      })
    }
  }

  // 4. 生成 AI 洞察
  const insight = generateInsight(scanResult, { newLeadsThisWeek, activeProjects, staleProjects, avgHealthScore })

  return {
    date: now.toISOString(),
    priorityActions,
    insight,
    stats: {
      newLeadsThisWeek,
      activeProjects,
      staleProjects,
      avgHealthScore,
    },
  }
}

function getSuggestedAction(alertType: string): string {
  const actionMap: Record<string, string> = {
    STALE_PROJECT: '立即安排拜访或电话跟进，了解客户最新动态',
    OVERDUE_LEAD: '尽快联系客户，确认需求并推动转化',
    DUE_TASK: '优先完成该任务，避免逾期',
    LOW_HEALTH: '诊断项目健康度下降原因，制定改进计划',
    MISSING_VISIT: '安排近期拜访，保持客户活跃度',
  }
  return actionMap[alertType] || '尽快跟进处理'
}

/**
 * 过滤掉关联实体已被软删除的预警
 * - lead/project 实体：直接检查 deletedAt
 * - task 实体：检查关联的 projectId / companyId 是否已被软删除
 */
async function filterValidAlerts(
  prisma: PrismaClient,
  alerts: Awaited<ReturnType<typeof runDailyScan>>['alerts'],
): Promise<Awaited<ReturnType<typeof runDailyScan>>['alerts']> {
  const projectIds = new Set<string>()
  const leadIds = new Set<string>()
  const taskIds = new Set<string>()

  for (const a of alerts) {
    if (a.entityType === 'project') projectIds.add(a.entityId)
    else if (a.entityType === 'lead') leadIds.add(a.entityId)
    else if (a.entityType === 'task') taskIds.add(a.entityId)
  }

  const [existingProjects, existingLeads, tasksWithProject] = await Promise.all([
    projectIds.size > 0
      ? prisma.project.findMany({
          where: { id: { in: [...projectIds] }, deletedAt: null },
          select: { id: true },
        })
      : Promise.resolve([] as Array<{ id: string }>),
    leadIds.size > 0
      ? prisma.lead.findMany({
          where: { id: { in: [...leadIds] }, deletedAt: null },
          select: { id: true },
        })
      : Promise.resolve([] as Array<{ id: string }>),
    taskIds.size > 0
      ? prisma.task.findMany({
          where: { id: { in: [...taskIds] } },
          select: { id: true, projectId: true, companyId: true },
        })
      : Promise.resolve([] as Array<{ id: string; projectId: string | null; companyId: string | null }>),
  ])

  const validProjectIds = new Set(existingProjects.map((p) => p.id))
  const validLeadIds = new Set(existingLeads.map((l) => l.id))

  // 任务的关联项目若已软删除或不存在，则该任务预警无效
  const tasksWithDeletedProject = new Set<string>()
  for (const t of tasksWithProject) {
    if (t.projectId && !validProjectIds.has(t.projectId)) {
      tasksWithDeletedProject.add(t.id)
    }
  }

  // 任务的关联客户若已软删除或不存在（且没有关联到有效项目），则该任务预警无效
  const companyIdsToCheck = new Set<string>()
  for (const t of tasksWithProject) {
    if (t.companyId && !t.projectId) {
      companyIdsToCheck.add(t.companyId)
    }
  }
  const existingCompanies = companyIdsToCheck.size > 0
    ? await prisma.company.findMany({
        where: { id: { in: [...companyIdsToCheck] }, deletedAt: null },
        select: { id: true },
      })
    : []
  const validCompanyIds = new Set(existingCompanies.map((c) => c.id))

  const tasksWithDeletedCompany = new Set<string>()
  for (const t of tasksWithProject) {
    if (!t.projectId && t.companyId && !validCompanyIds.has(t.companyId)) {
      tasksWithDeletedCompany.add(t.id)
    }
  }

  return alerts.filter((a) => {
    if (a.entityType === 'project') return validProjectIds.has(a.entityId)
    if (a.entityType === 'lead') return validLeadIds.has(a.entityId)
    if (a.entityType === 'task') {
      const t = tasksWithProject.find((x) => x.id === a.entityId)
      if (!t) return false
      if (t.projectId && tasksWithDeletedProject.has(t.id)) return false
      if (!t.projectId && t.companyId && tasksWithDeletedCompany.has(t.id)) return false
      return true
    }
    return true
  })
}

function getEntityPath(entityType: string): string {
  const pathMap: Record<string, string> = {
    project: '/projects',
    lead: '/leads',
    task: '/tasks',
  }
  return pathMap[entityType] || '/'
}

function generateInsight(
  scanResult: Awaited<ReturnType<typeof runDailyScan>>,
  stats: { newLeadsThisWeek: number; activeProjects: number; staleProjects: number; avgHealthScore: number },
): BriefingInsight {
  // 规则引擎生成洞察（确保稳定性，不依赖 LLM）
  const highAlerts = scanResult.alerts.filter(a => a.severity === 'HIGH')
  const staleCount = scanResult.summary.staleProjects
  const missingVisitCount = scanResult.summary.missingVisits

  if (staleCount > 0 && missingVisitCount > 0) {
    return {
      type: 'risk',
      title: '拜访节奏断层风险',
      description: `当前有 ${staleCount} 个项目停滞，同时 ${missingVisitCount} 个项目长期未拜访。数据表明：停滞项目中 80% 与拜访间隔过长相关。建议本周集中安排一轮客户回访。`,
      evidence: [
        `停滞项目：${staleCount} 个`,
        `缺拜访项目：${missingVisitCount} 个`,
        `高优先级预警：${highAlerts.length} 条`,
      ],
    }
  }

  if (stats.avgHealthScore < 50 && stats.activeProjects > 0) {
    return {
      type: 'risk',
      title: '整体商机健康度偏低',
      description: `平均健康度仅 ${stats.avgHealthScore} 分，活跃商机中可能存在信息缺失或推进停滞。建议逐个诊断健康度低于 60 分的项目。`,
      evidence: [
        `平均健康度：${stats.avgHealthScore} 分`,
        `活跃商机：${stats.activeProjects} 个`,
      ],
    }
  }

  if (stats.newLeadsThisWeek === 0 && stats.activeProjects > 0) {
    return {
      type: 'pattern',
      title: '获客节奏放缓',
      description: '本周暂无新增线索，但活跃商机仍在推进。建议关注获客渠道的活跃度，避免 Pipeline 枯竭。',
      evidence: [
        `本周新增线索：0`,
        `活跃商机：${stats.activeProjects} 个`,
      ],
    }
  }

  // 默认洞察
  return {
    type: 'pattern',
    title: '销售漏斗运行平稳',
    description: '当前 Pipeline 无明显异常，继续保持跟进节奏。建议利用空闲时间拓展新客户。',
    evidence: [
      `活跃商机：${stats.activeProjects} 个`,
      `平均健康度：${stats.avgHealthScore} 分`,
    ],
  }
}
