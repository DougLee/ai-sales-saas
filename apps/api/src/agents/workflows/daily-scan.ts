import type { PrismaClient } from '@prisma/client'
import { recordTimelineEvent } from '../../lib/timeline.js'
import { ActivityEventType } from '../../lib/activity.js'
import {
  createFollowUpReminders,
  releaseUnclaimedCompanies,
  notifyStaleProjects,
} from './follow-up-reminders.js'
import { loadTypeConfigMap, cfgFor } from './project-type-config.js'

export interface AlertItem {
  id: string
  type: 'STALE_PROJECT' | 'OVERDUE_LEAD' | 'DUE_TASK' | 'LOW_HEALTH' | 'MISSING_VISIT'
  severity: 'HIGH' | 'MEDIUM' | 'LOW'
  title: string
  description: string
  entityType: 'project' | 'lead' | 'task'
  entityId: string
  entityName: string
  createdAt: string
  metadata?: Record<string, unknown>
}

export interface DailyScanResult {
  scanTime: string
  totalAlerts: number
  alerts: AlertItem[]
  summary: {
    staleProjects: number
    overdueLeads: number
    dueTasks: number
    lowHealthProjects: number
    missingVisits: number
    autoTasksCreated: number
    projectReminders: number
    visitReminders: number
    releasedCompanies: number
    staleProjectNotifications: number
    /** V6.1：等待客户中而跳过倒计时的项目数 */
    waitingSkipped: number
  }
}

/**
 * 每日巡检工作流
 * - 扫描停滞项目（isStale 或超过跟进阈值）
 * - 扫描逾期线索（长时间未转化）
 * - 扫描即将到期任务
 * - 扫描低健康度项目
 * - 扫描缺少拜访记录的项目
 */
export async function runDailyScan(prisma: PrismaClient, tenantId: string): Promise<DailyScanResult> {
  const now = new Date()
  const alerts: AlertItem[] = []

  // ===== V6.1 §7：分档停滞判定 =====
  // 口径：以"最近一次有效跟进"（闭环且质量分≥档位最低分）为倒计时起点；
  //       等待客户中的项目（waitingStatus 非空）暂停倒计时，不标停滞、不提醒
  const configByType = await loadTypeConfigMap(prisma, tenantId)

  const activeProjects = await prisma.project.findMany({
    where: { tenantId, closedAt: null, deletedAt: null },
    select: {
      id: true, name: true, companyId: true, projectType: true, waitingStatus: true,
      isStale: true, staleSince: true, createdAt: true, lastVisitTime: true,
      milestone: true, healthScore: true, nextFollowUp: true,
    },
    take: 200,
  })

  // 批量取各项目已闭环且达标的拜访，逐项目按档位门槛过滤后取最近有效跟进时间
  const minScoreAcrossConfigs = Math.min(
    ...[...configByType.values()].map((c) => c.effectiveFollowupMinScore),
    40,
  )
  const closedVisits = activeProjects.length
    ? await prisma.visitClosure.findMany({
        where: {
          projectId: { in: activeProjects.map((p) => p.id) },
          closedAt: { not: null },
          qualityScore: { gte: minScoreAcrossConfigs },
          visit: { tenantId },
        },
        select: { projectId: true, closedAt: true, qualityScore: true },
      })
    : []
  const lastEffectiveByProject = new Map<string, Date>()
  for (const c of closedVisits) {
    if (!c.projectId || !c.closedAt) continue
    const project = activeProjects.find((p) => p.id === c.projectId)
    const threshold = cfgFor(configByType, project?.projectType ?? null).effectiveFollowupMinScore
    if ((c.qualityScore ?? 0) < threshold) continue
    const prev = lastEffectiveByProject.get(c.projectId)
    if (!prev || c.closedAt > prev) lastEffectiveByProject.set(c.projectId, c.closedAt)
  }

  const DAY_MS = 24 * 60 * 60 * 1000
  const projectsMissingVisit: typeof activeProjects = []
  let waitingSkipped = 0

  for (const p of activeProjects) {
    // 等待客户中：暂停倒计时
    if (p.waitingStatus) {
      waitingSkipped++
      continue
    }
    const cfg = cfgFor(configByType, p.projectType)
    const qualified = lastEffectiveByProject.get(p.id)
    // 有效跟进时间（质量分需达本项目档位门槛）；从未有效跟进则以立项时间计龄
    const lastEffective = qualified ?? null
    const basis = lastEffective ?? p.createdAt
    const daysSilent = Math.floor((now.getTime() - new Date(basis).getTime()) / DAY_MS)

    // 停滞标记：超过档位 staleDays 无有效跟进
    if (!p.isStale && daysSilent > cfg.staleDays) {
      const reason = lastEffective
        ? `超过${cfg.staleDays}天无有效跟进（${cfg.typeName}档）`
        : `立项超过${cfg.staleDays}天仍无有效跟进（${cfg.typeName}档）`
      await prisma.project.update({
        where: { id: p.id },
        data: { isStale: true, staleSince: now, staleReason: reason },
      })
      p.isStale = true
      p.staleSince = now

      await recordTimelineEvent(prisma, {
        tenantId,
        customerId: p.companyId || '',
        projectId: p.id,
        eventType: ActivityEventType.PROJECT_STALE_MARKED,
        eventData: { name: p.name, reason },
        sourceType: 'system',
        sourceLabel: '系统自动标记停滞',
        eventTime: now,
      })
    }

    // 防御性解除：闭环时的即时重置是主路径（closure.service），此处兜底
    if (p.isStale && daysSilent <= cfg.staleDays) {
      await prisma.project.update({
        where: { id: p.id },
        data: { isStale: false, staleSince: null, staleReason: null },
      })
      p.isStale = false
      p.staleSince = null
    }

    // 关注提醒：超过档位 attentionDays 无有效跟进
    if (daysSilent > cfg.attentionDays) {
      projectsMissingVisit.push(p)
    }
  }

  // 1. 停滞项目（等待客户中的项目不告警——倒计时已暂停）
  const staleProjects = await prisma.project.findMany({
    where: {
      tenantId,
      closedAt: null,
      deletedAt: null,
      isStale: true,
      waitingStatus: null,
    },
    select: {
      id: true,
      name: true,
      staleSince: true,
      milestone: true,
      healthScore: true,
      lastVisitTime: true,
    },
    take: 50,
  })

  for (const p of staleProjects) {
    const days = p.staleSince
      ? Math.floor((now.getTime() - new Date(p.staleSince).getTime()) / (1000 * 60 * 60 * 24))
      : 0
    alerts.push({
      id: `stale-${p.id}`,
      type: 'STALE_PROJECT',
      severity: days > 14 ? 'HIGH' : 'MEDIUM',
      title: `项目停滞：${p.name}`,
      description: `已停滞 ${days} 天，里程碑阶段 M${p.milestone}，健康度 ${p.healthScore}。建议尽快安排拜访或跟进。`,
      entityType: 'project',
      entityId: p.id,
      entityName: p.name,
      createdAt: now.toISOString(),
      metadata: { staleDays: days, milestone: p.milestone, healthScore: p.healthScore },
    })
  }

  // 2. 长期未转化的线索（>30天）
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const oldLeads = await prisma.lead.findMany({
    where: {
      tenantId,
      deletedAt: null,
      status: { not: 'CONVERTED' },
      createdAt: { lt: thirtyDaysAgo },
    },
    select: {
      id: true,
      name: true,
      status: true,
      createdAt: true,
      contactName: true,
      completenessScore: true,
    },
    take: 50,
  })

  for (const lead of oldLeads) {
    const days = Math.floor((now.getTime() - new Date(lead.createdAt).getTime()) / (1000 * 60 * 60 * 24))
    alerts.push({
      id: `lead-${lead.id}`,
      type: 'OVERDUE_LEAD',
      severity: days > 60 ? 'HIGH' : 'MEDIUM',
      title: `线索逾期：${lead.name}`,
      description: `已存在 ${days} 天未转化，状态 ${lead.status}，完整度 ${lead.completenessScore}%。建议评估是否继续跟进或放弃。`,
      entityType: 'lead',
      entityId: lead.id,
      entityName: lead.name,
      createdAt: now.toISOString(),
      metadata: { daysOld: days, status: lead.status, completenessScore: lead.completenessScore },
    })
  }

  // 3. 逾期任务
  const overdueTasks = await prisma.task.findMany({
    where: {
      tenantId,
      status: { not: 'COMPLETED' },
      deadline: { lt: now },
    },
    select: {
      id: true,
      title: true,
      deadline: true,
      priority: true,
      status: true,
      projectId: true,
      ownerId: true,
    },
    take: 50,
  })

  for (const task of overdueTasks) {
    const daysOverdue = task.deadline
      ? Math.floor((now.getTime() - new Date(task.deadline).getTime()) / (1000 * 60 * 60 * 24))
      : 0

    const project = task.projectId
      ? await prisma.project.findUnique({ where: { id: task.projectId }, select: { companyId: true, name: true } })
      : null

    await recordTimelineEvent(prisma, {
      tenantId,
      customerId: project?.companyId || '',
      projectId: task.projectId || undefined,
      eventType: ActivityEventType.TASK_OVERDUE,
      eventData: {
        taskId: task.id,
        title: task.title,
        daysOverdue,
        ownerId: task.ownerId,
      },
      sourceType: 'system',
      sourceLabel: '待办逾期',
      eventTime: now,
    })

    alerts.push({
      id: `overdue-task-${task.id}`,
      type: 'DUE_TASK',
      severity: task.priority === 'URGENT' || daysOverdue >= 3 ? 'HIGH' : 'MEDIUM',
      title: `任务已逾期：${task.title}`,
      description: `已逾期 ${daysOverdue} 天，优先级 ${task.priority}，当前状态 ${task.status}。`,
      entityType: 'task',
      entityId: task.id,
      entityName: task.title,
      createdAt: now.toISOString(),
      metadata: { daysOverdue, priority: task.priority, status: task.status },
    })
  }

  // 4. 即将到期任务（3天内）
  const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
  const dueTasks = await prisma.task.findMany({
    where: {
      tenantId,
      status: { not: 'COMPLETED' },
      deadline: { gte: now, lte: threeDaysLater },
    },
    select: {
      id: true,
      title: true,
      deadline: true,
      priority: true,
      status: true,
    },
    take: 50,
  })

  for (const task of dueTasks) {
    const daysLeft = task.deadline
      ? Math.ceil((new Date(task.deadline).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : 0
    alerts.push({
      id: `task-${task.id}`,
      type: 'DUE_TASK',
      severity: task.priority === 'URGENT' || daysLeft <= 1 ? 'HIGH' : 'MEDIUM',
      title: `任务即将到期：${task.title}`,
      description: `剩余 ${daysLeft} 天，优先级 ${task.priority}，当前状态 ${task.status}。`,
      entityType: 'task',
      entityId: task.id,
      entityName: task.title,
      createdAt: now.toISOString(),
      metadata: { daysLeft, priority: task.priority, status: task.status },
    })
  }

  // 5. 低健康度项目（<40分）
  const lowHealthProjects = await prisma.project.findMany({
    where: {
      tenantId,
      closedAt: null,
      deletedAt: null,
      healthScore: { lt: 40 },
    },
    select: {
      id: true,
      name: true,
      healthScore: true,
      milestone: true,
      urgency: true,
    },
    take: 20,
  })

  for (const p of lowHealthProjects) {
    alerts.push({
      id: `health-${p.id}`,
      type: 'LOW_HEALTH',
      severity: (p.healthScore ?? 0) < 20 ? 'HIGH' : 'MEDIUM',
      title: `低健康度项目：${p.name}`,
      description: `健康度仅 ${p.healthScore} 分，里程碑 M${p.milestone}，紧急度 ${p.urgency}。建议全面复盘。`,
      entityType: 'project',
      entityId: p.id,
      entityName: p.name,
      createdAt: now.toISOString(),
      metadata: { healthScore: p.healthScore, milestone: p.milestone, urgency: p.urgency },
    })
  }

  // 5. 缺少有效跟进的项目（分档 attentionDays，waiting 项目已在上方跳过）
  for (const p of projectsMissingVisit.slice(0, 30)) {
    const cfg = cfgFor(configByType, p.projectType)
    const lastEffective = lastEffectiveByProject.get(p.id) ?? null
    const basis = lastEffective ?? p.createdAt
    const days = Math.floor((now.getTime() - new Date(basis).getTime()) / DAY_MS)
    alerts.push({
      id: `visit-${p.id}`,
      type: 'MISSING_VISIT',
      severity: days > cfg.staleDays ? 'HIGH' : 'MEDIUM',
      title: `缺少有效跟进：${p.name}`,
      description: `最近一次有效跟进在 ${lastEffective ? `${days} 天前` : '从未（以立项时间计）'}，已超过 ${cfg.typeName}档关注阈值 ${cfg.attentionDays} 天，里程碑 M${p.milestone}。建议安排拜访。`,
      entityType: 'project',
      entityId: p.id,
      entityName: p.name,
      createdAt: now.toISOString(),
      metadata: { daysSinceEffectiveFollowUp: days, attentionDays: cfg.attentionDays, milestone: p.milestone, nextFollowUp: p.nextFollowUp },
    })
  }

  // 按严重度排序
  const severityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 }
  alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])

  // 6. 将 HIGH 严重度预警转为可执行任务
  const highAlerts = alerts.filter((a) => a.severity === 'HIGH')
  let autoTasksCreated = 0
  if (highAlerts.length > 0) {
    const projectIds = highAlerts.filter((a) => a.entityType === 'project').map((a) => a.entityId)
    const leadIds = highAlerts.filter((a) => a.entityType === 'lead').map((a) => a.entityId)
    const taskIds = highAlerts.filter((a) => a.entityType === 'task').map((a) => a.entityId)

    const [projects, leads, tasks] = await Promise.all([
      prisma.project.findMany({
        where: { id: { in: projectIds } },
        select: { id: true, ownerId: true, tenantId: true, orgId: true },
      }),
      prisma.lead.findMany({
        where: { id: { in: leadIds } },
        select: { id: true, ownerId: true, tenantId: true, orgId: true },
      }),
      prisma.task.findMany({
        where: { id: { in: taskIds } },
        select: { id: true, ownerId: true, tenantId: true, orgId: true },
      }),
    ])

    const ownerMap = new Map<string, { ownerId: string; tenantId: string; orgId: string | null }>()
    for (const p of projects) ownerMap.set(p.id, p)
    for (const l of leads) ownerMap.set(l.id, l)
    for (const t of tasks) ownerMap.set(t.id, t)

    for (const alert of highAlerts) {
      const source = `daily_scan_${alert.type}`
      const existing = await prisma.task.findFirst({
        where: {
          tenantId,
          source,
          sourceId: alert.entityId,
          status: { not: 'COMPLETED' },
        },
      })
      if (existing) continue

      const owner = ownerMap.get(alert.entityId)
      const deadline = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000)

      await prisma.task.create({
        data: {
          tenantId: owner?.tenantId || tenantId,
          orgId: owner?.orgId ?? null,
          ownerId: owner?.ownerId || '',
          title: alert.title,
          description: alert.description,
          priority: 'HIGH',
          status: 'PENDING',
          source,
          sourceId: alert.entityId,
          deadline,
        },
      })
      autoTasksCreated++
    }
  }

  // 7. nextFollowUp / nextActionDeadline 到期提醒
  const { projectReminders, visitReminders } = await createFollowUpReminders(prisma, tenantId, now)

  // 8. 公海池客户认领后 72 小时未触达自动释放
  const releasedCompanies = await releaseUnclaimedCompanies(prisma, tenantId, now)

  // 9. 停滞项目超 3 天通知
  const staleProjectNotifications = await notifyStaleProjects(prisma, tenantId, now)

  return {
    scanTime: now.toISOString(),
    totalAlerts: alerts.length,
    alerts,
    summary: {
      staleProjects: staleProjects.length,
      overdueLeads: oldLeads.length,
      dueTasks: dueTasks.length,
      lowHealthProjects: lowHealthProjects.length,
      missingVisits: projectsMissingVisit.length,
      autoTasksCreated,
      projectReminders,
      visitReminders,
      releasedCompanies,
      staleProjectNotifications,
      waitingSkipped,
    },
  }
}
