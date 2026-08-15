import type { FastifyRequest, FastifyReply } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import {
  CreateLeadSchema,
  UpdateLeadSchema,
  ListLeadsQuerySchema,
  FollowUpSchema,
  ConvertSchema,
  LoseSchema,
} from './leads.schema.js'
import { buildOwnerWhere, canAccess } from '../../lib/data-scope.js'
import { AppError } from '../../errors/app-error.js'
import { ErrorCode } from '../../errors/error-codes.js'
import { leadAssessmentQueue } from '../../jobs/queue.js'
import { getComponentLogger } from '../../infra/logger.js'
import { recordTimelineEvent } from '../../lib/timeline.js'
import { ActivityEventType } from '../../lib/activity.js'
import { cancelTasksForEntity } from '../tasks/task-cleanup.util.js'
import { calculateLeadScore, checkConversionReadiness } from './leads.scoring.js'
import { computeLeadDerivations } from './leads.derivation.service.js'

// 纯函数已抽至 leads.scoring.ts（避免 controller ↔ derivation 循环依赖）；此处 re-export 保持既有 import 兼容
export { calculateLeadScore, checkConversionReadiness } from './leads.scoring.js'

const logger = getComponentLogger('leads-controller')

function getPrisma(req: FastifyRequest): PrismaClient {
  return req.tenantPrisma!
}

function getUser(req: FastifyRequest) {
  return req.user as { id: string; tenantId: string; orgId?: string; role: string }
}

function isAdminLike(role?: string) {
  return role === 'TENANT_ADMIN' || role === 'SUPER_ADMIN' || role === 'DEPT_HEAD'
}

const VALID_LEAD_TRANSITIONS: Record<string, string[]> = {
  NEW: ['FOLLOWING', 'LOST'],
  FOLLOWING: ['CONVERTED', 'LOST'],
  CONVERTED: [],
  LOST: ['FOLLOWING'],
  PAUSED: ['FOLLOWING', 'LOST'],
}

export function canTransitionLeadStatus(from: string, to: string): boolean {
  return VALID_LEAD_TRANSITIONS[from]?.includes(to) ?? false
}

async function requireLead(
  prisma: PrismaClient,
  user: ReturnType<typeof getUser>,
  leadId: string,
) {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, deletedAt: null } })
  if (!lead) {
    throw new AppError(ErrorCode.NOT_FOUND, '线索不存在', 404)
  }
  const hasAccess = await canAccess(prisma, user as never, lead.ownerId)
  if (!hasAccess) {
    throw new AppError(ErrorCode.AUTHORIZATION_ERROR, '无权操作此线索', 403)
  }
  return lead
}

export async function list(req: FastifyRequest<{ Querystring: Record<string, string> }>, reply: FastifyReply) {
  const prisma = getPrisma(req)
  const user = getUser(req)
  const query = ListLeadsQuerySchema.parse(req.query)

  const baseWhere: Record<string, unknown> = { deletedAt: null }
  if (query.status) baseWhere.status = query.status
  if (query.statusIn) {
    // 逗号分隔多状态（培育中 = NEW,PAUSED）
    const statuses = query.statusIn.split(',').filter((s) => s)
    if (statuses.length > 0) baseWhere.status = { in: statuses }
  }
  if (query.grade) baseWhere.grade = query.grade
  if (query.source) baseWhere.source = query.source
  if (query.search) {
    baseWhere.OR = [
      { name: { contains: query.search } },
      { contactName: { contains: query.search } },
    ]
  }

  const where = await buildOwnerWhere(prisma, user as never, baseWhere)

  // 「可转化」页签：门禁 5/5 是 JS 推导，先取全量再内存过滤分页（线索量为租户级，可接受）
  if (query.ready === 'true') {
    const all = await prisma.lead.findMany({
      where: { ...where, status: 'FOLLOWING' },
      include: { company: { select: { id: true, name: true } } },
    })
    const readyItems = all
      .map((lead) => ({ ...lead, derivation: computeLeadDerivations(lead as never) }))
      .filter((lead) => lead.derivation.gate.passed === 5)
    const start = (query.page - 1) * query.pageSize
    reply.send({
      success: true,
      data: {
        items: readyItems.slice(start, start + query.pageSize),
        total: readyItems.length,
        page: query.page,
        pageSize: query.pageSize,
      },
    })
    return
  }

  const [items, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      include: { company: { select: { id: true, name: true } } },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.lead.count({ where }),
  ])

  // ADR-0002 决策 2：每条附带推导字段（四要素/门禁/7步/老化），前端不再自算
  const itemsWithDerivations = items.map((lead) => ({ ...lead, derivation: computeLeadDerivations(lead as never) }))

  reply.send({ success: true, data: { items: itemsWithDerivations, total, page: query.page, pageSize: query.pageSize } })
}

export async function get(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const prisma = getPrisma(req)
  const user = getUser(req)
  const lead = await requireLead(prisma, user, req.params.id)

  const [followUpsCount, latestFollowUp] = await Promise.all([
    prisma.leadFollowUp.count({ where: { leadId: lead.id } }),
    prisma.leadFollowUp.findFirst({
      where: { leadId: lead.id },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
  ])

  reply.send({
    success: true,
    data: {
      ...lead,
      followUpCount: followUpsCount,
      lastFollowUpAt: latestFollowUp?.createdAt ?? lead.lastFollowUpAt,
    },
  })
}

export async function create(req: FastifyRequest, reply: FastifyReply) {
  const prisma = getPrisma(req)
  const user = getUser(req)
  const body = CreateLeadSchema.parse(req.body)

  // 校验公司存在且可访问
  const company = await prisma.company.findFirst({
    where: { id: body.companyId, tenantId: user.tenantId, deletedAt: null },
  })
  if (!company) {
    throw new AppError(ErrorCode.BAD_REQUEST, '关联客户不存在', 400)
  }

  const lead = await prisma.lead.create({
    data: {
      ...(body as Record<string, unknown>),
      tenantId: user.tenantId,
      ownerId: user.id,
      orgId: user.orgId,
    },
  } as never)

  // ADR-0002 决策 3：保存即自动规则评分（assessedBy='rule'），AI 精评仍手动触发
  const breakdown = calculateLeadScore(lead as never)
  await prisma.lead.update({
    where: { id: lead.id },
    data: { score: breakdown.total, grade: breakdown.grade, assessedAt: new Date(), assessedBy: 'rule' },
  })
  Object.assign(lead, { score: breakdown.total, grade: breakdown.grade })

  // 若客户状态为 target，则自动推进为 following
  if (company.status === 'target') {
    await prisma.company.update({
      where: { id: company.id },
      data: { status: 'following', ownerId: company.ownerId ?? user.id, assignedAt: company.assignedAt ?? new Date() },
    })
  }

  await recordTimelineEvent(prisma, {
    tenantId: user.tenantId,
    customerId: company.id,
    customerType: 'company',
    eventType: ActivityEventType.LEAD_CREATED,
    eventData: { name: lead.name, source: lead.source, grade: lead.grade },
    sourceType: 'user',
    sourceId: user.id,
    sourceLabel: '新建线索',
  })

  reply.send({ success: true, data: lead })
}

export async function update(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const prisma = getPrisma(req)
  const user = getUser(req)
  const existing = await requireLead(prisma, user, req.params.id)

  const body = UpdateLeadSchema.parse(req.body)
  if (body.status && !canTransitionLeadStatus(existing.status, body.status)) {
    throw new AppError(
      ErrorCode.BAD_REQUEST,
      `不允许从「${existing.status}」变更为「${body.status}」`,
      400,
    )
  }

  const lead = await prisma.lead.update({
    where: { id: req.params.id },
    data: body as Record<string, unknown>,
  })

  // ADR-0002 决策 3：人事财字段变更后重算规则分（AI 精评分不覆盖）
  const breakdown = calculateLeadScore(lead as never)
  if (breakdown.total !== lead.score || breakdown.grade !== lead.grade) {
    await prisma.lead.update({
      where: { id: lead.id },
      data: { score: breakdown.total, grade: breakdown.grade, assessedAt: new Date(), assessedBy: 'rule' },
    })
    Object.assign(lead, { score: breakdown.total, grade: breakdown.grade })
  }

  reply.send({ success: true, data: lead })
}

export async function remove(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const prisma = getPrisma(req)
  const user = getUser(req)
  await requireLead(prisma, user, req.params.id)

  await prisma.$transaction(async (tx) => {
    await cancelTasksForEntity(tx, { leadId: req.params.id })
    await tx.lead.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } })
  })
  reply.send({ success: true })
}

export async function followUp(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const prisma = getPrisma(req)
  const user = getUser(req)
  const lead = await requireLead(prisma, user, req.params.id)
  const body = FollowUpSchema.parse(req.body)

  const followUp = await prisma.$transaction(async (tx) => {
    const created = await tx.leadFollowUp.create({
      data: {
        tenantId: user.tenantId,
        orgId: user.orgId,
        ownerId: user.id,
        leadId: lead.id,
        content: body.content,
        channel: body.channel,
        outcome: body.outcome,
        nextAction: body.nextAction,
        nextActionDeadline: body.nextActionDeadline ? new Date(body.nextActionDeadline) : null,
      },
    })

    await tx.lead.update({
      where: { id: lead.id },
      data: {
        followUpCount: { increment: 1 },
        lastFollowUpAt: new Date(),
      },
    })

    if (body.nextAction) {
      await tx.task.create({
        data: {
          tenantId: user.tenantId,
          orgId: user.orgId,
          companyId: lead.companyId,
          ownerId: user.id,
          title: body.nextAction,
          description: `来自线索跟进：${lead.name}\n跟进内容：${body.content}`,
          priority: 'MEDIUM',
          status: 'PENDING',
          source: 'lead_follow_up',
          sourceId: created.id,
          deadline: body.nextActionDeadline ? new Date(body.nextActionDeadline) : null,
        },
      })
    }

    return created
  })

  await recordTimelineEvent(prisma, {
    tenantId: user.tenantId,
    customerId: lead.id,
    customerType: 'lead',
    eventType: ActivityEventType.LEAD_FOLLOW_UP_CREATED,
    eventData: {
      followUpId: followUp.id,
      content: followUp.content,
      channel: followUp.channel,
      outcome: followUp.outcome,
      nextAction: followUp.nextAction,
      nextActionDeadline: followUp.nextActionDeadline,
    },
    sourceType: 'user',
    sourceId: user.id,
    sourceLabel: '线索跟进',
  })

  reply.send({ success: true, data: followUp })
}

export async function followUps(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const prisma = getPrisma(req)
  const user = getUser(req)
  const lead = await requireLead(prisma, user, req.params.id)

  const items = await prisma.leadFollowUp.findMany({
    where: { leadId: lead.id },
    orderBy: { createdAt: 'desc' },
  })

  reply.send({ success: true, data: items })
}

export async function score(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const prisma = getPrisma(req)
  const user = getUser(req)
  const lead = await requireLead(prisma, user, req.params.id)

  const breakdown = calculateLeadScore(lead as never)

  const updated = await prisma.lead.update({
    where: { id: lead.id },
    data: {
      score: breakdown.total,
      grade: breakdown.grade,
      assessedAt: new Date(),
      assessedBy: user.id,
    },
  })

  reply.send({ success: true, data: { lead: updated, breakdown } })
}

export async function assess(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const prisma = getPrisma(req)
  const user = getUser(req)
  const lead = await requireLead(prisma, user, req.params.id)

  const job = await prisma.leadAssessmentJob.create({
    data: {
      tenantId: user.tenantId,
      leadId: lead.id,
      status: 'pending',
    },
  })

  await leadAssessmentQueue.add('assess', {
    tenantId: user.tenantId,
    leadId: lead.id,
    jobId: job.id,
    userId: user.id,
    orgId: user.orgId,
  })

  reply.send({ success: true, data: { jobId: job.id, status: job.status } })
}

export async function getAssessmentJob(
  req: FastifyRequest<{ Params: { id: string; jobId: string } }>,
  reply: FastifyReply,
) {
  const prisma = getPrisma(req)
  const user = getUser(req)
  await requireLead(prisma, user, req.params.id)

  const job = await prisma.leadAssessmentJob.findFirst({
    where: { id: req.params.jobId, leadId: req.params.id },
  })

  if (!job) {
    throw new AppError(ErrorCode.NOT_FOUND, '评估任务不存在', 404)
  }

  reply.send({ success: true, data: job })
}

export async function lose(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const prisma = getPrisma(req)
  const user = getUser(req)
  const lead = await requireLead(prisma, user, req.params.id)
  const body = LoseSchema.parse(req.body)

  if (lead.status === 'CONVERTED') {
    throw new AppError(ErrorCode.BAD_REQUEST, '已转化的线索不能标记为流失', 400)
  }

  const updated = await prisma.lead.update({
    where: { id: lead.id },
    data: {
      status: 'LOST',
      lostReason: body.lostReason,
    },
  })

  // 记录 TimelineEvent
  await recordTimelineEvent(prisma, {
    tenantId: lead.tenantId,
    customerId: lead.id,
    customerType: 'lead',
    eventType: ActivityEventType.LEAD_LOST,
    eventData: { reason: body.lostReason },
    sourceType: 'user_action',
    sourceLabel: '线索流失',
    eventTime: new Date(),
  }).catch((err) => {
    logger.error({ err, leadId: lead.id }, 'Failed to record lead lost timeline event')
  })

  reply.send({ success: true, data: updated })
}

export async function convert(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const prisma = getPrisma(req)
  const user = getUser(req)
  const tenantId = user.tenantId
  const ownerId = user.id

  const lead = await requireLead(prisma, user, req.params.id)
  const body = ConvertSchema.parse(req.body || {})

  if (lead.status === 'CONVERTED') {
    throw new AppError(ErrorCode.BAD_REQUEST, '该线索已转化', 400)
  }
  if (lead.status === 'LOST') {
    throw new AppError(ErrorCode.BAD_REQUEST, '流失线索不能转化', 400)
  }

  const { ready, missing } = checkConversionReadiness(lead as never)
  if (!ready && !(body.force && isAdminLike(user.role))) {
    throw new AppError(
      ErrorCode.BAD_REQUEST,
      '线索尚未满足转化条件',
      400,
      { missing },
    )
  }

  const result = await prisma.$transaction(async (tx) => {
    // 1. 确定客户公司：优先使用线索已关联的公司
    let company = lead.companyId
      ? await tx.company.findFirst({ where: { id: lead.companyId, tenantId, deletedAt: null } })
      : null
    if (!company) {
      company = await tx.company.findFirst({
        where: { tenantId, name: lead.name, deletedAt: null },
      })
    }
    if (!company) {
      company = await tx.company.create({
        data: {
          tenantId,
          name: lead.name,
          industry: lead.industry,
          contactPerson: lead.contactName || undefined,
          contactPhone: lead.contactPhone || undefined,
          ownerId,
          status: 'following',
          assignedAt: new Date(),
        },
      })
    }

    // 2. 创建商机
    const project = await tx.project.create({
      data: {
        tenantId,
        ownerId,
        companyId: company.id,
        sourceLeadId: lead.id,
        name: lead.name,
        industry: lead.industry,
        milestone: 0,
        humanInfo: lead.humanInfo || {},
        businessInfo: lead.businessInfo || {},
        financeInfo: lead.financeInfo || {},
      } as never,
    })

    // 3. 创建联系人并关联到商机
    let contact = null
    if (lead.contactName) {
      contact = await tx.contact.create({
        data: {
          tenantId,
          name: lead.contactName,
          phone: lead.contactPhone || undefined,
          email: lead.contactEmail || undefined,
          position: lead.contactPosition || undefined,
          companyId: company.id,
        },
      })
      await tx.projectContact.create({
        data: {
          projectId: project.id,
          contactId: contact.id,
          role: lead.contactPosition || '联系人',
        },
      })
    }

    // 4. 更新线索状态并绑定公司
    const updatedLead = await tx.lead.update({
      where: { id: lead.id },
      data: {
        status: 'CONVERTED',
        convertedAt: new Date(),
        convertedProjectId: project.id,
        companyId: company.id,
      },
    })

    // 5. 确保客户状态为 following（不覆盖 won）
    if (company.status !== 'won') {
      await tx.company.update({
        where: { id: company.id },
        data: { status: 'following' },
      })
    }

    // 6. 记录 TimelineEvent：线索维度 + 客户/项目维度
    const conversionEventData = {
      projectId: project.id,
      companyId: company.id,
      force: body.force || false,
      forceReason: body.forceReason,
    }

    await recordTimelineEvent(tx as unknown as PrismaClient, {
      tenantId,
      ownerId,
      orgId: lead.orgId || undefined,
      customerId: lead.id,
      customerType: 'lead',
      projectId: project.id,
      eventType: ActivityEventType.LEAD_CONVERTED,
      eventData: conversionEventData,
      sourceType: 'user_action',
      sourceLabel: '线索转化',
      eventTime: new Date(),
    })

    await recordTimelineEvent(tx as unknown as PrismaClient, {
      tenantId,
      ownerId,
      orgId: lead.orgId || undefined,
      customerId: company.id,
      projectId: project.id,
      eventType: ActivityEventType.LEAD_CONVERTED,
      eventData: { ...conversionEventData, leadId: lead.id },
      sourceType: 'user_action',
      sourceLabel: '由线索转化而来',
      eventTime: new Date(),
    })

    return { lead: updatedLead, project, company, contact }
  })

  reply.send({ success: true, data: result })
}

export async function timeline(req: FastifyRequest<{ Params: { id: string }; Querystring: { includePending?: string } }>, reply: FastifyReply) {
  const prisma = getPrisma(req)
  const user = getUser(req)
  const lead = await requireLead(prisma, user, req.params.id)

  // V6.1 确认态隔离：默认只返回 confirmed；?includePending=1 显式开启
  const includePending = req.query.includePending === '1' || req.query.includePending === 'true'
  const items = await prisma.timelineEvent.findMany({
    where: {
      tenantId: lead.tenantId,
      customerId: lead.id,
      customerType: 'lead',
      ...(includePending ? {} : { factStatus: 'confirmed' }),
    },
    orderBy: { eventTime: 'desc' },
  })

  reply.send({ success: true, data: items })
}
