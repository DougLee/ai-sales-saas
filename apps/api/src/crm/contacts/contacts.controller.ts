import type { FastifyRequest, FastifyReply } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { isValidPhone, isValidEmail, PHONE_ERROR_MESSAGE, EMAIL_ERROR_MESSAGE } from '@ai-sales/shared'
import { recordTimelineEvent } from '../../lib/timeline.js'
import { ActivityEventType } from '../../lib/activity.js'

const ContactBodySchema = z.object({
  name: z.string().min(1),
  position: z.string().optional(),
  department: z.string().optional(),
  companyId: z.string().min(1),
  phone: z.string().optional().refine(isValidPhone, { message: PHONE_ERROR_MESSAGE }),
  email: z.string().optional().refine(isValidEmail, { message: EMAIL_ERROR_MESSAGE }),
  wechat: z.string().optional(),
  decisionRole: z.enum(['COACH', 'EVALUATOR', 'DECISION_MAKER', 'USER', 'GATEKEEPER']).optional(),
  roleConfidence: z.string().optional(),
  personalMotive: z.string().optional(),
  roiConcern: z.string().optional(),
  riskConcern: z.string().optional(),
  pressurePoints: z.string().optional(),
  howToReach: z.string().optional(),
  howToPersuade: z.string().optional(),
})

function getPrisma(req: FastifyRequest): PrismaClient {
  return req.tenantPrisma!
}

function getUser(req: FastifyRequest) {
  return req.user as { tenantId: string; id: string; orgId: string; role: string }
}

export async function list(req: FastifyRequest, reply: FastifyReply) {
  try {
    const prisma = getPrisma(req)
    const user = getUser(req)
    const { search, company } = req.query as { search?: string; company?: string }
    const where: Record<string, unknown> = { tenantId: user.tenantId }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { email: { contains: search, mode: 'insensitive' } },
        { company: { name: { contains: search, mode: 'insensitive' } } },
      ]
    }

    if (company) {
      where.company = { name: { contains: company, mode: 'insensitive' } }
    }

    const items = await prisma.contact.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 100,
      include: { company: { select: { id: true, name: true } } },
    })
    reply.send({ success: true, items })
  } catch (err) {
    reply.status(500).send({ success: false, error: (err as Error).message })
  }
}

// P1：详情独立查询端点（前端详情抽屉不再用列表快照）
export async function get(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const prisma = getPrisma(req)
    const user = getUser(req)
    const item = await prisma.contact.findFirst({
      where: { id: req.params.id, tenantId: user.tenantId },
      include: { company: { select: { id: true, name: true } } },
    })
    if (!item) return reply.status(404).send({ success: false, error: '联系人不存在' })
    reply.send({ success: true, data: item })
  } catch (err) {
    reply.status(500).send({ success: false, error: (err as Error).message })
  }
}

export async function create(req: FastifyRequest, reply: FastifyReply) {
  try {
    const prisma = getPrisma(req)
    const user = getUser(req)
    const body = ContactBodySchema.parse(req.body)

    const company = await prisma.company.findFirst({
      where: { id: body.companyId, tenantId: user.tenantId, deletedAt: null },
    })
    if (!company) {
      return reply.status(400).send({ success: false, error: '关联客户不存在' })
    }

    const item = await prisma.contact.create({
      data: { ...body, tenantId: user.tenantId } as never,
      include: { company: { select: { id: true, name: true } } },
    })

    await recordTimelineEvent(prisma, {
      tenantId: user.tenantId,
      customerId: item.companyId || '',
      eventType: ActivityEventType.CONTACT_CREATED,
      eventData: { name: item.name, position: item.position, decisionRole: item.decisionRole },
      sourceType: 'user',
      sourceId: user.id,
      sourceLabel: '新增联系人',
    })

    reply.send({ success: true, item })
  } catch (err) {
    reply.status(400).send({ success: false, error: (err as Error).message })
  }
}

export async function update(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const prisma = getPrisma(req)
    const user = getUser(req)
    const { id } = req.params
    const body = ContactBodySchema.partial().parse(req.body)
    const item = await prisma.contact.update({
      where: { id },
      data: body as never,
      include: { company: { select: { id: true, name: true } } },
    })

    if (item.companyId) {
      await recordTimelineEvent(prisma, {
        tenantId: user.tenantId,
        customerId: item.companyId,
        eventType: ActivityEventType.CONTACT_UPDATED,
        eventData: { name: item.name, position: item.position, decisionRole: item.decisionRole },
        sourceType: 'user',
        sourceId: user.id,
        sourceLabel: '更新联系人',
      })
    }

    reply.send({ success: true, item })
  } catch (err) {
    reply.status(400).send({ success: false, error: (err as Error).message })
  }
}

export async function remove(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const prisma = getPrisma(req)
    const { id } = req.params
    await prisma.contact.delete({ where: { id } })
    reply.send({ success: true })
  } catch (err) {
    reply.status(400).send({ success: false, error: (err as Error).message })
  }
}
