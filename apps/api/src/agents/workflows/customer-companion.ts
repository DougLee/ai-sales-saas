import type { PrismaClient } from '@prisma/client'
import { generateObject } from 'ai'
import { z } from 'zod'
import { recordTimelineEvent } from '../../lib/timeline.js'
import { createModel } from '../../config/model-provider.js'
import { logger } from '../../infra/logger.js'
import {
  loadSnapshotContext,
  saveSnapshot,
  parseSnapshotResponse,
  renderFullSnapshotPrompt,
  renderIncrementalSnapshotPrompt,
  getEffectiveSnapshot,
  estimateTokens,
  type ParsedSnapshot,
} from '../../crm/snapshots/snapshot.service.js'
import { getLastEffectiveFollowUp } from '../../crm/visits/closure.service.js'
import { loadTypeConfigMap, cfgFor } from './project-type-config.js'

/**
 * 持续陪伴智能体（V6.1 §4）
 *
 * 4 种 mode：
 * - snapshot:  生成/更新单个项目的客户状态快照（增量 vs 全量调度由 snapshot.service 决定）
 * - alert:     单项目扫描，输出断点预警（阶段停滞/无有效跟进/闭环未闭/赢单概率陡降）
 * - briefing:  生成某销售今日晨间简报（top5 重点客户）
 * - handover:  生成项目交接简报（owner 变更时复用快照+拼接）
 *
 * 设计红线（与 V6.1 一致）：
 * - 只读取 factStatus='confirmed' 事件
 * - 等待客户状态（waitingStatus）暂停停滞类检测
 * - 阈值从 projectTypeConfig 读取，无配置回退默认
 */

export type CompanionMode = 'snapshot' | 'alert' | 'briefing' | 'handover'

export interface CompanionParams {
  mode: CompanionMode
  tenantId: string
  projectId?: string
  userId?: string
}

export interface CompanionResult {
  mode: CompanionMode
  success: boolean
  [key: string]: unknown
}

const RISK_FLAG_EVENT_TYPE = 'ai.risk_alert' // 风险预警事件类型（非 ActivityEventType 枚举，自由字符串）

/**
 * 主入口
 */
export async function customerCompanion(prisma: PrismaClient, params: CompanionParams): Promise<CompanionResult> {
  switch (params.mode) {
    case 'snapshot':
      return runSnapshotMode(prisma, params)
    case 'alert':
      return runAlertMode(prisma, params)
    case 'briefing':
      return runBriefingMode(prisma, params)
    case 'handover':
      return runHandoverMode(prisma, params)
    default:
      throw new Error(`Unknown companion mode: ${(params as { mode: string }).mode}`)
  }
}

// ===== snapshot mode =====

async function runSnapshotMode(
  prisma: PrismaClient,
  params: CompanionParams,
): Promise<CompanionResult> {
  if (!params.projectId) throw new Error('snapshot mode requires projectId')
  const t0 = Date.now()

  // 1. 构造上下文（增量 vs 全量由 coversUntil 决定）
  const ctx = await loadSnapshotContext(prisma, {
    tenantId: params.tenantId,
    projectId: params.projectId,
  })

  // 2. 调 LLM
  const prompt = ctx.incremental
    ? renderIncrementalSnapshotPrompt(ctx)
    : renderFullSnapshotPrompt(ctx)
  let parsed: ParsedSnapshot
  try {
    const snapshotOutputSchema = z.object({
      weeklySummary: z.string(),
      monthlySummary: z.string(),
      quarterlyView: z.string(),
      healthScore: z.number(),
      riskFlags: z.array(
        z.object({
          type: z.string(),
          severity: z.enum(['high', 'medium', 'low']),
          description: z.string(),
        }),
      ),
      nextActions: z.array(
        z.object({
          action: z.string(),
          priority: z.enum(['high', 'medium', 'low']),
          expectedImpact: z.string(),
        }),
      ),
    })
    const { object } = await generateObject({
      model: createModel() as never,
      schema: snapshotOutputSchema,
      system: '你是销售总监，输出严格 JSON。',
      prompt,
    })
    parsed = object as ParsedSnapshot
  } catch (err) {
    logger.warn({ err: (err as Error).message, projectId: params.projectId }, 'companion.snapshot: LLM failed')
    parsed = parseSnapshotResponse(`{"weeklySummary":"快照生成失败：${(err as Error).message.slice(0, 100)}","monthlySummary":"","quarterlyView":"","healthScore":60,"riskFlags":[],"nextActions":[]}`)
  }

  // 3. 落库
  const project = await prisma.project.findFirst({
    where: { id: params.projectId, tenantId: params.tenantId },
    select: { companyId: true, milestone: true, createdAt: true },
  })
  const saved = await saveSnapshot(prisma, {
    tenantId: params.tenantId,
    customerId: project?.companyId ?? null,
    projectId: params.projectId,
    parsed,
    currentStage: project?.milestone ?? null,
    stageDuration: ctx.daysInStage,
    generatedBy: 'customerCompanion',
    incremental: ctx.incremental,
    estimatedTokens: ctx.estimatedTokens,
  })

  // 4. 高风险 → 时间轴写预警 + 记录（不创建 Task，Phase 3 待确认队列接入）
  for (const r of parsed.riskFlags.filter((x) => x.severity === 'high')) {
    await recordTimelineEvent(prisma, {
      tenantId: params.tenantId,
      customerId: project?.companyId || '',
      projectId: params.projectId,
      eventType: RISK_FLAG_EVENT_TYPE,
      eventData: { source: 'snapshot', riskType: r.type, description: r.description },
      aiInsight: r.description,
      sourceType: 'agent',
      sourceId: 'customerCompanion',
      sourceLabel: '陪伴智能体高风险预警',
      eventTime: new Date(),
    })
  }

  return {
    mode: 'snapshot',
    success: true,
    snapshotId: saved.id,
    incremental: ctx.incremental,
    healthScore: parsed.healthScore,
    riskFlags: parsed.riskFlags,
    nextActions: parsed.nextActions,
    contextEvents: ctx.events.length,
    estimatedTokens: ctx.estimatedTokens,
    durationMs: Date.now() - t0,
  }
}

// ===== alert mode =====

async function runAlertMode(
  prisma: PrismaClient,
  params: CompanionParams,
): Promise<CompanionResult> {
  if (!params.projectId) throw new Error('alert mode requires projectId')
  const project = await prisma.project.findFirst({
    where: { id: params.projectId, tenantId: params.tenantId },
  })
  if (!project) throw new Error(`Project not found: ${params.projectId}`)

  // V6.1：等待客户中暂停检测
  if (project.waitingStatus) {
    return {
      mode: 'alert',
      success: true,
      projectId: project.id,
      alerts: [],
      skipped: `waiting: ${project.waitingStatus}`,
    }
  }

  const cfgMap = await loadTypeConfigMap(prisma, params.tenantId)
  const cfg = cfgFor(cfgMap, project.projectType)

  const lastEffective = await getLastEffectiveFollowUp(prisma, {
    tenantId: params.tenantId,
    projectId: project.id,
    minScore: cfg.effectiveFollowupMinScore,
  })
  const daysSince = lastEffective
    ? Math.floor((Date.now() - new Date(lastEffective).getTime()) / 86400000)
    : Math.floor((Date.now() - new Date(project.createdAt).getTime()) / 86400000)

  const alerts: Array<{ type: string; severity: 'high' | 'medium' | 'low'; message: string; suggestion: string }> = []

  if (daysSince > cfg.staleDays) {
    alerts.push({
      type: 'stale_project',
      severity: daysSince > cfg.staleDays * 2 ? 'high' : 'medium',
      message: `已 ${daysSince} 天无有效跟进，超过 ${cfg.typeName}档 ${cfg.staleDays} 天阈值`,
      suggestion: '建议尽快安排拜访或电话回访',
    })
  } else if (daysSince > cfg.attentionDays) {
    alerts.push({
      type: 'attention_needed',
      severity: 'medium',
      message: `已 ${daysSince} 天无有效跟进，超过 ${cfg.typeName}档关注阈值 ${cfg.attentionDays} 天`,
      suggestion: '建议安排跟进',
    })
  }

  // 闭环未闭统计
  const openVisits = await prisma.visitClosure.findMany({
    where: { projectId: project.id, closedAt: null },
    select: { hasAiAnalysis: true, hasConfirmation: true },
  })
  const pendingConfirm = openVisits.filter((v) => v.hasAiAnalysis && !v.hasConfirmation).length
  if (openVisits.length > 0) {
    alerts.push({
      type: 'open_closures',
      severity: 'low',
      message: `${openVisits.length} 次拜访未闭环${pendingConfirm > 0 ? `，其中 ${pendingConfirm} 次待确认 AI 提取` : ''}`,
      suggestion: pendingConfirm > 0 ? '请先到待确认收件箱处理' : '请补充拜访摘要或上传录音',
    })
  }

  // 待确认收件箱
  const pendingItems = await prisma.aiPendingItem.count({
    where: { tenantId: params.tenantId, projectId: project.id, status: 'pending' },
  })
  if (pendingItems > 0) {
    alerts.push({
      type: 'pending_confirmations',
      severity: pendingItems > 3 ? 'medium' : 'low',
      message: `有 ${pendingItems} 条 AI 提取内容待你确认`,
      suggestion: '请到工作台收件箱一键处理',
    })
  }

  return {
    mode: 'alert',
    success: true,
    projectId: project.id,
    alerts,
    daysSinceEffective: daysSince,
    configUsed: cfg,
  }
}

// ===== briefing mode =====

interface ProjectBrief {
  project: { id: string; name: string; milestone: number }
  snapshot: { healthScore: number | null; riskFlags: unknown; weeklySummary: string | null } | null
  overdueTasks: number
  pendingCount: number
  staleFlag: boolean
  snapshotStale: boolean
}

async function runBriefingMode(
  prisma: PrismaClient,
  params: CompanionParams,
): Promise<CompanionResult> {
  if (!params.userId) throw new Error('briefing mode requires userId')
  const now = new Date()
  const projects = await prisma.project.findMany({
    where: { ownerId: params.userId, closedAt: null, deletedAt: null, milestone: { lt: 8 } },
    select: { id: true, name: true, milestone: true },
    take: 50,
  })

  const briefs: ProjectBrief[] = []
  for (const p of projects) {
    const [snap, overdueTasks, pendingCount] = await Promise.all([
      getEffectiveSnapshot(prisma, p.id),
      prisma.task.count({
        where: {
          projectId: p.id,
          ownerId: params.userId,
          status: { not: 'COMPLETED' },
          deadline: { lt: now },
        },
      }),
      prisma.aiPendingItem.count({
        where: { tenantId: params.tenantId, projectId: p.id, status: 'pending' },
      }),
    ])
    briefs.push({
      project: p,
      snapshot: snap.snapshot
        ? {
            healthScore: snap.snapshot.healthScore,
            riskFlags: snap.snapshot.riskFlags,
            weeklySummary: snap.snapshot.weeklySummary,
          }
        : null,
      overdueTasks,
      pendingCount,
      staleFlag: false, // briefing 模式不查 stale（daily-scan 负责），避免重复扫描
      snapshotStale: snap.stale,
    })
  }

  // V6.1 §4.2 优先级排序：逾期 > 高风险 > 待确认 > 快照过期
  briefs.sort((a, b) => {
    const score = (x: ProjectBrief) =>
      x.overdueTasks * 1000 +
      (Array.isArray(x.snapshot?.riskFlags)
        ? ((x.snapshot!.riskFlags as Array<{ severity: string }>).filter((r) => r.severity === 'high').length) * 500
        : 0) +
      x.pendingCount * 300 +
      (x.snapshotStale ? 200 : 0) -
      (x.snapshot?.healthScore ?? 60)
    return score(b) - score(a)
  })

  const top5 = briefs.slice(0, 5)
  const summary = {
    projectCount: briefs.length,
    urgentCount: briefs.filter((b) => b.overdueTasks > 0).length,
    pendingConfirmCount: briefs.reduce((sum, b) => sum + b.pendingCount, 0),
    top5: top5.map((b) => ({
      projectId: b.project.id,
      projectName: b.project.name,
      milestone: b.project.milestone,
      overdueTasks: b.overdueTasks,
      pendingCount: b.pendingCount,
      healthScore: b.snapshot?.healthScore ?? null,
      weeklySummary: b.snapshot?.weeklySummary ?? null,
      snapshotStale: b.snapshotStale,
    })),
  }

  // 简报 prompt token 估算（仅日志用）
  const briefingTokens = estimateTokens(JSON.stringify(summary))

  return {
    mode: 'briefing',
    success: true,
    briefing: summary,
    estimatedTokens: briefingTokens,
  }
}

// ===== handover mode =====

async function runHandoverMode(
  prisma: PrismaClient,
  params: CompanionParams,
): Promise<CompanionResult> {
  if (!params.projectId) throw new Error('handover mode requires projectId')
  const project = await prisma.project.findFirst({
    where: { id: params.projectId, tenantId: params.tenantId },
    include: {
      company: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
    },
  })
  if (!project) throw new Error(`Project not found: ${params.projectId}`)

  // 复用快照（fresh 优先，否则兜底触发一次 snapshot 生成）
  let snapshot = (await getEffectiveSnapshot(prisma, project.id)).snapshot
  if (!snapshot) {
    await runSnapshotMode(prisma, {
      mode: 'snapshot',
      tenantId: params.tenantId,
      projectId: project.id,
    })
    snapshot = (await getEffectiveSnapshot(prisma, project.id)).snapshot
  }

  // 最近 90 天关键事件（不含确认态）
  const since = new Date(Date.now() - 90 * 86400000)
  const { items: recentEvents } = await (await import('../../lib/timeline.js')).getTimeline(prisma, {
    tenantId: params.tenantId,
    projectId: project.id,
    startTime: since,
    limit: 50,
  })

  // 待办/闭环统计
  const [openTasks, openClosures, pendingItems] = await Promise.all([
    prisma.task.count({
      where: { projectId: project.id, status: { not: 'COMPLETED' } },
    }),
    prisma.visitClosure.count({
      where: { projectId: project.id, closedAt: null },
    }),
    prisma.aiPendingItem.count({
      where: { tenantId: params.tenantId, projectId: project.id, status: 'pending' },
    }),
  ])

  const handover = {
    project: {
      id: project.id,
      name: project.name,
      milestone: project.milestone,
      healthScore: project.healthScore,
      currentOwner: project.owner?.name ?? null,
      company: project.company?.name ?? null,
      waitingStatus: project.waitingStatus,
      waitingNote: project.waitingNote,
    },
    snapshot: snapshot
      ? {
          generatedAt: snapshot.generatedAt,
          weeklySummary: snapshot.weeklySummary,
          monthlySummary: snapshot.monthlySummary,
          healthScore: snapshot.healthScore,
          riskFlags: snapshot.riskFlags,
          nextActions: snapshot.nextActions,
        }
      : null,
    recentEvents: recentEvents.map((e) => ({
      type: e.eventType,
      time: e.eventTime,
      summary: typeof e.aiInsight === 'string' ? e.aiInsight : '',
    })),
    openCounts: {
      tasks: openTasks,
      closures: openClosures,
      pendingConfirmations: pendingItems,
    },
  }

  return {
    mode: 'handover',
    success: true,
    handover,
  }
}