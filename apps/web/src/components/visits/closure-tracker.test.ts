import { describe, it, expect } from 'vitest'
import { deriveNodeStates, behaviorScoreOf } from './closure-tracker.utils.js'
import type { VisitClosure } from '../../hooks/use-visit-closure.js'

function makeClosure(overrides: Partial<VisitClosure>): VisitClosure {
  return {
    id: 'c1',
    visitId: 'v1',
    ownerId: 'u1',
    hasPreparation: false,
    hasRecording: false,
    hasSummary: false,
    hasAiAnalysis: false,
    hasFollowUp: false,
    hasConfirmation: false,
    qualityScore: 0,
    createdAt: '2026-08-09T10:00:00Z',
    updatedAt: '2026-08-09T10:00:00Z',
    ...overrides,
  }
}

describe('closure-tracker 六节点（V6.1 §5.3）', () => {
  it('全未完成时 6 个节点均 done=false', () => {
    const nodes = deriveNodeStates(makeClosure({}))
    expect(nodes).toHaveLength(6)
    expect(nodes.every((n) => !n.done)).toBe(true)
  })

  it('节点顺序：准备→记录→摘要→AI分析→跟进→确认', () => {
    const nodes = deriveNodeStates(makeClosure({}))
    expect(nodes.map((n) => n.key)).toEqual([
      'hasPreparation',
      'hasRecording',
      'hasSummary',
      'hasAiAnalysis',
      'hasFollowUp',
      'hasConfirmation',
    ])
  })

  it('部分完成正确映射', () => {
    const nodes = deriveNodeStates(makeClosure({ hasPreparation: true, hasRecording: true }))
    expect(nodes.filter((n) => n.done).map((n) => n.key)).toEqual(['hasPreparation', 'hasRecording'])
  })
})

describe('behaviorScoreOf（行为分四维求和）', () => {
  it('行为分 = 准备+记录+跟进+推进（不含 rubric 折算）', () => {
    const score = behaviorScoreOf(
      makeClosure({
        qualityFactors: { preparation: 15, rawDocumentation: 17, followUp: 15, progression: 10, rubricWeighted: 24 },
      }),
    )
    expect(score).toBe(57)
  })

  it('qualityFactors 缺失时按 0', () => {
    expect(behaviorScoreOf(makeClosure({ qualityFactors: null }))).toBe(0)
  })
})
