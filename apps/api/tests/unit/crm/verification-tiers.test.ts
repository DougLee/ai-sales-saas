import { describe, it, expect } from 'vitest'
import {
  readFieldSources,
  levelFromSources,
  addSourceToMeta,
  computeAnchorStrength,
  FIELD_VERIFY_REQ,
  LEVEL_RANK,
  REQ_LEVEL,
} from '../../../src/crm/projects/verification-tiers.js'

describe('verification-tiers（ADR-0005 验证水位）', () => {
  it('兼容 ADR-0004 旧 string 结构', () => {
    const metas = readFieldSources({ _gateFieldSource: { 'financeInfo.price': 'manual', 'evidence.bidResult': 'manual-pass' } })
    expect(metas['financeInfo.price']).toEqual({ level: 'manual', sources: [] })
    expect(metas['evidence.bidResult']).toEqual({ level: 'final', sources: ['豁免'] })
  })

  it('读取新结构', () => {
    const metas = readFieldSources({ _gateFieldSource: { 'humanInfo.firstContact': { level: 'cross', sources: ['录音', '文档'] } } })
    expect(metas['humanInfo.firstContact'].level).toBe('cross')
    expect(metas['humanInfo.firstContact'].sources).toHaveLength(2)
  })

  it('来源数决定水位：1=单源，2=交叉', () => {
    expect(levelFromSources('manual', ['录音'], true)).toBe('single')
    expect(levelFromSources('single', ['录音', '文档'], true)).toBe('cross')
    expect(levelFromSources('cross', ['录音'], true)).toBe('single') // 撤销后降级
    expect(levelFromSources('final', [], true)).toBe('final') // final 只被显式动作撤销
  })

  it('addSourceToMeta 第二来源升级交叉', () => {
    const m1 = addSourceToMeta({ level: 'single', sources: ['拜访录音'] }, '方案文档')
    expect(m1.level).toBe('cross')
    // 同名来源不重复计
    const m2 = addSourceToMeta(m1, '方案文档')
    expect(m2.sources).toHaveLength(2)
    expect(m2.level).toBe('cross')
  })

  it('锚定强弱：水位全达标=strong，含不足=weak', () => {
    // M0 唯一字段 firstContact 要求 material（级别≥1）
    const strong = computeAnchorStrength(
      { evidence: { _gateFieldSource: { 'humanInfo.firstContact': { level: 'single', sources: ['录音'] } } } } as never,
      ['humanInfo.firstContact'],
    )
    expect(strong.strong).toBe(true)

    const weak = computeAnchorStrength(
      { evidence: { _gateFieldSource: { 'humanInfo.firstContact': { level: 'manual', sources: [] } } } } as never,
      ['humanInfo.firstContact'],
    )
    expect(weak.strong).toBe(false)

    // 无来源记录的历史数据 → weak
    const legacy = computeAnchorStrength({ evidence: {} } as never, ['humanInfo.firstContact'])
    expect(legacy.strong).toBe(false)
  })

  it('字段验证要求档位齐全（8 个 gate 字段）', () => {
    expect(Object.keys(FIELD_VERIFY_REQ)).toHaveLength(8)
    expect(FIELD_VERIFY_REQ['businessInfo.solution']).toBe('decision')
    expect(FIELD_VERIFY_REQ['evidence.bidResult']).toBe('material')
    expect(LEVEL_RANK.cross).toBeGreaterThanOrEqual(REQ_LEVEL.material)
    expect(LEVEL_RANK.final).toBeGreaterThanOrEqual(REQ_LEVEL.decision)
  })
})
