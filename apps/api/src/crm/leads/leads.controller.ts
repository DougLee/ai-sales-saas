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

interface ScoreBreakdown {
  contactCompleteness: number
  needClarity: number
  budgetSignal: number
  decisionChainClarity: number
  bonus: number
  penalty: number
  total: number
  grade: 'A' | 'B' | 'C'
}

export function calculateLeadScore(lead: {
  contactName?: string | null
  contactPhone?: string | null
  contactPosition?: string | null
  contactEmail?: string | null
  humanInfo?: Record<string, unknown> | null
  businessInfo?: Record<string, unknown> | null
  financeInfo?: Record<string, unknown> | null
  source?: string | null
  followUpCount?: number | null
  lastFollowUpAt?: Date | string | null
  createdAt?: Date | string | null
}): ScoreBreakdown {
  // 联系方式完整度（25分）
  let contactCompleteness = 0
  if (lead.contactName) contactCompleteness += 5
  if (lead.contactPhone || lead.contactEmail) contactCompleteness += 10
  if (lead.contactPosition) contactCompleteness += 10
  contactCompleteness = Math.min(25, contactCompleteness)

  // 需求明确度（30分）
  const businessInfo = ((lead.businessInfo as Record<string, string | undefined> | null) || {})
  let needClarity = 0
  if (businessInfo.requirements?.trim()) needClarity += 20
  if (businessInfo.timeline?.trim()) needClarity += 10
  needClarity = Math.min(30, needClarity)

  // 预算信号（25分）
  const financeInfo = ((lead.financeInfo as Record<string, string | undefined> | null) || {})
  let budgetSignal = 0
  if (financeInfo.budget?.trim()) budgetSignal += 20
  else if (financeInfo.budgetSource?.trim()) budgetSignal += 10
  budgetSignal = Math.min(25, budgetSignal)

  // 决策链清晰度（20分）
  const humanInfo = ((lead.humanInfo as Record<string, string | undefined> | null) || {})
  let decisionChainClarity = 0
  if (humanInfo.decisionMaker?.trim()) decisionChainClarity += 15
  if (humanInfo.decisionChain?.trim()) decisionChainClarity += 5
  decisionChainClarity = Math.min(20, decisionChainClarity)

  // 加分项（+10上限）
  let bonus = 0
  if (businessInfo.timeline?.trim()) bonus += 5 // 明确采购时间窗口
  if (lead.source === 'referral') bonus += 5 // 老客户推荐
  bonus = Math.min(10, bonus)

  // 时间衰减：超过 30 天未跟进开始扣分
  let penalty = 0
  const lastFollowUp = lead.lastFollowUpAt ? new Date(lead.lastFollowUpAt) : null
  const createdAt = lead.createdAt ? new Date(lead.createdAt) : null
  const referenceTime = lastFollowUp || createdAt
  if (referenceTime) {
    const daysSince = Math.floor((Date.now() - referenceTime.getTime()) / (1000 * 60 * 60 * 24))
    if (daysSince > 30) {
      penalty += Math.min(15, Math.floor((daysSince - 30) / 7) * 2)
    }
  }

  // 跟进频率奖励
  if ((lead.followUpCount ?? 0) >= 3) {
    bonus += 3
  }

  let total = contactCompleteness + needClarity + budgetSignal + decisionChainClarity + bonus - penalty
  total = Math.max(0, Math.min(100, total))

  const grade: 'A' | 'B' | 'C' = total >= 60 ? 'A' : total >= 40 ? 'B' : 'C'

  return {
    contactCompleteness,
    needClarity,
    budgetSignal,
    decisionChainClarity,
    bonus,
    penalty,
    total,
    grade,
  }
}

export function checkConversionReadiness(lead: {
  score?: number | null
  completenessScore: number
  contactPhone?: string | null
  contactEmail?: string | null
  followUpCount: number
  humanInfo?: Record<string, unknown> | null
  businessInfo?: Record<string, unknown> | null
  financeInfo?: Record<string, unknown> | null
}) {
  const businessInfo = (lead.businessInfo as Record<string, string | undefined> | null) || {}
  const humanInfo = (lead.humanInfo as Record<string, string | undefined> | null) || {}
  const financeInfo = (lead.financeInfo as Record<string, string | undefined> | null) || {}

  const missing: string[] = []

  if ((lead.score ?? 0) < 60 && lead.completenessScore < 60) {
    missing.push('评分或完整度需达到 60 分以上')
  }

  if (!lead.contactPhone && !lead.contactEmail) {
    missing.push('至少需要一个有效联系方式（电话或邮箱）')
  }

  if (!businessInfo.requirements?.trim()) {
    missing.push('需求方向需明确')
  }

  if (lead.followUpCount < 1) {
    missing.push('至少完成一次有效跟进')
  }

  if (!humanInfo.decisionMaker?.trim()) {
    missing.push('需识别决策链中的关键角色')
  }

  if (!financeInfo.budget?.trim() && !financeInfo.budgetSource?.trim()) {
    missing.push('需确认预算信号')
  }

  return { ready: missing.length === 0, missing }
}

export async function list(req: FastifyRequest<{ Querystring: Record<string, string> }>, reply: FastifyReply) {
  const prisma = getPrisma(req)
  const user = getUser(req)
  const query = ListLeadsQuerySchema.parse(req.query)

  const baseWhere: Record<string, unknown> = { deletedAt: null }
  if (query.status) baseWhere.status = query.status
  if (query.grade) baseWhere.grade = query.grade
  if (query.search) {
    baseWhere.OR = [
      { name: { contains: query.search } },
      { contactName: { contains: query.search } },
    ]
  }

  const where = await buildOwnerWhere(prisma, user as never, baseWhere)

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

  reply.send({ success: true, data: { items, total, page: query.page, pageSize: query.pageSize } })
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
