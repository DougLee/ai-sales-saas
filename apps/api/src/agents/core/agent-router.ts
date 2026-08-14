import { generateText } from 'ai'
import { z } from 'zod'
import { createModel } from '../../config/model-provider.js'
import { getAIConfig } from '../../config/ai-config.js'
import type { IntentResult } from './agent-types.js'
import { getComponentLogger } from '../../infra/logger.js'
import { traceLLMCall, type LLMTraceResult } from '../../infra/llm-trace.js'
import { getCachedIntent, setCachedIntent, type CachedIntent } from './intent-cache.js'
import { matchIntentByRule } from './intent-rules.js'
import { llmConcurrencyLimiter } from '../../infra/concurrency-limiter.js'

const logger = getComponentLogger('intent-router')

// 使用 z.literal 组合替代 z.enum，避免类型转换问题
const IntentValueSchema = z.union([
  z.literal('territory_search'),
  z.literal('background_research'),
  z.literal('visit_preparation'),
  z.literal('visit_analysis'),
  z.literal('demand_mining'),
  z.literal('follow_up'),
  z.literal('lead_assessment'),
  z.literal('project_health'),
  z.literal('team_management'),
  z.literal('illusion_detection'),
  z.literal('sales_coaching'),
  z.literal('territory_expansion'),
  z.literal('customer_enroll'),
  z.literal('bidding_monitor'),
  z.literal('system_help'),
  z.literal('general_chat'),
  z.literal('clarification'),
])

const IntentClassificationSchema = z.object({
  intent: IntentValueSchema,
  confidence: z.number().min(0).max(1),
  entities: z.object({
    region: z.string().optional(),
    product: z.string().optional(),
    targetName: z.string().optional(),
    scene: z.string().optional(),
  }),
  reasoning: z.string(),
})

export interface IntentRouteContext {
  traceId?: string
  sessionId?: string
  userId?: string
  tenantId?: string
  orgId?: string
}

export interface RoutedIntent extends IntentResult {
  trace?: LLMTraceResult
}

/**
 * LLM-native 意图理解
 * 用一次轻量 generateText 调用替代正则路由
 * 基于完整语义理解用户目标，而非关键词匹配
 */
export async function routeIntent(
  message: string,
  ctx?: IntentRouteContext,
): Promise<RoutedIntent> {
  const aiConfig = getAIConfig()
  const modelName = aiConfig.modelName || 'unknown'
  const provider = aiConfig.provider

  // 1. 缓存命中直接返回（缓存键含租户，防跨租户串味）
  const cached = await getCachedIntent(message, ctx?.tenantId)
  if (cached) {
    logger.debug(
      {
        traceId: ctx?.traceId,
        sessionId: ctx?.sessionId,
        intent: cached.intent,
        confidence: cached.confidence,
        source: 'cache',
      },
      'Intent resolved from cache',
    )
    return {
      intent: cached.intent,
      confidence: cached.confidence,
      entityType: cached.entityType,
      parameters: cached.parameters,
    }
  }

  // 2. 规则兜底命中直接返回
  const ruleMatch = matchIntentByRule(message)
  if (ruleMatch) {
    logger.debug(
      {
        traceId: ctx?.traceId,
        sessionId: ctx?.sessionId,
        intent: ruleMatch.intent,
        confidence: ruleMatch.confidence,
        matchedRule: ruleMatch.matchedRule,
        source: 'rule',
      },
      'Intent resolved by rule',
    )
    const result = {
      intent: ruleMatch.intent,
      confidence: ruleMatch.confidence,
      entityType: ruleMatch.entityType,
      parameters: ruleMatch.parameters,
    }
    await setCachedIntent(message, result, ctx?.tenantId)
    return result
  }

  const userId = ctx?.userId || 'anonymous'
  try {
    const { result, trace } = await llmConcurrencyLimiter.run(userId, () =>
      traceLLMCall(
        {
          component: 'intent-router',
          model: modelName,
          provider,
          traceId: ctx?.traceId,
          sessionId: ctx?.sessionId,
          userId,
          tenantId: ctx?.tenantId,
          orgId: ctx?.orgId,
        },
        async () => {
          const { text, usage } = await generateText({
            model: createModel() as any,
          system: `你是一个销售意图理解专家。分析用户的销售相关问题，准确提取意图和关键实体。

## 可能的意图

- **territory_search**: 寻找/推荐目标客户。用户想要找客户、推荐学校、客户开发、目标客户筛选、拓展客户等。这是最常见的意图之一。
- **background_research**: 调研某个具体客户的背景。用户提到了具体的学校/客户名称，想要了解这个客户的情况、决策链、痛点等。
- **visit_preparation**: 准备拜访。用户即将拜访某个客户，需要准备话术、议程、物料等。
- **visit_analysis**: 拜访复盘。用户已经拜访了某个客户，需要分析拜访质量、记录内容、提炼下一步。
- **demand_mining**: 需求挖掘。用户想要挖掘客户的真实需求、隐性需求、战略需求。
- **follow_up**: 跟进策略。客户不回复、停滞、冷淡，需要持续跟进策略。
- **lead_assessment**: 线索评估。评估某个线索值不值得跟进、怎么分级。
- **project_health**: 商机健康度/评分诊断与提升。用户问某个商机的评分、健康度、质量分为什么低、怎么提升、这个商机当前状态怎么样，需要基于健康雷达等真实数据给出诊断和补救动作。
- **team_management**: 团队/Pipeline分析。团队业绩、销售漏斗、项目全景、风险预警。
- **illusion_detection**: 项目风险识别。判断一个商机是否靠谱、是否存在假项目信号。
- **sales_coaching**: 销售辅导。销售技巧、心态调整、新人培训、破局策略。
- **territory_expansion**: 市场开拓。如何开拓新市场、新区域、陌生拜访策略。
- **customer_enroll**: 目标客户入库。用户要求把上一轮推荐的目标客户（或直接指定的客户）入库建档、加入公海池，例如"把第2个入库""全部入库""把XX公司入库"。
- **bidding_monitor**: 招投标监测。招标信息、中标公告、竞争对手投标。
- **system_help**: 系统使用帮助。怎么用系统、功能在哪、怎么操作。
- **general_chat**: 其他一般性对话，不归属于以上任何一类。

## 判断原则（按优先级排序）

1. **目标优先于动作**：用户说"做XX产品的客户开发" → territory_search（目标是找客户，不是调研产品本身）
2. **完整语义优于关键词**：不要只看孤立的关键词，要理解整句话的意思
3. **具体名称指向调研**：用户明确提到某个学校/客户的名称 → background_research（如"调研河南科技学院"）
4. **模糊表达指向搜索**：用户没有提具体名称，说"帮我找""推荐"→ territory_search
5. **多意图时选主要**：如果用户同时提到多个意图，选择最主要的那个
6. **评分健康专属**：用户问"评分/健康度/质量分/分数"为什么低、怎么提升 → project_health，不要误判为 territory_search 或 follow_up

## 示例

- "河南大学人工智能通识课的商机评分在30分，我该怎么才能提升" → project_health（targetName=河南大学，product=人工智能通识课）
- "这个项目健康度为什么一直在降" → project_health
- "帮我找新乡的本科院校做客户开发" → territory_search（region=新乡）
- "调研一下河南科技学院" → background_research（targetName=河南科技学院）
- "明天去拜访黄淮学院，帮我准备下" → visit_preparation（targetName=黄淮学院）`,
          prompt: `请分析以下用户消息，输出JSON格式的意图分类结果：

用户消息："""${message}"""

请严格按以下JSON格式输出（不要输出其他内容）：
{
  "intent": "意图名称",
  "confidence": 0.0-1.0,
  "entities": {
    "region": "提取的地区（如'新乡'、'河南'）",
    "product": "提取的产品（如'人工智能通识课'、'学科交叉平台'）",
    "targetName": "提取的具体客户/院校名称",
    "scene": "提取的场景/目标描述"
  },
  "reasoning": "你的推理过程"
}`,
        })

        logger.debug(
          {
            traceId: ctx?.traceId,
            sessionId: ctx?.sessionId,
            outputLength: text.length,
          },
          'Intent router raw output parsed',
        )

        // 提取JSON（处理markdown代码块、多余文本等情况）
        let jsonText = text.trim()
        // 去掉markdown代码块标记
        jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '')
        // 提取花括号内的内容
        const braceStart = jsonText.indexOf('{')
        const braceEnd = jsonText.lastIndexOf('}')
        if (braceStart === -1 || braceEnd === -1 || braceEnd <= braceStart) {
          throw new Error('No JSON object found in LLM response')
        }
        jsonText = jsonText.slice(braceStart, braceEnd + 1)

        const rawJson = JSON.parse(jsonText)
        const parsed = IntentClassificationSchema.parse(rawJson)

        logger.debug(
          {
            traceId: ctx?.traceId,
            sessionId: ctx?.sessionId,
            intent: parsed.intent,
            confidence: parsed.confidence,
            entities: parsed.entities,
          },
          'Intent classified',
        )

        return {
          result: parsed,
          usage: {
            promptTokens: usage?.inputTokens,
            completionTokens: usage?.outputTokens,
            totalTokens: usage?.totalTokens,
          },
        }
      }),
    )

    const parsed = result

    // 置信度中等：不反问用户，带最佳猜测意图继续作答（assumed 标记由上层在回答开头注明理解）
    // assumed 结果不缓存——避免把不确定的分类固化 1 小时
    if (
      parsed.confidence >= 0.3 &&
      parsed.confidence < 0.7 &&
      parsed.intent !== 'clarification'
    ) {
      return {
        intent: parsed.intent,
        confidence: parsed.confidence,
        parameters: parsed.entities,
        assumed: true,
        trace,
      }
    }

    // 置信度过低或 LLM 主动表示需要澄清：走澄清兜底
    if (parsed.intent === 'clarification' || parsed.confidence < 0.3) {
      return {
        intent: 'clarification',
        confidence: parsed.confidence,
        entityType: parsed.intent === 'clarification' ? undefined : parsed.intent,
        parameters: parsed.entities,
        trace,
      }
    }

    const cachedValue: CachedIntent = {
      intent: parsed.intent,
      confidence: parsed.confidence,
      entityType: undefined,
      parameters: parsed.entities,
    }
    await setCachedIntent(message, cachedValue, ctx?.tenantId)

    return {
      intent: parsed.intent,
      confidence: parsed.confidence,
      entityType: undefined,
      parameters: parsed.entities,
      trace,
    }
  } catch (err) {
    logger.error(
      {
        traceId: ctx?.traceId,
        sessionId: ctx?.sessionId,
        err,
      },
      'Intent routing failed, falling back to general_chat',
    )
    // 降级到 general_chat，不阻断用户
    return {
      intent: 'general_chat',
      confidence: 0.3,
      entityType: undefined,
      parameters: { error: (err as Error).message },
    }
  }
}

/**
 * 复合意图拆分：检测用户是否在一次消息中表达了多个独立目标
 */
export function splitCompositeIntents(message: string): { intents: string[]; needsAsync: boolean } {
  const separators = /[;；。然后接着还有另外]/
  const segments = message.split(separators).filter((s) => s.trim().length > 3)

  if (segments.length <= 1) {
    return { intents: [], needsAsync: message.length > 500 }
  }

  const needsAsync = segments.length > 3 || message.length > 500
  return { intents: [], needsAsync }
}
