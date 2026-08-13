import type { PrismaClient } from '@prisma/client'
import { getWeekStart } from '../crm/spotcheck/spot-check.service.js'

/**
 * 团队轻量排名（V6.1 §6.2）
 *
 * WQMI（周拜访质量指数）= 平均质量分 * 0.6 + 闭环率 * 40
 * - 直接使用落库的 qualityScore（行为分 + rubric 折算），不每次重算
 * - 分数构成透明：行为分/rubric 分列（验收：团队排名页分数构成可见）
 */

export interface WeeklyWqmi {
  wqmi: number
  visitCount: number
  avgScore: number
  avgBehaviorScore: number
  avgRubricWeighted: number
  closureRate: number // 0-100
}

interface ClosureRow {
  qualityScore: number | null
  closedAt: Date | null
  qualityFactors: unknown
}

/** 从 qualityFactors 还原行为分（rubricWeighted 之外的维度之和） */
function behaviorScoreOf(factors: unknown): number {
  const f = (factors || {}) as Record<string, unknown>
  return (
    (Number(f.preparation) || 0) +
    (Number(f.rawDocumentation) || 0) +
    (Number(f.followUp) || 0) +
    (Number(f.progression) || 0)
  )
}

function rubricWeightedOf(factors: unknown): number {
  return Number((factors as Record<string, unknown> | null)?.rubricWeighted) || 0
}

export function computeWqmi(closures: ClosureRow[]): WeeklyWqmi | null {
  if (closures.length === 0) return null
  const avgScore = closures.reduce((a, c) => a + (c.qualityScore || 0), 0) / closures.length
  const avgBehavior = closures.reduce((a, c) => a + behaviorScoreOf(c.qualityFactors), 0) / closures.length
  const avgRubric = closures.reduce((a, c) => a + rubricWeightedOf(c.qualityFactors), 0) / closures.length
  const closureRate = closures.filter((c) => c.closedAt).length / closures.length

  return {
    wqmi: Math.round(avgScore * 0.6 + closureRate * 40),
    visitCount: closures.length,
    avgScore: Math.round(avgScore),
    avgBehaviorScore: Math.round(avgBehavior),
    avgRubricWeighted: Math.round(avgRubric * 10) / 10,
    closureRate: Math.round(closureRate * 100),
  }
}

export interface TeamRankingItem extends WeeklyWqmi {
  userId: string
  name: string
  trend: number | null // 本周 WQMI - 上周 WQMI（上周无数据为 null）
  activeProjects: number
  staleProjects: number
}

/**
 * 团队周排名：同租户销售角色成员（SALES/DEPT_HEAD），按 WQMI 降序
 */
export async function getTeamRanking(
  prisma: PrismaClient,
  opts: { tenantId: string; weekStart?: Date },
): Promise<{ weekStart: string; rankings: TeamRankingItem[]; teamAvg: number }> {
  const weekStart = opts.weekStart || getWeekStart()
  const weekEnd = new Date(weekStart.getTime() + 7 * 86400000)
  const lastWeekStart = new Date(weekStart.getTime() - 7 * 86400000)

  const members = await prisma.user.findMany({
    where: { tenantId: opts.tenantId, role: { in: ['SALES', 'DEPT_HEAD'] } },
    select: { id: true, name: true },
  })

  const rankings = await Promise.all(
    members.map(async (member) => {
      const [thisWeek, lastWeek, activeProjects, staleProjects] = await Promise.all([
        prisma.visitClosure.findMany({
          where: { ownerId: member.id, createdAt: { gte: weekStart, lt: weekEnd }, visit: { tenantId: opts.tenantId } },
          select: { qualityScore: true, closedAt: true, qualityFactors: true },
        }),
        prisma.visitClosure.findMany({
          where: { ownerId: member.id, createdAt: { gte: lastWeekStart, lt: weekStart }, visit: { tenantId: opts.tenantId } },
          select: { qualityScore: true, closedAt: true, qualityFactors: true },
        }),
        prisma.project.count({ where: { ownerId: member.id, tenantId: opts.tenantId, deletedAt: null, closedAt: null } }),
        prisma.project.count({ where: { ownerId: member.id, tenantId: opts.tenantId, deletedAt: null, isStale: true } }),
      ])

      const wqmi = computeWqmi(thisWeek)
      const lastWqmi = computeWqmi(lastWeek)

      return {
        userId: member.id,
        name: member.name,
        ...(wqmi || {
          wqmi: 0,
          visitCount: 0,
          avgScore: 0,
          avgBehaviorScore: 0,
          avgRubricWeighted: 0,
          closureRate: 0,
        }),
        trend: wqmi && lastWqmi ? wqmi.wqmi - lastWqmi.wqmi : null,
        activeProjects,
        staleProjects,
      }
    }),
  )

  rankings.sort((a, b) => b.wqmi - a.wqmi)
  const teamAvg = rankings.length > 0
    ? Math.round(rankings.reduce((a, r) => a + r.wqmi, 0) / rankings.length)
    : 0

  return { weekStart: weekStart.toISOString().slice(0, 10), rankings, teamAvg }
}
