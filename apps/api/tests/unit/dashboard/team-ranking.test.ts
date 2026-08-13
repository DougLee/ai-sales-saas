import { describe, it, expect } from 'vitest'
import { computeWqmi } from '../../../src/dashboard/team-ranking.service.js'
import { parseReadinessResponse } from '../../../src/milestone-gate/readiness-check.js'

describe('team-ranking WQMI（V6.1 §6.2）', () => {
  it('无拜访返回 null（不参与排名分母）', () => {
    expect(computeWqmi([])).toBeNull()
  })

  it('WQMI = 平均分*0.6 + 闭环率*40', () => {
    const wqmi = computeWqmi([
      { qualityScore: 80, closedAt: new Date(), qualityFactors: { preparation: 15, rawDocumentation: 17, followUp: 15, progression: 10, rubricWeighted: 23 } },
      { qualityScore: 40, closedAt: null, qualityFactors: { preparation: 15, rawDocumentation: 17, followUp: 8, progression: 0, rubricWeighted: 0 } },
    ])
    // avg=60 → 36；闭环率 50% → 20；合计 56
    expect(wqmi!.wqmi).toBe(56)
    expect(wqmi!.visitCount).toBe(2)
    expect(wqmi!.avgScore).toBe(60)
    expect(wqmi!.closureRate).toBe(50)
  })

  it('分数构成透明：行为分与 rubric 折算分列', () => {
    const wqmi = computeWqmi([
      { qualityScore: 64, closedAt: new Date(), qualityFactors: { preparation: 15, rawDocumentation: 11, followUp: 15, progression: 0, rubricWeighted: 23 } },
    ])
    expect(wqmi!.avgBehaviorScore).toBe(41)
    expect(wqmi!.avgRubricWeighted).toBe(23)
  })

  it('qualityFactors 缺失时行为分按 0 兜底', () => {
    const wqmi = computeWqmi([{ qualityScore: 30, closedAt: new Date(), qualityFactors: null }])
    expect(wqmi!.avgBehaviorScore).toBe(0)
    expect(wqmi!.wqmi).toBe(58) // 30*0.6 + 100*0.4
  })
})

describe('readiness-check 解析（V6.1 §7.1）', () => {
  it('解析合法响应', () => {
    const r = parseReadinessResponse(
      '{"signals":[{"signal":"客户认可方案","evidence":"...","strength":"strong"}],"risks":[],"suggestion":"proceed","reason":"信号充分"}',
    )
    expect(r!.suggestion).toBe('proceed')
    expect(r!.signals).toHaveLength(1)
  })

  it('非法 suggestion 返回 null', () => {
    expect(parseReadinessResponse('{"signals":[],"risks":[],"suggestion":"maybe","reason":""}')).toBeNull()
  })

  it('非法 JSON 返回 null', () => {
    expect(parseReadinessResponse('无法解析')).toBeNull()
  })

  it('容忍 markdown 包裹 + 缺省数组兜底', () => {
    const r = parseReadinessResponse('```json\n{"suggestion":"hold","reason":"关键人失联"}\n```')
    expect(r!.suggestion).toBe('hold')
    expect(r!.signals).toEqual([])
    expect(r!.risks).toEqual([])
  })
})
