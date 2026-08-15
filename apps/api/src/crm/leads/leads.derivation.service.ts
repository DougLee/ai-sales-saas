import type { PrismaClient } from '@prisma/client'
import type { FastifyRequest, FastifyReply } from 'fastify'
import { buildOwnerWhere } from '../../lib/data-scope.js'
import { checkConversionReadiness } from './leads.scoring.js'

/**
 * 线索推导字段与指标条（ADR-0002 决策 2）
 * - fourElements：四要素状态（人/事/财/决策链，ready|partial|missing）
 * - gate：转化门禁 5 条进度及缺口（预算为软提示，见 checkConversionReadiness）
 * - currentStep：7 步路线图当前步
 * - aging：老化分档（A 级 7 天 / B 级 14 天 / C 级 30 天未跟进，总纲决策⑦）
 */

type ElemStatus = 'ready' | 'partial' | 'missing'

export interface LeadDerivations {
  fourElements: { person: ElemStatus; business: ElemStatus; finance: ElemStatus; decisionChain: ElemStatus }
  gate: { passed: number; total: number; missing: string[]; softHints: string[] }
  currentStep: { step: number; label: string }
  aging: 'ok' | 'warning' | 'overdue'
}

const STEP_LABELS = [
  '信息验证',
  '首次触达',
  '确认需求',
  '决策链',
  '预算信号',
  '门禁检查',
  '待转化',
] as const

const AGING_DAYS: Record<string, number> = { A: 7, B: 14, C: 30 }

export function computeLeadDerivations(lead: {
  contactName?: string | null
  contactPhone?: string | null
  contactEmail?: string | null
  contactPosition?: string | null
  humanInfo?: Record<string, unknown> | null
  businessInfo?: Record<string, unknown> | null
  financeInfo?: Record<string, unknown> | null
  score?: number | null
  grade?: string | null
  completenessScore: number
  followUpCount: number
  lastFollowUpAt?: Date | string | null
  createdAt?: Date | string | null
  status?: string
}): LeadDerivations {
  const humanInfo = (lead.humanInfo as Record<string, string | undefined> | null) || {}
  const businessInfo = (lead.businessInfo as Record<string, string | undefined> | null) || {}
  const financeInfo = (lead.financeInfo as Record<string, string | undefined> | null) || {}

  // 四要素：绿=齐（关键字段落齐） 黄=有苗头 灰=缺
  const person: ElemStatus = lead.contactName
    ? (lead.contactPhone || lead.contactEmail) && lead.contactPosition ? 'ready' : 'partial'
    : 'missing'
  const business: ElemStatus = businessInfo.requirements?.trim()
    ? businessInfo.timeline?.trim() ? 'ready' : 'partial'
    : 'missing'
  const finance: ElemStatus = ['confirmed'].includes(financeInfo.budgetSignal || '') || financeInfo.budget?.trim()
    ? 'ready'
    : ['mentioned', 'range'].includes(financeInfo.budgetSignal || '') || financeInfo.budgetSource?.trim()
      ? 'partial'
      : 'missing'
  const decisionChain: ElemStatus = humanInfo.decisionMaker?.trim()
    ? humanInfo.decisionChain?.trim() ? 'ready' : 'partial'
    : 'missing'

  // 门禁 5 条
  const readiness = checkConversionReadiness(lead as never)
  const gate = {
    passed: 5 - readiness.missing.length,
    total: 5,
    missing: readiness.missing,
    softHints: readiness.softHints,
  }

  // 7 步路线图：按存量证据推进，封顶 Step 7
  let step = 1
  if (lead.followUpCount >= 1) step = 2
  if (businessInfo.requirements?.trim()) step = 3
  if (humanInfo.decisionMaker?.trim()) step = 4
  if (['mentioned', 'range', 'confirmed'].includes(financeInfo.budgetSignal || '') || financeInfo.budget?.trim()) step = 5
  if (readiness.ready) step = 6
  if (readiness.ready && lead.status === 'FOLLOWING') step = 7

  // 老化：超阈值 warning，超 2 倍阈值 overdue
  const reference = lead.lastFollowUpAt || lead.createdAt
  const daysSince = reference ? Math.floor((Date.now() - new Date(reference).getTime()) / 86400000) : 0
  const threshold = AGING_DAYS[lead.grade || 'C'] ?? 30
  let aging: 'ok' | 'warning' | 'overdue' = 'ok'
  if (lead.status === 'FOLLOWING' || lead.status === 'NEW') {
    if (daysSince > threshold * 2) aging = 'overdue'
    else if (daysSince > threshold) aging = 'warning'
  }

  return {
    fourElements: { person, business, finance, decisionChain },
    gate,
    currentStep: { step, label: STEP_LABELS[step - 1] },
    aging,
  }
}

/**
 * 转化即定级（ADR-0004 决策 7 / 总纲决策⑥）：按已确认证据核定商机初始里程碑，封顶 M2。
 * 口径与 gate 一致：M1 需 painPoints≥1，M2 需 requirements 非空（M1 为 M2 前置）。
 * M3+ 必须在商机阶段重新取证（预算等财务证据转化后由拜访/人工补）。
 */
export function gradeConvertedMilestone(lead: {
  humanInfo?: Record<string, unknown> | null
  businessInfo?: Record<string, unknown> | null
}): { milestone: number; evidence: string[] } {
  const humanInfo = (lead.humanInfo as Record<string, unknown> | null) || {}
  const businessInfo = (lead.businessInfo as Record<string, unknown> | null) || {}
  const pains = Array.isArray(humanInfo.painPoints) ? (humanInfo.painPoints as unknown[]) : []
  const hasRequirements = !!(businessInfo.requirements as string | undefined)?.trim?.()

  if (pains.length >= 1 && hasRequirements) {
    return { milestone: 2, evidence: [`痛点 ${pains.length} 条`, '需求已量化'] }
  }
  if (pains.length >= 1) {
    return { milestone: 1, evidence: [`痛点 ${pains.length} 条`] }
  }
  return { milestone: 0, evidence: [] }
}

export interface LeadMetrics {
  following: number
  weeklyNew: number
  gradeA: number
  convertible: number
  aging: number
  conversionRate2: number
  /** 页签计数 */
  counts: { following: number; convertible: number; nurturing: number; converted: number; lost: number }
}

/** 指标条：跟进中/A 级/可转化（5/5 未转化）/老化/转化率②（本月） */
export async function computeLeadMetrics(
  prisma: PrismaClient,
  user: { id: string; tenantId: string; orgId: string; role: string; email: string },
): Promise<LeadMetrics> {
  const where = await buildOwnerWhere(prisma, user as never, { deletedAt: null })
  const weekStart = new Date()
  const day = weekStart.getDay() === 0 ? 7 : weekStart.getDay()
  weekStart.setDate(weekStart.getDate() - (day - 1))
  weekStart.setHours(0, 0, 0, 0)
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  const [following, weeklyNew, gradeA, convertedThisMonth, converted, lost, nurturing, all] = await Promise.all([
    prisma.lead.count({ where: { ...where, status: 'FOLLOWING' } }),
    prisma.lead.count({ where: { ...where, createdAt: { gte: weekStart } } }),
    prisma.lead.count({ where: { ...where, grade: 'A', status: { in: ['FOLLOWING', 'NEW', 'PAUSED'] } } }),
    prisma.lead.count({ where: { ...where, convertedAt: { gte: monthStart } } }),
    prisma.lead.count({ where: { ...where, status: 'CONVERTED' } }),
    prisma.lead.count({ where: { ...where, status: 'LOST' } }),
    prisma.lead.count({ where: { ...where, status: { in: ['NEW', 'PAUSED'] } } }),
    prisma.lead.findMany({
      where,
      select: {
        contactName: true, contactPhone: true, contactEmail: true, contactPosition: true,
        humanInfo: true, businessInfo: true, financeInfo: true,
        score: true, grade: true, completenessScore: true,
        followUpCount: true, lastFollowUpAt: true, createdAt: true, status: true,
      },
    }),
  ])

  // 可转化与老化需要逐条推导（数据量为租户线索总量，可接受）
  let convertible = 0
  let aging = 0
  for (const lead of all) {
    const d = computeLeadDerivations(lead as never)
    if (d.gate.passed === 5 && lead.status === 'FOLLOWING') convertible++
    if (d.aging !== 'ok') aging++
  }

  return {
    following,
    weeklyNew,
    gradeA,
    convertible,
    aging,
    conversionRate2: all.length > 0 ? Math.round((convertedThisMonth / all.length) * 1000) / 10 : 0,
    counts: { following, convertible, nurturing, converted, lost },
  }
}

export async function leadMetrics(req: FastifyRequest, reply: FastifyReply) {
  try {
    const prisma = req.tenantPrisma!
    const user = req.user as { id: string; tenantId: string; orgId: string; role: string; email: string }
    const data = await computeLeadMetrics(prisma, user)
    reply.send({ success: true, data })
  } catch (err) {
    reply.status(500).send({ success: false, error: (err as Error).message })
  }
}
