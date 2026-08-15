/**
 * 线索规则评分 —— 后端 apps/api/src/crm/leads/leads.scoring.ts 的前端复刻（ADR-0002）
 * 用于新建线索表单右侧实时预览。两侧口径必须同步：改一处必改另一处。
 */

export interface LeadScoreInput {
  contactName?: string
  contactPhone?: string
  contactPosition?: string
  contactEmail?: string
  humanInfo?: Record<string, string | undefined>
  businessInfo?: Record<string, string | undefined>
  financeInfo?: Record<string, string | undefined>
  source?: string
  followUpCount?: number
}

export interface ScoreBreakdown {
  contactCompleteness: number
  needClarity: number
  budgetSignal: number
  decisionChainClarity: number
  total: number
  grade: 'A' | 'B' | 'C'
}

export function calculateLeadScorePreview(lead: LeadScoreInput): ScoreBreakdown {
  let contactCompleteness = 0
  if (lead.contactName) contactCompleteness += 5
  if (lead.contactPhone || lead.contactEmail) contactCompleteness += 10
  if (lead.contactPosition) contactCompleteness += 10
  contactCompleteness = Math.min(25, contactCompleteness)

  const businessInfo = lead.businessInfo || {}
  let needClarity = 0
  if (businessInfo.requirements?.trim()) needClarity += 20
  if (businessInfo.timeline?.trim()) needClarity += 10
  needClarity = Math.min(30, needClarity)

  // ADR-0002 决策 4：四档枚举入评分，存量 budget 文本按已确认档兼容
  const financeInfo = lead.financeInfo || {}
  let budgetSignal = 0
  if (financeInfo.budget?.trim() || financeInfo.budgetSignal === 'confirmed') budgetSignal += 20
  else if (financeInfo.budgetSignal === 'range') budgetSignal += 15
  else if (financeInfo.budgetSignal === 'mentioned') budgetSignal += 10
  if (financeInfo.budgetSource?.trim()) budgetSignal += 5
  budgetSignal = Math.min(25, budgetSignal)

  const humanInfo = lead.humanInfo || {}
  let decisionChainClarity = 0
  if (humanInfo.decisionMaker?.trim()) decisionChainClarity += 15
  if (humanInfo.decisionChain?.trim()) decisionChainClarity += 5
  decisionChainClarity = Math.min(20, decisionChainClarity)

  const total = Math.max(0, Math.min(100, contactCompleteness + needClarity + budgetSignal + decisionChainClarity))
  const grade: 'A' | 'B' | 'C' = total >= 60 ? 'A' : total >= 40 ? 'B' : 'C'
  return { contactCompleteness, needClarity, budgetSignal, decisionChainClarity, total, grade }
}

/** 转化门禁 5 条（ADR-0002 决策 1：预算软提示不阻断） */
export function checkConvertReadiness5(input: {
  score: number
  contactPhone?: string
  contactEmail?: string
  followUpCount?: number
  requirements?: string
  decisionMaker?: string
  budgetSignal?: string
  budget?: string
  budgetSource?: string
}): { ready: boolean; missing: string[]; softHints: string[] } {
  const missing: string[] = []
  if (input.score < 60) missing.push('评分需达到 60 分以上')
  if (!input.contactPhone && !input.contactEmail) missing.push('至少一个有效联系方式')
  if (!input.requirements?.trim()) missing.push('需求方向需明确')
  if ((input.followUpCount ?? 0) < 1) missing.push('至少一次有效跟进（建档后跟进即计）')
  if (!input.decisionMaker?.trim()) missing.push('识别决策链关键角色')

  const softHints: string[] = []
  if (!input.budget?.trim() && !input.budgetSource?.trim() && !input.budgetSignal) {
    softHints.push('预算信号尚未确认（建议转化前补齐）')
  }
  return { ready: missing.length === 0, missing, softHints }
}

/** 四要素缺口清单（与后端推导同口径），供表单缺口提示 */
export function elementGaps(b: ScoreBreakdown): string[] {
  const gaps: string[] = []
  if (b.contactCompleteness < 25) gaps.push(`联系方式：补职务/邮箱可 +${25 - b.contactCompleteness} 分`)
  if (b.needClarity < 30) gaps.push(`需求：写清需求与时间窗 +${30 - b.needClarity} 分`)
  if (b.budgetSignal < 25) gaps.push(`预算：问出经费来源 +${25 - b.budgetSignal} 分`)
  if (b.decisionChainClarity < 20) gaps.push(`决策链：识别关键角色 +${20 - b.decisionChainClarity} 分`)
  return gaps
}
