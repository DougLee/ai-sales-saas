import { DEFAULT_MILESTONE_GATE_RULES, MILESTONE_NAMES } from '@ai-sales/shared'

/**
 * 里程碑 Gate 规则定义
 *
 * 规则说明：
 * - 每个 milestone 阶段（fromStage）对应一组 requiredFields
 * - 从 fromStage 推进到更高阶段时，必须满足 requiredFields 中的所有规则
 * - 支持字段校验、证据链校验、以及 and/or/not 复合规则
 */

export interface EvidenceRequirement {
  /** 证据类型，如 visit / voice / chat / email */
  type: string
  /** 最少条数，默认 1 */
  min?: number
  /** 证据必须在最近 N 天内，默认不限制 */
  withinDays?: number
}

export interface GateRule {
  kind?: 'field'
  /** JSON 字段路径，支持点号嵌套，如 'humanInfo.firstContact' */
  path: string
  /** 人类可读的规则标签 */
  label: string
  /** 可选的自定义字段校验函数 */
  validate?: (val: unknown) => boolean
  /** 可选的证据链要求 */
  evidence?: EvidenceRequirement[]
}

export interface CompoundRule {
  kind: 'compound'
  operator: 'and' | 'or' | 'not'
  /** 复合规则的人类可读标签 */
  label: string
  /** 子规则 */
  rules: GateRuleNode[]
}

export type GateRuleNode = GateRule | CompoundRule

export interface MilestoneGate {
  /** 当前阶段 */
  fromStage: number
  /** 推进到下一阶段所需满足的字段规则 */
  requiredFields: GateRuleNode[]
}

function buildValidator(validator?: string, params?: { min?: number }) {
  if (!validator) return undefined
  if (validator === 'arrayMinLength') {
    return (val: unknown) => Array.isArray(val) && val.length >= (params?.min ?? 1)
  }
  if (validator === 'stringMinLength') {
    return (val: unknown) => typeof val === 'string' && val.trim().length >= (params?.min ?? 1)
  }
  return undefined
}

function configFieldToGateRule(field: {
  path: string
  label: string
  validator?: string
  params?: { min?: number }
  evidence?: EvidenceRequirement[]
}): GateRule {
  return {
    kind: 'field',
    path: field.path,
    label: field.label,
    validate: buildValidator(field.validator, field.params),
    evidence: field.evidence,
  }
}

function configRuleToGateRuleNode(rule: unknown): GateRuleNode {
  if (typeof rule === 'object' && rule !== null && 'operator' in rule) {
    const compound = rule as { operator: 'and' | 'or' | 'not'; label: string; rules: unknown[] }
    return {
      kind: 'compound',
      operator: compound.operator,
      label: compound.label,
      rules: compound.rules.map(configRuleToGateRuleNode),
    }
  }
  return configFieldToGateRule(rule as { path: string; label: string; validator?: string; params?: { min?: number }; evidence?: EvidenceRequirement[] })
}

export const DEFAULT_MILESTONE_GATES: MilestoneGate[] = DEFAULT_MILESTONE_GATE_RULES.map((rule) => ({
  fromStage: rule.fromStage,
  requiredFields: rule.requiredFields.map(configRuleToGateRuleNode),
}))

export function buildMilestoneGateFromConfig(config: unknown): MilestoneGate[] {
  const raw = config as { gateRules?: unknown[] } | undefined
  const gateRules = raw?.gateRules
  if (!Array.isArray(gateRules) || gateRules.length === 0) return DEFAULT_MILESTONE_GATES
  return gateRules.map((gate) => ({
    fromStage: (gate as { fromStage: number }).fromStage,
    requiredFields: ((gate as { requiredFields?: unknown[] }).requiredFields ?? []).map(configRuleToGateRuleNode),
  }))
}

export const MILESTONE_LABELS = MILESTONE_NAMES as unknown as string[]
