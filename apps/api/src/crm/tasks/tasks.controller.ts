import type { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { buildOwnerWhere, canAccess } from '../../lib/data-scope.js'
import { recordTimelineEvent } from '../../lib/timeline.js'
import { ActivityEventType } from '../../lib/activity.js'

const TaskBodySchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  companyId: z.string().min(1).optional(),
  projectId: z.string().optional(),
  deadline: z.string().optional(),
})

function getUser(req: FastifyRequest) {
  return req.user as { id: string; tenantId: string; orgId: string; role: string }
}

export async function list(req: FastifyRequest, reply: FastifyReply) {
  try {
    const prisma = req.tenantPrisma!
    const user = getUser(req)
    const { status, projectId, companyId, priority, deadlineFrom, deadlineTo, isOverdue } = req.query as {
      status?: string
      projectId?: string
      companyId?: string
      priority?: string
      deadlineFrom?: string
      deadlineTo?: string
      isOverdue?: string
    }
    const baseWhere: Record<string, unknown> = {}
    if (status) baseWhere.status = status
    if (projectId) baseWhere.projectId = projectId
    if (companyId) baseWhere.companyId = companyId
    if (priority) baseWhere.priority = priority

    const deadlineFilter: Record<string, unknown> = {}
    if (deadlineFrom) deadlineFilter.gte = new Date(deadlineFrom)
    if (deadlineTo) deadlineFilter.lte = new Date(deadlineTo)
    if (Object.keys(deadlineFilter).length > 0) {
      baseWhere.deadline = deadlineFilter
    }

    if (isOverdue === 'true') {
      baseWhere.deadline = { lt: new Date() }
      if (!status) baseWhere.status = { not: 'COMPLETED' }
    }

    const where = await buildOwnerWhere(prisma, user as never, baseWhere)
    const items = await prisma.task.findMany({
      where,
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
      // V6.2：任务列表按 客户/项目 分组展示，需要带出名
      include: {
        project: { select: { id: true, name: true, company: { select: { id: true, name: true } } } },
        company: { select: { id: true, name: true } },
      },
    })
    reply.send({ success: true, items })
  } catch (err) {
    reply.status(500).send({ success: false, error: (err as Error).message })
  }
}

// P1：详情独立查询端点（前端详情抽屉不再用列表快照）
export async function get(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const prisma = req.tenantPrisma!
    const user = getUser(req)
    const item = await prisma.task.findUnique({
      where: { id: req.params.id },
      include: {
        project: { select: { id: true, name: true, company: { select: { id: true, name: true } } } },
        company: { select: { id: true, name: true } },
      },
    })
    if (!item) return reply.status(404).send({ success: false, error: '任务不存在' })
    const hasAccess = await canAccess(prisma, user as never, item.ownerId)
    if (!hasAccess) return reply.status(403).send({ success: false, error: '无权查看此任务' })
    reply.send({ success: true, data: item })
  } catch (err) {
    reply.status(500).send({ success: false, error: (err as Error).message })
  }
}

export async function create(req: FastifyRequest, reply: FastifyReply) {
  try {
    const prisma = req.tenantPrisma!
    const user = getUser(req)
    const body = TaskBodySchema.parse(req.body)

    // 若指定 projectId，自动从 project 带出 companyId
    let companyId = body.companyId
    if (body.projectId) {
      const project = await prisma.project.findFirst({
        where: { id: body.projectId, tenantId: user.tenantId, deletedAt: null },
        select: { companyId: true },
      })
      if (!project) {
        return reply.status(400).send({ success: false, error: '关联商机不存在' })
      }
      if (project.companyId && project.companyId !== companyId) {
        companyId = project.companyId
      }
    }

    if (!companyId) {
      return reply.status(400).send({ success: false, error: '必须关联客户或商机' })
    }

    const item = await prisma.task.create({
      data: {
        ...body,
        companyId,
        ownerId: user.id,
        deadline: body.deadline ? new Date(body.deadline) : undefined,
      } as never,
    })

    await recordTimelineEvent(prisma, {
      tenantId: user.tenantId,
      customerId: companyId,
      projectId: item.projectId || undefined,
      eventType: ActivityEventType.TASK_CREATED,
      eventData: {
        taskId: item.id,
        title: item.title,
        priority: item.priority,
        deadline: item.deadline,
      },
      sourceType: 'user',
      sourceId: user.id,
      sourceLabel: '创建待办',
    })

    reply.send({ success: true, item })
  } catch (err) {
    reply.status(400).send({ success: false, error: (err as Error).message })
  }
}

export async function update(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const prisma = req.tenantPrisma!
    const user = getUser(req)
    const { id } = req.params
    const existing = await prisma.task.findUnique({ where: { id }, select: { ownerId: true, deadline: true } })
    if (!existing) return reply.status(404).send({ success: false, error: '任务不存在' })
    const hasAccess = await canAccess(prisma, user as never, existing.ownerId)
    if (!hasAccess) return reply.status(403).send({ success: false, error: '无权修改此任务' })

    const body = TaskBodySchema.partial().parse(req.body)
    const data: Record<string, unknown> = { ...body }
    if (body.deadline) data.deadline = new Date(body.deadline)
    const item = await prisma.task.update({ where: { id }, data })

    // 截止时间变更记录
    if (body.deadline && String(body.deadline) !== String(existing.deadline?.toISOString?.())) {
      await recordTimelineEvent(prisma, {
        tenantId: user.tenantId,
        customerId: item.companyId || '',
        projectId: item.projectId || undefined,
        eventType: ActivityEventType.TASK_DEADLINE_CHANGED,
        eventData: {
          taskId: item.id,
          title: item.title,
          oldDeadline: existing.deadline,
          newDeadline: item.deadline,
        },
        sourceType: 'user',
        sourceId: user.id,
        sourceLabel: '待办截止时间变更',
      })
    }

    reply.send({ success: true, item })
  } catch (err) {
    reply.status(400).send({ success: false, error: (err as Error).message })
  }
}

export async function complete(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const prisma = req.tenantPrisma!
    const user = getUser(req)
    const { id } = req.params
    const existing = await prisma.task.findUnique({ where: { id }, select: { ownerId: true } })
    if (!existing) return reply.status(404).send({ success: false, error: '任务不存在' })
    const hasAccess = await canAccess(prisma, user as never, existing.ownerId)
    if (!hasAccess) return reply.status(403).send({ success: false, error: '无权操作此任务' })

    const item = await prisma.task.update({
      where: { id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    })

    await recordTimelineEvent(prisma, {
      tenantId: user.tenantId,
      customerId: item.companyId || '',
      projectId: item.projectId || undefined,
      eventType: ActivityEventType.TASK_COMPLETED,
      eventData: {
        taskId: item.id,
        title: item.title,
      },
      sourceType: 'user',
      sourceId: user.id,
      sourceLabel: '完成待办',
    })

    reply.send({ success: true, item })
  } catch (err) {
    reply.status(400).send({ success: false, error: (err as Error).message })
  }
}

export async function remove(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const prisma = req.tenantPrisma!
    const user = getUser(req)
    const { id } = req.params
    const existing = await prisma.task.findUnique({ where: { id }, select: { ownerId: true } })
    if (!existing) return reply.status(404).send({ success: false, error: '任务不存在' })
    const hasAccess = await canAccess(prisma, user as never, existing.ownerId)
    if (!hasAccess) return reply.status(403).send({ success: false, error: '无权删除此任务' })

    await prisma.task.delete({ where: { id } })
    reply.send({ success: true })
  } catch (err) {
    reply.status(400).send({ success: false, error: (err as Error).message })
  }
}
