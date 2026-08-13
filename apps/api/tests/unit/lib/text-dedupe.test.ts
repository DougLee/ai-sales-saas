import { describe, it, expect } from 'vitest'
import { normalizeText, bigramSimilarity, dedupeSimilar, filterSimilarTo } from '@/lib/text-dedupe'

describe('text-dedupe（V6.2 AI 提取产物语义去重）', () => {
  it('normalizeText 去空白标点大小写', () => {
    expect(normalizeText('提交方案， 初稿。')).toBe('提交方案初稿')
  })

  it('bigramSimilarity：相同=1，包含关系=0.9，无关≈0', () => {
    expect(bigramSimilarity('提交方案初稿', '提交方案初稿')).toBe(1)
    expect(bigramSimilarity('提交方案', '下周三前提交方案初稿')).toBe(0.9)
    expect(bigramSimilarity('收集竞品信息', '确认办公会时间')).toBeLessThan(0.3)
  })

  it('dedupeSimilar：合并同一件事的换角度复述，保留信息量大的', () => {
    const actions = [
      '下周三前完成并提交方案初稿，重点突出兼容性',
      '下周三前按时提交方案初稿，确保内容专业、有针对性',
      '与李主任进行技术细节沟通',
    ]
    const result = dedupeSimilar(actions)
    expect(result).toHaveLength(2)
    expect(result.some((r) => r.includes('提交方案初稿'))).toBe(true)
    expect(result).toContain('与李主任进行技术细节沟通')
  })

  it('dedupeSimilar：独立动作不误杀', () => {
    const actions = ['收集华为竞品信息，准备应对策略', '持续跟进拨款进展', '准备办公会汇报材料']
    expect(dedupeSimilar(actions)).toHaveLength(3)
  })

  it('dedupeSimilar：空项过滤', () => {
    expect(dedupeSimilar(['', '  ', '任务A'])).toEqual(['任务A'])
  })

  it('filterSimilarTo：过滤与已有任务相似的项', () => {
    const existing = ['提交方案初稿']
    const fresh = ['按时提交方案初稿，确保专业', '约王校长复盘']
    expect(filterSimilarTo(fresh, existing)).toEqual(['约王校长复盘'])
  })
})
