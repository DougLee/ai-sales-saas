import type { PrismaClient, Prisma } from '@prisma/client'
import {
  MILESTONE_NAMES,
  SPIN_DIMENSIONS,
  DECISION_ROLES,
  SALES_STAGES,
  DEMAND_MINING_LEVELS,
  PERSONALITY_TYPES,
  TOUCH_RHYTHM,
  DEFAULT_MILESTONE_GATE_RULES,
} from '@ai-sales/shared'
import type { MilestoneGateRuleField, MilestoneGateCompoundRule } from '@ai-sales/shared'

function isRuleField(item: MilestoneGateRuleField | MilestoneGateCompoundRule): item is MilestoneGateRuleField {
  return 'path' in item
}

function serializeRuleField(field: MilestoneGateRuleField) {
  return {
    path: field.path,
    label: field.label,
    ...(field.validator ? { validator: field.validator, params: field.params } : {}),
    ...(field.evidence ? { evidence: field.evidence } : {}),
  }
}

function serializeRule(rule: { fromStage: number; requiredFields: Array<MilestoneGateRuleField | MilestoneGateCompoundRule> }) {
  return {
    fromStage: rule.fromStage,
    requiredFields: rule.requiredFields.map((item) =>
      isRuleField(item) ? serializeRuleField(item) : item
    ),
  }
}

export const DEFAULT_CONFIGS: Array<{ moduleType: string; configJson: Prisma.InputJsonValue }> = [
  {
    moduleType: 'MILESTONE',
    configJson: {
      stages: MILESTONE_NAMES.map((name, i) => ({
        stage: i,
        name,
        criteria: [],
        evidenceRequired: [],
      })),
      gateRules: DEFAULT_MILESTONE_GATE_RULES.map(serializeRule),
    },
  },
  {
    moduleType: 'SPIN',
    configJson: {
      situation: { prompt: SPIN_DIMENSIONS[0].purpose, examples: [] },
      problem: { prompt: SPIN_DIMENSIONS[1].purpose, examples: [] },
      implication: { prompt: SPIN_DIMENSIONS[2].purpose, examples: [] },
      needPayoff: { prompt: SPIN_DIMENSIONS[3].purpose, examples: [] },
    },
  },
  {
    moduleType: 'HUMAN_INFO',
    configJson: {
      dimensions: DECISION_ROLES.map((r) => ({
        role: r.code,
        trustIndicators: [],
        attitudeTracking: true,
      })),
      extractionRules: [],
    },
  },
  {
    moduleType: 'SALES_PLAYBOOK',
    configJson: { stages: SALES_STAGES },
  },
  {
    moduleType: 'DEMAND_MINING',
    configJson: {
      levels: DEMAND_MINING_LEVELS,
      spinDimensions: SPIN_DIMENSIONS,
    },
  },
  {
    moduleType: 'PERSONALITY_ANALYSIS',
    configJson: { types: PERSONALITY_TYPES },
  },
  {
    moduleType: 'FOLLOW_UP',
    configJson: { rhythm: TOUCH_RHYTHM },
  },
]

/**
 * 幂等地为指定租户创建默认方法论配置。
 * 已存在同类型活跃配置时跳过，避免重复或覆盖用户自定义配置。
 */
export async function ensureDefaultConfigs(prisma: PrismaClient, tenantId: string) {
  for (const { moduleType, configJson } of DEFAULT_CONFIGS) {
    const existing = await prisma.methodologyConfig.findFirst({
      where: { tenantId, moduleType, isActive: true },
    })
    if (existing) continue

    await prisma.methodologyConfig.create({
      data: {
        tenantId,
        moduleType,
        configJson,
        version: 'seed',
        isActive: true,
      },
    })
  }
}
