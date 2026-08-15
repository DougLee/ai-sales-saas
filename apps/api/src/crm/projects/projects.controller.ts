import type { FastifyRequest, FastifyReply } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { CreateProjectSchema, UpdateProjectSchema, ListProjectsQuerySchema } from './projects.schema.js'
import { buildOwnerWhere, canAccess } from '../../lib/data-scope.js'
import { recordTimelineEvent, getTimeline } from '../../lib/timeline.js'
import { ActivityEventType } from '../../lib/activity.js'
import { validateMilestoneAdvance, loadMilestoneGates, MILESTONE_LABELS } from '../../milestone-gate/index.js'
import { aiReadinessCheck, type AiReadiness } from '../../milestone-gate/readiness-check.js'
import { cancelTasksForEntity } from '../tasks/task-cleanup.util.js'
import { computeProjectDerivation, evidenceCountsByProject } from './projects.derivation.service.js'

function getPrisma(req: FastifyRequest): PrismaClient {
  return req.tenantPrisma!
}

function getUser(req: FastifyRequest) {
  return req.user as { id: string; tenantId: string; orgId: string; role: string }
}

const VALID_PROJECT_TRANSITIONS: Record<string, string[]> = {
  following: ['stale', 'won', 'lost'],
  stale: ['following', 'won', 'lost'],
  // ADR-0004 决策 8：赢单/流失可重新激活（lost 复活在销售现实常见）
  won: ['following'],
  lost: ['following'],
}

function canTransitionProjectStatus(from: string, to: string): boolean {
  return VALID_PROJECT_TRANSITIONS[from]?.includes(to) ?? false
}

export async function list(req: FastifyRequest<{ Querystring: Record<string, string> }>, reply: FastifyReply) {
  try {
    const prisma = getPrisma(req)
    const user = getUser(req)
    const query = ListProjectsQuerySchema.parse(req.query)
    const baseWhere: Record<string, unknown> = {}
    if (query.milestone != null) baseWhere.milestone = query.milestone
    if (query.urgency) baseWhere.urgency = query.urgency
    if (query.search) {
      baseWhere.OR = [
        { name: { contains: query.search } },
        { company: { name: { contains: query.search } } },
      ]
    }

    const where = await buildOwnerWhere(prisma, user as never, baseWhere)

    const whereWithSoftDelete = { ...where, deletedAt: null }

    const [items, total] = await Promise.all([
      prisma.project.findMany({
        where: whereWithSoftDelete,
        include: {
          company: true,
          visits: { take: 3, orderBy: { visitTime: 'desc' } },
          tasks: { where: { status: { not: 'COMPLETED' } }, take: 3 },
        },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.project.count({ where: whereWithSoftDelete }),
    ])

    // ADR-0003 决策 2：附带推导字段（停滞/等待/决策链/证据链/下一步/幻觉/可信度）
    const evidenceMap = await evidenceCountsByProject(prisma, user.tenantId, items.map((p) => p.id))
    const itemsWithDerivation = items.map((p) => ({
      ...p,
      derivation: computeProjectDerivation(p, evidenceMap.get(p.id) || 0),
    }))

    reply.send({ success: true, data: { items: itemsWithDerivation, total, page: query.page, pageSize: query.pageSize } })
  } catch (err) {
    reply.status(400).send({ success: false, error: (err as Error).message })
  }
}

export async function get(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const prisma = getPrisma(req)
    const user = getUser(req)
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: {
        company: true,
        contacts: { include: { contact: true } },
        visits: { take: 20, orderBy: { visitTime: 'desc' } },
        tasks: { where: { status: { not: 'COMPLETED' } }, take: 5 },
      },
    })
    if (!project) return reply.status(404).send({ success: false, error: '商机不存在' })
    const hasAccess = await canAccess(prisma, user as never, project.ownerId)
    if (!hasAccess) return reply.status(403).send({ success: false, error: '无权查看此商机' })

    const health = computeProjectHealthScore({
      humanInfo: project.humanInfo as Record<string, unknown> | null,
      businessInfo: project.businessInfo as Record<string, unknown> | null,
      financeInfo: project.financeInfo as Record<string, unknown> | null,
      milestone: project.milestone,
      decisionMap: project.decisionMap as Record<string, unknown> | null,
      lastVisitTime: project.lastVisitTime,
      visits: project.visits,
      contacts: project.contacts,
      amount: project.amount,
      nextFollowUp: project.nextFollowUp,
    })
    // ADR-0003 决策 2：详情页真假条/锚点条复用推导字段
    const evidenceMap = await evidenceCountsByProject(prisma, user.tenantId, [project.id])
    const derivation = computeProjectDerivation(project, evidenceMap.get(project.id) || 0)

    reply.send({ success: true, data: { ...project, healthScore: health.score, healthRadar: health.radar, derivation } })
  } catch (err) {
    reply.status(400).send({ success: false, error: (err as Error).message })
  }
}

export async function create(req: FastifyRequest, reply: FastifyReply) {
  try {
    const prisma = getPrisma(req)
    const user = getUser(req)
    const body = CreateProjectSchema.parse(req.body)
    const { notes, ...rest } = body
    const data: Record<string, unknown> = { ...rest, ownerId: user.id }
    if (notes) {
      data.humanInfo = { ...(rest.humanInfo || {}), notes }
    }

    // 校验公司存在
    const company = await prisma.company.findFirst({
      where: { id: body.companyId, tenantId: user.tenantId, deletedAt: null },
    })
    if (!company) {
      return reply.status(400).send({ success: false, error: '关联客户不存在' })
    }

    const project = await prisma.project.create({ data: data as never })

    // 若客户状态为 target，则自动推进为 following
    if (company.status === 'target') {
      await prisma.company.update({
        where: { id: company.id },
        data: { status: 'following', ownerId: company.ownerId ?? user.id, assignedAt: company.assignedAt ?? new Date() },
      })
    }

    await recordTimelineEvent(prisma, {
      tenantId: user.tenantId,
      customerId: project.companyId || project.id,
      projectId: project.id,
      eventType: ActivityEventType.PROJECT_CREATED,
      eventData: { name: project.name, milestone: project.milestone },
      sourceType: 'user',
      sourceId: user.id,
      sourceLabel: '创建商机',
    })

    reply.send({ success: true, data: project })
  } catch (err) {
    reply.status(400).send({ success: false, error: (err as Error).message })
  }
}

export async function update(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const prisma = getPrisma(req)
    const user = getUser(req)
    const existing = await prisma.project.findFirst({ where: { id: req.params.id, deletedAt: null }, select: { ownerId: true, companyId: true, milestone: true, name: true, closedAt: true, status: true } })
    if (!existing) return reply.status(404).send({ success: false, error: '商机不存在' })
    const hasAccess = await canAccess(prisma, user as never, existing.ownerId)
    if (!hasAccess) return reply.status(403).send({ success: false, error: '无权修改此商机' })

    const body = UpdateProjectSchema.parse(req.body)

    // 状态机校验
    if (body.status && body.status !== existing.status && !canTransitionProjectStatus(existing.status, body.status)) {
      return reply.status(400).send({ success: false, error: `不允许从「${existing.status}」变更为「${body.status}」` })
    }

    // 输单必须填写原因
    if (body.status === 'lost' && !body.lostInfo && !existing.closedAt) {
      return reply.status(400).send({ success: false, error: '输单时必须填写输单原因' })
    }

    // ADR-0004 决策 4：回退必须填原因（回退往往意味着需求变化/报价被拒，是最该留证据的动作）
    if (body.milestone != null && body.milestone < existing.milestone && !body.backReason?.trim()) {
      return reply.status(400).send({
        success: false,
        error: `里程碑回退（M${existing.milestone} → M${body.milestone}）需要填写原因`,
      })
    }

    // 里程碑推进校验
    if (body.milestone != null && body.milestone !== existing.milestone) {
      const gates = await loadMilestoneGates(prisma, user.tenantId)
      const gateResult = await validateMilestoneAdvance(prisma, req.params.id, existing.milestone, body.milestone, gates)
      if (!gateResult.passed) {
        return reply.status(400).send({
          success: false,
          error: `推进条件不满足：${gateResult.missing.map((m) => m.label).join('、')} 尚未录入`,
          missingFields: gateResult.missing,
        })
      }
    }

    const { notes, backReason, ...rest } = body
    const data: Record<string, unknown> = { ...rest }
    if (notes !== undefined) {
      const current = await prisma.project.findFirst({ where: { id: req.params.id, deletedAt: null }, select: { humanInfo: true } })
      data.humanInfo = { ...(current?.humanInfo as Record<string, unknown> || {}), notes }
    }
    const project = await prisma.project.update({
      where: { id: req.params.id },
      data,
    })

    // 重新激活（ADR-0004 决策 8）：清 closedAt 恢复在途
    if (body.status === 'following' && existing.status !== 'following' && existing.closedAt) {
      await prisma.project.update({ where: { id: project.id }, data: { closedAt: null } })
    }

    // 赢单/输单后同步客户状态与关闭时间
    if ((body.status === 'won' || body.status === 'lost') && existing.status !== body.status) {
      const closeData: Record<string, unknown> = { closedAt: new Date() }
      if (body.status === 'won') {
        closeData.status = 'won'
      }
      await prisma.project.update({ where: { id: project.id }, data: closeData })

      if (existing.companyId && body.status === 'won') {
        await prisma.company.update({
          where: { id: existing.companyId },
          data: { status: 'won' },
        })
      }
    }

    // 记录时间线事件
    if (body.milestone != null && body.milestone !== existing.milestone) {
      await recordTimelineEvent(prisma, {
        tenantId: user.tenantId,
        customerId: existing.companyId || project.id,
        projectId: project.id,
        eventType: ActivityEventType.MILESTONE_GATE_PASSED,
        eventSubtype: `M${existing.milestone} → M${body.milestone}`,
        eventData: { from: existing.milestone, to: body.milestone, name: project.name, ...(backReason ? { backReason } : {}) },
        sourceType: 'user',
        sourceId: user.id,
        sourceLabel: body.milestone < existing.milestone ? '里程碑回退' : '里程碑 gate 校验通过',
      })
      await recordTimelineEvent(prisma, {
        tenantId: user.tenantId,
        customerId: existing.companyId || project.id,
        projectId: project.id,
        eventType: ActivityEventType.MILESTONE_ADVANCED,
        eventSubtype: `M${existing.milestone} → M${body.milestone}`,
        eventData: { from: existing.milestone, to: body.milestone, name: project.name, ...(backReason ? { backReason } : {}) },
        sourceType: 'user',
        sourceId: user.id,
        sourceLabel: body.milestone < existing.milestone ? '里程碑回退' : '里程碑推进',
      })
    }
    if (body.status && body.status !== existing.status) {
      await recordTimelineEvent(prisma, {
        tenantId: user.tenantId,
        customerId: existing.companyId || project.id,
        projectId: project.id,
        eventType: ActivityEventType.PROJECT_CLOSED,
        eventSubtype: `${existing.status} → ${body.status}`,
        eventData: { from: existing.status, to: body.status, name: project.name, lostInfo: body.lostInfo },
        sourceType: 'user',
        sourceId: user.id,
        sourceLabel: body.status === 'won' ? '商机赢单' : body.status === 'lost' ? '商机输单' : '商机状态变更',
      })
    }
    if (body.closedAt != null && !existing.closedAt) {
      await recordTimelineEvent(prisma, {
        tenantId: user.tenantId,
        customerId: existing.companyId || project.id,
        projectId: project.id,
        eventType: ActivityEventType.PROJECT_CLOSED,
        eventData: { name: project.name, closedAt: body.closedAt },
        sourceType: 'user',
        sourceId: user.id,
        sourceLabel: '商机关闭',
      })
    }
    if (body.healthScore != null) {
      await recordTimelineEvent(prisma, {
        tenantId: user.tenantId,
        customerId: existing.companyId || project.id,
        projectId: project.id,
        eventType: ActivityEventType.HEALTH_SCORE_CHANGED,
        eventData: { healthScore: body.healthScore, name: project.name },
        sourceType: 'user',
        sourceId: user.id,
        sourceLabel: '健康度更新',
      })
    }

    // V6.1 §7.1：里程碑推进成功后跑 AI 成熟度诊断（第二双眼睛，不是第二道锁）
    // suggestion='hold' 不阻断推进，由前端弹出《阶段跃迁风险清单》要求显式覆核
    let aiReadiness: AiReadiness | null = null
    if (body.milestone != null && body.milestone !== existing.milestone && body.milestone > existing.milestone) {
      aiReadiness = await aiReadinessCheck(prisma, {
        tenantId: user.tenantId,
        projectId: project.id,
        targetMilestone: body.milestone,
        userId: user.id,
      })
    }

    reply.send({ success: true, data: project, aiReadiness })
  } catch (err) {
    reply.status(400).send({ success: false, error: (err as Error).message })
  }
}

export async function remove(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const prisma = getPrisma(req)
    const user = getUser(req)
    const existing = await prisma.project.findFirst({ where: { id: req.params.id, deletedAt: null }, select: { ownerId: true } })
    if (!existing) return reply.status(404).send({ success: false, error: '商机不存在' })
    const hasAccess = await canAccess(prisma, user as never, existing.ownerId)
    if (!hasAccess) return reply.status(403).send({ success: false, error: '无权删除此商机' })

    await prisma.$transaction(async (tx) => {
      await cancelTasksForEntity(tx, { projectId: req.params.id })
      await tx.project.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } })
    })
    reply.send({ success: true })
  } catch (err) {
    reply.status(400).send({ success: false, error: (err as Error).message })
  }
}

export async function timeline(req: FastifyRequest<{ Params: { id: string }; Querystring: { includePending?: string } }>, reply: FastifyReply) {
  try {
    const prisma = getPrisma(req)
    const user = getUser(req)
    const { id } = req.params

    const project = await prisma.project.findFirst({ where: { id, deletedAt: null }, select: { id: true, ownerId: true } })
    if (!project) return reply.status(404).send({ success: false, error: '商机不存在' })
    const hasAccess = await canAccess(prisma, user as never, project.ownerId)
    if (!hasAccess) return reply.status(403).send({ success: false, error: '无权查看' })

    // V6.1 确认态隔离：默认只返回 confirmed；?includePending=1 显式开启才含待确认/已驳回
    const { items } = await getTimeline(prisma, {
      tenantId: user.tenantId,
      projectId: id,
      limit: 100,
      includePending: req.query.includePending === '1' || req.query.includePending === 'true',
    })

    reply.send({ success: true, data: items })
  } catch (err) {
    reply.status(500).send({ success: false, error: (err as Error).message })
  }
}

export async function pipeline(req: FastifyRequest, reply: FastifyReply) {
  try {
    const prisma = getPrisma(req)
    const user = getUser(req)
    const baseWhere: Record<string, unknown> = { closedAt: null, deletedAt: null }
    const where = await buildOwnerWhere(prisma, user as never, baseWhere)

    const projects = await prisma.project.findMany({
      where,
      include: {
        company: { select: { id: true, name: true } },
        tasks: { where: { status: { not: 'COMPLETED' } }, take: 3, select: { id: true, title: true, deadline: true } },
      },
      orderBy: [{ milestone: 'asc' }, { updatedAt: 'desc' }],
      take: 500,
    })

    const columns = Array.from({ length: MILESTONE_LABELS.length }, (_, milestone) => ({
      milestone,
      name: MILESTONE_LABELS[milestone] ?? `M${milestone}`,
      items: projects.filter((p) => p.milestone === milestone),
    }))

    reply.send({ success: true, data: { columns, total: projects.length } })
  } catch (err) {
    reply.status(500).send({ success: false, error: (err as Error).message })
  }
}

export function computeProjectHealthScore(project: {
  humanInfo?: Record<string, unknown> | null
  businessInfo?: Record<string, unknown> | null
  financeInfo?: Record<string, unknown> | null
  milestone: number
  decisionMap?: Record<string, unknown> | null
  lastVisitTime?: Date | string | null
  visits?: Array<unknown>
  contacts?: Array<unknown>
  amount?: unknown
  nextFollowUp?: Date | string | null
}): { score: number; radar: Record<string, number> } {
  const human = (project.humanInfo as Record<string, string | undefined> | null) || {}
  const business = (project.businessInfo as Record<string, string | undefined> | null) || {}
  const finance = (project.financeInfo as Record<string, string | undefined> | null) || {}

  // 信息完整度（20分）
  let infoScore = 0
  if (human.decisionMaker?.trim()) infoScore += 5
  if (business.requirements?.trim()) infoScore += 5
  if (finance.budget?.trim() || finance.budgetSource?.trim()) infoScore += 5
  if (project.amount != null) infoScore += 5

  // 里程碑进度（20分）
  const milestoneScore = Math.min(20, project.milestone * 2.5)

  // 决策链清晰度（20分）
  const decisionMap = project.decisionMap as Record<string, unknown> | null
  const hasDecisionMap = decisionMap && Object.keys(decisionMap).length > 0
  const decisionScore = hasDecisionMap ? 15 : 5
  const contactCount = project.contacts?.length ?? 0
  const decisionContactScore = contactCount >= 2 ? 5 : contactCount >= 1 ? 3 : 0

  // 拜访频率（20分）
  let visitScore = 0
  const visitCount = project.visits?.length ?? 0
  if (visitCount >= 3) visitScore += 10
  else if (visitCount >= 1) visitScore += 5
  const lastVisit = project.lastVisitTime ? new Date(project.lastVisitTime) : null
  if (lastVisit) {
    const daysSince = Math.floor((Date.now() - lastVisit.getTime()) / (1000 * 60 * 60 * 24))
    if (daysSince <= 7) visitScore += 10
    else if (daysSince <= 14) visitScore += 7
    else if (daysSince <= 30) visitScore += 3
  }
  visitScore = Math.min(20, visitScore)

  // 竞争位置（20分）
  let competitiveScore = 0
  // competitors 可能是字符串（人工录入）或数组（V6.1 AI 确认产物落库）——两种形态都算"已了解竞品"
  const competitorsVal: unknown = business.competitors
  const hasCompetitors = Array.isArray(competitorsVal)
    ? competitorsVal.length > 0
    : typeof competitorsVal === 'string' && competitorsVal.trim().length > 0
  if (hasCompetitors) competitiveScore += 5
  if (business.ourAdvantage?.trim()) competitiveScore += 10
  if (project.nextFollowUp) competitiveScore += 5

  const radar = {
    infoCompleteness: infoScore,
    milestoneProgress: milestoneScore,
    decisionClarity: decisionScore + decisionContactScore,
    visitFrequency: visitScore,
    competitivePosition: competitiveScore,
  }

  const total = Object.values(radar).reduce((a, b) => a + b, 0)
  return { score: Math.min(100, Math.round(total)), radar }
}
