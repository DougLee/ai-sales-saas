import type { PrismaClient } from '@prisma/client'
import { logger } from '../infra/logger.js'

/**
 * V6.1 确认态：AI 提取的事实性内容默认待确认，人工确认后才作为事实被下游消费
 * （快照、评分、赢单预测、停滞判定一律只读 confirmed）
 */
export type FactStatus = 'confirmed' | 'pending_confirmation' | 'rejected'

interface TimelineEventInput {
  tenantId: string
  ownerId?: string
  orgId?: string
  customerId: string
  customerType?: string
  projectId?: string
  eventType: string
  eventSubtype?: string
  eventData?: Record<string, unknown>
  aiInsight?: string
  factStatus?: FactStatus
  sourceType: string
  sourceId?: string
  sourceLabel?: string
  eventTime?: Date
}

/**
 * 记录时间轴事件（全系统统一写入入口）
 *
 * V6.1 规则：
 * - 凡 eventData 中含事实性断言（需求、预算、任务、竞品动向）的事件，
 *   调用方必须传 factStatus: 'pending_confirmation'（见《智能体数据写入治理规范》§三）
 * - 孤儿事件（customer/project 不存在）拒绝写入并记 error 日志，返回 null
 *   （fail-soft：不抛出，避免打断调用方主流程；完整性由确认态与审计兜底）
 */
export async function recordTimelineEvent(
  prisma: PrismaClient,
  input: TimelineEventInput,
) {
  try {
    // 多态关联存在性校验（customer_id+customer_type 无外键约束，service 层兜底）
    if (input.customerType === 'target_account') {
      // target_account 模型当前不存在，预留分支；出现即拒绝
      logger.warn({ customerId: input.customerId }, 'timeline: unsupported customerType target_account')
      return null
    }
    const customer = await prisma.company.findFirst({
      where: { id: input.customerId, tenantId: input.tenantId },
      select: { id: true },
    })
    if (!customer) {
      logger.error(
        { customerId: input.customerId, tenantId: input.tenantId, eventType: input.eventType },
        'timeline: orphan event rejected (customer not found)',
      )
      return null
    }
    if (input.projectId) {
      const project = await prisma.project.findFirst({
        where: { id: input.projectId, tenantId: input.tenantId },
        select: { id: true },
      })
      if (!project) {
        logger.error(
          { projectId: input.projectId, tenantId: input.tenantId, eventType: input.eventType },
          'timeline: orphan event rejected (project not found)',
        )
        return null
      }
    }

    return await prisma.timelineEvent.create({
      data: {
        tenantId: input.tenantId,
        ownerId: input.ownerId,
        orgId: input.orgId,
        customerId: input.customerId,
        customerType: input.customerType || 'company',
        projectId: input.projectId,
        eventType: input.eventType,
        eventSubtype: input.eventSubtype,
        eventData: (input.eventData || {}) as never,
        aiInsight: input.aiInsight,
        factStatus: input.factStatus || 'confirmed',
        confirmedBy: input.factStatus === 'confirmed' || !input.factStatus ? input.ownerId : undefined,
        confirmedAt: input.factStatus === 'confirmed' || !input.factStatus ? new Date() : undefined,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        sourceLabel: input.sourceLabel,
        eventTime: input.eventTime || new Date(),
      },
    })
  } catch (err) {
    logger.error({ err, eventType: input.eventType, tenantId: input.tenantId }, 'Failed to record timeline event')
    return null
  }
}

interface GetTimelineOptions {
  tenantId: string
  customerId?: string
  projectId?: string
  eventTypes?: string[]
  startTime?: Date
  endTime?: Date
  limit?: number
  offset?: number
  /** 默认 false：待确认/已驳回事件不出现在查询结果中 */
  includePending?: boolean
}

/**
 * 获取客户/项目时间轴（默认只返回已确认事件 —— V6.1 确认态隔离）
 */
export async function getTimeline(prisma: PrismaClient, opts: GetTimelineOptions) {
  const where: Record<string, unknown> = { tenantId: opts.tenantId }
  if (opts.customerId) where.customerId = opts.customerId
  if (opts.projectId) where.projectId = opts.projectId
  if (opts.eventTypes?.length) where.eventType = { in: opts.eventTypes }
  if (!opts.includePending) where.factStatus = 'confirmed'
  if (opts.startTime || opts.endTime) {
    where.eventTime = {
      ...(opts.startTime ? { gte: opts.startTime } : {}),
      ...(opts.endTime ? { lte: opts.endTime } : {}),
    }
  }

  const limit = opts.limit ?? 50
  const offset = opts.offset ?? 0

  const [items, total] = await Promise.all([
    prisma.timelineEvent.findMany({
      where: where as never,
      orderBy: { eventTime: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.timelineEvent.count({ where: where as never }),
  ])

  return { items, total, hasMore: offset + items.length < total }
}

/**
 * 获取某时间点之后的增量已确认事件（V6.1 快照增量更新的水位线查询）
 */
export async function getEventsSince(
  prisma: PrismaClient,
  opts: { tenantId: string; projectId: string; since: Date; limit?: number },
) {
  return prisma.timelineEvent.findMany({
    where: {
      tenantId: opts.tenantId,
      projectId: opts.projectId,
      eventTime: { gt: opts.since },
      factStatus: 'confirmed',
    },
    orderBy: { eventTime: 'asc' },
    take: opts.limit ?? 100,
  })
}

/**
 * 客户最近 N 天关键事件摘要（仅已确认事件，陪伴智能体上下文用）
 */
export async function getRecentSummary(
  prisma: PrismaClient,
  opts: { tenantId: string; customerId: string; days?: number },
) {
  const days = opts.days ?? 7
  const since = new Date(Date.now() - days * 86400000)
  const events = await prisma.timelineEvent.findMany({
    where: {
      tenantId: opts.tenantId,
      customerId: opts.customerId,
      eventTime: { gte: since },
      factStatus: 'confirmed',
    },
    orderBy: { eventTime: 'desc' },
  })

  return {
    totalEvents: events.length,
    visitCount: events.filter((e) => e.eventType === 'visit.completed').length,
    aiInsightCount: events.filter((e) => e.eventType.startsWith('ai.')).length,
    riskAlerts: events.filter((e) => e.eventType === 'ai.risk_alert'),
    latestMilestone: events.find((e) => e.eventType === 'milestone.advanced'),
    lastContact: events.find((e) => e.eventType === 'visit.completed')?.eventTime,
  }
}
