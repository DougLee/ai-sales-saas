import type { PrismaClient } from '@prisma/client'
import { MethodologyConfigSchema, validateMethodologyConfig, DEFAULT_MILESTONE_GATE_RULES } from '@ai-sales/shared'
import type { MilestoneGateRuleField, MilestoneGateCompoundRule } from '@ai-sales/shared'
import type { z } from 'zod'
import { DEFAULT_CONFIGS } from './methodology-seed.js'

type MethodologyInput = z.infer<typeof MethodologyConfigSchema>

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

const ALL_MODULE_TYPES = DEFAULT_CONFIGS.map((c) => c.moduleType)

function buildDefaultMethodologyConfig(moduleType: string) {
  const found = DEFAULT_CONFIGS.find((c) => c.moduleType === moduleType)
  if (!found) return null
  return {
    id: `default-${moduleType}`,
    tenantId: '',
    moduleType: found.moduleType,
    configJson: found.configJson,
    version: 'seed',
    isActive: true,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  }
}

export class MethodologyService {
  constructor(private prisma: PrismaClient) {}

  async list(tenantId: string) {
    const existing = await this.prisma.methodologyConfig.findMany({
      where: { tenantId, isActive: true },
      orderBy: { updatedAt: 'desc' },
    })

    const existingTypes = new Set(existing.map((c) => c.moduleType))
    const defaults = ALL_MODULE_TYPES
      .filter((mt) => !existingTypes.has(mt))
      .map((mt) => buildDefaultMethodologyConfig(mt))
      .filter(Boolean)

    return [...existing, ...defaults]
  }

  async get(tenantId: string, moduleType: string) {
    const config = await this.prisma.methodologyConfig.findFirst({
      where: { tenantId, moduleType, isActive: true },
      orderBy: { updatedAt: 'desc' },
    })
    if (config) return config
    return buildDefaultMethodologyConfig(moduleType)
  }

  async create(tenantId: string, data: MethodologyInput) {
    const validated = validateMethodologyConfig(data)

    // 将同一 moduleType 的旧配置置为非活跃
    await this.prisma.methodologyConfig.updateMany({
      where: { tenantId, moduleType: validated.moduleType },
      data: { isActive: false },
    })

    return this.prisma.methodologyConfig.create({
      data: {
        tenantId,
        moduleType: validated.moduleType,
        configJson: validated.configJson,
        version: new Date().toISOString().slice(0, 7) + '-v1',
        isActive: true,
      },
    })
  }
}

/**
 * 供 Agent 层使用的工具函数：加载当前租户的方法论配置
 */
export async function loadMethodologyConfig(
  prisma: PrismaClient,
  tenantId: string,
  moduleType: 'HUMAN_INFO' | 'SPIN' | 'MILESTONE' | 'SALES_PLAYBOOK' | 'DEMAND_MINING' | 'PERSONALITY_ANALYSIS' | 'FOLLOW_UP'
) {
  const config = await prisma.methodologyConfig.findFirst({
    where: { tenantId, moduleType, isActive: true },
  })

  if (!config) {
    // 回退到共享包的硬编码常量
    const { MILESTONE_NAMES, SPIN_DIMENSIONS, DECISION_ROLES, SALES_STAGES, DEMAND_MINING_LEVELS, PERSONALITY_TYPES, TOUCH_RHYTHM } = await import('@ai-sales/shared')
    if (moduleType === 'MILESTONE') {
      return {
        moduleType,
        configJson: {
          stages: MILESTONE_NAMES.map((name, i) => ({
            stage: i,
            name,
            criteria: [],
            evidenceRequired: [],
          })),
          gateRules: DEFAULT_MILESTONE_GATE_RULES.map(serializeRule),
        },
      }
    }
    if (moduleType === 'SPIN') {
      return {
        moduleType,
        configJson: {
          situation: { prompt: SPIN_DIMENSIONS[0].purpose, examples: [] },
          problem: { prompt: SPIN_DIMENSIONS[1].purpose, examples: [] },
          implication: { prompt: SPIN_DIMENSIONS[2].purpose, examples: [] },
          needPayoff: { prompt: SPIN_DIMENSIONS[3].purpose, examples: [] },
        },
      }
    }
    if (moduleType === 'HUMAN_INFO') {
      return {
        moduleType,
        configJson: {
          dimensions: DECISION_ROLES.map((r) => ({
            role: r.code,
            trustIndicators: [],
            attitudeTracking: true,
          })),
          extractionRules: [],
        },
      }
    }
    if (moduleType === 'SALES_PLAYBOOK') {
      return {
        moduleType,
        configJson: {
          stages: SALES_STAGES,
        },
      }
    }
    if (moduleType === 'DEMAND_MINING') {
      return {
        moduleType,
        configJson: {
          levels: DEMAND_MINING_LEVELS,
          spinDimensions: SPIN_DIMENSIONS,
        },
      }
    }
    if (moduleType === 'PERSONALITY_ANALYSIS') {
      return {
        moduleType,
        configJson: {
          types: PERSONALITY_TYPES,
        },
      }
    }
    if (moduleType === 'FOLLOW_UP') {
      return {
        moduleType,
        configJson: {
          rhythm: TOUCH_RHYTHM,
        },
      }
    }
  }

  return config
}
