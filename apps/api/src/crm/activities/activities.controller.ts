import type { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { buildOwnerWhere } from '../../lib/data-scope.js'

function getUser(req: FastifyRequest) {
  return req.user as { id: string; tenantId: string; orgId: string; role: string }
}

const ListActivitiesQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
})

/**
 * 列出某个客户（Company）下的 Activity Feed。
 * 按 eventTime 倒序，包含该 customerId 下的所有事件（项目相关事件也会展示）。
 */
export async function listByCustomer(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  try {
    const prisma = req.tenantPrisma!
    const user = getUser(req)
    const { id: customerId } = req.params
    const query = ListActivitiesQuerySchema.parse(req.query)

    // 校验客户存在且在当前租户下
    const customer = await prisma.company.findFirst({
      where: { id: customerId, tenantId: user.tenantId, deletedAt: null },
      select: { id: true, ownerId: true },
    })
    if (!customer) {
      return reply.status(404).send({ success: false, error: '客户不存在' })
    }

    // 数据范围：普通销售只能看自己负责的客户；后续可随数据范围策略调整
    const where = await buildOwnerWhere(
      prisma,
      user as never,
      { tenantId: user.tenantId, customerId },
    )

    // V6.1：待确认/已驳回事件不出现在活动流（确认态隔离）
    ;(where as Record<string, unknown>).factStatus = 'confirmed'

    const [items, total] = await Promise.all([
      prisma.timelineEvent.findMany({
        where,
        orderBy: { eventTime: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          project: { select: { id: true, name: true } },
        },
      }),
      prisma.timelineEvent.count({ where }),
    ])

    reply.send({
      success: true,
      data: { items, total, page: query.page, pageSize: query.pageSize },
    })
  } catch (err) {
    reply.status(400).send({ success: false, error: (err as Error).message })
  }
}

/**
 * 列出某个项目（Project）下的 Activity Feed。
 * 按 eventTime 倒序。
 */
export async function listByProject(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  try {
    const prisma = req.tenantPrisma!
    const user = getUser(req)
    const { id: projectId } = req.params
    const query = ListActivitiesQuerySchema.parse(req.query)

    const project = await prisma.project.findFirst({
      where: { id: projectId, tenantId: user.tenantId, deletedAt: null },
      select: { id: true, ownerId: true, companyId: true },
    })
    if (!project) {
      return reply.status(404).send({ success: false, error: '商机不存在' })
    }

    const where = await buildOwnerWhere(
      prisma,
      user as never,
      { tenantId: user.tenantId, projectId },
    )

    // V6.1：待确认/已驳回事件不出现在活动流（确认态隔离，与 listByCustomer 对齐）
    ;(where as Record<string, unknown>).factStatus = 'confirmed'

    const [items, total] = await Promise.all([
      prisma.timelineEvent.findMany({
        where,
        orderBy: { eventTime: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          project: { select: { id: true, name: true } },
        },
      }),
      prisma.timelineEvent.count({ where }),
    ])

    reply.send({
      success: true,
      data: { items, total, page: query.page, pageSize: query.pageSize },
    })
  } catch (err) {
    reply.status(400).send({ success: false, error: (err as Error).message })
  }
}
