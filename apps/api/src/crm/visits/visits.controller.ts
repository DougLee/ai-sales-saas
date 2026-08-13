import type { FastifyRequest, FastifyReply } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { CreateVisitSchema, UpdateVisitSchema, ListVisitsQuerySchema, LogVisitSchema } from './visits.schema.js'
import { buildOwnerWhere, canAccess } from '../../lib/data-scope.js'
import { recordTimelineEvent } from '../../lib/timeline.js'
import { ActivityEventType } from '../../lib/activity.js'
import { cancelTasksForEntity } from '../tasks/task-cleanup.util.js'
import { initClosure, refreshClosure } from './closure.service.js'
import { runVisitAnalysis } from './visits.analysis.controller.js'

function getPrisma(req: FastifyRequest): PrismaClient {
  return req.tenantPrisma!
}

function getUser(req: FastifyRequest) {
  return req.user as { id: string; tenantId: string; orgId: string; role: string }
}

export async function list(req: FastifyRequest<{ Querystring: Record<string, string> }>, reply: FastifyReply) {
  try {
    const prisma = getPrisma(req)
    const user = getUser(req)
    const query = ListVisitsQuerySchema.parse(req.query)
    const baseWhere: Record<string, unknown> = {}
    if (query.companyId) baseWhere.companyId = query.companyId
    if (query.projectId) baseWhere.projectId = query.projectId
    if (query.leadId) baseWhere.leadId = query.leadId

    const where = await buildOwnerWhere(prisma, user as never, baseWhere)

    const [items, total] = await Promise.all([
      prisma.visit.findMany({
        where,
        include: { project: { select: { name: true } }, company: { select: { id: true, name: true } } },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { visitTime: 'desc' },
      }),
      prisma.visit.count({ where }),
    ])

    reply.send({ success: true, data: { items, total, page: query.page, pageSize: query.pageSize } })
  } catch (err) {
    reply.status(400).send({ success: false, error: (err as Error).message })
  }
}

export async function get(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const prisma = getPrisma(req)
    const user = getUser(req)
    const visit = await prisma.visit.findUnique({
      where: { id: req.params.id },
      include: { project: true },
    })
    if (!visit) return reply.status(404).send({ success: false, error: '拜访记录不存在' })
    const hasAccess = await canAccess(prisma, user as never, visit.ownerId)
    if (!hasAccess) return reply.status(403).send({ success: false, error: '无权查看此拜访记录' })
    reply.send({ success: true, data: visit })
  } catch (err) {
    reply.status(400).send({ success: false, error: (err as Error).message })
  }
}

export async function create(req: FastifyRequest, reply: FastifyReply) {
  try {
    const prisma = getPrisma(req)
    const user = getUser(req)
    const body = CreateVisitSchema.parse(req.body)

    // 若指定 projectId，自动从 project 带出 companyId 并校验一致性
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

    const company = await prisma.company.findFirst({
      where: { id: companyId, tenantId: user.tenantId, deletedAt: null },
    })
    if (!company) {
      return reply.status(400).send({ success: false, error: '关联客户不存在' })
    }

    const visit = await prisma.visit.create({
      data: {
        ...body,
        companyId,
        ownerId: user.id,
        projectId: body.projectId || undefined,
        leadId: body.leadId || undefined,
        visitTime: new Date(body.visitTime),
        nextActionDeadline: body.nextActionDeadline ? new Date(body.nextActionDeadline) : undefined,
        // V6.1 录音合规：标记了告知同意才记录告知时间
        consentAt: body.consentConfirmed ? new Date() : undefined,
        workflowStage: 'DRAFT',
      } as never,
    })

    // V6.1 Phase 3：创建拜访自动初始化闭环记录
    await initClosure(prisma, { visitId: visit.id, projectId: visit.projectId, ownerId: user.id })

    // V6.1 Phase 3 节点1-2：预约后自动触发准备（fail-soft，队列不可用不阻塞创建）
    if (visit.projectId) {
      const { enqueueVisitPreparation } = await import('../../jobs/queue.js')
      await enqueueVisitPreparation({ tenantId: user.tenantId, visitId: visit.id, userId: user.id })
    }

    if (body.projectId) {
      await prisma.project.update({
        where: { id: body.projectId },
        data: { lastVisitTime: visit.visitTime },
      })
    }

    // 若客户状态为 target，自动推进为 following
    if (company.status === 'target') {
      await prisma.company.update({
        where: { id: company.id },
        data: { status: 'following', ownerId: company.ownerId ?? user.id, assignedAt: company.assignedAt ?? new Date() },
      })
    }

    // 记录拜访创建事件
    await recordTimelineEvent(prisma, {
      tenantId: user.tenantId,
      customerId: companyId,
      projectId: visit.projectId || undefined,
      eventType: ActivityEventType.VISIT_CREATED,
      eventData: {
        visitId: visit.id,
        visitTime: visit.visitTime,
        visitType: visit.visitType,
        contactName: visit.contactName,
      },
      sourceType: 'user',
      sourceId: user.id,
      sourceLabel: '创建拜访',
    })

    reply.send({ success: true, data: visit })
  } catch (err) {
    reply.status(400).send({ success: false, error: (err as Error).message })
  }
}

export async function update(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const prisma = getPrisma(req)
    const user = getUser(req)
    const existing = await prisma.visit.findUnique({ where: { id: req.params.id }, select: { ownerId: true } })
    if (!existing) return reply.status(404).send({ success: false, error: '拜访记录不存在' })
    const hasAccess = await canAccess(prisma, user as never, existing.ownerId)
    if (!hasAccess) return reply.status(403).send({ success: false, error: '无权修改此拜访记录' })

    const body = UpdateVisitSchema.parse(req.body)
    const data: Record<string, unknown> = { ...body }
    if (body.visitTime) data.visitTime = new Date(body.visitTime)
    if (body.nextActionDeadline) data.nextActionDeadline = new Date(body.nextActionDeadline)

    const visit = await prisma.visit.update({
      where: { id: req.params.id },
      data,
    })
    reply.send({ success: true, data: visit })
  } catch (err) {
    reply.status(400).send({ success: false, error: (err as Error).message })
  }
}

export async function remove(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const prisma = getPrisma(req)
    const user = getUser(req)
    const existing = await prisma.visit.findUnique({ where: { id: req.params.id }, select: { ownerId: true } })
    if (!existing) return reply.status(404).send({ success: false, error: '拜访记录不存在' })
    const hasAccess = await canAccess(prisma, user as never, existing.ownerId)
    if (!hasAccess) return reply.status(403).send({ success: false, error: '无权删除此拜访记录' })

    await prisma.$transaction(async (tx) => {
      await cancelTasksForEntity(tx, { visitId: req.params.id })
      await tx.visit.delete({ where: { id: req.params.id } })
    })
    reply.send({ success: true })
  } catch (err) {
    reply.status(400).send({ success: false, error: (err as Error).message })
  }
}

/**
 * V6.1 §5.2 节点3-4：拜访记录录入（logVisit）
 * - 三种记录方式（transcript 现场录音 / recap 个人复盘 / meeting 线上会议 / note 备注），录音非必选
 * - 原始记录一律存 rawInput（评分唯一依据），与 AI 扩写 summary 严格分离
 * - 现场录音必须 consentConfirmed=true（PIPL 告知同意，schema 层强校验）
 * - 录入后自动触发 AI 分析（fail-soft：分析失败不阻塞录入本身）
 */
export async function logVisit(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const prisma = getPrisma(req)
    const user = getUser(req)
    const { id } = req.params
    const body = LogVisitSchema.parse(req.body)

    const existing = await prisma.visit.findUnique({ where: { id } })
    if (!existing) return reply.status(404).send({ success: false, error: '拜访记录不存在' })
    const hasAccess = await canAccess(prisma, user as never, existing.ownerId)
    if (!hasAccess) return reply.status(403).send({ success: false, error: '无权操作此拜访记录' })

    const visit = await prisma.visit.update({
      where: { id },
      data: {
        rawInput: body.rawInput,
        rawInputType: body.rawInputType,
        ...(body.audioUrl !== undefined ? { audioUrl: body.audioUrl } : {}),
        ...(body.audioTranscript !== undefined ? { audioTranscript: body.audioTranscript } : {}),
        ...(body.consentConfirmed ? { consentConfirmed: true, consentAt: new Date() } : {}),
        ...(body.nextAction !== undefined ? { nextAction: body.nextAction } : {}),
        ...(body.nextActionDeadline ? { nextActionDeadline: new Date(body.nextActionDeadline) } : {}),
        // 录入完成进入复盘阶段（除非已关闭）
        ...(existing.workflowStage !== 'CLOSED' ? { workflowStage: 'REVIEWING' } : {}),
      } as never,
    })

    await recordTimelineEvent(prisma, {
      tenantId: user.tenantId,
      customerId: visit.companyId || '',
      projectId: visit.projectId || undefined,
      eventType: ActivityEventType.VISIT_UPDATED,
      eventData: { visitId: visit.id, rawInputType: body.rawInputType },
      sourceType: 'user',
      sourceId: user.id,
      sourceLabel: '录入拜访记录',
    })

    // 录入即刷新闭环（has_recording / has_follow_up 节点）
    await refreshClosure(prisma, id, { actorUserId: user.id })

    // 自动触发 AI 分析（fail-soft：LLM 不可用不阻塞录入）
    let analysisStatus: 'ok' | 'failed' | 'skipped' = 'skipped'
    try {
      await runVisitAnalysis(prisma, id, user.id)
      analysisStatus = 'ok'
    } catch (err) {
      analysisStatus = 'failed'
      req.log.warn({ err, visitId: id }, 'auto analysis after logVisit failed (non-blocking)')
    }

    reply.send({ success: true, data: { visit, analysisStatus } })
  } catch (err) {
    reply.status(400).send({ success: false, error: (err as Error).message })
  }
}

const STAGE_ORDER = ['DRAFT', 'PREPARING', 'READY', 'IN_PROGRESS', 'REVIEWING', 'CLOSED']

function canAdvanceStage(from: string | undefined | null, to: string): boolean {
  const fromIdx = STAGE_ORDER.indexOf(from || 'DRAFT')
  const toIdx = STAGE_ORDER.indexOf(to)
  if (fromIdx === -1 || toIdx === -1) return false
  return toIdx >= fromIdx
}

export async function advanceStage(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const prisma = getPrisma(req)
    const user = getUser(req)
    const { id } = req.params
    const { stage } = req.body as { stage?: string }

    if (!stage || !STAGE_ORDER.includes(stage)) {
      return reply.status(400).send({ success: false, error: '无效的目标阶段' })
    }

    const existing = await prisma.visit.findUnique({ where: { id }, select: { ownerId: true, workflowStage: true, projectId: true } })
    if (!existing) return reply.status(404).send({ success: false, error: '拜访记录不存在' })

    const hasAccess = await canAccess(prisma, user as never, existing.ownerId)
    if (!hasAccess) return reply.status(403).send({ success: false, error: '无权操作此拜访记录' })

    if (!canAdvanceStage(existing.workflowStage, stage)) {
      return reply.status(400).send({ success: false, error: `无法从 ${existing.workflowStage} 回退到 ${stage}` })
    }

    const visit = await prisma.visit.update({ where: { id }, data: { workflowStage: stage } })

    // 拜访闭环时记录事件
    if (stage === 'CLOSED') {
      await recordTimelineEvent(prisma, {
        tenantId: user.tenantId,
        customerId: visit.companyId || '',
        projectId: visit.projectId || undefined,
        eventType: ActivityEventType.VISIT_COMPLETED,
        eventData: {
          visitId: visit.id,
          visitTime: visit.visitTime,
          summary: visit.summary,
          contactName: visit.contactName,
        },
        sourceType: 'user',
        sourceId: user.id,
        sourceLabel: '完成拜访',
      })
    }

    reply.send({ success: true, data: visit })
  } catch (err) {
    reply.status(400).send({ success: false, error: (err as Error).message })
  }
}
