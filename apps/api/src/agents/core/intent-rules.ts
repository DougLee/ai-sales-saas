import type { CachedIntent } from './intent-cache.js'

export interface IntentRuleMatch extends CachedIntent {
  /** 命中的规则名称，用于 observability */
  matchedRule: string
}

const COMMON_PATTERNS: Array<{
  name: string
  intent: string
  confidence: number
  patterns: RegExp[]
  /** 从消息中提取实体的简单规则 */
  extract?: (message: string) => {
    region?: string
    product?: string
    targetName?: string
    scene?: string
  }
}> = [
  {
    name: 'customer_enroll',
    intent: 'customer_enroll',
    confidence: 0.9,
    patterns: [/入库|入公海|建档/],
  },
  {
    name: 'territory_search',
    intent: 'territory_search',
    confidence: 0.85,
    patterns: [
      /找客户|推荐客户|目标客户|客户开发|拓展客户|客户筛选|学校推荐|推荐学校|找学校|潜在客户|目标院校/,
    ],
  },
  {
    name: 'visit_preparation',
    intent: 'visit_preparation',
    confidence: 0.85,
    patterns: [
      /准备拜访|拜访准备|去见|约访|拜访话术|拜访议程|拜访材料|拜访前|怎么拜访|拜访计划/,
    ],
  },
  {
    name: 'visit_analysis',
    intent: 'visit_analysis',
    confidence: 0.85,
    patterns: [
      /分析拜访|拜访复盘|拜访分析|复盘.*拜访|拜访.*记录|拜访.*质量|刚刚拜访|这次拜访/,
    ],
  },
  {
    name: 'demand_mining',
    intent: 'demand_mining',
    confidence: 0.85,
    patterns: [
      /需求挖掘|挖需求|真实需求|隐性需求|战略需求|客户需求|需求分析/,
    ],
  },
  {
    name: 'follow_up',
    intent: 'follow_up',
    confidence: 0.85,
    patterns: [
      /跟进|不回复|冷淡|停滞|怎么跟|持续跟进|跟进策略|催一下/,
    ],
  },
  {
    name: 'project_health',
    intent: 'project_health',
    confidence: 0.85,
    patterns: [
      /健康度|质量分|评分.*(低|降|高|提升|涨|为什么|多少)|(低|降|提升|涨).*评分|分数.*(低|降|提升|为什么)|怎么提升.*(分|评分|商机)|提升.*(评分|分数|健康度)/,
    ],
  },
  {
    name: 'lead_assessment',
    intent: 'lead_assessment',
    confidence: 0.85,
    patterns: [
      /线索评估|线索分级|线索.*值不值|这线索|评估线索/,
    ],
  },
  {
    name: 'system_help',
    intent: 'system_help',
    confidence: 0.9,
    patterns: [
      /怎么用|在哪里|功能在哪|怎么操作|系统.*用|不会用|帮助文档/,
    ],
  },
]

function extractTargetName(message: string): string | undefined {
  // 匹配 "调研 XXX"、"了解一下 XXX"、"看看 XXX" 中的 XXX
  const patterns = [
    /调研\s*([一-龥]{2,20})(?:学校|学院|大学|客户|公司)?/,
    /了解(?:一下)?\s*([一-龥]{2,20})(?:学校|学院|大学|客户|公司)?/,
    /看看\s*([一-龥]{2,20})(?:学校|学院|大学|客户|公司)?/,
  ]
  for (const p of patterns) {
    const m = message.match(p)
    if (m?.[1]) return m[1]
  }
  return undefined
}

function extractRegion(message: string): string | undefined {
  // 简单提取省市名称
  const patterns = [
    /([一-龥]{2,7})(?:省|市|自治区)/,
    /在([一-龥]{2,7})/,
  ]
  for (const p of patterns) {
    const m = message.match(p)
    if (m?.[1]) return m[1]
  }
  return undefined
}

/**
 * 用轻量规则匹配高频意图，避免每次消息都走 LLM。
 * 只覆盖高置信度、高频率场景，复杂语义仍交给 LLM。
 */
export function matchIntentByRule(message: string): IntentRuleMatch | null {
  const normalized = message.trim()
  if (normalized.length === 0) return null

  for (const rule of COMMON_PATTERNS) {
    if (rule.patterns.some((p) => p.test(normalized))) {
      const entities = rule.extract ? rule.extract(normalized) : {}
      return {
        intent: rule.intent,
        confidence: rule.confidence,
        entityType: undefined,
        parameters: {
          region: extractRegion(normalized) || entities.region,
          product: entities.product,
          targetName: extractTargetName(normalized) || entities.targetName,
          scene: entities.scene,
        },
        matchedRule: rule.name,
      }
    }
  }

  return null
}
