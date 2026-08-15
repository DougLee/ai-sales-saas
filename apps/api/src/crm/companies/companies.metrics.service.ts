import type { PrismaClient, Prisma } from '@prisma/client'
import type { FastifyRequest, FastifyReply } from 'fastify'
import { buildOwnerWhere } from '../../lib/data-scope.js'

/**
 * 客户池指标条（L0 专属）聚合服务
 * 口径见 ADR-0001 / CONTEXT.md：
 * - 池子总量：status='target' 客户数；周新增按周一零点起算
 * - 已触达：至少有一次关联拜访的 target 客户
 * - 转化率①：已产出线索（存在关联 Lead）的 target 客户占比
 * - 待核实：source='ai_recommendation' 且超 7 天未补充（updatedAt 早于 7 天前）的 target 客户
 */

/** 待核实阈值（天）——小销建档后超过该天数未人工补充即计入待核实 */
export const PENDING_VERIFY_DAYS = 7

interface PoolMetrics {
  total: number
  weeklyNew: number
  reached: number
  reachedRate: number
  producedLeads: number
  conversionRate1: number
  pendingVerify: number
}

function weekStart(now = new Date()): Date {
  const d = new Date(now)
  // 周一为一周起点（getDay: 0=周日）
  const day = d.getDay() === 0 ? 7 : d.getDay()
  d.setDate(d.getDate() - (day - 1))
  d.setHours(0, 0, 0, 0)
  return d
}

export async function computePoolMetrics(
  prisma: PrismaClient,
  user: { id: string; tenantId: string; orgId: string; role: string; email: string },
): Promise<PoolMetrics> {
  // 与列表接口同口径的数据范围：SALES 全租户可见，其余按 buildOwnerWhere
  const scope = user.role === 'SALES'
    ? { deletedAt: null }
    : await buildOwnerWhere(prisma, user as never, { deletedAt: null })

  const targetWhere: Prisma.CompanyWhereInput = { ...scope, status: 'target' }
  const pendingBefore = new Date(Date.now() - PENDING_VERIFY_DAYS * 24 * 60 * 60 * 1000)

  const [total, weeklyNew, pendingVerify, visitedCompanyIds, leadedCompanyIds] = await Promise.all([
    prisma.company.count({ where: targetWhere }),
    prisma.company.count({ where: { ...targetWhere, createdAt: { gte: weekStart() } } }),
    prisma.company.count({
      where: { ...targetWhere, source: 'ai_recommendation', updatedAt: { lt: pendingBefore } },
    }),
    // 已触达：有拜访的 target 客户（distinct companyId）
    prisma.visit.findMany({
      where: { company: targetWhere },
      select: { companyId: true },
      distinct: ['companyId'],
    }),
    // 已产出线索：有 Lead 的 target 客户
    prisma.lead.findMany({
      where: { company: targetWhere },
      select: { companyId: true },
      distinct: ['companyId'],
    }),
  ])

  const reached = visitedCompanyIds.length
  const producedLeads = leadedCompanyIds.length

  return {
    total,
    weeklyNew,
    reached,
    reachedRate: total > 0 ? Math.round((reached / total) * 1000) / 10 : 0,
    producedLeads,
    conversionRate1: total > 0 ? Math.round((producedLeads / total) * 1000) / 10 : 0,
    pendingVerify,
  }
}

export async function poolMetrics(req: FastifyRequest, reply: FastifyReply) {
  try {
    const prisma = req.tenantPrisma!
    const user = req.user as { id: string; tenantId: string; orgId: string; role: string; email: string }
    const data = await computePoolMetrics(prisma, user)
    reply.send({ success: true, data })
  } catch (err) {
    reply.status(500).send({ success: false, error: (err as Error).message })
  }
}
