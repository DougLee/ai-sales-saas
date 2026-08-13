import type { FastifyRequest, FastifyReply } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { buildOwnerWhere, type AuthUser } from '../../lib/data-scope.js'

function getPrisma(req: FastifyRequest): PrismaClient {
  return req.tenantPrisma!
}

function getUser(req: FastifyRequest): AuthUser {
  return req.user as AuthUser
}

const DAY_MS = 24 * 60 * 60 * 1000
const STALE_CUSTOMER_DAYS = 30
const OVERDUE_LEAD_DAYS = 14
const LIST_LIMIT = 10

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '').replace(/[（）()有限公司股份]/g, '')
}

/**
 * 数据质量看板汇总
 * - 客户完整度分布（高/中/低）
 * - 重复客户（按归一化名称聚类）
 * - 长期未跟进客户（在跟客户 30 天内无拜访）
 * - 超期未处理线索（跟进中线索 14 天未跟进）
 * - 停滞商机
 */
export async function getDataQualitySummary(req: FastifyRequest, reply: FastifyReply) {
  try {
    const prisma = getPrisma(req)
    const user = getUser(req)
    const now = new Date()
    const staleCustomerThreshold = new Date(now.getTime() - STALE_CUSTOMER_DAYS * DAY_MS)
    const overdueLeadThreshold = new Date(now.getTime() - OVERDUE_LEAD_DAYS * DAY_MS)

    const companyWhere = await buildOwnerWhere(prisma, user, { deletedAt: null })
    const leadFollowingWhere = await buildOwnerWhere(prisma, user, { deletedAt: null, status: 'FOLLOWING' })
    const staleProjectWhere = await buildOwnerWhere(prisma, user, {
      isStale: true,
      closedAt: null,
      deletedAt: null,
    })

    const [companies, overdueLeadCount, overdueLeadItems, staleProjectCount, staleProjectItems] =
      await Promise.all([
        prisma.company.findMany({
          where: companyWhere,
          select: { id: true, name: true, completenessScore: true, status: true },
        }),
        prisma.lead.count({
          where: {
            ...leadFollowingWhere,
            OR: [
              { lastFollowUpAt: { lt: overdueLeadThreshold } },
              { lastFollowUpAt: null, createdAt: { lt: overdueLeadThreshold } },
            ],
          },
        }),
        prisma.lead.findMany({
          where: {
            ...leadFollowingWhere,
            OR: [
              { lastFollowUpAt: { lt: overdueLeadThreshold } },
              { lastFollowUpAt: null, createdAt: { lt: overdueLeadThreshold } },
            ],
          },
          orderBy: [{ lastFollowUpAt: { sort: 'asc', nulls: 'first' } }],
          take: LIST_LIMIT,
          select: {
            id: true,
            name: true,
            lastFollowUpAt: true,
            createdAt: true,
            company: { select: { name: true } },
          },
        }),
        prisma.project.count({ where: staleProjectWhere }),
        prisma.project.findMany({
          where: staleProjectWhere,
          orderBy: [{ staleSince: 'asc' }],
          take: LIST_LIMIT,
          select: {
            id: true,
            name: true,
            staleSince: true,
            healthScore: true,
            company: { select: { name: true } },
          },
        }),
      ])

    // 完整度分布
    const completeness = { high: 0, medium: 0, low: 0, total: companies.length, avgScore: 0 }
    let scoreSum = 0
    for (const c of companies) {
      const s = c.completenessScore ?? 0
      scoreSum += s
      if (s >= 80) completeness.high += 1
      else if (s >= 50) completeness.medium += 1
      else completeness.low += 1
    }
    completeness.avgScore = companies.length ? Math.round(scoreSum / companies.length) : 0

    // 重复客户聚类
    const clusters = new Map<string, { name: string; ids: string[] }>()
    for (const c of companies) {
      const key = normalizeName(c.name)
      if (!key) continue
      const existing = clusters.get(key)
      if (existing) existing.ids.push(c.id)
      else clusters.set(key, { name: c.name, ids: [c.id] })
    }
    const duplicateClusters = Array.from(clusters.values()).filter((g) => g.ids.length > 1)
    const duplicates = {
      groups: duplicateClusters.length,
      companies: duplicateClusters.reduce((acc, g) => acc + g.ids.length, 0),
      items: duplicateClusters
        .sort((a, b) => b.ids.length - a.ids.length)
        .slice(0, LIST_LIMIT)
        .map((g) => ({ name: g.name, count: g.ids.length, ids: g.ids })),
    }

    // 长期未跟进客户（在跟客户，30 天内无拜访）
    const followingCompanies = companies.filter((c) => c.status === 'following')
    const followingIds = followingCompanies.map((c) => c.id)
    let staleCustomers = { count: 0, items: [] as Array<{ id: string; name: string; lastVisitTime: Date | null }> }
    if (followingIds.length > 0) {
      const visitAgg = await prisma.visit.groupBy({
        by: ['companyId'],
        where: { companyId: { in: followingIds } },
        _max: { visitTime: true },
      })
      const lastVisitMap = new Map<string, Date | null>()
      for (const v of visitAgg) {
        if (v.companyId) lastVisitMap.set(v.companyId, v._max.visitTime)
      }
      const staleList = followingCompanies
        .map((c) => ({ id: c.id, name: c.name, lastVisitTime: lastVisitMap.get(c.id) ?? null }))
        .filter((c) => !c.lastVisitTime || c.lastVisitTime < staleCustomerThreshold)
      staleCustomers = {
        count: staleList.length,
        items: staleList
          .sort((a, b) => {
            const ta = a.lastVisitTime ? a.lastVisitTime.getTime() : 0
            const tb = b.lastVisitTime ? b.lastVisitTime.getTime() : 0
            return ta - tb
          })
          .slice(0, LIST_LIMIT),
      }
    }

    reply.send({
      success: true,
      data: {
        completeness,
        duplicates,
        staleCustomers,
        overdueLeads: {
          count: overdueLeadCount,
          items: overdueLeadItems.map((l) => ({
            id: l.id,
            name: l.name,
            companyName: l.company?.name ?? null,
            lastFollowUpAt: l.lastFollowUpAt,
            createdAt: l.createdAt,
          })),
        },
        staleProjects: {
          count: staleProjectCount,
          items: staleProjectItems.map((p) => ({
            id: p.id,
            name: p.name,
            companyName: p.company?.name ?? null,
            staleSince: p.staleSince,
            healthScore: p.healthScore,
          })),
        },
      },
    })
  } catch (err) {
    req.log.error({ err }, 'Data quality summary failed')
    reply.status(500).send({ success: false, error: (err as Error).message })
  }
}
