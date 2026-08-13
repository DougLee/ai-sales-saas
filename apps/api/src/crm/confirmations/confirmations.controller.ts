import type { FastifyRequest, FastifyReply } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { resolveItem, batchConfirm } from './confirmations.service.js'

function getPrisma(req: FastifyRequest): PrismaClient {
  return req.tenantPrisma!
}

function getUser(req: FastifyRequest) {
  return req.user as { id: string; tenantId: string }
}

const STATUS_VALUES = ['pending', 'confirmed', 'modified', 'rejected', 'auto', 'revoked'] as const

const ListQuerySchema = z.object({
  visitId: z.string().optional(),
  // 支持逗号分隔多状态（如 status=pending,auto 一次拉齐待确认与已自动录入）
  status: z
    .string()
    .default('pending')
    .transform((s) => s.split(',').map((v) => v.trim()))
    .pipe(z.array(z.enum(STATUS_VALUES)).min(1)),
})

/**
 * GET /api/confirmations — 当前用户的待确认收件箱（V6.1 §5.2 节点4.5）
 *
 * AiPendingItem 无外键关联，这里批量回查 visit(company/project) 与 project，
 * 为每条 item 附上人读上下文 context（客户名/项目名/拜访时间/记录方式），
 * 供收件箱按拜访/项目分组展示。
 */
export async function list(req: FastifyRequest<{ Querystring: Record<string, string> }>, reply: FastifyReply) {
  try {
    const prisma = getPrisma(req)
    const user = getUser(req)
    const query = ListQuerySchema.parse(req.query)

    const items = await prisma.aiPendingItem.findMany({
      where: {
        tenantId: user.tenantId,
        ownerId: user.id,
        status: { in: query.status },
        ...(query.visitId ? { visitId: query.visitId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    })

    const visitIds = [...new Set(items.map((i) => i.visitId).filter((v): v is string => !!v))]
    const visits = visitIds.length
      ? await prisma.visit.findMany({
          where: { tenantId: user.tenantId, id: { in: visitIds } },
          select: {
            id: true,
            visitTime: true,
            visitType: true,
            rawInputType: true,
            contactName: true,
            company: { select: { id: true, name: true } },
            project: { select: { id: true, name: true } },
            relatedLead: { select: { id: true, name: true } },
          },
        })
      : []
    const visitMap = new Map(visits.map((v) => [v.id, v]))

    // 无 visit 上下文的条目，直接从 project 补客户/项目名
    const orphanProjectIds = [
      ...new Set(
        items
          .filter((i) => i.projectId && (!i.visitId || !visitMap.has(i.visitId)))
          .map((i) => i.projectId as string),
      ),
    ]
    const projects = orphanProjectIds.length
      ? await prisma.project.findMany({
          where: { tenantId: user.tenantId, id: { in: orphanProjectIds } },
          select: { id: true, name: true, company: { select: { id: true, name: true } } },
        })
      : []
    const projectMap = new Map(projects.map((p) => [p.id, p]))

    const enriched = items.map((item) => {
      const visit = item.visitId ? visitMap.get(item.visitId) : undefined
      const project = item.projectId ? projectMap.get(item.projectId) : undefined
      return {
        ...item,
        context: {
          companyId: visit?.company?.id ?? project?.company?.id ?? null,
          companyName: visit?.company?.name ?? project?.company?.name ?? null,
          projectName: visit?.project?.name ?? project?.name ?? null,
          leadId: visit?.relatedLead?.id ?? null,
          leadName: visit?.relatedLead?.name ?? null,
          visitTime: visit?.visitTime ?? null,
          visitType: visit?.visitType ?? null,
          rawInputType: visit?.rawInputType ?? null,
          contactName: visit?.contactName ?? null,
        },
      }
    })

    reply.send({ success: true, data: enriched })
  } catch (err) {
    reply.status(400).send({ success: false, error: (err as Error).message })
  }
}

const ResolveSchema = z.object({
  action: z.enum(['confirm', 'modify', 'reject', 'revoke']),
  modifiedData: z.record(z.unknown()).optional(),
})

/**
 * POST /api/confirmations/:id/resolve — 一键确认 / 微调 / 驳回 / 撤销自动录入
 */
export async function resolve(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const prisma = getPrisma(req)
    const user = getUser(req)
    const body = ResolveSchema.parse(req.body)

    const item = await resolveItem(prisma, {
      itemId: req.params.id,
      action: body.action,
      modifiedData: body.modifiedData,
      userId: user.id,
      tenantId: user.tenantId,
    })
    reply.send({ success: true, data: item })
  } catch (err) {
    const msg = (err as Error).message
    if (msg === '待确认项不存在') return reply.status(404).send({ success: false, error: msg })
    if (msg === '无权处理他人的待确认项') return reply.status(403).send({ success: false, error: msg })
    reply.status(400).send({ success: false, error: msg })
  }
}

const BatchSchema = z
  .object({
    visitId: z.string().min(1).optional(),
    itemIds: z.array(z.string().min(1)).min(1).max(200).optional(),
  })
  .refine((v) => v.visitId || (v.itemIds && v.itemIds.length > 0), { message: 'visitId 或 itemIds 必填其一' })

/**
 * POST /api/confirmations/batch-confirm — 一键确认某次拜访的全部待确认项，
 * 或按 itemIds 整单确认（收件箱按 项目/线索 维度聚合成确认单后，一单可能跨多次拜访）
 */
export async function batch(req: FastifyRequest, reply: FastifyReply) {
  try {
    const prisma = getPrisma(req)
    const user = getUser(req)
    const { visitId, itemIds } = BatchSchema.parse(req.body)

    const result = await batchConfirm(prisma, { visitId, itemIds, userId: user.id, tenantId: user.tenantId })
    reply.send({ success: true, data: result })
  } catch (err) {
    reply.status(400).send({ success: false, error: (err as Error).message })
  }
}
