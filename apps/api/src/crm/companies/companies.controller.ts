import type { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { isValidPhone, PHONE_ERROR_MESSAGE } from '@ai-sales/shared'
import { buildOwnerWhere, canAccess } from '../../lib/data-scope.js'
import { recordTimelineEvent } from '../../lib/timeline.js'
import { ActivityEventType } from '../../lib/activity.js'
import { cancelTasksForEntity } from '../tasks/task-cleanup.util.js'
import {
  computeCompanyCompleteness,
  detectDuplicateCompanies,
  getMissingFieldLabels,
} from '../data-quality/data-quality.service.js'
import { recordFieldChanges } from '../change-history/change-history.service.js'
import { findOrCreateContact } from '../../lib/entity-services/contact.service.js'

/**
 * 客户表单的"联系人/电话"平铺字段 → 同步沉淀为联系人档案（走 findOrCreateContact 防裂变）。
 * 不修这个的话：用户明明填了联系人，完整度/360 风险/决策链却只认 Contact 档案，等于没填。
 * fail-soft：同步失败不阻断客户保存。
 */
async function syncContactFromCompany(
  prisma: unknown,
  tenantId: string,
  companyId: string,
  contactPerson?: string | null,
  contactPhone?: string | null,
) {
  const name = contactPerson?.trim()
  if (!name) return
  try {
    await findOrCreateContact(prisma as never, {
      tenantId,
      name,
      companyId,
      phone: contactPhone?.trim() || undefined,
      aiTagged: false, // 人工录入
    })
  } catch (err) {
    console.error('[companies] 同步联系人档案失败:', (err as Error).message)
  }
}

const CompanyStatusEnum = z.enum(['target', 'following', 'won', 'lost'])

const CompanyBodySchema = z.object({
  name: z.string().min(1),
  industry: z.string().optional(),
  scale: z.string().optional(),
  region: z.string().optional(),
  level: z.string().optional(),
  address: z.string().optional(),
  website: z.string().optional(),
  contactPerson: z.string().optional(),
  contactPhone: z.string().optional().refine(isValidPhone, { message: PHONE_ERROR_MESSAGE }),
  notes: z.string().optional(),
  status: CompanyStatusEnum.optional(),
  source: z.string().optional(),
  dataConfidence: z.enum(['high', 'medium', 'low']).optional(),
})

const UpdateStatusSchema = z.object({
  status: CompanyStatusEnum,
  reason: z.string().optional(),
})

const VALID_COMPANY_TRANSITIONS: Record<string, string[]> = {
  target: ['following'],
  following: ['won', 'lost'],
  won: ['lost', 'following'],
  lost: ['target', 'following'],
}

export function canTransitionCompanyStatus(from: string, to: string): boolean {
  return VALID_COMPANY_TRANSITIONS[from]?.includes(to) ?? false
}

function getUser(req: FastifyRequest) {
  return req.user as { id: string; tenantId: string; orgId: string; role: string; email: string }
}

export async function list(req: FastifyRequest, reply: FastifyReply) {
  try {
    const prisma = req.tenantPrisma!
    const user = getUser(req)
    const { search, pool } = req.query as { search?: string; pool?: string }

    // 30天自动释放：assignedAt 超过30天且无活跃商机的客户回公海池
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      const activeProjects = await prisma.project.findMany({
        where: { companyId: { not: null }, closedAt: null, deletedAt: null },
        select: { companyId: true },
        distinct: ['companyId'],
      })
      const activeCompanyIds = activeProjects.map((p) => p.companyId).filter(Boolean) as string[]
      await prisma.company.updateMany({
        where: {
          tenantId: user.tenantId,
          ownerId: { not: null },
          assignedAt: { lt: thirtyDaysAgo },
          id: { notIn: activeCompanyIds.length > 0 ? activeCompanyIds : ['__none__'] },
        },
        data: { ownerId: null, assignedAt: null },
      })
    } catch {
      // 自动释放失败不影响列表查询
    }

    const where: Record<string, unknown> = {}
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { region: { contains: search, mode: 'insensitive' } },
      ]
    }

    const { status } = req.query as { status?: string }
    if (status && ['target', 'following', 'won', 'lost'].includes(status)) {
      where.status = status
    }

    // 客户池列表筛选（设计稿 20260813）：行业/等级/地区/来源/负责人
    const { industry, level, region, source, ownerId, page, pageSize } = req.query as {
      industry?: string; level?: string; region?: string; source?: string; ownerId?: string; page?: string; pageSize?: string
    }
    if (industry) where.industry = industry
    if (level) where.level = level
    if (region) where.region = { contains: region, mode: 'insensitive' }
    if (source) where.source = source
    if (ownerId === 'none') where.ownerId = null
    else if (ownerId) where.ownerId = ownerId

    // 公海池筛选
    if (pool === 'open') {
      where.ownerId = null
    } else if (pool === 'mine') {
      where.ownerId = user.id
    }

    // SALES 可见全公司客户名单（用于避免撞单）；DEPT_HEAD / ADMIN 按数据范围过滤
    const finalWhere = user.role === 'SALES'
      ? { ...where, deletedAt: null }
      : await buildOwnerWhere(prisma, user as never, { ...where, deletedAt: null })

    // 分页（设计稿：每页 20/50，上限 100 防全量拉取）
    const take = Math.min(Number(pageSize) || 20, 100)
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take

    // 页签计数（不受筛选影响，仅按数据范围）：状态分布 + 公海池
    const scopeOnlyWhere = user.role === 'SALES'
      ? { deletedAt: null }
      : await buildOwnerWhere(prisma, user as never, { deletedAt: null })
    const [items, total, statusGroups, openPoolCount, allCount] = await Promise.all([
      prisma.company.findMany({
        where: finalWhere,
        orderBy: { updatedAt: 'desc' },
        skip,
        take,
        include: {
          // contacts 计数供客户×联系人合一主档视图（issue #43）：无联系人筛选 + 督导统计的粗筛口径
          _count: { select: { projects: true, leads: true, visits: true, tasks: true, contacts: true } },
          owner: { select: { id: true, name: true } },
        },
      }),
      prisma.company.count({ where: finalWhere }),
      prisma.company.groupBy({ by: ['status'], where: scopeOnlyWhere, _count: { _all: true } }),
      prisma.company.count({ where: { ...scopeOnlyWhere, ownerId: null } }),
      prisma.company.count({ where: scopeOnlyWhere }),
    ])
    const counts: Record<string, number> = { all: allCount, open: openPoolCount }
    for (const g of statusGroups) counts[g.status] = g._count._all
    // P1：返回真实总数（分页后前端不能把当批条数当总数）
    reply.send({ success: true, items, total, counts, page: Math.max(Number(page) || 1, 1), pageSize: take })
  } catch (err) {
    reply.status(500).send({ success: false, error: (err as Error).message })
  }
}

export async function get(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const prisma = req.tenantPrisma!
    const user = getUser(req)
    const { id } = req.params

    const company = await prisma.company.findFirst({ where: { id, deletedAt: null }, include: { owner: { select: { id: true, name: true } } } })
    if (!company) return reply.status(404).send({ success: false, error: '客户不存在' })

    const hasAccess = await canAccess(prisma, user as never, company.ownerId)
    if (!hasAccess) {
      // SALES 非 owner：返回只读摘要，避免撞单即可
      return reply.send({
        success: true,
        data: {
          company: { id: company.id, name: company.name, ownerId: company.ownerId, owner: company.owner },
          projects: [],
          contacts: [],
          visits: [],
          tasks: [],
          _readonly: true,
        },
      })
    }

    const [projects, contacts, visits, tasks] = await Promise.all([
      prisma.project.findMany({
        where: { companyId: id, deletedAt: null },
        orderBy: { updatedAt: 'desc' },
        take: 10,
        select: {
          id: true,
          name: true,
          milestone: true,
          urgency: true,
          healthScore: true,
          amount: true,
          closedAt: true,
          updatedAt: true,
        },
      }),
      prisma.contact.findMany({
        where: { companyId: id, tenantId: user.tenantId },
        orderBy: { updatedAt: 'desc' },
        take: 20,
        select: {
          id: true,
          name: true,
          position: true,
          department: true,
          phone: true,
          email: true,
          decisionRole: true,
          updatedAt: true,
        },
      }),
      prisma.visit.findMany({
        where: { companyId: id },
        orderBy: { visitTime: 'desc' },
        take: 10,
        select: {
          id: true,
          visitTime: true,
          visitType: true,
          summary: true,
          contactName: true,
          project: { select: { name: true } },
        },
      }),
      prisma.task.findMany({
        where: { companyId: id, status: { not: 'COMPLETED' } },
        orderBy: { deadline: 'asc' },
        take: 10,
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          deadline: true,
          project: { select: { name: true } },
        },
      }),
    ])

    const stats = computeCompany360Stats(company, projects, contacts, visits, tasks)
    const risks = computeCompany360Risks(company, projects, contacts, visits, tasks)
    const completeness = computeCompanyCompleteness(company, contacts, projects, visits)

    reply.send({ success: true, data: { company, projects, contacts, visits, tasks, stats, risks, completeness } })
  } catch (err) {
    reply.status(500).send({ success: false, error: (err as Error).message })
  }
}

export async function create(req: FastifyRequest, reply: FastifyReply) {
  try {
    const prisma = req.tenantPrisma!
    const user = getUser(req)
    const body = CompanyBodySchema.parse(req.body)
    const item = await prisma.company.create({
      data: { ...(body as Record<string, unknown>), ownerId: user.id },
    } as never)

    await syncContactFromCompany(prisma, user.tenantId, item.id, body.contactPerson, body.contactPhone)

    await recordTimelineEvent(prisma, {
      tenantId: user.tenantId,
      customerId: item.id,
      eventType: ActivityEventType.COMPANY_CREATED,
      eventData: { name: item.name, industry: item.industry, region: item.region },
      sourceType: 'user',
      sourceId: user.id,
      sourceLabel: '创建客户',
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
    const existing = await prisma.company.findFirst({ where: { id, deletedAt: null } })
    if (!existing) return reply.status(404).send({ success: false, error: '客户不存在' })
    const hasAccess = await canAccess(prisma, user as never, existing.ownerId)
    if (!hasAccess) return reply.status(403).send({ success: false, error: '无权修改此客户' })

    const body = CompanyBodySchema.partial().parse(req.body)
    const item = await prisma.company.update({ where: { id }, data: body as never })

    // 联系人字段被提交过才同步（避免无关字段编辑也触发档案写入）
    if (body.contactPerson !== undefined) {
      await syncContactFromCompany(prisma, user.tenantId, id, body.contactPerson, body.contactPhone)
    }

    await recordFieldChanges(
      prisma,
      user.tenantId,
      'company',
      id,
      existing as Record<string, unknown>,
      item as Record<string, unknown>,
      user.id,
      'manual',
      Object.keys(body),
    )

    reply.send({ success: true, item })
  } catch (err) {
    reply.status(400).send({ success: false, error: (err as Error).message })
  }
}

export async function updateStatus(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const prisma = req.tenantPrisma!
    const user = getUser(req)
    const { id } = req.params
    const existing = await prisma.company.findFirst({ where: { id, deletedAt: null }, select: { ownerId: true, status: true, name: true } })
    if (!existing) return reply.status(404).send({ success: false, error: '客户不存在' })
    const hasAccess = await canAccess(prisma, user as never, existing.ownerId)
    if (!hasAccess) return reply.status(403).send({ success: false, error: '无权修改此客户' })

    const body = UpdateStatusSchema.parse(req.body)
    if (!canTransitionCompanyStatus(existing.status, body.status)) {
      return reply.status(400).send({ success: false, error: `不允许从「${existing.status}」变更为「${body.status}」` })
    }

    const item = await prisma.company.update({ where: { id }, data: { status: body.status } })

    await recordTimelineEvent(prisma, {
      tenantId: user.tenantId,
      customerId: item.id,
      eventType: ActivityEventType.COMPANY_STATUS_CHANGED,
      eventData: { name: item.name, from: existing.status, to: body.status, reason: body.reason },
      sourceType: 'user',
      sourceId: user.id,
      sourceLabel: '客户状态变更',
    })

    reply.send({ success: true, item })
  } catch (err) {
    reply.status(400).send({ success: false, error: (err as Error).message })
  }
}

const MERGE_FILL_FIELDS = [
  'industry', 'scale', 'region', 'level', 'address', 'website', 'contactPerson', 'contactPhone', 'notes',
] as const

const MergeBodySchema = z.object({
  fromId: z.string().min(1),
})

/**
 * 客户合并：把 fromId 客户的全部关联数据（联系人/线索/商机/拜访/任务/时间线/快照）
 * 迁移到主客户（:id），并软删除 fromId、标记 mergedIntoId。主客户为空的核心字段用从客户补全。
 */
export async function merge(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const prisma = req.tenantPrisma!
    const user = getUser(req)
    const { id: intoId } = req.params
    const { fromId } = MergeBodySchema.parse(req.body)

    if (fromId === intoId) {
      return reply.status(400).send({ success: false, error: '不能将客户合并到自身' })
    }

    const [into, from] = await Promise.all([
      prisma.company.findFirst({ where: { id: intoId, deletedAt: null } }),
      prisma.company.findFirst({ where: { id: fromId, deletedAt: null } }),
    ])
    if (!into) return reply.status(404).send({ success: false, error: '主客户不存在' })
    if (!from) return reply.status(404).send({ success: false, error: '被合并客户不存在' })

    const [intoAccess, fromAccess] = await Promise.all([
      canAccess(prisma, user as never, into.ownerId),
      canAccess(prisma, user as never, from.ownerId),
    ])
    if (!intoAccess || !fromAccess) {
      return reply.status(403).send({ success: false, error: '无权合并这两个客户' })
    }

    // 用从客户补全主客户为空的核心字段
    const fillData: Record<string, unknown> = {}
    for (const field of MERGE_FILL_FIELDS) {
      const intoVal = (into as Record<string, unknown>)[field]
      const fromVal = (from as Record<string, unknown>)[field]
      if ((intoVal == null || intoVal === '') && fromVal != null && fromVal !== '') {
        fillData[field] = fromVal
      }
    }

    const counts = await prisma.$transaction(async (tx) => {
      const [leads, projects, contacts, visits, tasks, timeline, snapshots] = await Promise.all([
        tx.lead.updateMany({ where: { companyId: fromId }, data: { companyId: intoId } }),
        tx.project.updateMany({ where: { companyId: fromId }, data: { companyId: intoId } }),
        tx.contact.updateMany({ where: { companyId: fromId }, data: { companyId: intoId } }),
        tx.visit.updateMany({ where: { companyId: fromId }, data: { companyId: intoId } }),
        tx.task.updateMany({ where: { companyId: fromId }, data: { companyId: intoId } }),
        tx.timelineEvent.updateMany({ where: { customerId: fromId }, data: { customerId: intoId } }),
        tx.customerSnapshot.updateMany({ where: { customerId: fromId }, data: { customerId: intoId } }),
      ])

      if (Object.keys(fillData).length > 0) {
        await tx.company.update({ where: { id: intoId }, data: fillData })
      }

      await tx.company.update({
        where: { id: fromId },
        data: { deletedAt: new Date(), mergedIntoId: intoId, ownerId: null, assignedAt: null },
      })

      return {
        leads: leads.count,
        projects: projects.count,
        contacts: contacts.count,
        visits: visits.count,
        tasks: tasks.count,
        timeline: timeline.count,
        snapshots: snapshots.count,
      }
    })

    // 主客户记录字段补全
    if (Object.keys(fillData).length > 0) {
      await recordFieldChanges(
        prisma,
        user.tenantId,
        'company',
        intoId,
        into as Record<string, unknown>,
        { ...into, ...fillData } as Record<string, unknown>,
        user.id,
        'merge',
        Object.keys(fillData),
      )
    }

    await recordTimelineEvent(prisma, {
      tenantId: user.tenantId,
      customerId: intoId,
      eventType: ActivityEventType.COMPANY_UPDATED,
      eventData: {
        action: 'merge',
        fromId,
        fromName: from.name,
        migrated: counts,
        filledFields: Object.keys(fillData),
      },
      sourceType: 'user',
      sourceId: user.id,
      sourceLabel: `合并客户「${from.name}」`,
    })

    reply.send({ success: true, data: { intoId, fromId, migrated: counts, filledFields: Object.keys(fillData) } })
  } catch (err) {
    reply.status(400).send({ success: false, error: (err as Error).message })
  }
}

export async function duplicates(req: FastifyRequest, reply: FastifyReply) {
  try {
    const prisma = req.tenantPrisma!
    const user = getUser(req)
    const { name, excludeId } = req.query as { name?: string; excludeId?: string }
    if (!name) {
      return reply.status(400).send({ success: false, error: 'name 参数必填' })
    }

    const items = await detectDuplicateCompanies(prisma, user.tenantId, name, excludeId)
    reply.send({ success: true, data: items })
  } catch (err) {
    reply.status(500).send({ success: false, error: (err as Error).message })
  }
}

export async function missingFields(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const prisma = req.tenantPrisma!
    const { id } = req.params

    const company = await prisma.company.findFirst({ where: { id, deletedAt: null } })
    if (!company) return reply.status(404).send({ success: false, error: '客户不存在' })

    const [contacts, projects, visits] = await Promise.all([
      prisma.contact.findMany({ where: { companyId: id }, select: { phone: true, decisionRole: true } }),
      prisma.project.findMany({ where: { companyId: id, deletedAt: null }, select: { id: true } }),
      prisma.visit.findMany({ where: { companyId: id }, select: { visitTime: true } }),
    ])

    const { missingFields } = computeCompanyCompleteness(company, contacts, projects, visits)
    reply.send({ success: true, data: getMissingFieldLabels(missingFields) })
  } catch (err) {
    reply.status(500).send({ success: false, error: (err as Error).message })
  }
}

export async function changeHistory(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const prisma = req.tenantPrisma!
    const user = getUser(req)
    const { id } = req.params

    const company = await prisma.company.findFirst({ where: { id, deletedAt: null }, select: { ownerId: true } })
    if (!company) return reply.status(404).send({ success: false, error: '客户不存在' })
    const hasAccess = await canAccess(prisma, user as never, company.ownerId)
    if (!hasAccess) return reply.status(403).send({ success: false, error: '无权查看此客户' })

    const { getChangeHistory } = await import('../change-history/change-history.service.js')
    const items = await getChangeHistory(prisma, user.tenantId, 'company', id)
    reply.send({ success: true, data: items })
  } catch (err) {
    reply.status(500).send({ success: false, error: (err as Error).message })
  }
}

export async function remove(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const prisma = req.tenantPrisma!
    const user = getUser(req)
    const { id } = req.params
    const existing = await prisma.company.findFirst({ where: { id, deletedAt: null }, select: { ownerId: true } })
    if (!existing) return reply.status(404).send({ success: false, error: '客户不存在' })
    const hasAccess = await canAccess(prisma, user as never, existing.ownerId)
    if (!hasAccess) return reply.status(403).send({ success: false, error: '无权删除此客户' })

    await prisma.$transaction(async (tx) => {
      await cancelTasksForEntity(tx, { companyId: id })
      await tx.company.update({ where: { id }, data: { deletedAt: new Date() } })
    })
    reply.send({ success: true })
  } catch (err) {
    reply.status(400).send({ success: false, error: (err as Error).message })
  }
}

export async function claim(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const prisma = req.tenantPrisma!
    const user = getUser(req)
    const { id } = req.params

    const existing = await prisma.company.findFirst({ where: { id, deletedAt: null }, select: { id: true, ownerId: true, name: true } })
    if (!existing) return reply.status(404).send({ success: false, error: '客户不存在' })

    // 只能认领无主的公海池客户
    if (existing.ownerId != null) {
      return reply.status(400).send({ success: false, error: '该客户已有负责人，无法认领' })
    }

    const item = await prisma.company.update({
      where: { id },
      data: { ownerId: user.id, assignedAt: new Date(), status: 'following' },
    })

    await recordTimelineEvent(prisma, {
      tenantId: user.tenantId,
      customerId: item.id,
      eventType: ActivityEventType.COMPANY_ASSIGNED,
      eventData: { name: item.name, ownerId: item.ownerId },
      sourceType: 'user',
      sourceId: user.id,
      sourceLabel: '认领客户',
    })

    reply.send({ success: true, item })
  } catch (err) {
    reply.status(400).send({ success: false, error: (err as Error).message })
  }
}

export async function assign(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const prisma = req.tenantPrisma!
    const user = getUser(req)
    const { id } = req.params
    const { ownerId } = req.body as { ownerId?: string }

    // 仅 TENANT_ADMIN / DEPT_HEAD 可分配
    if (user.role !== 'TENANT_ADMIN' && user.role !== 'DEPT_HEAD') {
      return reply.status(403).send({ success: false, error: '无权分配客户' })
    }

    const existing = await prisma.company.findFirst({ where: { id, deletedAt: null }, select: { id: true, ownerId: true } })
    if (!existing) return reply.status(404).send({ success: false, error: '客户不存在' })

    // 分配给 null 表示释放回公海池
    const item = await prisma.company.update({
      where: { id },
      data: {
        ownerId: ownerId || null,
        assignedAt: ownerId ? new Date() : null,
      },
    })

    await recordTimelineEvent(prisma, {
      tenantId: user.tenantId,
      customerId: item.id,
      eventType: ActivityEventType.COMPANY_OWNER_CHANGED,
      eventData: { name: item.name, ownerId: item.ownerId, previousOwnerId: existing.ownerId },
      sourceType: 'user',
      sourceId: user.id,
      sourceLabel: ownerId ? '分配客户负责人' : '释放客户回公海池',
    })

    reply.send({ success: true, item })
  } catch (err) {
    reply.status(400).send({ success: false, error: (err as Error).message })
  }
}

interface Company360Stats {
  projectCount: number
  activeProjectCount: number
  contactCount: number
  decisionMakerCount: number
  visitCount: number
  pendingTaskCount: number
  overdueTaskCount: number
  lastContactAt: string | null
  daysSinceLastContact: number | null
  avgHealthScore: number | null
}

interface Company360Risk {
  type: string
  message: string
  severity: 'HIGH' | 'MEDIUM' | 'LOW'
}

export function computeCompany360Stats(
  company: { updatedAt: Date },
  projects: Array<{ closedAt: Date | null; healthScore: number | null }>,
  contacts: Array<{ decisionRole?: string | null }>,
  visits: Array<{ visitTime: Date }>,
  tasks: Array<{ status: string; deadline?: Date | null }>,
): Company360Stats {
  const now = new Date()
  const activeProjects = projects.filter((p) => p.closedAt === null)
  const healthScores = activeProjects
    .map((p) => p.healthScore)
    .filter((s): s is number => s != null)
  const avgHealthScore =
    healthScores.length > 0
      ? Math.round(healthScores.reduce((a, b) => a + b, 0) / healthScores.length)
      : null

  const lastContactTimes = [
    ...visits.map((v) => v.visitTime),
    company.updatedAt,
  ].filter(Boolean)
  const lastContactAt =
    lastContactTimes.length > 0
      ? new Date(Math.max(...lastContactTimes.map((d) => new Date(d).getTime())))
      : null
  const daysSinceLastContact = lastContactAt
    ? Math.floor((now.getTime() - lastContactAt.getTime()) / (1000 * 60 * 60 * 24))
    : null

  const pendingTasks = tasks.filter(
    (t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED',
  )
  const overdueTasks = pendingTasks.filter(
    (t) => t.deadline && new Date(t.deadline) < now,
  )

  return {
    projectCount: projects.length,
    activeProjectCount: activeProjects.length,
    contactCount: contacts.length,
    decisionMakerCount: contacts.filter((c) => c.decisionRole === 'DECISION_MAKER').length,
    visitCount: visits.length,
    pendingTaskCount: pendingTasks.length,
    overdueTaskCount: overdueTasks.length,
    lastContactAt: lastContactAt ? lastContactAt.toISOString() : null,
    daysSinceLastContact,
    avgHealthScore,
  }
}

export function computeCompany360Risks(
  company: { contactPerson?: string | null },
  projects: Array<{ closedAt: Date | null }>,
  contacts: Array<{ decisionRole?: string | null }>,
  visits: Array<{ visitTime: Date }>,
  tasks: Array<{ status: string; deadline?: Date | null }>,
): Company360Risk[] {
  const now = new Date()
  const risks: Company360Risk[] = []

  // 存量兼容：无联系人档案但公司平铺字段填了联系人，不算"缺少联系人"
  if (contacts.length === 0 && !company.contactPerson) {
    risks.push({ type: 'MISSING_CONTACT', message: '缺少联系人', severity: 'HIGH' })
  }

  const activeProjects = projects.filter((p) => p.closedAt === null)
  if (activeProjects.length === 0) {
    risks.push({ type: 'NO_ACTIVE_PROJECT', message: '无活跃商机', severity: 'MEDIUM' })
  }

  const lastVisitTime = visits.length > 0
    ? Math.max(...visits.map((v) => new Date(v.visitTime).getTime()))
    : null
  if (lastVisitTime) {
    const daysSinceLastVisit = Math.floor(
      (now.getTime() - lastVisitTime) / (1000 * 60 * 60 * 24),
    )
    if (daysSinceLastVisit > 14) {
      risks.push({
        type: 'NO_RECENT_CONTACT',
        message: `超过 ${daysSinceLastVisit} 天未拜访`,
        severity: 'HIGH',
      })
    }
  }

  const overdueTasks = tasks.filter(
    (t) =>
      t.status !== 'COMPLETED' &&
      t.status !== 'CANCELLED' &&
      t.deadline &&
      new Date(t.deadline) < now,
  )
  if (overdueTasks.length > 0) {
    risks.push({
      type: 'OVERDUE_TASKS',
      message: `有 ${overdueTasks.length} 个逾期待办`,
      severity: 'HIGH',
    })
  }

  const hasDecisionMaker = contacts.some((c) => c.decisionRole === 'DECISION_MAKER')
  if (!hasDecisionMaker && activeProjects.length > 0) {
    risks.push({
      type: 'MISSING_DECISION_MAKER',
      message: '决策链缺少关键决策者',
      severity: 'MEDIUM',
    })
  }

  return risks
}
