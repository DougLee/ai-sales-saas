import { describe, it, expect } from 'vitest'
import {
  cfgFor,
  loadTypeConfigMap,
  FALLBACK_CFG,
  DEFAULT_TYPE_CONFIGS,
  seedDefaultTypeConfigs,
  type TypeCfg,
} from '@/agents/workflows/project-type-config'

describe('project-type-config', () => {
  describe('cfgFor', () => {
    const map = new Map<string, TypeCfg>([
      ['integration_large', { typeName: '千万级', attentionDays: 30, staleDays: 60, effectiveFollowupMinScore: 40 }],
      ['default', { typeName: '默认', attentionDays: 14, staleDays: 28, effectiveFollowupMinScore: 40 }],
    ])

    it('returns the project type config when present', () => {
      expect(cfgFor(map, 'integration_large').staleDays).toBe(60)
    })

    it('falls back to default when projectType unknown', () => {
      expect(cfgFor(map, 'unknown_type').staleDays).toBe(28)
    })

    it('falls back to FALLBACK_CFG when no default present', () => {
      const empty = new Map<string, TypeCfg>()
      const cfg = cfgFor(empty, null)
      expect(cfg).toEqual(FALLBACK_CFG)
    })

    it('handles null/undefined projectType', () => {
      expect(cfgFor(map, null).staleDays).toBe(28)
      expect(cfgFor(map, undefined).staleDays).toBe(28)
    })

    it('projectType wins over default for matching typeKey', () => {
      const cfg = cfgFor(map, 'integration_large')
      expect(cfg.attentionDays).toBe(30)
      expect(cfg.typeName).toBe('千万级')
    })
  })

  describe('DEFAULT_TYPE_CONFIGS', () => {
    it('contains four V6.1 §十三 校准档位', () => {
      const keys = DEFAULT_TYPE_CONFIGS.map((c) => c.typeKey)
      expect(keys).toEqual(['integration_large', 'software_mid', 'procurement_small', 'default'])
    })

    it('integration_large staleDays=60 (V6.1 §十三校准)', () => {
      const c = DEFAULT_TYPE_CONFIGS.find((c) => c.typeKey === 'integration_large')!
      expect(c.attentionDays).toBe(30)
      expect(c.staleDays).toBe(60)
      expect(c.effectiveFollowupMinScore).toBe(40)
    })

    it('software_mid staleDays=45', () => {
      const c = DEFAULT_TYPE_CONFIGS.find((c) => c.typeKey === 'software_mid')!
      expect(c.attentionDays).toBe(21)
      expect(c.staleDays).toBe(45)
    })

    it('procurement_small staleDays=28', () => {
      const c = DEFAULT_TYPE_CONFIGS.find((c) => c.typeKey === 'procurement_small')!
      expect(c.attentionDays).toBe(14)
      expect(c.staleDays).toBe(28)
    })

    it('default staleDays=28 (Phase 1 fallback 等价)', () => {
      const c = DEFAULT_TYPE_CONFIGS.find((c) => c.typeKey === 'default')!
      expect(c.attentionDays).toBe(14)
      expect(c.staleDays).toBe(28)
    })

    it('all configs have non-empty stageThresholds (9 milestones)', () => {
      for (const c of DEFAULT_TYPE_CONFIGS) {
        expect(c.stageThresholds).toHaveLength(9)
      }
    })
  })

  // loadTypeConfigMap 与 seedDefaultTypeConfigs 是 Prisma 集成行为，由 daily-scan / companion 测试覆盖
  describe('loadTypeConfigMap', () => {
    it('exports a function', () => {
      expect(typeof loadTypeConfigMap).toBe('function')
    })

    it('seedDefaultTypeConfigs is exported', () => {
      expect(typeof seedDefaultTypeConfigs).toBe('function')
    })
  })
})