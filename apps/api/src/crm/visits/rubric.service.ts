import type { PrismaClient } from '@prisma/client'
import { generateText } from 'ai'
import { createModel } from '../../config/model-provider.js'
import { llmConcurrencyLimiter } from '../../infra/concurrency-limiter.js'
import { getTimeline } from '../../lib/timeline.js'
import { getRawInput } from './closure.service.js'
import { logger } from '../../infra/logger.js'

/**
 * B 轨 rubric 评分服务（V6.1 §6.1）
 *
 * 设计红线：
 * - 评估对象是销售的原始输入（rawInput/转写原文），不是 AI 扩写摘要
 * - 评估"信息增量"而非"文本质量"：对照项目已知信息（已确认时间轴），这次拜访新获得了什么
 * - evidence 必须锚定 rawInput 原文（程序硬校验：非原文子串的 evidence 维度分数清零），
 *   防止 LLM 脑补证据（《智能体数据写入治理规范》§四 evidence 证据锚定）
 * - rubricScore 0-100，折算 rubricWeighted = round(score * 0.4) 计入 qualityScore（0-40）
 * - 重复评分稳定性靠 temperature=0 + 固定 prompt 结构（验收：同一输入分差≤10）
 */

export interface RubricDimension {
  name: string
  score: number
  evidence?: string
  /** 程序校验结果：evidence 是否为 rawInput 原文子串（无 evidence 且 0 分视为 true） */
  evidenceValid?: boolean
}

export interface RubricResult {
  score: number // 0-100
  dimensions: RubricDimension[]
  comment: string
}

const RUBRIC_DIMENSIONS: Array<{ name: string; max: number }> = [
  { name: '决策链信息', max: 25 },
  { name: '需求与痛点', max: 25 },
  { name: '预算与流程', max: 20 },
  { name: '竞争态势', max: 15 },
  { name: '下一步承诺', max: 15 },
]

export function buildRubricPrompt(rawInput: string, projectContext: string): string {
  return `你是一位ToB销售管理专家，请评估一次拜访的【信息获取质量】。

【评分对象】销售的原始拜访记录（速记/转写原文），不是AI整理后的摘要。
【评估基准】对照该项目此前已知信息，本次拜访是否带来了"信息增量"。

【rubric（总分100）】
1. 决策链信息（0-25）：是否新获知了决策人/评估人/影响人的态度、立场、变动？
2. 需求与痛点（0-25）：是否新明确了具体需求、痛点、优先级？（"聊了聊"不算，要有具体内容）
3. 预算与流程（0-20）：是否触及预算规模、采购流程、时间节点？
4. 竞争态势（0-15）：是否获知竞品动态、客户倾向？
5. 下一步承诺（0-15）：客户是否给出了明确的下一步约定（时间/动作/引荐）？

【项目已知信息摘要】
${projectContext || '（暂无历史记录）'}

【本次拜访原始记录】
${rawInput}

【输出JSON】{ "dimensions": [{"name":"...","score":n,"evidence":"记录中的原文依据"}], "total": n, "comment": "一句话评语" }
注意：evidence 必须引用原始记录中的实际内容；记录中没有的维度给0分，不要脑补。
只返回合法JSON，不要markdown代码块。`
}

/**
 * evidence 锚定硬校验：evidence 必须是 rawInput 的原文子串（去空白后比对）。
 * 校验失败的维度分数清零——宁可低估，不让幻觉得分。
 */
export function enforceEvidenceAnchor(dimensions: RubricDimension[], rawInput: string): RubricDimension[] {
  const normalizedRaw = rawInput.replace(/\s+/g, '')
  return dimensions.map((d) => {
    const max = RUBRIC_DIMENSIONS.find((r) => r.name === d.name)?.max ?? 25
    let score = Math.max(0, Math.min(max, Number(d.score) || 0))
    let evidenceValid = true
    if (d.evidence && String(d.evidence).trim()) {
      const normalizedEvidence = String(d.evidence).replace(/\s+/g, '')
      evidenceValid = normalizedRaw.includes(normalizedEvidence)
      if (!evidenceValid) score = 0
    } else if (score > 0) {
      // 给了分却没有 evidence：不符合 rubric 约定，清零
      evidenceValid = false
      score = 0
    }
    return { ...d, score, evidenceValid }
  })
}

/** 解析 LLM rubric 响应（容错：解析失败返回 null，由调用方决定降级） */
export function parseRubricResponse(text: string): { dimensions: RubricDimension[]; total: number; comment: string } | null {
  try {
    const clean = text.replace(/^```json\s*|\s*```$/g, '').trim()
    const parsed = JSON.parse(clean) as { dimensions?: RubricDimension[]; total?: number; comment?: string }
    if (!Array.isArray(parsed.dimensions)) return null
    return {
      dimensions: parsed.dimensions,
      total: Number(parsed.total) || 0,
      comment: String(parsed.comment || ''),
    }
  } catch {
    return null
  }
}

/**
 * 对一次拜访做 rubric 评分并落库（visitClosure.rubricScore/rubricDetails）
 * 返回 rubricScore（0-100）；无原始输入或 LLM 失败返回 null（调用方按 0 折算）
 */
export async function scoreVisitWithRubric(
  prisma: PrismaClient,
  opts: { visitId: string; userId: string },
): Promise<number | null> {
  const visit = await prisma.visit.findUnique({ where: { id: opts.visitId } })
  if (!visit) throw new Error('拜访记录不存在')

  const raw = getRawInput(visit)
  if (!raw.text.trim()) {
    logger.info({ visitId: opts.visitId }, 'rubric skipped: no raw input')
    return null
  }

  // 项目已知信息：只读已确认时间轴事件（V6.1 §6.3：未确认的 AI 产物不得影响评估）
  let projectContext = ''
  if (visit.projectId) {
    const { items } = await getTimeline(prisma, {
      tenantId: visit.tenantId,
      projectId: visit.projectId,
      limit: 50,
    })
    projectContext = items
      .map((e) => `[${e.eventTime.toISOString().slice(0, 10)}] ${e.eventType}: ${JSON.stringify(e.eventData).slice(0, 120)}`)
      .join('\n')
  }

  const { text } = await llmConcurrencyLimiter.run(opts.userId, () =>
    generateText({
      model: createModel() as unknown as Parameters<typeof generateText>[0]['model'],
      prompt: buildRubricPrompt(raw.text, projectContext),
      temperature: 0, // 稳定性验收：同一输入重复评分分差≤10
      maxOutputTokens: 1500,
    }),
  )

  const parsed = parseRubricResponse(text)
  if (!parsed) {
    logger.warn({ visitId: opts.visitId }, 'rubric parse failed')
    return null
  }

  const anchored = enforceEvidenceAnchor(parsed.dimensions, raw.text)
  const score = Math.max(0, Math.min(100, anchored.reduce((a, d) => a + d.score, 0)))

  const result: RubricResult = { score, dimensions: anchored, comment: parsed.comment }

  await prisma.visitClosure.update({
    where: { visitId: opts.visitId },
    data: { rubricScore: score, rubricDetails: result as never },
  })

  logger.info({ visitId: opts.visitId, score }, 'rubric scored')
  return score
}
