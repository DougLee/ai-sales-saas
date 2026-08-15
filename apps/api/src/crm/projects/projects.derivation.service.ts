import type { PrismaClient } from '@prisma/client'
import type { FastifyRequest, FastifyReply } from 'fastify'
import { buildOwnerWhere } from '../../lib/data-scope.js'

/**
 * 商机推导字段与指标条（ADR-0003 决策 2/3/5）
 * - staleDays：无 waitingStatus 且超 21 天未推进
 * - waiting：waitingStatus 非空 = 合理等待（不计停滞）
 * - illusion：停滞≥15 天 或（停滞且证据链为 0）
 * - credibility：单单可信度（脱水公式）
 * - 脱水金额 = Σ(amount × credibility)
 */

/** 停滞判定阈值（天） */
export const STALE_DAYS = 21
/** 疑似幻觉：停滞天数阈值（天） */
export const ILLUSION_STALE_DAYS = 15
/** 近期推进窗口（天） */
export const RECENT_DAYS = 14

export interface ProjectDerivation {
  staleDays: number
  waiting: boolean
  decisionChainCount: number
  evidenceCount: number
  nextAction: { title: string; deadline: string | null } | null
  illusion: boolean
  credibility: number // 0-100
}

export function computeProjectDerivation(project: {
  updatedAt: Date | string
  waitingStatus?: string | null
  decisionMap?: unknown
  milestone: number
  closedAt?: Date | string | null
  tasks?: Array<{ title: string; deadline?: Date | string | null; status: string }>
}, evidenceCount: number): ProjectDerivation {
  const daysSince = Math.floor((Date.now() - new Date(project.updatedAt).getTime()) / 86400000)
  const waiting = !!project.waitingStatus
  const staleDays = !waiting && !project.closedAt && daysSince > STALE_DAYS ? daysSince : 0

  const decisionChainCount = Array.isArray((project.decisionMap as Record<string, unknown> | null)?.nodes)
    ? ((project.decisionMap as Record<string, unknown>).nodes as unknown[]).length
    : 0

  const nextTask = (project.tasks || [])
    .filter((t) => t.status !== 'COMPLETED')
    .sort((a, b) => new Date(a.deadline || 0).getTime() - new Date(b.deadline || 0).getTime())[0]

  // ADR-0003 决策 3：可信度 = 证据覆盖×50% + 决策链≥2人×20% + 近14天推进×30%
  const evidenceCoverage = Math.min(1, evidenceCount / (project.milestone + 1))
  const hasChain = decisionChainCount >= 2 ? 1 : 0
  const recentPush = daysSince <= RECENT_DAYS ? 1 : 0
  const credibility = Math.round(Math.min(1, evidenceCoverage * 0.5 + hasChain * 0.2 + recentPush * 0.3) * 100)

  return {
    staleDays,
    waiting,
    decisionChainCount,
    evidenceCount,
    nextAction: nextTask ? { title: nextTask.title, deadline: nextTask.deadline ? new Date(nextTask.deadline).toISOString() : null } : null,
    // 疑似幻觉（设计稿"15天无证据推进"）：未等待、超 15 天未推进、且证据链为 0
    illusion: !waiting && !project.closedAt && daysSince >= ILLUSION_STALE_DAYS && evidenceCount === 0,
    credibility,
  }
}

export interface ProjectMetrics {
  active: number
  nominalAmount: number
  dehydratedAmount: number
  dehydrationRate: number
  stale: number
  waitingCount: number
  conversionRate3: number
}

export async function computeProjectMetrics(
  prisma: PrismaClient,
  user: { id: string; tenantId: string; orgId: string; role: string; email: string },
): Promise<ProjectMetrics> {
  const where = await buildOwnerWhere(prisma, user as never, { deletedAt: null })
  const quarterStart = new Date()
  quarterStart.setMonth(Math.floor(quarterStart.getMonth() / 3) * 3, 1)
  quarterStart.setHours(0, 0, 0, 0)

  const [projects, evidenceGroups] = await Promise.all([
    prisma.project.findMany({
      where,
      select: {
        id: true, amount: true, closedAt: true, lostInfo: true, updatedAt: true,
        waitingStatus: true, decisionMap: true, milestone: true,
      },
    }),
    prisma.timelineEvent.groupBy({
      by: ['projectId'],
      where: { tenantId: user.tenantId, factStatus: 'confirmed', projectId: { not: null } },
      _count: { _all: true },
    }),
  ])

  const evidenceMap = new Map(evidenceGroups.map((g) => [g.projectId, g._count._all]))

  let nominal = 0
  let dehydrated = 0
  let stale = 0
  let waitingCount = 0
  let active = 0
  let wonThisQuarter = 0
  let closedAll = 0
  for (const p of projects) {
    if (p.closedAt) {
      closedAll++
      if (new Date(p.closedAt) >= quarterStart && p.lostInfo == null) wonThisQuarter++
      continue
    }
    active++
    const amt = Number(p.amount ?? 0)
    nominal += amt
    const d = computeProjectDerivation({ ...p, tasks: [] }, evidenceMap.get(p.id) || 0)
    dehydrated += amt * (d.credibility / 100)
    if (d.staleDays > STALE_DAYS) stale++
    if (d.waiting) waitingCount++
  }

  return {
    active,
    nominalAmount: Math.round(nominal),
    dehydratedAmount: Math.round(dehydrated),
    dehydrationRate: nominal > 0 ? Math.round(((nominal - dehydrated) / nominal) * 1000) / 10 : 0,
    stale,
    waitingCount,
    // 转化率③：季度赢单 / 全部已关单（含流失，反映漏斗效率）
    conversionRate3: closedAll > 0 ? Math.round((wonThisQuarter / closedAll) * 1000) / 10 : 0,
  }
}

export async function projectMetrics(req: FastifyRequest, reply: FastifyReply) {
  try {
    const prisma = req.tenantPrisma!
    const user = req.user as { id: string; tenantId: string; orgId: string; role: string; email: string }
    const data = await computeProjectMetrics(prisma, user)
    reply.send({ success: true, data })
  } catch (err) {
    reply.status(500).send({ success: false, error: (err as Error).message })
  }
}

/** 批量取项目的 confirmed 证据数（list 附带推导用） */
export async function evidenceCountsByProject(prisma: PrismaClient, tenantId: string, projectIds: string[]): Promise<Map<string, number>> {
  if (projectIds.length === 0) return new Map()
  const groups = await prisma.timelineEvent.groupBy({
    by: ['projectId'],
    where: { tenantId, factStatus: 'confirmed', projectId: { in: projectIds } },
    _count: { _all: true },
  })
  const map = new Map<string, number>()
  for (const g of groups) if (g.projectId) map.set(g.projectId, g._count._all)
  return map
}
