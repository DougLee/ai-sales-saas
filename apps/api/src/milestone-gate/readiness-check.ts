import type { PrismaClient } from '@prisma/client'
import { generateText } from 'ai'
import { createModel } from '../config/model-provider.js'
import { llmConcurrencyLimiter } from '../infra/concurrency-limiter.js'
import { getTimeline } from '../lib/timeline.js'
import { logger } from '../infra/logger.js'

/**
 * AI 成熟度诊断（V6.1 §7.1 AI Readiness Check）
 *
 * 固定 gate 规则只能检查"动作做没做"，检查不了"客户成熟没有"。
 * 本模块基于已确认时间轴事件做信号检测，输出《阶段跃迁风险清单》。
 *
 * 交互约定：gate 通过但 suggestion='hold' 时不阻断推进，
 * 由前端弹出风险清单要求显式覆核——AI 诊断是"第二双眼睛"，不是"第二道锁"。
 */

export interface ReadinessSignal {
  signal: string
  evidence?: string
  strength?: 'strong' | 'weak'
}

export interface ReadinessRisk {
  risk: string
  evidence?: string
  severity?: 'high' | 'medium' | 'low'
}

export interface AiReadiness {
  signals: ReadinessSignal[]
  risks: ReadinessRisk[]
  suggestion: 'proceed' | 'caution' | 'hold'
  reason: string
}

export function buildReadinessPrompt(timelineEvents: string, targetMilestone: number): string {
  return `你是销售总监，判断一个项目是否具备推进到下一阶段（M${targetMilestone}）的客户侧成熟度。
基于以下已确认的跟进记录，识别两类信号：

【推进信号】例如：客户明确认可方案、关键决策人表态支持、竞争对手退场、预算已批复、
客户主动推进内部流程（上会/立项/招标准备）
【风险信号】例如：关键人变动/失联、客户态度转冷、预算削减迹象、竞品新动作、
客户内部流程卡壳

【时间轴记录】
${timelineEvents || '（暂无已确认的跟进记录）'}

【输出JSON】{
  "signals": [{"signal":"...","evidence":"...","strength":"strong|weak"}],
  "risks": [{"risk":"...","evidence":"...","severity":"high|medium|low"}],
  "suggestion": "proceed|caution|hold",
  "reason": "一句话判断依据"
}
只返回合法JSON，不要markdown代码块。`
}

const VALID_SUGGESTIONS = new Set(['proceed', 'caution', 'hold'])

/** 解析 LLM 响应（容错：失败返回 null，由调用方降级） */
export function parseReadinessResponse(text: string): AiReadiness | null {
  try {
    const clean = text.replace(/^```json\s*|\s*```$/g, '').trim()
    const parsed = JSON.parse(clean) as Partial<AiReadiness>
    if (!parsed.suggestion || !VALID_SUGGESTIONS.has(parsed.suggestion)) return null
    return {
      signals: Array.isArray(parsed.signals) ? parsed.signals : [],
      risks: Array.isArray(parsed.risks) ? parsed.risks : [],
      suggestion: parsed.suggestion as AiReadiness['suggestion'],
      reason: String(parsed.reason || ''),
    }
  } catch {
    return null
  }
}

/**
 * 对项目做推进成熟度诊断。LLM 不可用时返回 null（调用方按"无诊断"处理，不阻断流程）
 */
export async function aiReadinessCheck(
  prisma: PrismaClient,
  opts: { tenantId: string; projectId: string; targetMilestone: number; userId: string },
): Promise<AiReadiness | null> {
  try {
    // 只读已确认事件（V6.1：未确认的 AI 产物不得影响诊断）
    const { items } = await getTimeline(prisma, {
      tenantId: opts.tenantId,
      projectId: opts.projectId,
      limit: 100,
    })
    const timelineEvents = items
      .map((e) => `[${e.eventTime.toISOString().slice(0, 10)}] ${e.sourceLabel || e.eventType}: ${JSON.stringify(e.eventData).slice(0, 150)}`)
      .join('\n')

    const { text } = await llmConcurrencyLimiter.run(opts.userId, () =>
      generateText({
        model: createModel() as unknown as Parameters<typeof generateText>[0]['model'],
        prompt: buildReadinessPrompt(timelineEvents, opts.targetMilestone),
        temperature: 0.2,
        maxOutputTokens: 1200,
      }),
    )

    const result = parseReadinessResponse(text)
    if (!result) {
      logger.warn({ projectId: opts.projectId }, 'aiReadinessCheck: parse failed')
    }
    return result
  } catch (err) {
    logger.warn({ err, projectId: opts.projectId }, 'aiReadinessCheck failed (non-blocking)')
    return null
  }
}
