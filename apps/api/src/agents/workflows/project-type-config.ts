import type { PrismaClient } from '@prisma/client'

/**
 * 项目类型档位配置（V6.1 §7 替代硬编码）
 *
 * 共享给 daily-scan + customerCompanion.alert 复用。
 * 单一事实来源：projectTypeConfig 表 + FALLBACK_CFG（无配置时兜底）。
 */

export interface TypeCfg {
  typeName: string
  attentionDays: number
  staleDays: number
  effectiveFollowupMinScore: number
}

export const FALLBACK_CFG: TypeCfg = {
  typeName: '默认',
  attentionDays: 14,
  staleDays: 28,
  effectiveFollowupMinScore: 40,
}

/**
 * 加载租户的所有档位配置（含 'default'）
 */
export async function loadTypeConfigMap(
  prisma: PrismaClient,
  tenantId: string,
): Promise<Map<string, TypeCfg>> {
  const cfgs = await prisma.projectTypeConfig.findMany({ where: { tenantId } })
  const map = new Map<string, TypeCfg>()
  for (const c of cfgs) {
    map.set(c.typeKey, {
      typeName: c.typeName,
      attentionDays: c.attentionDays,
      staleDays: c.staleDays,
      effectiveFollowupMinScore: c.effectiveFollowupMinScore,
    })
  }
  return map
}

/**
 * 取项目所属档位（无 projectType 或无配置 → 'default' → FALLBACK_CFG）
 */
export function cfgFor(
  map: Map<string, TypeCfg>,
  projectType: string | null | undefined,
): TypeCfg {
  if (projectType && map.has(projectType)) return map.get(projectType)!
  if (map.has('default')) return map.get('default')!
  return FALLBACK_CFG
}

/**
 * V6.1 §十三 已确认的四档默认配置（Tom 2026-08-08 决策）
 */
export const DEFAULT_TYPE_CONFIGS: Array<{
  typeKey: string
  typeName: string
  attentionDays: number
  staleDays: number
  effectiveFollowupMinScore: number
  stageThresholds: number[]
  advancementRules: Record<string, unknown>
}> = [
  {
    typeKey: 'integration_large',
    typeName: '千万级集成项目',
    attentionDays: 30,
    staleDays: 60,
    effectiveFollowupMinScore: 40,
    stageThresholds: [0, 14, 30, 45, 60, 60, 60, 60, 60],
    advancementRules: {},
  },
  {
    typeKey: 'software_mid',
    typeName: '百万级软件项目',
    attentionDays: 21,
    staleDays: 45,
    effectiveFollowupMinScore: 40,
    stageThresholds: [0, 10, 21, 30, 45, 45, 45, 45, 45],
    advancementRules: {},
  },
  {
    typeKey: 'procurement_small',
    typeName: '小额采购/续费',
    attentionDays: 14,
    staleDays: 28,
    effectiveFollowupMinScore: 40,
    stageThresholds: [0, 7, 14, 21, 28, 28, 28, 28, 28],
    advancementRules: {},
  },
  {
    typeKey: 'default',
    typeName: '其他/未分类',
    attentionDays: 14,
    staleDays: 28,
    effectiveFollowupMinScore: 40,
    stageThresholds: [0, 10, 21, 30, 45, 45, 45, 45, 45],
    advancementRules: {},
  },
]

/**
 * Seed 默认档位配置（幂等 upsert）
 * 测试 setup 与生产 seed 脚本均可复用
 */
export async function seedDefaultTypeConfigs(
  prisma: PrismaClient,
  tenantId: string,
): Promise<void> {
  for (const c of DEFAULT_TYPE_CONFIGS) {
    await prisma.projectTypeConfig.upsert({
      where: { tenantId_typeKey: { tenantId, typeKey: c.typeKey } },
      create: {
        tenantId,
        typeKey: c.typeKey,
        typeName: c.typeName,
        attentionDays: c.attentionDays,
        staleDays: c.staleDays,
        effectiveFollowupMinScore: c.effectiveFollowupMinScore,
        stageThresholds: c.stageThresholds,
        advancementRules: c.advancementRules as never,
      },
      update: {
        typeName: c.typeName,
        attentionDays: c.attentionDays,
        staleDays: c.staleDays,
        effectiveFollowupMinScore: c.effectiveFollowupMinScore,
        stageThresholds: c.stageThresholds,
      },
    })
  }
}