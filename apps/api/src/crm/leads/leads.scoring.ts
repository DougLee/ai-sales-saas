/**
 * 线索规则评分与转化门禁（纯函数，ADR-0002）
 * 前端表单实时预览复刻同口径：四维 联系方式25 / 需求30 / 预算25 / 决策链20，
 * 门禁 5 条硬条件 + 预算软提示。改动需与 apps/web 的 lead-scoring.ts 同步。
 */

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

  // 预算信号（25分）—— ADR-0002 决策 4：四档枚举入评分，存量 budget 文本按已确认档兼容
  const financeInfo = ((lead.financeInfo as Record<string, string | undefined> | null) || {})
  let budgetSignal = 0
  if (financeInfo.budget?.trim() || financeInfo.budgetSignal === 'confirmed') budgetSignal += 20
  else if (financeInfo.budgetSignal === 'range') budgetSignal += 15
  else if (financeInfo.budgetSignal === 'mentioned') budgetSignal += 10
  if (financeInfo.budgetSource?.trim()) budgetSignal += 5
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

  // ADR-0002 决策 1：预算信号降为软提示，不再阻断转化（线索阶段财的口径是"信号级"）
  const softHints: string[] = []
  if (!financeInfo.budget?.trim() && !financeInfo.budgetSource?.trim() && !financeInfo.budgetSignal) {
    softHints.push('预算信号尚未确认（建议转化前补齐）')
  }

  return { ready: missing.length === 0, missing, softHints }
}
