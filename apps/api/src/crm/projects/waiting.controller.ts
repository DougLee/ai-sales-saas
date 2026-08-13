import type { FastifyRequest, FastifyReply } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { canAccess } from '../../lib/data-scope.js'
import { recordTimelineEvent } from '../../lib/timeline.js'
import { ActivityEventType } from '../../lib/activity.js'

/**
 * "等待客户"状态管理（V6.1 §7.2）
 *
 * 六类枚举（Tom 2026-08-08 确认）：
 * - awaiting_tender    等招标公告发布
 * - awaiting_semester  等开学/学期开始
 * - awaiting_budget    等预算批复/立项
 * - awaiting_funding   等财政拨款到位
 * - awaiting_approval  等审批流程（客户内部行政审批）
 * - awaiting_meeting   等会议流程（上会/办公会/例会）
 *
 * 标记后 daily-scan 跳过停滞检测（倒计时暂停）；解除后恢复，并重置基准时间
 * （lastVisitTime 不动，停滞判定看有效跟进，解除时刻视为一次"恢复"重新开始计时
 *  ——通过清掉 isStale 状态 + 写时间轴事件实现可审计）
 */

export const WAITING_STATUSES = {
  awaiting_tender: '等招标公告发布',
  awaiting_semester: '等开学/学期开始',
  awaiting_budget: '等预算批复/立项',
  awaiting_funding: '等财政拨款到位',
  awaiting_approval: '等审批流程',
  awaiting_meeting: '等会议流程',
} as const

export type WaitingStatus = keyof typeof WAITING_STATUSES

const MarkWaitingSchema = z.object({
  waitingStatus: z.enum(Object.keys(WAITING_STATUSES) as [WaitingStatus, ...WaitingStatus[]]),
  note: z.string().max(500).optional(),
})

function getPrisma(req: FastifyRequest): PrismaClient {
  return req.tenantPrisma!
}

function getUser(req: FastifyRequest) {
  return req.user as { id: string; tenantId: string }
}

/** PUT /api/projects/:id/waiting — 标记等待客户（暂停停滞倒计时） */
export async function markWaiting(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const prisma = getPrisma(req)
    const user = getUser(req)
    const { id } = req.params
    const body = MarkWaitingSchema.parse(req.body)

    const project = await prisma.project.findFirst({ where: { id, tenantId: user.tenantId, deletedAt: null } })
    if (!project) return reply.status(404).send({ success: false, error: '商机不存在' })
    const hasAccess = await canAccess(prisma, user as never, project.ownerId)
    if (!hasAccess) return reply.status(403).send({ success: false, error: '无权操作此商机' })

    const updated = await prisma.project.update({
      where: { id },
      data: {
        waitingStatus: body.waitingStatus,
        // 等待期间不应处于停滞态
        isStale: false,
        staleSince: null,
        staleReason: null,
      },
    })

    await recordTimelineEvent(prisma, {
      tenantId: user.tenantId,
      customerId: project.companyId || '',
      projectId: id,
      eventType: ActivityEventType.PROJECT_WAITING_MARKED,
      eventData: {
        waitingStatus: body.waitingStatus,
        waitingLabel: WAITING_STATUSES[body.waitingStatus],
        note: body.note,
      },
      sourceType: 'user',
      sourceId: user.id,
      sourceLabel: '标记等待客户',
    })

    reply.send({ success: true, data: updated })
  } catch (err) {
    reply.status(400).send({ success: false, error: (err as Error).message })
  }
}

/** DELETE /api/projects/:id/waiting — 解除等待（恢复停滞倒计时） */
export async function clearWaiting(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const prisma = getPrisma(req)
    const user = getUser(req)
    const { id } = req.params

    const project = await prisma.project.findFirst({ where: { id, tenantId: user.tenantId, deletedAt: null } })
    if (!project) return reply.status(404).send({ success: false, error: '商机不存在' })
    const hasAccess = await canAccess(prisma, user as never, project.ownerId)
    if (!hasAccess) return reply.status(403).send({ success: false, error: '无权操作此商机' })
    if (!project.waitingStatus) return reply.status(400).send({ success: false, error: '该商机不在等待状态' })

    const previousStatus = project.waitingStatus
    const updated = await prisma.project.update({
      where: { id },
      data: { waitingStatus: null },
    })

    await recordTimelineEvent(prisma, {
      tenantId: user.tenantId,
      customerId: project.companyId || '',
      projectId: id,
      eventType: ActivityEventType.PROJECT_WAITING_CLEARED,
      eventData: {
        previousWaitingStatus: previousStatus,
        previousWaitingLabel: WAITING_STATUSES[previousStatus as WaitingStatus] || previousStatus,
      },
      sourceType: 'user',
      sourceId: user.id,
      sourceLabel: '解除等待客户',
    })

    reply.send({ success: true, data: updated })
  } catch (err) {
    reply.status(400).send({ success: false, error: (err as Error).message })
  }
}
