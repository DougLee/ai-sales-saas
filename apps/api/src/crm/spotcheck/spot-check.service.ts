import type { PrismaClient } from '@prisma/client'

/**
 * 管理者抽检服务（V6.1 §6.1.5）
 *
 * 每周从上周已闭环拜访中抽 10%（至少 1 条，分层抽样：高/低分各半），
 * 管理者按同一 rubric 人工评分，与 LLM rubric 分对比。
 *
 * 用途：校准 rubric（系统性偏离时回调 prompt）、防"表演式记录"、为团队排名提供人工背书
 */

/** 偏差阈值：|管理者分 - rubric分| ≤ 15 视为一致（V6.1 §十一 验收线） */
export const SPOT_CHECK_TOLERANCE = 15

/** 计算周起点（周一 00:00 本地） */
export function getWeekStart(date: Date = new Date()): Date {
  const d = new Date(date)
  const day = d.getDay() || 7 // 周日视为第 7 天
  d.setDate(d.getDate() - day + 1)
  d.setHours(0, 0, 0, 0)
  return d
}

export interface SpotCheckSampleItem {
  closureId: string
  visitId: string
  ownerId: string
  qualityScore: number | null
  rubricScore: number | null
  closedAt: Date | null
}

/**
 * 抽样：指定周（默认上周）已闭环且未抽检的拜访，抽 10%（至少 1 条）
 * 分层：按质量分排序后高分段/低分段各取一半，避免只抽到极端样本
 */
export async function sampleWeeklySpotCheck(
  prisma: PrismaClient,
  tenantId: string,
  opts: { weekStart?: Date; ratio?: number } = {},
): Promise<SpotCheckSampleItem[]> {
  const thisMonday = getWeekStart()
  const weekStart = opts.weekStart || new Date(thisMonday.getTime() - 7 * 86400000) // 默认上周
  const weekEnd = new Date(weekStart.getTime() + 7 * 86400000)
  const ratio = opts.ratio ?? 0.1

  const closures = await prisma.visitClosure.findMany({
    where: {
      closedAt: { gte: weekStart, lt: weekEnd, not: null },
      spotChecked: false,
      visit: { tenantId },
    },
    select: {
      id: true,
      visitId: true,
      ownerId: true,
      qualityScore: true,
      rubricScore: true,
      closedAt: true,
    },
  })

  if (closures.length === 0) return []

  const sampleSize = Math.max(1, Math.ceil(closures.length * ratio))
  const sorted = [...closures].sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0))
  const head = sorted.slice(0, Math.ceil(sampleSize / 2))
  const tailCount = Math.floor(sampleSize / 2)
  // 注意：tailCount=0 时 slice(-0) === slice(0) 会返回全量，必须显式判空
  const tail = tailCount > 0 ? sorted.slice(-tailCount) : []
  const seen = new Set<string>()
  const sample = [...head, ...tail].filter((c) => {
    if (seen.has(c.id)) return false
    seen.add(c.id)
    return true
  })

  return sample.map((c) => ({
    closureId: c.id,
    visitId: c.visitId,
    ownerId: c.ownerId,
    qualityScore: c.qualityScore,
    rubricScore: c.rubricScore,
    closedAt: c.closedAt,
  }))
}

/**
 * 管理者提交抽检评分（按同一 rubric，0-100 人工分）
 * 注意：spotCheckScore 与 rubricScore 同量纲（0-100），对比用；
 * 不回写 qualityScore——抽检用于校准与背书，不改销售的已落库分数
 */
export async function recordSpotCheck(
  prisma: PrismaClient,
  opts: { closureId: string; managerId: string; managerScore: number; comment?: string },
) {
  const closure = await prisma.visitClosure.findUnique({ where: { id: opts.closureId } })
  if (!closure) throw new Error('闭环记录不存在')
  if (closure.spotChecked) throw new Error('该拜访已抽检过')

  const managerScore = Math.max(0, Math.min(100, Math.round(opts.managerScore)))

  return prisma.visitClosure.update({
    where: { id: opts.closureId },
    data: {
      spotChecked: true,
      spotCheckScore: managerScore,
      spotCheckBy: opts.managerId,
      spotCheckAt: new Date(),
      rubricDetails: {
        ...((closure.rubricDetails as Record<string, unknown>) || {}),
        spotCheckComment: opts.comment,
      } as never,
    },
  })
}

export interface DeviationReport {
  totalChecked: number
  withinTolerance: number
  /** 偏差 ≤15 分占比（验收线 ≥80%） */
  consistencyRate: number
  /** 偏差 >15 的校准清单 */
  outliers: Array<{
    closureId: string
    visitId: string
    ownerId: string
    rubricScore: number | null
    spotCheckScore: number | null
    deviation: number
  }>
}

/**
 * 偏差报告：最近 N 周已抽检的闭环拜访，rubric 分 vs 管理者分
 */
export async function getDeviationReport(
  prisma: PrismaClient,
  tenantId: string,
  opts: { weeks?: number } = {},
): Promise<DeviationReport> {
  const weeks = opts.weeks ?? 4
  const since = new Date(getWeekStart().getTime() - weeks * 7 * 86400000)

  const checked = await prisma.visitClosure.findMany({
    where: {
      spotChecked: true,
      spotCheckAt: { gte: since },
      visit: { tenantId },
    },
    select: {
      id: true,
      visitId: true,
      ownerId: true,
      rubricScore: true,
      spotCheckScore: true,
    },
  })

  const withBoth = checked.filter((c) => c.rubricScore != null && c.spotCheckScore != null)
  const outliers = withBoth
    .map((c) => ({
      closureId: c.id,
      visitId: c.visitId,
      ownerId: c.ownerId,
      rubricScore: c.rubricScore,
      spotCheckScore: c.spotCheckScore,
      deviation: Math.abs((c.spotCheckScore || 0) - (c.rubricScore || 0)),
    }))
    .filter((c) => c.deviation > SPOT_CHECK_TOLERANCE)
    .sort((a, b) => b.deviation - a.deviation)

  const within = withBoth.length - outliers.length
  return {
    totalChecked: withBoth.length,
    withinTolerance: within,
    consistencyRate: withBoth.length > 0 ? Math.round((within / withBoth.length) * 100) : 100,
    outliers,
  }
}
